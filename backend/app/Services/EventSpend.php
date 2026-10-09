<?php

namespace App\Services;

use App\Models\Item;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * The money a Calendar event with "Implică o cumpărare" stands for (user,
 * 2026-10-05): PLANNED until its day, SPENT from its day on (an event
 * already marked done counts as spent whatever its date), and a repeating
 * one counts at every occurrence, in the month that occurrence falls in --
 * not once, in the month it was first entered. Budget, Acasă and the
 * Cheltuieli space all read it from here so the three always agree.
 *
 * Scoped by user_id, like every other spend total (BudgetController,
 * DashboardController).
 */
class EventSpend
{
    /**
     * Every purchase occurrence inside [$start, $end] (any zone -- the
     * comparisons are instant-based), oldest first. Each row:
     * id, title, amount, due_at (JSON), planned, recurrence, guilt_free.
     *
     * $guiltFree filters on the "Bani fără vină" flag: null = every
     * purchase (Dashboard's month total, the Cheltuieli list), false =
     * only unflagged ones (Budget's per-space sums), true = only flagged
     * ones (Budget's guilt-free jar).
     */
    public static function occurrences(int $userId, Carbon $start, Carbon $end, Carbon $now, ?bool $guiltFree = null): Collection
    {
        $endOfToday = $now->copy()->endOfDay();
        $rows = collect();

        $events = Item::where('user_id', $userId)
            ->where('type', 'custom_event')
            ->whereNotNull('due_at')
            ->where('amount', '>', 0)
            ->when($guiltFree !== null, fn ($q) => $q->where('guilt_free', $guiltFree))
            ->get();

        foreach ($events as $event) {
            $done = in_array($event->status, Item::CLOSED_STATUSES, true);

            if (!$event->recurrence) {
                $due = Carbon::parse($event->due_at);
                if ($due->between($start, $end)) {
                    $rows->push(self::row($event, $due, !$done && $due->gt($endOfToday)));
                }
                continue;
            }

            // A stopped series (closed) no longer stands for any money.
            if ($done) {
                continue;
            }
            // Month by month: occurrencesBetween lists at most 60 per call,
            // which a weekly event over a long range would hit.
            $cursor = $start->copy()->startOfMonth();
            while ($cursor->lte($end)) {
                $from = $cursor->lt($start) ? $start->copy() : $cursor->copy();
                $monthEnd = $cursor->copy()->endOfMonth();
                $to = $monthEnd->gt($end) ? $end->copy() : $monthEnd;
                foreach (RecurrenceProjector::occurrencesBetween($event, $from, $to) as $occurrence) {
                    $rows->push(self::row($event, $occurrence['due'], $occurrence['due']->gt($endOfToday)));
                }
                $cursor = $cursor->copy()->addMonthNoOverflow()->startOfMonth();
            }
        }

        return $rows->sortBy('due_at')->values();
    }

    /** Spent and planned for one month ($month carries the user's zone).
     * $guiltFree: see occurrences(). */
    public static function totals(int $userId, Carbon $month, Carbon $now, ?bool $guiltFree = null): array
    {
        $rows = self::occurrences($userId, $month->copy()->startOfMonth(), $month->copy()->endOfMonth(), $now, $guiltFree);

        return [
            'spent' => (float) $rows->where('planned', false)->sum('amount'),
            'planned' => (float) $rows->where('planned', true)->sum('amount'),
        ];
    }

    /** From the first purchase event's month to the end of this month --
     * everything the Cheltuieli space lists (past = spent, this month's
     * later days = planned). */
    public static function untilEndOfMonth(int $userId, Carbon $now): Collection
    {
        $first = Item::where('user_id', $userId)
            ->where('type', 'custom_event')
            ->whereNotNull('due_at')
            ->where('amount', '>', 0)
            ->min('due_at');
        if (!$first) {
            return collect();
        }

        $start = Carbon::parse($first)->setTimezone($now->getTimezone())->startOfMonth();

        return self::occurrences($userId, $start, $now->copy()->endOfMonth(), $now);
    }

    private static function row(Item $event, Carbon $due, bool $planned): array
    {
        return [
            'id' => $event->id,
            'title' => $event->title,
            'amount' => (float) $event->amount,
            'due_at' => $due->copy()->setTimezone('UTC')->toJSON(),
            'planned' => $planned,
            'recurrence' => $event->recurrence,
            'guilt_free' => (bool) $event->guilt_free,
        ];
    }
}
