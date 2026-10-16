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

    // A fixed day of the month the item is due on (metadata.day_of_month,
    // 1-31 -- today only expense_credit sets it), or null. Monthly steps
    // re-clamp to min(day, daysInMonth) every cycle: addMonthsNoOverflow
    // alone turns a 31st into 28 Feb and then STAYS on the 28th forever
    // (31 Jan -> 28 Feb -> 28 Mar), the day-31 drift a credit can't have.
    private static function anchorDay(Item $item): ?int
    {
        if (self::step($item->recurrence)['add'] !== 'addMonthsNoOverflow') {
            return null;
        }
        $day = (int) ($item->metadata['day_of_month'] ?? 0);

        return $day >= 1 && $day <= 31 ? $day : null;
    }

    // One step of $n cycles ('add' or 'sub'), on $c itself.
    private static function move(Carbon $c, array $step, string $dir, int $n, ?int $anchorDay): Carbon
    {
        $c->{$step[$dir]}($n);
        if ($anchorDay !== null) {
            $c->day(min($anchorDay, $c->daysInMonth));
        }

        return $c;
    }

    /** Types whose stored due_at only moves when the user resolves the
     * current occurrence (Casă advances it on "rezolvat") -- an unpaid
     * bill stays due on its original date instead of silently rolling
     * forward to next month. */
    private const HELD_TYPES = ['home_recurring', 'home_task'];

    // Stepping happens in the USER's zone ($now/$start carry it): adding
    // a month to a UTC instant drifts across a DST change -- a bill due
    // 00:00 Bucharest in September (21:00 UTC) landed on 23:00 the day
    // BEFORE once Bucharest left summer time on 25 October. Results go
    // back to the app zone because callers assign them to the
    // datetime-cast due_at, which drops the zone.
    private static function inZone($value, Carbon $ref): Carbon
    {
        return Carbon::parse($value)->setTimezone($ref->getTimezone());
    }

    private static function out(Carbon $c): Carbon
    {
        return $c->copy()->setTimezone(config('app.timezone'));
    }

    // The occurrence that is due RIGHT NOW from the user's point of view:
    // for a held type that's its stored due_at, even if it's already in
    // the past (that's what makes it "restant"); for a recurring
    // maintenance visit it's the next date Casă computed
    // (metadata.nextDueDate); everything else (e.g. a birthday) just
    // projects to the next occurrence. Dashboard, Calendar and Budget
    // all use this so the same bill reads the same everywhere.
    public static function currentDue(Item $item, Carbon $now): array
    {
        $step = self::step($item->recurrence);
        $n = self::interval($item);

        if (in_array($item->type, self::HELD_TYPES, true) && $item->due_at) {
            $due = self::inZone($item->due_at, $now);
            if ($due->lt($now)) {
                return ['due' => self::out($due), 'cycle_start' => self::out($due->copy()->{$step['sub']}($n))];
            }
        }

        if ($item->type === 'home_maintenance') {
            $next = $item->metadata['nextDueDate'] ?? null;
            if (is_string($next) && $next !== '') {
                try {
                    $due = self::inZone($next, $now);

                    return ['due' => self::out($due), 'cycle_start' => self::out($due->copy()->{$step['sub']}($n))];
                } catch (\Exception $e) {
                    // fall through to the plain projection
                }
            }
        }

        return self::nextOccurrence($item, $now);
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
        $anchorDay = self::anchorDay($item);
        $cursor = self::inZone($item->due_at, $now);
        $iterations = 0;

        while ($cursor->lt($now) && $iterations < 600) {
            self::move($cursor, $step, 'add', $n, $anchorDay);
            $iterations++;
        }

        return ['due' => self::out($cursor), 'cycle_start' => self::out(self::move($cursor->copy(), $step, 'sub', $n, $anchorDay))];
    }

    // Every occurrence that falls inside [$start, $end] -- a weekly
    // item can land more than once in the same window; that's correct,
    // not a bug. Used for the calendar's month-by-month day grid, where
    // a single "next occurrence" isn't enough. The fast-forward and the
    // enumeration have SEPARATE caps -- they used to share one counter,
    // so a very old weekly item could spend most of it just catching up
    // to $start and then list only part of the requested month.
    public static function occurrencesBetween(Item $item, Carbon $start, Carbon $end): array
    {
        $step = self::step($item->recurrence);
        $n = self::interval($item);
        $anchorDay = self::anchorDay($item);
        $cursor = self::inZone($item->due_at, $start);
        $occurrences = [];

        $skipped = 0;
        while ($cursor->lt($start) && $skipped < 5000) {
            self::move($cursor, $step, 'add', $n, $anchorDay);
            $skipped++;
        }

        $listed = 0;
        while ($cursor->lte($end) && $listed < 60) {
            $cycleStart = self::move($cursor->copy(), $step, 'sub', $n, $anchorDay);
            $occurrences[] = ['due' => self::out($cursor), 'cycle_start' => self::out($cycleStart)];
            self::move($cursor, $step, 'add', $n, $anchorDay);
            $listed++;
        }

        return $occurrences;
    }

    /** A recurring home_maintenance projects from metadata.nextDueDate when
     * set (what Casă shows), not from the stored due_at -- shared by
     * Calendar and the Spații card counts. */
    public static function projectionAnchor(Item $item): Item
    {
        $next = $item->metadata['nextDueDate'] ?? null;
        if ($item->type !== 'home_maintenance' || !is_string($next) || $next === '') {
            return $item;
        }
        try {
            $anchor = clone $item;
            // App zone before assigning: the datetime cast drops the zone.
            $anchor->due_at = Carbon::parse($next)->setTimezone(config('app.timezone'));

            return $anchor;
        } catch (\Exception $e) {
            return $item;
        }
    }
}
