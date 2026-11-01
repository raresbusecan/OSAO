<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CarProfile;
use App\Models\Item;
use App\Services\EventSpend;
use App\Services\RecurrenceProjector;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class CalendarController extends Controller
{
    /**
     * Everything with a due_at in the given month, grouped by day --
     * matches what frontend/app/(tabs)/calendar.tsx already expects
     * (`r.days['YYYY-MM-DD']`). Scoped via Item::visibleTo, so a shared
     * Car/Home space's items show up here too, not just this user's own.
     *
     * Split into two passes: plain items show on the single real date
     * they're due, same as always; items with `recurrence` set instead
     * get PROJECTED onto every occurrence inside the visible month (see
     * RecurrenceProjector::occurrencesBetween), so a monthly bill due
     * months ago still shows up as "coming due" this month and every
     * month after, not just the one it was first logged in.
     */
    public function index(Request $request)
    {
        $validated = $request->validate([
            'month' => ['required', 'date_format:Y-m'],
        ]);

        $user = $request->user();
        // Null until SyncUserTimezone middleware has seen a request from
        // this user carrying the device-read X-Timezone header (see
        // frontend/lib/api.ts) -- UTC until then, same as before this
        // existed at all.
        $userTz = $user->timezone ?? 'UTC';

        // Computed IN the user's own timezone, then Carbon converts to
        // UTC under the hood for the whereBetween() query below -- "the
        // user's September" starts at their own local midnight, not
        // UTC midnight, so an item due right after local midnight near
        // either edge of the month doesn't fall into the wrong month's
        // view. All display-side grouping (both toDateString() calls
        // below) also has to read back in the same $userTz, or the two
        // notions of "which day" would disagree with each other.
        $start = Carbon::createFromFormat('Y-m', $validated['month'], $userTz)->startOfMonth();
        $end = $start->copy()->endOfMonth();

        // The query builder serializes a Carbon straight to its OWN
        // wall-clock string (whatever timezone it's tagged with) as the
        // literal SQL parameter -- it does NOT auto-convert to the
        // connection's timezone the way an in-PHP Carbon comparison
        // would. due_at is stored UTC-normalized, so whereBetween()
        // below needs these explicitly in UTC or it silently compares
        // against the wrong wall-clock hours (an item near either edge
        // of the month would vanish from both months' views). $start/
        // $end themselves stay in $userTz for every other use in this
        // method (RecurrenceProjector's and car_document's own
        // Carbon-to-Carbon comparisons are instant-based and don't care
        // which timezone the operands are tagged with).
        $startUtc = $start->copy()->setTimezone('UTC');
        $endUtc = $end->copy()->setTimezone('UTC');

        // space:id,name,icon eager-loaded so the frontend can group and
        // label each day's items by their real space (name + the icon
        // chosen when that space was created) without a second request
        // per item -- null on a custom_event (or any item created with
        // no space_id), which the frontend treats as its own "custom"
        // group rather than an error case.
        // Same allowlist as Home's "De făcut" (Item::ACTIONABLE_TYPES):
        // tasks, recurring bills, scheduled deadlines (car_document) and
        // custom events -- plus, below, the deadlines that live in
        // metadata instead of due_at: one-off maintenance's next date,
        // Casă documents' expiry, car services' next date. Everything else
        // with a due_at -- car_fuel, car_expense, grocery_trip,
        // home_expense, expense_item, a car service's own visit -- is a
        // log of something that already happened, not a thing to plan
        // around, and stays visible only inside its own space.
        $plainItemsBase = Item::visibleTo($user)
            ->whereIn('type', Item::ACTIONABLE_TYPES)
            ->whereNull('recurrence')
            ->whereNotIn('status', Item::CLOSED_STATUSES);

        // car_document can't be range-filtered by due_at in SQL -- its
        // due_at is just whenever it was logged, not its real deadline
        // (see Item::effectiveDueAt, metadata.expiryDate instead). It's
        // fetched separately without a due_at bound and filtered by its
        // effective date in PHP; a user's real document count is always
        // small, so this stays cheap.
        $plainItems = (clone $plainItemsBase)
            ->where('type', '!=', 'car_document')
            ->whereBetween('due_at', [$startUtc, $endUtc])
            ->with('space:id,name,icon,type,color')
            ->get()
            ->merge(
                (clone $plainItemsBase)
                    ->where('type', 'car_document')
                    ->whereNotNull('due_at')
                    ->with('space:id,name,icon,type,color')
                    ->get()
                    ->map(function (Item $item) use ($userTz) {
                        $item->due_at = $item->effectiveDueAt($userTz);

                        return $item;
                    })
                    ->filter(fn (Item $item) => $item->due_at !== null && $item->due_at->between($start, $end))
                    ->reject(fn (Item $item) => in_array($item->id, Item::supersededCarDocumentIds($user->id), true))
            )
            // One-off maintenance with a "next due" date set in Casă --
            // a real deadline (Item::maintenanceNextDue), shown on it.
            ->concat(
                Item::visibleTo($user)
                    ->where('type', 'home_maintenance')
                    ->whereNull('recurrence')
                    ->whereNotIn('status', Item::CLOSED_STATUSES)
                    ->with('space:id,name,icon,type,color')
                    ->get()
                    ->map(function (Item $item) {
                        $next = $item->maintenanceNextDue();
                        if (!$next) {
                            return null;
                        }
                        $item->due_at = $next;

                        return $item;
                    })
                    ->filter(fn (?Item $item) => $item !== null && $item->due_at->between($start, $end))
            )
            // Casă documents, on the day they expire (metadata.expiryDate,
            // end of that day in the user's zone) -- the same date Casă
            // and Acasă's "De făcut" read (DashboardController::
            // homeDocumentsDue). Their due_at is only the day they were
            // entered, so it can't be range-filtered in SQL either.
            ->concat(
                Item::visibleTo($user)
                    ->where('type', 'home_document')
                    ->whereNotIn('status', Item::CLOSED_STATUSES)
                    ->with('space:id,name,icon,type,color')
                    ->get()
                    ->map(function (Item $item) use ($userTz) {
                        $expiry = $item->metadata['expiryDate'] ?? null;
                        if (!is_string($expiry) || $expiry === '') {
                            return null;
                        }
                        try {
                            $due = Carbon::parse($expiry)->setTimezone($userTz)->endOfDay();
                        } catch (\Exception $e) {
                            return null;
                        }
                        $item->due_at = $due->setTimezone(config('app.timezone'));

                        return $item;
                    })
                    ->filter(fn (?Item $item) => $item !== null && $item->due_at->between($start, $end))
            )
            ->concat($this->carServicesBetween($user, $userTz, $start, $end));

        $recurringItems = Item::visibleTo($user)
            ->whereIn('type', Item::RECURRING_ACTIONABLE_TYPES)
            ->whereNotNull('recurrence')
            ->whereNotNull('due_at')
            ->whereNotIn('status', Item::CLOSED_STATUSES)
            ->with('space:id,name,icon,type,color')
            ->get();

        $days = [];

        // Both branches end up as plain arrays via ->toArray(), never a
        // mix of raw Eloquent models and arrays -- keeps due_at/
        // created_at in exactly the same serialized shape either way,
        // so sorting and the frontend's date parsing never have to care
        // which branch an entry came from.
        foreach ($plainItems as $item) {
            $key = Carbon::parse($item->due_at)->setTimezone($userTz)->toDateString();
            $days[$key] ??= [];
            $days[$key][] = $item->toArray();
        }

        foreach ($recurringItems as $item) {
            foreach (RecurrenceProjector::occurrencesBetween(self::projectionAnchor($item), $start, $end) as $occurrence) {
                $key = $occurrence['due']->copy()->setTimezone($userTz)->toDateString();
                $days[$key] ??= [];
                // The real row's due_at is untouched -- this is only
                // the response shape. `created_at` is swapped for this
                // cycle's start so the frontend's due-date progress bar
                // measures "how far through THIS billing cycle", not
                // "how long since the bill was first ever entered".
                $days[$key][] = array_merge($item->toArray(), [
                    'due_at' => $occurrence['due']->toJSON(),
                    'created_at' => $occurrence['cycle_start']->toJSON(),
                    'is_projected' => true,
                ]);
            }
        }

        // Credits (Item::CREDIT_TYPE): a reminder on each due day --
        // metadata.day_of_month clamped to the month's length
        // (RecurrenceProjector re-clamps every step, so a 31st stays the
        // 31st after February), never after the last instalment
        // (metadata.end_date). Not a held type, so never "restant"; the
        // frontend shows `reminder: true` rows without swipe-to-resolve.
        $credits = Item::visibleTo($user)
            ->where('type', Item::CREDIT_TYPE)
            ->whereNotIn('status', Item::CLOSED_STATUSES)
            ->whereNotNull('due_at')
            ->with('space:id,name,icon,type,color')
            ->get();
        foreach ($credits as $credit) {
            $last = $credit->creditEndDate($userTz);
            foreach (RecurrenceProjector::occurrencesBetween($credit, $start, $end) as $occurrence) {
                if (!$last || $occurrence['due']->gt($last)) {
                    continue;
                }
                $key = $occurrence['due']->copy()->setTimezone($userTz)->toDateString();
                $days[$key] ??= [];
                $days[$key][] = array_merge($credit->toArray(), [
                    'due_at' => $occurrence['due']->toJSON(),
                    'created_at' => $occurrence['cycle_start']->toJSON(),
                    'is_projected' => true,
                    'reminder' => true,
                ]);
            }
        }

        ksort($days);
        foreach ($days as &$dayItems) {
            usort($dayItems, fn ($a, $b) => strcmp($a['due_at'], $b['due_at']));
        }

        // Always "next due", never month-scoped -- the whole point is a
        // stable list of what's coming up that doesn't change as the
        // user pages the day grid backward/forward through months.
        // Tagged with $userTz (already computed above), not the
        // server's default -- an untagged Carbon::now() here could
        // misclassify "next occurrence" near the user's own local
        // midnight in a non-UTC zone (found alongside the sibling
        // Budget/Dashboard timezone fixes, same session).
        $now = Carbon::now($userTz);
        $recurring = $recurringItems
            ->map(function (Item $item) use ($now) {
                $next = RecurrenceProjector::currentDue($item, $now);

                return array_merge($item->toArray(), [
                    'due_at' => $next['due']->toJSON(),
                    'created_at' => $next['cycle_start']->toJSON(),
                    'is_projected' => true,
                ]);
            })
            ->sortBy('due_at')
            ->values();

        return response()->json(['days' => $days, 'recurring' => $recurring]);
    }

    /**
     * GET /calendar/purchases -- every occurrence of a Calendar event with
     * "Implică o cumpărare", from the first one to the end of this month:
     * the Cheltuieli space lists them ("din Calendar") so its totals match
     * Budget's. `planned` = this month, day not reached yet (EventSpend).
     */
    public function purchases(Request $request)
    {
        $user = $request->user();
        $now = Carbon::now($user->timezone ?? 'UTC');

        return response()->json(['purchases' => EventSpend::untilEndOfMonth($user->id, $now)]);
    }

    /**
     * What a recurring item is projected FROM. A recurring maintenance
     * visit runs off Casă's own next date (metadata.nextDueDate, moved on
     * every time it's done), not the day it was first entered -- the same
     * anchor RecurrenceProjector::currentDue uses, so a visit that's
     * restant in Casă is restant on the same day here, and the next ones
     * fall where Casă expects them. Everything else: its own due_at.
     */
    private static function projectionAnchor(Item $item): Item
    {
        return RecurrenceProjector::projectionAnchor($item);
    }

    /**
     * Car services due by DATE inside [$start, $end] -- metadata.
     * nextServiceDate ("ZZ.LL.AAAA"), the date Mașină's "Urmează" shows.
     * Same rules as DashboardController::carServiceDue: a "Repair"
     * predicts nothing, a newer record of the same service on the same
     * car supersedes the older one's prediction. A km-only target has no
     * day, so it can't sit on a calendar (Mașină and Acasă still flag it).
     * `current_odometer` rides along for the swipe's "same as last time"
     * (lib/dashboard/itemActions.ts).
     */
    private function carServicesBetween($user, string $userTz, Carbon $start, Carbon $end)
    {
        $entries = Item::visibleTo($user)
            ->where('type', 'car_maintenance')
            ->whereNotIn('status', Item::CLOSED_STATUSES)
            ->with('space:id,name,icon,type,color')
            ->get();
        if ($entries->isEmpty()) {
            return collect();
        }

        $live = $entries->filter(function (Item $e) use ($entries) {
            if ($e->title === 'Repair') {
                return false;
            }

            return !$entries->contains(fn (Item $o) => $o->id !== $e->id
                && $o->space_id === $e->space_id
                && $o->title === $e->title
                && Item::isNewerVisit($o, $e));
        });

        $odometer = Item::visibleTo($user)
            ->whereIn('type', ['car_fuel', 'car_maintenance', 'car_expense'])
            ->whereIn('space_id', $live->pluck('space_id')->unique())
            ->get(['space_id', 'metadata'])
            ->groupBy('space_id')
            ->map(fn ($rows) => $rows->max(fn ($r) => (float) ($r->metadata['odometer'] ?? 0)));
        $odometer = CarProfile::withManualOdometers($odometer, $live->pluck('space_id'));

        return $live
            ->map(function (Item $e) use ($userTz, $odometer) {
                $next = $e->metadata['nextServiceDate'] ?? null;
                if (!is_string($next) || !preg_match('/^\d{2}\.\d{2}\.\d{4}$/', $next)) {
                    return null;
                }
                try {
                    $due = Carbon::createFromFormat('d.m.Y', $next, $userTz)->startOfDay();
                } catch (\Exception $ex) {
                    return null;
                }
                $odo = (float) ($odometer[$e->space_id] ?? 0);
                $e->setAttribute('current_odometer', $odo > 0 ? (int) round($odo) : null);
                // The visit's own date, before due_at becomes the next due day
                // (itemActions derives the interval from it -- as on /dashboard).
                $e->setAttribute('service_date', $e->due_at?->toJSON());
                $e->due_at = $due->setTimezone(config('app.timezone'));

                return $e;
            })
            ->filter(fn (?Item $e) => $e !== null && $e->due_at->between($start, $end))
            ->values();
    }
}
