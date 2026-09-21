<?php

namespace App\Services;

use App\Models\Item;
use Illuminate\Support\Carbon;

/**
 * Everywhere an Item with `recurrence` set needs its NEXT real occurrence
 * -- never the raw stored `due_at`, which is just whatever date it was
 * last set to and never rolls forward on its own (see homeItems.ts's
 * recurringEntryToItemBody: `nextDueDate` is set once, at creation or
 * edit, nothing advances it automatically). Shared by CalendarController
 * (day-by-day projection for the grid + the "recurring upcoming" list),
 * BudgetController (the Budget tab's own recurring-bills list) and
 * DashboardController (Home's overdue/today/upcoming classification) --
 * one implementation, so "when is this actually due next" can never
 * drift between screens.
 */
class RecurrenceProjector
{
    // Which Carbon step (add/sub) one cycle of a recurrence is -- plural
    // method names since every call site now passes an explicit interval
    // (interval() below), not just the single-step default. 'monthly' is
    // the fallback (covers an unrecognized value too, same default
    // BudgetController::monthlyRecurringEquivalent uses).
    public static function step(?string $recurrence): array
    {
        return match ($recurrence) {
            'weekly' => ['add' => 'addWeeks', 'sub' => 'subWeeks'],
            'yearly' => ['add' => 'addYears', 'sub' => 'subYears'],
            default => ['add' => 'addMonthsNoOverflow', 'sub' => 'subMonthsNoOverflow'],
        };
    }

    // "Every N periods" -- 1 for a plain recurring bill (every single
    // week/month/year, the only thing this supported before), or higher
    // for e.g. a maintenance visit done every 3 months (see
    // homeCategoryConfig.ts's maintenance category, the first feature to
    // actually set this). Stored in metadata rather than its own column
    // -- no schema change needed, same reasoning as every other
    // type-specific flag on Item. Defaults to 1 for any item that never
    // set it, so every existing recurring item behaves exactly as before.
    private static function interval(Item $item): int
    {
        $n = (int) ($item->metadata['recurrenceInterval'] ?? 1);

        return $n > 0 ? $n : 1;
    }

    // The single NEXT occurrence relative to $now -- if the stored
    // due_at is still in the future, that IS the next occurrence
    // (nothing to fast-forward); if it's in the past, steps forward
    // until it isn't. Capped so a years-stale due_at (or a malformed
    // recurrence) can't loop indefinitely.
    public static function nextOccurrence(Item $item, Carbon $now): array
    {
        $step = self::step($item->recurrence);
        $n = self::interval($item);
        $cursor = Carbon::parse($item->due_at);
        $iterations = 0;

        while ($cursor->lt($now) && $iterations < 600) {
            $cursor->{$step['add']}($n);
            $iterations++;
        }

        return ['due' => $cursor, 'cycle_start' => $cursor->copy()->{$step['sub']}($n)];
    }

    // Every occurrence that falls inside [$start, $end] -- a weekly
    // item can land more than once in the same window; that's correct,
    // not a bug. Used for the calendar's month-by-month day grid, where
    // a single "next occurrence" isn't enough.
    public static function occurrencesBetween(Item $item, Carbon $start, Carbon $end): array
    {
        $step = self::step($item->recurrence);
        $n = self::interval($item);
        $cursor = Carbon::parse($item->due_at);
        $occurrences = [];
        $iterations = 0;

        while ($cursor->lt($start) && $iterations < 600) {
            $cursor->{$step['add']}($n);
            $iterations++;
        }

        while ($cursor->lte($end) && $iterations < 660) {
            $cycleStart = $cursor->copy()->{$step['sub']}($n);
            $occurrences[] = ['due' => $cursor->copy(), 'cycle_start' => $cycleStart];
            $cursor->{$step['add']}($n);
            $iterations++;
        }

        return $occurrences;
    }
}
