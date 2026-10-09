<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Item;
use App\Services\EventSpend;
use App\Services\RecurrenceProjector;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class DashboardController extends Controller
{
    public function index()
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        // Tagged with the user's own stored timezone (same pattern
        // CalendarController/BudgetController already use), not the
        // server's default (UTC) -- both the overdue/today/upcoming
        // classification below (isToday(), the 7-day window) and the
        // Monthly Expenses whereYear/whereMonth further down read off
        // this SAME $now, so tagging it here fixes both at once. Found
        // by qa-lead while verifying the sibling Budget fix: this
        // controller had the identical timezone-blind pattern, its own
        // comment even calling out it's meant to match Budget's rule.
        $now = now($user->timezone ?? 'UTC');

        // Only Item::ACTIONABLE_TYPES -- everything else with a due_at
        // (car_fuel, car_maintenance, grocery_trip, home_expense,
        // expense_item...) is the date something already happened, not
        // a deadline; including them here is what made a 10-day-old
        // fuel fill-up show up as "overdue". Split the same way
        // CalendarController does: a plain item classifies by its own
        // stored due_at, a recurring one (home_recurring, or a
        // custom_event with its "recurent" toggle on) classifies by its
        // PROJECTED next occurrence (RecurrenceProjector), never the
        // stale stored date.
        // space:id,name,icon eager-loaded so the frontend's "De făcut"
        // carousel can send each item's Deschide button straight to the
        // space it actually belongs to (a space-linked item) or fall
        // back to Calendar (space is null -- a custom_event), instead
        // of always landing on Calendar regardless of source.
        // due_at is re-pointed to effectiveDueAt() here -- for every type
        // except car_document that's a no-op, but a document's own
        // due_at is just whenever it was logged, not its real deadline
        // (see Item::effectiveDueAt). Without this, a document renewed
        // today with a 2027 expiry showed up as permanently "overdue"
        // here while Car's own dashboard (which already reads
        // metadata.expiryDate) correctly showed it as fine -- the exact
        // discrepancy this account hit.
        $superseded = Item::supersededCarDocumentIds($user->id);
        $plainItems = Item::where('user_id', $user->id)
            ->whereIn('type', Item::ACTIONABLE_TYPES)
            ->whereNull('recurrence')
            ->whereNotNull('due_at')
            ->whereNotIn('status', Item::CLOSED_STATUSES)
            ->with('space:id,name,icon,type')
            ->get()
            ->map(function (Item $item) use ($user) {
                $item->due_at = $item->effectiveDueAt($user->timezone);

                return $item;
            })
            ->filter(fn (Item $item) => $item->due_at !== null)
            ->reject(fn (Item $item) => in_array($item->id, $superseded, true))
            ->values();

        // One-off maintenance visits with a "next due" date (see
        // Item::maintenanceNextDue) -- deadlines Casă already counts.
        $maintenanceDue = Item::where('user_id', $user->id)
            ->where('type', 'home_maintenance')
            ->whereNull('recurrence')
            ->whereNotIn('status', Item::CLOSED_STATUSES)
            ->with('space:id,name,icon,type')
            ->get()
            ->map(function (Item $item) {
                $next = $item->maintenanceNextDue();
                if (!$next) {
                    return null;
                }
                $item->due_at = $next;

                return $item;
            })
            ->filter()
            ->values();
        $plainItems = $plainItems->concat($maintenanceDue);

        $recurringItems = Item::where('user_id', $user->id)
            ->whereIn('type', Item::RECURRING_ACTIONABLE_TYPES)
            ->whereNotNull('recurrence')
            ->whereNotNull('due_at')
            ->whereNotIn('status', Item::CLOSED_STATUSES)
            ->with('space:id,name,icon,type')
            ->get()
            ->map(function (Item $item) use ($now) {
                $next = RecurrenceProjector::currentDue($item, $now);
                $item->due_at = $next['due'];

                return $item;
            });

        $overdue = [];
        $today = [];
        $upcoming = [];
        $sevenDaysOut = $now->copy()->addDays(7);

        // Day buckets are compared in the user's own timezone: due_at
        // comes back UTC-tagged, and isToday()/isSameDay() read the
        // date in the Carbon's OWN zone -- a task due 00:00 Bucharest
        // (21:00 UTC the day before) used to land in "overdue" here
        // while Calendar and the Casă space correctly said "today".
        $tz = $now->getTimezone();
        $carService = $this->carServiceDue($user->id, $now);
        $homeDocuments = $this->homeDocumentsDue($user->id, $now);

        foreach ($plainItems->merge($recurringItems)->concat($carService)->concat($homeDocuments) as $item) {
            $localDue = $item->due_at->copy()->setTimezone($tz);
            if ($localDue->isSameDay($now)) {
                $today[] = $item;
            } elseif ($localDue->lt($now)) {
                $overdue[] = $item;
            } elseif ($localDue->lte($sevenDaysOut->copy()->endOfDay())) {
                $upcoming[] = $item;
            }
        }

        // Credits: a reminder in "Azi" on their due day only (clamped
        // day_of_month, until end_date) -- `reminder: true`, so the
        // frontend offers no swipe-to-resolve; never overdue/upcoming, gone
        // the next day.
        $credits = Item::where('user_id', $user->id)
            ->activeCredits($now)
            ->whereNotNull('due_at')
            ->with('space:id,name,icon,type')
            ->get();
        foreach ($credits as $credit) {
            $due = $credit->creditDueIn($now);
            if ($due && $due->isSameDay($now)) {
                $credit->due_at = $due->setTimezone(config('app.timezone'));
                $credit->setAttribute('reminder', true);
                $today[] = $credit;
            }
        }

        usort($overdue, fn ($a, $b) => $a->due_at <=> $b->due_at);
        usort($today, fn ($a, $b) => $a->due_at <=> $b->due_at);
        usort($upcoming, fn ($a, $b) => $a->due_at <=> $b->due_at);

        // Real cross-space "this month" spending, grouped by space -- same
        // types and same "spent this month" rule as BudgetController's
        // per-category totals (see Item::SPENDING_TYPES -- fuel,
        // maintenance and document entries all carry a real price too, not
        // just the dedicated car_expense/home_expense types; most of a
        // Car space's actual spend is exactly those). Replaces what used
        // to be a frontend-only mock sum
        // (frontend/lib/dashboard/monthlyExpenses.ts). A space with
        // nothing this month is simply absent from `sources`, not listed
        // at 0. One query, bucketed in PHP by Item::SPENDING_TYPE_SPACE.
        // whereYear/whereMonth would extract the month from due_at's
        // raw STORED value (effectively UTC), ignoring $now's own
        // timezone tag entirely -- same gotcha BudgetController's own
        // monthWindowUtc() already works around. Converting $now's
        // month boundaries to UTC first, then a whereBetween, keeps
        // this in agreement with Budget's own per-category totals for
        // the identical data (that's this query's own stated goal).
        $monthStartUtc = $now->copy()->startOfMonth()->setTimezone('UTC');
        $monthEndUtc = $now->copy()->endOfMonth()->setTimezone('UTC');

        $monthItems = Item::where('user_id', $user->id)
            ->whereIn('type', array_values(array_diff(Item::SPENDING_TYPES, ['custom_event'])))
            ->whereBetween('due_at', [$monthStartUtc, $monthEndUtc])
            ->get(['type', 'amount']);

        $totals = [];
        foreach ($monthItems as $item) {
            $meta = Item::SPENDING_TYPE_SPACE[$item->type] ?? null;
            if (!$meta) {
                continue;
            }
            $totals[$meta['label']] ??= ['icon' => $meta['icon'], 'amount' => 0.0];
            $totals[$meta['label']]['amount'] += (float) $item->amount;
        }
        // Calendar purchases count as spent only from their day on (a
        // planned one is Budget's `planned`, never "Cheltuit") -- EventSpend.
        $eventSpent = EventSpend::totals($user->id, $now, $now)['spent'];
        if ($eventSpent > 0) {
            $meta = Item::SPENDING_TYPE_SPACE['custom_event'];
            $totals[$meta['label']] ??= ['icon' => $meta['icon'], 'amount' => 0.0];
            $totals[$meta['label']]['amount'] += $eventSpent;
        }

        $sources = [];
        $monthlyTotal = 0;

        foreach ($totals as $label => $info) {
            if ($info['amount'] <= 0) {
                continue;
            }
            $sources[] = [
                'spaceName' => $label,
                'icon' => $info['icon'],
                'amount' => $info['amount'],
            ];
            $monthlyTotal += $info['amount'];
        }

        // Items still to buy per grocery space (not yet ticked into the
        // cart) -- the Cumpărături tile says "19 de cumpărat" instead of
        // "La zi" while a list is still open.
        $openGrocery = Item::where('user_id', $user->id)
            ->where('type', 'grocery_item')
            ->whereNotIn('status', Item::CLOSED_STATUSES)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get(['space_id', 'title', 'metadata'])
            ->filter(fn (Item $i) => empty($i->metadata['inCart']));
        $toBuy = $openGrocery->countBy('space_id');

        // The same, per shopping list -- Acasă names each list ("Listă
        // Cumpărături lunch job · 19 de cumpărat") instead of one total.
        $listTitles = Item::where('user_id', $user->id)
            ->where('type', 'grocery_list')
            ->whereNotIn('status', Item::CLOSED_STATUSES)
            ->pluck('title', 'id');
        $toBuyLists = $openGrocery
            ->groupBy(fn (Item $i) => (string) ($i->metadata['listId'] ?? ''))
            ->filter(fn ($items, $listId) => $listId !== '' && isset($listTitles[(int) $listId]))
            ->map(fn ($items, $listId) => [
                'list_id' => (string) $listId,
                'space_id' => $items->first()->space_id,
                'title' => $listTitles[(int) $listId],
                'count' => $items->count(),
                // The first few still to buy, for the list's own card.
                'items' => $items->take(8)->map(fn (Item $i) => [
                    'title' => $i->title,
                    'quantity' => $i->metadata['quantity'] ?? null,
                ])->values(),
            ])
            ->values();

        return response()->json([
            'today' => $today,
            'upcoming' => $upcoming,
            'overdue' => $overdue,
            'toBuy' => $toBuy,
            'toBuyLists' => $toBuyLists,
            'cars' => $this->carSummaries($user->id, $now),
            'lowSupplies' => $this->lowSuppliesBySpace($user->id),
            'monthlyExpenses' => [
                'total' => $monthlyTotal,
                'sources' => $sources,
            ],
        ]);
    }

    // A car service the Mașină space already flags (its "Urmează": km or
    // date, whichever comes first -- lib/spaces/car/calculations/
    // dashboard.calculations.ts getMaintenanceUrgency) must count here
    // too, or a car showing "Schimb ulei · Depășit cu 500 km" reads
    // "1 de făcut" on Acasă. Only what matters for "De făcut" is mirrored:
    // overdue by km (within the same 5,000 km staleness cut-off the Car
    // screen uses) or due by date. A km-overdue item has no real date, so
    // it's dated yesterday (sorts into "Restante") and carries
    // `overdue_km` for the label.
    private function carServiceDue(int $userId, Carbon $now): Collection
    {
        $entries = Item::where('user_id', $userId)
            ->where('type', 'car_maintenance')
            ->whereNotIn('status', Item::CLOSED_STATUSES)
            ->with('space:id,name,icon,type')
            ->get();
        if ($entries->isEmpty()) {
            return collect();
        }

        // Current odometer per car = the highest reading logged on any of
        // its fuel/service/expense entries (getCurrentOdometer).
        $odometer = Item::where('user_id', $userId)
            ->whereIn('type', ['car_fuel', 'car_maintenance', 'car_expense'])
            ->whereIn('space_id', $entries->pluck('space_id')->unique())
            ->get(['space_id', 'metadata'])
            ->groupBy('space_id')
            ->map(fn ($rows) => $rows->max(fn ($r) => (float) ($r->metadata['odometer'] ?? 0)));

        $appTz = config('app.timezone');
        $horizon = $now->copy()->addDays(7)->endOfDay();

        return $entries
            ->filter(function (Item $e) use ($entries) {
                // A one-off repair predicts nothing; a newer entry of the
                // same service supersedes this one's prediction.
                if ($e->title === 'Repair') {
                    return false;
                }

                return !$entries->contains(fn (Item $o) => $o->id !== $e->id
                    && $o->space_id === $e->space_id
                    && $o->title === $e->title
                    && $o->due_at && $e->due_at && $o->due_at->gt($e->due_at));
            })
            ->map(function (Item $e) use ($odometer, $now, $appTz, $horizon) {
                $nextKm = $e->metadata['nextServiceOdometer'] ?? null;
                $odo = (float) ($odometer[$e->space_id] ?? 0);
                // Lets Acasă log "the same service again, today" without
                // opening the Car form (lib/dashboard/itemActions.ts).
                $e->setAttribute('current_odometer', $odo > 0 ? (int) round($odo) : null);
                if (is_numeric($nextKm) && $odo > 0) {
                    $remaining = (float) $nextKm - $odo;
                    if ($remaining < 0 && $remaining >= -5000) {
                        $e->due_at = $now->copy()->subDay()->startOfDay()->setTimezone($appTz);
                        $e->setAttribute('overdue_km', (int) round(-$remaining));

                        return $e;
                    }
                }

                $nextDate = $e->metadata['nextServiceDate'] ?? null;
                if (is_string($nextDate) && preg_match('/^\d{2}\.\d{2}\.\d{4}$/', $nextDate)) {
                    try {
                        $due = Carbon::createFromFormat('d.m.Y', $nextDate, $now->getTimezone())->startOfDay();
                    } catch (\Exception $ex) {
                        return null;
                    }
                    if ($due->lte($horizon)) {
                        $e->due_at = $due->setTimezone($appTz);

                        return $e;
                    }
                }

                return null;
            })
            ->filter()
            ->values();
    }

    // Casă documents (insurance, contracts...) expiring within the week
    // or already expired -- the Casă screen's own "Urmează" already shows
    // them; Acasă's "De făcut" didn't. Dated by metadata.expiryDate at the
    // end of that day in the user's zone (same rule as car documents).
    private function homeDocumentsDue(int $userId, Carbon $now): Collection
    {
        $horizon = $now->copy()->addDays(7)->endOfDay();
        $appTz = config('app.timezone');

        return Item::where('user_id', $userId)
            ->where('type', 'home_document')
            ->whereNotIn('status', Item::CLOSED_STATUSES)
            ->with('space:id,name,icon,type')
            ->get()
            ->map(function (Item $item) use ($now, $horizon, $appTz) {
                $expiry = $item->metadata['expiryDate'] ?? null;
                if (!is_string($expiry) || $expiry === '') {
                    return null;
                }
                try {
                    $due = Carbon::parse($expiry)->setTimezone($now->getTimezone())->endOfDay();
                } catch (\Exception $e) {
                    return null;
                }
                if ($due->gt($horizon)) {
                    return null;
                }
                $item->due_at = $due->setTimezone($appTz);

                return $item;
            })
            ->filter()
            ->values();
    }

    // Casă supplies probably running out, per space -- the same estimate
    // the Provizii page uses (lib/spaces/home/calculations/
    // dashboard.calculations.ts getSupplyRestockEstimate): average daily
    // use from the restock history, "low" once the last restock should
    // have been used up. Not dated (no real deadline), so it's a count,
    // never a "restant".
    private function lowSuppliesBySpace(int $userId): Collection
    {
        $now = time();

        return Item::where('user_id', $userId)
            ->where('type', 'home_supply')
            ->whereNotIn('status', Item::CLOSED_STATUSES)
            ->get(['space_id', 'metadata'])
            ->filter(function (Item $item) use ($now) {
                $fallback = (float) ($item->metadata['quantity'] ?? 1);
                $history = collect($item->metadata['restockHistory'] ?? [])
                    ->map(fn ($e) => is_string($e)
                        ? ['date' => strtotime($e), 'quantity' => $fallback]
                        : ['date' => isset($e['date']) ? strtotime($e['date']) : false, 'quantity' => (float) ($e['quantity'] ?? $fallback)])
                    ->filter(fn ($e) => $e['date'] && $e['quantity'] > 0)
                    ->sortBy('date')
                    ->values();
                if ($history->count() < 2) {
                    return false;
                }
                $rates = [];
                for ($i = 1; $i < $history->count(); $i++) {
                    $days = ($history[$i]['date'] - $history[$i - 1]['date']) / 86400;
                    if ($days > 0) {
                        $rates[] = $history[$i - 1]['quantity'] / $days;
                    }
                }
                if (!$rates) {
                    return false;
                }
                $daily = array_sum($rates) / count($rates);
                $last = $history->last();
                $daysSince = ($now - $last['date']) / 86400;

                return $daily > 0 && $daysSince >= $last['quantity'] / $daily;
            })
            ->countBy('space_id');
    }

    /** Card types the Acasă screen knows (lib/dashboard/layout.ts). */
    private const WIDGET_TYPES = ['spend', 'todo', 'bills', 'savings', 'budget', 'car', 'grocery', 'supplies', 'calendar', 'expenses'];

    // GET /dashboard/layout -- the user's Acasă arrangement, or null for
    // "never customized" (the app then shows its default).
    public function layout(Request $request)
    {
        // Cast to array on the User model (it used to be decoded by hand here).
        $layout = $request->user()->dashboard_layout;

        return response()->json(['layout' => $layout]);
    }

    // PUT /dashboard/layout -- replaces the whole arrangement. Each card:
    // id, type (WIDGET_TYPES), size wide|compact, color (hex or null),
    // hidden, settings (small flat object). `layout: null` resets to the
    // default.
    public function saveLayout(Request $request)
    {
        $validated = $request->validate([
            'layout' => 'present|nullable|array|max:40',
            'layout.*.id' => 'required|string|max:40',
            'layout.*.type' => ['required', 'string', \Illuminate\Validation\Rule::in(self::WIDGET_TYPES)],
            'layout.*.size' => 'required|in:wide,compact',
            'layout.*.color' => ['nullable', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'layout.*.hidden' => 'boolean',
            'layout.*.settings' => 'nullable|array|max:10',
            'layout.*.settings.*' => 'nullable',
        ]);

        $user = $request->user();
        $user->dashboard_layout = $validated['layout'] === null ? null : array_values($validated['layout']);
        $user->save();

        return response()->json(['layout' => $validated['layout']]);
    }

    // One line of facts per car for its Acasă card: current odometer
    // (highest logged reading), the nearest service by km, the nearest
    // document expiry -- the same rules the Mașină screen uses.
    private function carSummaries(int $userId, Carbon $now): Collection
    {
        $items = Item::where('user_id', $userId)
            ->whereIn('type', ['car_fuel', 'car_maintenance', 'car_expense', 'car_document'])
            ->whereNotNull('space_id')
            ->with('space:id,name,icon,type')
            ->get();
        if ($items->isEmpty()) {
            return collect();
        }
        $superseded = Item::supersededCarDocumentIds($userId);

        return $items->groupBy('space_id')->map(function (Collection $rows) use ($superseded) {
            $odo = (int) round($rows->max(fn (Item $r) => (float) ($r->metadata['odometer'] ?? 0)));
            $services = $rows->where('type', 'car_maintenance')->filter(fn (Item $r) => !in_array($r->status, Item::CLOSED_STATUSES, true));
            $nextService = $services
                ->filter(fn (Item $r) => is_numeric($r->metadata['nextServiceOdometer'] ?? null)
                    && !$services->contains(fn (Item $o) => $o->id !== $r->id && $o->title === $r->title && $o->due_at && $r->due_at && $o->due_at->gt($r->due_at)))
                ->map(fn (Item $r) => ['title' => $r->title, 'at_km' => (int) $r->metadata['nextServiceOdometer'], 'km_left' => (int) $r->metadata['nextServiceOdometer'] - $odo])
                ->sortBy('km_left')
                ->first();
            $nextDoc = $rows->where('type', 'car_document')
                ->filter(fn (Item $r) => $r->status !== 'archived' && !in_array($r->id, $superseded, true))
                ->map(function (Item $r) {
                    $exp = $r->metadata['expiryDate'] ?? null;
                    if (!is_string($exp) || !preg_match('/^\d{2}\.\d{2}\.\d{4}$/', $exp)) {
                        return null;
                    }

                    return ['title' => $r->title, 'expiry' => $exp, 'ts' => Carbon::createFromFormat('d.m.Y', $exp)->timestamp];
                })
                ->filter()
                ->sortBy('ts')
                ->first();
            $space = $rows->first()->space;

            return [
                'space_id' => $space?->id,
                'name' => $space?->name,
                'odometer' => $odo > 0 ? $odo : null,
                'next_service' => $nextService,
                'next_document' => $nextDoc ? ['title' => $nextDoc['title'], 'expiry' => $nextDoc['expiry']] : null,
            ];
        })->values();
    }
}
