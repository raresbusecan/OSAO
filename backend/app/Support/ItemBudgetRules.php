<?php

namespace App\Support;

use App\Models\Item;
use App\Models\Space;
use App\Models\User;
use Illuminate\Support\Carbon;

/**
 * Budget-from-income rules for an item, shared by ItemController
 * (store/update) and SpaceController::store (a car/home created "în rate"
 * creates its expense_credit in the same request). One copy of the rules;
 * callers turn the returned errors into their own 422.
 */
class ItemBudgetRules
{
    /** $item = null on create. Mutates $data (normalizes a credit's
     * derived fields) and returns `[field => [message, ...]]`, empty when
     * fine.
     *
     * - guilt_free=true only on Item::guiltFreeTypes(); an item retyped to
     *   anything else loses the flag.
     * - expense_credit: amount > 0, metadata.day_of_month 1-31,
     *   metadata.end_date 'YYYY-MM-DD' (>= today on create),
     *   metadata.linked_space_id null or one of the user's own car/home
     *   spaces (a label only), space_id required and an Expenses space.
     *   recurrence is always 'monthly' and due_at is always the next due
     *   date (start of that day, user's zone) -- computed here, never
     *   trusted from the client. */
    public static function errors(User $user, array &$data, ?Item $item = null): array
    {
        $type = $data['type'] ?? $item?->type;
        $errors = [];

        $wantsGuiltFree = array_key_exists('guilt_free', $data) ? (bool) $data['guilt_free'] : (bool) $item?->guilt_free;
        if ($wantsGuiltFree && !in_array($type, Item::guiltFreeTypes(), true)) {
            if (array_key_exists('guilt_free', $data)) {
                $errors['guilt_free'][] = 'Acest tip de înregistrare nu poate fi marcat „Bani fără vină”.';
            } else {
                $data['guilt_free'] = false;
            }
        }

        if ($type === Item::CREDIT_TYPE) {
            $tz = $user->timezone ?? 'UTC';
            $now = Carbon::now($tz);
            $amount = array_key_exists('amount', $data) ? $data['amount'] : $item?->amount;
            $meta = $data['metadata'] ?? $item?->metadata ?? [];
            $spaceId = array_key_exists('space_id', $data) ? $data['space_id'] : $item?->space_id;

            if (!is_numeric($amount) || (float) $amount <= 0) {
                $errors['amount'][] = 'Rata lunară trebuie să fie mai mare decât 0.';
            }

            $day = $meta['day_of_month'] ?? null;
            if (filter_var($day, FILTER_VALIDATE_INT) === false || (int) $day < 1 || (int) $day > 31) {
                $errors['metadata.day_of_month'][] = 'Ziua de plată trebuie să fie între 1 și 31.';
            }

            $end = $meta['end_date'] ?? null;
            $endDate = null;
            if (is_string($end) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $end)) {
                try {
                    $endDate = Carbon::createFromFormat('!Y-m-d', $end, $tz);
                    if ($endDate->format('Y-m-d') !== $end) {
                        $endDate = null;
                    }
                } catch (\Exception $e) {
                    $endDate = null;
                }
            }
            if (!$endDate) {
                $errors['metadata.end_date'][] = 'Data ultimei rate este obligatorie (AAAA-LL-ZZ).';
            } elseif (!$item && $endDate->lt($now->copy()->startOfDay())) {
                $errors['metadata.end_date'][] = 'Data ultimei rate nu poate fi în trecut.';
            }

            $linked = $meta['linked_space_id'] ?? null;
            if ($linked !== null) {
                $linkedSpace = filter_var($linked, FILTER_VALIDATE_INT) !== false
                    ? Space::where('user_id', $user->id)->find((int) $linked)
                    : null;
                // Legacy spaces have a null `type` (pre-2026-09) -- accepted,
                // since there's no reliable way to tell what they are.
                if (!$linkedSpace || !in_array($linkedSpace->type, ['car', 'home', null], true)) {
                    $errors['metadata.linked_space_id'][] = 'Spațiul legat trebuie să fie una dintre mașinile sau casele tale.';
                } else {
                    $meta['linked_space_id'] = $linkedSpace->id;
                }
            }

            $space = $spaceId ? Space::find($spaceId) : null;
            if (!$space || !in_array($space->type, ['expenses', null], true)) {
                $errors['space_id'][] = 'Un credit se adaugă în spațiul Cheltuieli.';
            }

            if (!$errors) {
                $meta['day_of_month'] = (int) $day;
                $data['metadata'] = $meta;
                $data['recurrence'] = 'monthly';
                $data['guilt_free'] = false;
                $data['status'] = $data['status'] ?? $item?->status ?? 'pending';
                $probe = new Item(['type' => Item::CREDIT_TYPE, 'metadata' => $meta]);
                // Next due date, or the last one once the credit is over
                // (still a real date, never projected past end_date).
                $due = $probe->creditNextDue($now) ?? $probe->creditDueIn($endDate);
                $data['due_at'] = $due?->setTimezone(config('app.timezone'));
            }
        }

        return $errors;
    }
}
