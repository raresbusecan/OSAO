<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Item;
use App\Services\RecurrenceProjector;
use Illuminate\Support\Facades\Auth;

class DashboardController extends Controller
{
    public function index()
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $now = now();

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
        $plainItems = Item::where('user_id', $user->id)
            ->whereIn('type', Item::ACTIONABLE_TYPES)
            ->whereNull('recurrence')
            ->whereNotNull('due_at')
            ->whereNotIn('status', ['completed', 'archived'])
            ->with('space:id,name,icon')
            ->get()
            ->map(function (Item $item) {
                $item->due_at = $item->effectiveDueAt();

                return $item;
            })
            ->filter(fn (Item $item) => $item->due_at !== null)
            ->values();

        $recurringItems = Item::where('user_id', $user->id)
            ->whereIn('type', Item::RECURRING_ACTIONABLE_TYPES)
            ->whereNotNull('recurrence')
            ->whereNotNull('due_at')
            ->whereNotIn('status', ['completed', 'archived'])
            ->with('space:id,name,icon')
            ->get()
            ->map(function (Item $item) use ($now) {
                $next = RecurrenceProjector::nextOccurrence($item, $now);
                $item->due_at = $next['due'];

                return $item;
            });

        $overdue = [];
        $today = [];
        $upcoming = [];
        $sevenDaysOut = $now->copy()->addDays(7);

        foreach ($plainItems->merge($recurringItems) as $item) {
            if ($item->due_at->lt($now) && !$item->due_at->isToday()) {
                $overdue[] = $item;
            } elseif ($item->due_at->isToday()) {
                $today[] = $item;
            } elseif ($item->due_at->gt($now) && $item->due_at->lte($sevenDaysOut)) {
                $upcoming[] = $item;
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
        $monthItems = Item::where('user_id', $user->id)
            ->whereIn('type', Item::SPENDING_TYPES)
            ->whereYear('due_at', $now->year)
            ->whereMonth('due_at', $now->month)
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

        return response()->json([
            'today' => $today,
            'upcoming' => $upcoming,
            'overdue' => $overdue,
            'monthlyExpenses' => [
                'total' => $monthlyTotal,
                'sources' => $sources,
            ],
        ]);
    }
}
