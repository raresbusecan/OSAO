<?php

namespace App\Services;

use App\Models\Item;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Money spent in Casă that a plain due_at sum gets wrong (2026-10-15). A
 * purchase task and a maintenance visit log every payment as a
 * `metadata.spendHistory` event ({date, amount}) when they're resolved --
 * a recurring one many times, each in its own month -- while their due_at
 * is a deadline that moves on (a recurring task's next date, a recurring
 * visit's original date). So they're counted per event, on the day it was
 * paid; a record with no history yet falls back to its single snapshot
 * (a task's completed_at + amount, a visit's due_at + amount). Same rule
 * as the frontend's getHomeSpendRecords (spend.calculations.ts), so Casă's
 * "Luna asta", Acasă's month total and Buget all agree.
 *
 * Bills (home_recurring) are NOT here: Buget counts them as a flat monthly
 * commitment (BudgetController::recurringMonthlyForLabel). Their paid
 * events are read by billsPaid() for Simplu's Acasă only.
 *
 * Scoped by user_id, like every other spend total.
 */
class HomeSpend
{
    /** The types this service sums -- every SQL due_at sum leaves them out. */
    public const TYPES = ['home_task', 'home_maintenance'];

    /**
     * Every payment inside [$start, $end] (instant-based, any zone), oldest
     * first. Row: id (unique per payment), item_id, type, title, amount,
     * due_at (JSON, the payment's moment), guilt_free. $guiltFree: null =
     * all, false = unflagged (Buget's per-space sums), true = flagged.
     */
    public static function payments(int $userId, Carbon $start, Carbon $end, ?bool $guiltFree = null): Collection
    {
        return self::eventsOf($userId, self::TYPES, $start, $end, $guiltFree, true);
    }

    public static function total(int $userId, Carbon $month, ?bool $guiltFree = null): float
    {
        return (float) self::payments($userId, $month->copy()->startOfMonth(), $month->copy()->endOfMonth(), $guiltFree)->sum('amount');
    }

    /** Bills marked paid inside $month (their spendHistory events). */
    public static function billsPaid(int $userId, Carbon $month): float
    {
        return (float) self::eventsOf($userId, array_keys(Item::RECURRING_TYPE_SPACE), $month->copy()->startOfMonth(), $month->copy()->endOfMonth(), null, false)->sum('amount');
    }

    /** What the user's open bills still ask for up to the end of $month:
     * every unpaid occurrence from the stored due_at (a bill only moves on
     * when it's paid, so a restant one still counts) to the month's end. */
    public static function billsDue(int $userId, Carbon $month): float
    {
        $end = $month->copy()->endOfMonth();
        $sum = 0.0;
        $bills = Item::where('user_id', $userId)
            ->whereIn('type', array_keys(Item::RECURRING_TYPE_SPACE))
            ->whereNotNull('recurrence')
            ->whereNotNull('due_at')
            ->where('amount', '>', 0)
            ->whereNotIn('status', Item::CLOSED_STATUSES)
            ->get();
        foreach ($bills as $bill) {
            $from = Carbon::parse($bill->due_at)->setTimezone($month->getTimezone());
            $sum += count(RecurrenceProjector::occurrencesBetween($bill, $from, $end)) * (float) $bill->amount;
        }

        return $sum;
    }

    private static function eventsOf(int $userId, array $types, Carbon $start, Carbon $end, ?bool $guiltFree, bool $snapshotFallback): Collection
    {
        $rows = collect();
        $items = Item::where('user_id', $userId)
            ->whereIn('type', $types)
            ->when($guiltFree !== null, fn ($q) => $q->where('guilt_free', $guiltFree))
            ->get(['id', 'space_id', 'type', 'title', 'amount', 'due_at', 'completed_at', 'metadata', 'guilt_free']);

        foreach ($items as $item) {
            $meta = is_array($item->metadata) ? $item->metadata : [];
            // A task is spend only as a purchase (the frontend's rule too).
            if ($item->type === 'home_task' && empty($meta['isPurchase'])) {
                continue;
            }
            $history = is_array($meta['spendHistory'] ?? null) ? $meta['spendHistory'] : [];

            if ($history) {
                foreach ($history as $i => $event) {
                    $amount = (float) ($event['amount'] ?? 0);
                    $at = self::parse($event['date'] ?? null);
                    if ($amount > 0 && $at && $at->between($start, $end)) {
                        $rows->push(self::row($item, $at, $amount, "hs-{$item->id}-{$i}"));
                    }
                }
                continue;
            }

            if (!$snapshotFallback) {
                continue;
            }
            $amount = (float) $item->amount;
            $at = self::parse($item->type === 'home_task' ? $item->completed_at : $item->due_at);
            if ($amount > 0 && $at && $at->between($start, $end)) {
                $rows->push(self::row($item, $at, $amount, "hs-{$item->id}"));
            }
        }

        return $rows->sortBy('due_at')->values();
    }

    private static function parse($value): ?Carbon
    {
        if (!$value) {
            return null;
        }
        try {
            return Carbon::parse($value);
        } catch (\Exception $e) {
            return null;
        }
    }

    private static function row(Item $item, Carbon $at, float $amount, string $id): array
    {
        return [
            'id' => $id,
            'item_id' => $item->id,
            'space_id' => $item->space_id,
            'type' => $item->type,
            'title' => $item->title,
            'amount' => $amount,
            'currency' => 'RON',
            'due_at' => $at->copy()->setTimezone('UTC')->toJSON(),
            'guilt_free' => (bool) $item->guilt_free,
        ];
    }
}
