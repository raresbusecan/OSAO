<?php

namespace App\Services;

use App\Models\SavingsDeposit;
use App\Models\SavingsGoal;
use Illuminate\Support\Carbon;

/**
 * Obiectiv de economii's rhythm (2026-11): the periods of a day / week /
 * month cadence, the "3 confirmed periods in a row" rule that turns the
 * reminders on, and the days the reminders fall on. All dates are local
 * calendar days in the user's timezone.
 *
 *  - day:   every calendar day is a period;
 *  - week:  7-day blocks counted from `cadence_since` (the day it was picked);
 *  - month: calendar months; the reminder falls on cadence_since's day of
 *           the month (clamped to the month's length).
 */
class SavingsCadence
{
    public const CADENCES = ['day', 'week', 'month'];

    /** Average periods per month, for Pui deoparte's monthly estimate. */
    public const PER_MONTH = ['day' => 365.25 / 12, 'week' => 365.25 / 12 / 7, 'month' => 1.0];

    public const STREAK_TO_REMIND = 3;

    public static function periodStart(string $cadence, Carbon $since, Carbon $day): Carbon
    {
        $day = $day->copy()->startOfDay();
        return match ($cadence) {
            'day' => $day,
            'week' => $since->copy()->startOfDay()->addDays(7 * intdiv(max(0, self::days($since, $day)), 7)),
            default => $day->startOfMonth(),
        };
    }

    /** Whole calendar days from $a to $b (DST-safe: a 23h day is still 1). */
    private static function days(Carbon $a, Carbon $b): int
    {
        return (int) round($a->copy()->startOfDay()->diffInDays($b->copy()->startOfDay(), false));
    }

    public static function previousPeriod(string $cadence, Carbon $start): Carbon
    {
        return match ($cadence) {
            'day' => $start->copy()->subDay(),
            'week' => $start->copy()->subDays(7),
            default => $start->copy()->subMonthNoOverflow()->startOfMonth(),
        };
    }

    /** Consecutive periods with a deposit, counted back from the current
     * period (or the previous one when the current has none yet). */
    public static function streak(SavingsGoal $goal, Carbon $today): int
    {
        if (!$goal->cadence || !$goal->cadence_since) {
            return 0;
        }
        $since = Carbon::parse($goal->cadence_since->toDateString(), $today->getTimezone());
        $done = SavingsDeposit::where('user_id', $goal->user_id)
            ->where('cadence', $goal->cadence)
            ->where('period_start', '>=', $since->toDateString())
            ->pluck('period_start')
            ->map(fn ($d) => Carbon::parse($d)->toDateString())
            ->flip();

        $period = self::periodStart($goal->cadence, $since, $today);
        if (!$done->has($period->toDateString())) {
            $period = self::previousPeriod($goal->cadence, $period);
        }
        $n = 0;
        while ($done->has($period->toDateString())) {
            $n++;
            $period = self::previousPeriod($goal->cadence, $period);
        }

        return $n;
    }

    /** The reminder days that fall in [$from, $to], in order. */
    public static function reminderDays(SavingsGoal $goal, Carbon $from, Carbon $to): array
    {
        if (!$goal->cadence || !$goal->cadence_since) {
            return [];
        }
        $tz = $from->getTimezone();
        $since = Carbon::parse($goal->cadence_since->toDateString(), $tz);
        // max() returns one of the two instances: copy, or addDay() moves $since too.
        $day = $from->copy()->startOfDay()->max($since)->copy();
        $days = [];
        while ($day->lte($to) && count($days) < 400) {
            $hit = match ($goal->cadence) {
                'day' => true,
                'week' => self::days($since, $day) % 7 === 0,
                default => $day->day === min($since->day, $day->daysInMonth),
            };
            if ($hit) {
                $days[] = $day->copy();
            }
            $day->addDay();
        }

        return $days;
    }
}
