<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Item;
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
        // custom events. Everything else with a due_at -- car_fuel,
        // car_maintenance, car_expense, grocery_trip, home_expense,
        // expense_item -- is a log of something that already happened,
        // not a thing to plan around, and stays visible only inside its
        // own space, never on the calendar.
        $plainItemsBase = Item::visibleTo($user)
            ->whereIn('type', Item::ACTIONABLE_TYPES)
            ->whereNull('recurrence')
            ->whereNotIn('status', ['completed', 'archived']);

        // car_document can't be range-filtered by due_at in SQL -- its
        // due_at is just whenever it was logged, not its real deadline
        // (see Item::effectiveDueAt, metadata.expiryDate instead). It's
        // fetched separately without a due_at bound and filtered by its
        // effective date in PHP; a user's real document count is always
        // small, so this stays cheap.
        $plainItems = (clone $plainItemsBase)
            ->where('type', '!=', 'car_document')
            ->whereBetween('due_at', [$startUtc, $endUtc])
            ->with('space:id,name,icon')
            ->get()
            ->merge(
                (clone $plainItemsBase)
                    ->where('type', 'car_document')
                    ->whereNotNull('due_at')
                    ->with('space:id,name,icon')
                    ->get()
                    ->map(function (Item $item) {
                        $item->due_at = $item->effectiveDueAt();

                        return $item;
                    })
                    ->filter(fn (Item $item) => $item->due_at !== null && $item->due_at->between($start, $end))
            );

        $recurringItems = Item::visibleTo($user)
            ->whereIn('type', Item::RECURRING_ACTIONABLE_TYPES)
            ->whereNotNull('recurrence')
            ->whereNotNull('due_at')
            ->whereNotIn('status', ['completed', 'archived'])
            ->with('space:id,name,icon')
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
            foreach (RecurrenceProjector::occurrencesBetween($item, $start, $end) as $occurrence) {
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

        ksort($days);
        foreach ($days as &$dayItems) {
            usort($dayItems, fn ($a, $b) => strcmp($a['due_at'], $b['due_at']));
        }

        // Always "next due", never month-scoped -- the whole point is a
        // stable list of what's coming up that doesn't change as the
        // user pages the day grid backward/forward through months.
        $now = Carbon::now();
        $recurring = $recurringItems
            ->map(function (Item $item) use ($now) {
                $next = RecurrenceProjector::nextOccurrence($item, $now);

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
}
