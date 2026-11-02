<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BudgetArchive;
use App\Models\Item;
use App\Models\SavingsDeposit;
use App\Models\SavingsGoal;
use App\Models\User;
use App\Services\EventSpend;
use App\Services\HomeSpend;
use App\Services\RecurrenceProjector;
use App\Services\SavingsCadence;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;

class BudgetController extends Controller
{
    // A limit's `category` is a SPACE label ("Car", "Home", ...), not a
    // free-typed item category -- most spending records never had that
    // column filled in at all (car_fuel/car_maintenance/car_document
    // never set it, only car_expense's own free-typed field did), so
    // matching on it directly missed almost everything. This is the
    // same type->label map DashboardController's own Monthly Expenses
    // breakdown already groups by, inverted to label->types -- reusing
    // it is what makes a "Car: 800 RON" limit actually reflect every
    // real car_fuel/car_maintenance/car_document/car_expense record.
    private function typesForLabel(string $label): array
    {
        $typesByLabel = [];
        foreach (Item::SPENDING_TYPE_SPACE as $type => $meta) {
            $typesByLabel[$meta['label']][] = $type;
        }

        return $typesByLabel[$label] ?? [];
    }

    // Same shape as typesForLabel, but for RECURRING_TYPE_SPACE instead
    // of SPENDING_TYPE_SPACE -- today only "Home" ever has entries
    // (home_recurring is the only recurring type that exists), but any
    // future *_recurring type for another space folds in automatically
    // just by being added to that map, no controller change needed.
    private function recurringTypesForLabel(string $label): array
    {
        $typesByLabel = [];
        foreach (Item::RECURRING_TYPE_SPACE as $type => $spaceLabel) {
            $typesByLabel[$spaceLabel][] = $type;
        }

        return $typesByLabel[$label] ?? [];
    }

    // A recurring bill's amount, normalized to what it costs PER MONTH
    // regardless of how often it actually charges -- weekly bills
    // charge ~4.33x a month, yearly ones a twelfth each month. Without
    // this, a weekly bill would look 4x cheaper than it really is next
    // to a monthly one of the same face amount.
    private function monthlyRecurringEquivalent(float $amount, ?string $recurrence): float
    {
        return match ($recurrence) {
            'weekly' => $amount * 52 / 12,
            'yearly' => $amount / 12,
            default => $amount, // 'monthly' or anything unrecognized
        };
    }

    // Every ACTIVE recurring bill for a space, summed as a flat
    // monthly-equivalent -- deliberately NOT scoped to a specific
    // Carbon month like monthlySumForLabel's due_at sum is: a standing
    // commitment counts the same in every month, past or present,
    // there's no record of exactly when it started. Same "apply today's
    // reality to every month" approximation already used for budget
    // limits applied retroactively elsewhere in this controller.
    private function recurringMonthlyForLabel(int $userId, string $label): float
    {
        $types = $this->recurringTypesForLabel($label);
        if (!$types) {
            return 0.0;
        }

        return (float) Item::where('user_id', $userId)
            ->whereIn('type', $types)
            ->whereNotNull('recurrence')
            ->whereNotIn('status', Item::CLOSED_STATUSES)
            ->get(['amount', 'recurrence'])
            ->sum(fn (Item $item) => $this->monthlyRecurringEquivalent((float) $item->amount, $item->recurrence));
    }

    // One month's total for one space label -- the same shape every
    // month-scoped sum in this controller needs, so index()/
    // spaceDetail() just call this with a different Carbon instead of
    // each rebuilding the same 4-line query. Folds in that space's
    // recurring commitments (see recurringMonthlyForLabel above) on top
    // of the real dated transactions, so "spent" is never missing a
    // standing bill just because nothing was logged with today's date.
    // $month is expected to already carry the user's OWN timezone (see
    // index()/spaceDetail()'s own $now = Carbon::now($userTz)) -- start/
    // end of month computed in THAT timezone, then converted to UTC for
    // the raw SQL comparison below. whereYear()/whereMonth() (the
    // previous approach) run directly against due_at's stored value
    // with zero timezone awareness -- the exact same gotcha
    // CalendarController's own $startUtc/$endUtc already works around
    // for its whereBetween query. Found by this session's full-app QA
    // sweep, live-reproduced: a purchase the user picked as "next
    // month" (e.g. just past midnight, Bucharest) silently counted
    // toward the CURRENT month's spend here, while Calendar (already
    // timezone-aware) correctly showed it in the month the user meant.
    private function monthWindowUtc(Carbon $month): array
    {
        return [
            $month->copy()->startOfMonth()->setTimezone('UTC'),
            $month->copy()->endOfMonth()->setTimezone('UTC'),
        ];
    }

    private function monthlySumForLabel(int $userId, array $types, Carbon $month, string $label): float
    {
        [$startUtc, $endUtc] = $this->monthWindowUtc($month);

        // Calendar purchases aren't a plain due_at sum: planned until their
        // day, every occurrence of a repeating one counted (EventSpend).
        // Both halves are part of the month's committed total, like the
        // recurring bills; the frontend shows `planned` apart.
        $datedTypes = array_values(array_diff($types, ['custom_event'], HomeSpend::TYPES));
        $dated = $datedTypes
            ? (float) Item::where('user_id', $userId)
                ->whereIn('type', $datedTypes)
                ->whereBetween('due_at', [$startUtc, $endUtc])
                ->sum('amount')
            : 0.0;
        // Casă purchases / maintenance: on the day each was paid (HomeSpend).
        if (array_intersect($types, HomeSpend::TYPES)) {
            $dated += HomeSpend::total($userId, $month, null);
        }
        // Buget simplu (2026-11): the old "Bani fără vină" flag is ignored --
        // every record counts (null = no guilt_free filter).
        $events = in_array('custom_event', $types, true)
            ? EventSpend::totals($userId, $month, Carbon::now($month->getTimezone()), null)
            : ['spent' => 0.0, 'planned' => 0.0];

        return $dated + $events['spent'] + $events['planned'] + $this->recurringMonthlyForLabel($userId, $label);
    }

    // Calendar purchases still ahead this month, per space label -- already
    // inside `spent`/`this_month` (monthlySumForLabel), shown apart as
    // "planificat" (hatched in BudgetSplitBar), never as "Cheltuit".
    private function plannedForLabel(int $userId, array $types, Carbon $now): float
    {
        return in_array('custom_event', $types, true) ? EventSpend::totals($userId, $now, $now, null)['planned'] : 0.0;
    }

    // "Ritmul lunii" (Buget, 2026-11): this month's RECORDED spend for one
    // label, day by day in the user's zone, plus every Calendar purchase
    // occurrence. Counts exactly what monthlySumForLabel counts minus the
    // flat recurring bills and the planned purchases, so
    //   Σ daily == this_month − recurring − planned   (BudgetPaceTest).
    // Buckets in PHP via setTimezone -- never SQL DATE()/CONVERT_TZ (no tz
    // tables guaranteed; the UTC/local bug class Calendar already hit).
    // A recorded row dated later this month (an expense_item typed with a
    // future date, a payment dated ahead) is already in this_month as spent,
    // so it lands on TODAY: the line never runs ahead of today and its end
    // still equals "Cheltuit".
    private function paceForLabel(int $userId, array $types, Carbon $now): array
    {
        $tz = $now->getTimezone();
        $daysInMonth = $now->daysInMonth;
        $today = $now->day;
        $monthStart = $now->copy()->startOfMonth();
        $monthEnd = $now->copy()->endOfMonth();
        $daily = array_fill(0, $daysInMonth, 0.0);
        $add = function ($at, float $amount) use (&$daily, $tz, $today) {
            $day = min(Carbon::parse($at)->setTimezone($tz)->day, $today);
            $daily[$day - 1] += $amount;
        };

        [$startUtc, $endUtc] = $this->monthWindowUtc($now);
        $datedTypes = array_values(array_diff($types, ['custom_event'], HomeSpend::TYPES));
        if ($datedTypes) {
            Item::where('user_id', $userId)
                ->whereIn('type', $datedTypes)
                ->whereBetween('due_at', [$startUtc, $endUtc])
                ->get(['due_at', 'amount'])
                ->each(fn (Item $row) => $add($row->due_at, (float) $row->amount));
        }
        if (array_intersect($types, HomeSpend::TYPES)) {
            foreach (HomeSpend::payments($userId, $monthStart, $monthEnd, null) as $payment) {
                $add($payment['due_at'], (float) $payment['amount']);
            }
        }

        $events = [];
        if (in_array('custom_event', $types, true)) {
            foreach (EventSpend::occurrences($userId, $monthStart, $monthEnd, $now, null) as $occurrence) {
                if (!$occurrence['planned']) {
                    $add($occurrence['due_at'], (float) $occurrence['amount']);
                }
                $events[] = [
                    'day' => Carbon::parse($occurrence['due_at'])->setTimezone($tz)->day,
                    'amount' => round((float) $occurrence['amount'], 2),
                    'planned' => (bool) $occurrence['planned'],
                    'title' => $occurrence['title'],
                ];
            }
            usort($events, fn ($a, $b) => $a['day'] <=> $b['day']);
        }

        return [
            'daily' => array_map(fn ($v) => round($v, 2), $daily),
            'events' => $events,
        ];
    }

    // The single largest line item of a month -- a dated record, or a
    // Calendar purchase whose day has come (a planned one isn't spent).
    private function biggestInMonth(int $userId, array $types, Carbon $month): ?array
    {
        [$startUtc, $endUtc] = $this->monthWindowUtc($month);
        $datedTypes = array_values(array_diff($types, ['custom_event'], HomeSpend::TYPES));
        $item = $datedTypes
            ? Item::where('user_id', $userId)
                ->whereIn('type', $datedTypes)
                ->whereNotNull('amount')
                ->whereBetween('due_at', [$startUtc, $endUtc])
                ->orderByDesc('amount')
                ->first(['title', 'amount'])
            : null;
        $best = $item ? ['title' => $item->title, 'amount' => (float) $item->amount] : null;

        if (array_intersect($types, HomeSpend::TYPES)) {
            $payment = HomeSpend::payments($userId, $month->copy()->startOfMonth(), $month->copy()->endOfMonth(), null)->sortByDesc('amount')->first();
            if ($payment && (!$best || $payment['amount'] > $best['amount'])) {
                $best = ['title' => $payment['title'], 'amount' => $payment['amount']];
            }
        }

        if (in_array('custom_event', $types, true)) {
            $event = EventSpend::occurrences($userId, $month->copy()->startOfMonth(), $month->copy()->endOfMonth(), Carbon::now($month->getTimezone()), null)
                ->where('planned', false)
                ->sortByDesc('amount')
                ->first();
            if ($event && (!$best || $event['amount'] > $best['amount'])) {
                $best = ['title' => $event['title'], 'amount' => $event['amount']];
            }
        }

        return $best;
    }

    // ---- Buget simplu (2026-11) --------------------------------------
    // Venit (users.monthly_income) -> Pui deoparte (users.monthly_set_aside)
    // -> De cheltuit = venit - pus deoparte. The old 5-jar `budget_split`,
    // `budget_categories` limits and `items.guilt_free` flags stay in the DB
    // and are no longer read.

    /** budget_archives.category values of the non-space rows. GuiltFree is
     * only ever read now (old months); Spendable is written from 2026-11. */
    private const ARCHIVE_GUILT_FREE = 'GuiltFree';
    private const ARCHIVE_CREDIT = 'Credit';
    private const ARCHIVE_SPENDABLE = 'Spendable';

    /** users.monthly_set_aside only exists once the 2026_11_02 migration
     * ran; until then every read treats it as null (= 0) and savePlan
     * refuses to write. Cached per process. */
    private static ?bool $hasSetAsideColumn = null;

    private function hasSetAsideColumn(): bool
    {
        return self::$hasSetAsideColumn ??= Schema::hasColumn('users', 'monthly_set_aside');
    }

    /** The 2026_11_02_000003 migration (cadence + savings_deposits) ran. */
    private static ?bool $hasCadence = null;

    private function hasCadence(): bool
    {
        return self::$hasCadence ??= Schema::hasTable('savings_deposits');
    }

    /** Σ "Am pus deoparte" taps in the user's local month of $month. */
    private function depositsInMonth(int $userId, Carbon $month): float
    {
        if (!$this->hasCadence()) {
            return 0.0;
        }

        return round((float) SavingsDeposit::where('user_id', $userId)
            ->whereBetween('deposited_on', [$month->copy()->startOfMonth()->toDateString(), $month->copy()->endOfMonth()->toDateString()])
            ->sum('amount'), 2);
    }

    /** The goal as GET /budget sends it, plus its rhythm's live state:
     * `streak` (periods in a row confirmed), `period_done` (the current
     * period has a deposit), `deposited_this_month`. */
    private function goalPayload(?SavingsGoal $goal, Carbon $today): ?array
    {
        if (!$goal) {
            return null;
        }
        $out = $goal->toArray();
        if (!$this->hasCadence()) {
            return $out;
        }
        $out['deposited_this_month'] = $this->depositsInMonth($goal->user_id, $today);
        $out['streak'] = SavingsCadence::streak($goal, $today);
        $out['period_done'] = false;
        if ($goal->cadence && $goal->cadence_since) {
            $since = Carbon::parse($goal->cadence_since->toDateString(), $today->getTimezone());
            $out['period_done'] = SavingsDeposit::where('user_id', $goal->user_id)
                ->where('cadence', $goal->cadence)
                ->where('period_start', SavingsCadence::periodStart($goal->cadence, $since, $today)->toDateString())
                ->exists();
        }

        return $out;
    }

    /** The user's plan, or null when no income was ever saved. */
    private function plan(User $user): ?array
    {
        if ($user->monthly_income === null) {
            return null;
        }
        $income = (float) $user->monthly_income;
        // A missing column (migration not run) reads as null -> 0.
        $aside = min($income, max(0.0, (float) ($user->monthly_set_aside ?? 0)));

        return [
            'monthly_income' => $income,
            'set_aside' => $aside,
            'spendable' => round($income - $aside, 2),
        ];
    }

    /** First month the plan rule applies to (the month PUT /budget/plan was
     * first called in), in the zone of $ref; null = no known start. */
    private function planStart(User $user, Carbon $ref): ?Carbon
    {
        return $user->budget_plan_set_at
            ? $user->budget_plan_set_at->copy()->setTimezone($ref->getTimezone())->startOfMonth()
            : null;
    }

    private function planAppliesTo(?Carbon $planStart, Carbon $month): bool
    {
        return !$planStart || $month->format('Y-m') >= $planStart->format('Y-m');
    }

    /** Σ monthly rates of the credits still running in $month. */
    private function creditRatesForMonth(int $userId, Carbon $month): array
    {
        $credits = Item::where('user_id', $userId)->activeCredits($month)->get(['amount']);

        return ['rates' => round((float) $credits->sum('amount'), 2), 'count' => $credits->count()];
    }

    /** One month's committed total against De cheltuit: every space label's
     * monthlySumForLabel (recorded + flat bills + Calendar purchases) plus
     * the credit rates running that month. `spaces` = per label. */
    private function committedForMonth(int $userId, Carbon $month): array
    {
        $spaces = [];
        foreach (array_unique(array_column(Item::SPENDING_TYPE_SPACE, 'label')) as $label) {
            $spaces[$label] = $this->monthlySumForLabel($userId, $this->typesForLabel($label), $month, $label);
        }
        $credit = $this->creditRatesForMonth($userId, $month);

        return [
            'spaces' => $spaces,
            'credit' => $credit,
            'committed' => round(array_sum($spaces) + $credit['rates'], 2),
        ];
    }

    // Rolls each completed month into the savings goal, one month at a
    // time since the last month already applied -- called from index() so
    // it happens lazily on whatever GET /api/budget request first notices a
    // newly completed month, no cron/queue needed.
    //
    // Buget simplu (2026-11): for each month on/after the plan's start,
    //   added = A + (E - committed) = income - committed
    // where committed = Σ labels monthlySumForLabel + that month's credit
    // rates. Overspending is negative and reduces Economii (current_amount
    // may go below 0 -- the frontend decides how to show it). Credits DO
    // reduce Economii now (user decision 2026-11-02, reversing the jar
    // model's "credits never reduce Economii"). Uses TODAY's plan values
    // for every month, like before. No plan -> nothing to roll; the cursor
    // just moves forward. Leftover budget_categories rows are ignored (the
    // limits loop that still read them is gone). Months already applied are
    // never recomputed.
    private function applyMonthlySavings(User $user, SavingsGoal $goal, Carbon $lastMonth): SavingsGoal
    {
        $lastMonthStart = $lastMonth->copy()->startOfMonth();

        // Never applied before -- this call just sets the baseline so
        // future completed months accumulate from here, without back-
        // dating a bonus (or penalty) for months before the goal even
        // existed.
        if (!$goal->last_applied_month) {
            $goal->last_applied_month = $lastMonthStart;
            $goal->save();

            return $goal;
        }

        // The date cast parses as midnight UTC -- re-read it in the user's
        // own timezone (like archiveCompletedMonths), or every month below
        // is summed over UTC boundaries.
        $cursor = Carbon::parse($goal->last_applied_month->toDateString(), $lastMonth->getTimezone())->startOfMonth();
        if (!$cursor->lt($lastMonthStart)) {
            return $goal;
        }

        $plan = $this->plan($user);
        $planStart = $this->planStart($user, $lastMonth);
        $added = 0.0;

        while ($cursor->lt($lastMonthStart)) {
            $cursor->addMonthNoOverflow();
            if ($plan && $this->planAppliesTo($planStart, $cursor)) {
                // Minus what the user already put in by hand that month
                // ("Am pus deoparte" on the card) -- it's in Economii already.
                $added += $plan['monthly_income'] - $this->committedForMonth($user->id, $cursor)['committed']
                    - $this->depositsInMonth($user->id, $cursor);
            }
        }

        $goal->current_amount = round((float) $goal->current_amount + $added, 2);
        $goal->last_applied_month = $lastMonthStart;
        $goal->save();

        return $goal;
    }

    // Writes one row per space, per completed month, so later changes can
    // never rewrite what a past month's numbers actually were -- a
    // permanent, point-in-time record. Runs unconditionally from index()
    // (not gated on a savings goal existing): it's general history.
    //
    // Idempotent via updateOrCreate on (user, month, category). With
    // nothing archived yet, this call archives only the single most-
    // recently-completed month, never a deep backfill; every call after
    // that catches up whatever completed month(s) it hasn't seen yet.
    //
    // Buget simplu (2026-11): space rows carry no limit (budget_limit and
    // diff null). Extra rows per month:
    //  - 'Credit': spent = Σ rates of the credits running that month
    //    (only when one ran), budget_limit null;
    //  - 'Spendable' (when a plan applies to that month): budget_limit = De
    //    cheltuit, spent = committed (spaces + credit rates), diff = the
    //    difference. GET /budget/archive takes its month totals from it.
    // No more 'GuiltFree' rows; old ones stay as history.
    private function archiveCompletedMonths(User $user, Carbon $lastMonth): void
    {
        $userId = $user->id;
        $lastMonthStart = $lastMonth->copy()->startOfMonth();
        $latestArchived = BudgetArchive::where('user_id', $userId)->max('month');

        $cursor = $latestArchived
            // Parsed in the user's zone: a UTC cursor (1st 00:00 UTC) is
            // AFTER the user's 1st 00:00 in any UTC+ zone, so the last
            // completed month used to be skipped until a month later.
            ? Carbon::parse($latestArchived, $lastMonth->getTimezone())->startOfMonth()->addMonthNoOverflow()
            : $lastMonthStart->copy();

        // Before the 2026_11_02 migration the set-aside reads as 0, so a
        // Spendable row would be frozen at the full income. Archive rows are
        // never rewritten once a month is past the cursor -- wait for the
        // column instead (the catch-up loop fills the gap afterwards).
        if ($cursor->gt($lastMonthStart) || !$this->hasSetAsideColumn()) {
            return;
        }

        $plan = $this->plan($user);
        $planStart = $this->planStart($user, $lastMonth);

        while ($cursor->lte($lastMonthStart)) {
            $month = $this->committedForMonth($userId, $cursor);
            $rows = [];
            foreach ($month['spaces'] as $label => $spent) {
                // Nothing spent -- e.g. a space created well after this
                // month passed. An empty row would just be noise.
                if ($spent > 0) {
                    $rows[$label] = [null, $spent];
                }
            }
            if ($month['credit']['count'] > 0) {
                $rows[self::ARCHIVE_CREDIT] = [null, $month['credit']['rates']];
            }
            if ($plan && $this->planAppliesTo($planStart, $cursor)) {
                $rows[self::ARCHIVE_SPENDABLE] = [$plan['spendable'], $month['committed']];
            }

            foreach ($rows as $category => [$limitAmount, $spent]) {
                BudgetArchive::updateOrCreate(
                    ['user_id' => $userId, 'month' => $cursor->toDateString(), 'category' => $category],
                    [
                        'budget_limit' => $limitAmount,
                        'spent' => $spent,
                        'diff' => $limitAmount !== null ? round($limitAmount - $spent, 2) : null,
                    ],
                );
            }

            $cursor->addMonthNoOverflow();
        }
    }

    public function index(Request $request)
    {
        $user = $request->user();
        $userTz = $user->timezone ?? 'UTC';
        $now = Carbon::now($userTz);
        $lastMonth = $now->copy()->subMonthNoOverflow();

        $this->archiveCompletedMonths($user, $lastMonth);

        // Real spend for EVERY known space label, not just the ones with
        // a limit set -- this is what lets a still-unset card show real
        // numbers ("this month vs last month") instead of a bare "set a
        // budget" prompt, so the user has something to base a first
        // number on instead of guessing blind.
        //
        // avg_last_3_months is 3 whole PAST months (M-1..M-3), never the
        // current one -- a still-in-progress month would understate the
        // average and make the suggestion look artificially low.
        //
        // biggest is the single largest line item -- this month if it has
        // one, else last month (see the topItem query below).
        //
        // recurring is Home-only for now: home_recurring is the only
        // type that ever sets `recurrence` (see homeItems.ts's
        // recurringEntryToItemBody), and it's deliberately left OUT of
        // SPENDING_TYPES (see the const's own comment) so a bill isn't
        // double-counted once as "recurring" and again once actually
        // paid -- this is a separate "committed each month" figure, not
        // part of `spent` at all.
        $labels = array_unique(array_column(Item::SPENDING_TYPE_SPACE, 'label'));
        $spending = [];
        $biggest = [];
        $recurring = [];
        $planned = [];
        $paceLabels = [];

        foreach ($labels as $label) {
            $types = $this->typesForLabel($label);

            $spending[$label] = [
                'this_month' => $this->monthlySumForLabel($user->id, $types, $now, $label),
                'last_month' => $this->monthlySumForLabel($user->id, $types, $lastMonth, $label),
            ];

            $past3 = [];
            for ($i = 1; $i <= 3; $i++) {
                $past3[] = $this->monthlySumForLabel($user->id, $types, $now->copy()->subMonthsNoOverflow($i), $label);
            }
            $spending[$label]['avg_last_3_months'] = round(array_sum($past3) / 3, 2);

            // This month first, falling back to last month if this month
            // has nothing logged yet -- a brand-new app/space has all its
            // real data sitting in the current month (nothing to look
            // back on yet), so a strict "last month" scope goes blank for
            // everyone early on. Whichever month it came from is labeled
            // in the UI (BudgetSpaceDetailPage/budget.tsx) so it's never
            // ambiguous which one is shown.
            $topItem = $this->biggestInMonth($user->id, $types, $now);
            $biggestFromLastMonth = false;

            if (!$topItem && $types) {
                $topItem = $this->biggestInMonth($user->id, $types, $lastMonth);
                $biggestFromLastMonth = (bool) $topItem;
            }
            $biggest[$label] = $topItem
                ? ['title' => $topItem['title'], 'amount' => $topItem['amount'], 'from_last_month' => $biggestFromLastMonth]
                : null;

            // Purely informational now -- "of which X RON is recurring"
            // -- since recurringMonthlyForLabel is already folded into
            // `spent`/`this_month` above via monthlySumForLabel. Works
            // for any label with a RECURRING_TYPE_SPACE entry, not just
            // Home; normalized the same monthly-equivalent way (a
            // weekly or yearly bill no longer under- or over-states
            // itself here vs. in the total it's part of).
            $recurring[$label] = $this->recurringMonthlyForLabel($user->id, $label);
            $planned[$label] = $this->plannedForLabel($user->id, $types, $now);
            $paceLabels[$label] = $this->paceForLabel($user->id, $types, $now);
        }

        // Next real occurrence, not the raw stored due_at (see
        // RecurrenceProjector) -- otherwise a bill logged months ago
        // shows the same stale date here forever, even though Calendar
        // and this very controller's own recurring-savings math already
        // treat it as due again each cycle.
        // Recurring costs: the bills (RECURRING_TYPE_SPACE, what the "de
        // plătit" total sums) plus recurring maintenance -- the frontend
        // lists them in separate, labeled groups (RecurringGroups), since
        // maintenance only reaches "Cheltuit" when it's done.
        $recurringBills = Item::where('user_id', $user->id)
            ->whereIn('type', [...array_keys(Item::RECURRING_TYPE_SPACE), 'home_maintenance'])
            ->whereNotNull('recurrence')
            ->whereNotIn('status', Item::CLOSED_STATUSES)
            ->with('space:id,name,icon,type,color')
            ->get()
            ->map(function (Item $item) use ($now) {
                $next = RecurrenceProjector::currentDue($item, $now);
                $item->due_at = $next['due'];

                return $item;
            })
            ->sortBy('due_at')
            ->values();

        $savingsGoal = SavingsGoal::where('user_id', $user->id)->first();
        if ($savingsGoal) {
            $savingsGoal = $this->applyMonthlySavings($user, $savingsGoal, $lastMonth);
        }

        // ---- Buget simplu ----
        $plan = $this->plan($user);
        $avgByLabel = array_map(fn ($s) => $s['avg_last_3_months'], $spending);
        $credits = Item::where('user_id', $user->id)
            ->activeCredits($now)
            ->orderBy('title')
            ->get()
            ->map(fn (Item $c) => [
                'id' => $c->id,
                'space_id' => $c->space_id,
                'title' => $c->title,
                'amount' => (float) $c->amount,
                'day_of_month' => (int) ($c->metadata['day_of_month'] ?? 0),
                'end_date' => $c->metadata['end_date'] ?? null,
                'linked_space_id' => isset($c->metadata['linked_space_id']) ? (int) $c->metadata['linked_space_id'] : null,
                'remaining_rates' => $c->creditRemainingRates($now),
                'next_due' => $c->creditNextDue($now)?->toDateString(),
            ])
            ->values();

        return response()->json([
            // {monthly_income, set_aside, spendable}; null until an income
            // was saved (PUT /budget/plan).
            'plan' => $plan,
            // Kept as an alias (envelope = plan.spendable) so Acasă's older
            // read keeps working while the frontend moves to plan.spendable.
            'necessities' => [
                'envelope' => $plan['spendable'] ?? null,
                'avg_last_3_months' => round(array_sum($avgByLabel), 2),
            ],
            // Active credits: their rates sit in Ritmul lunii's hatched band
            // with the bills, inside De cheltuit, never in a space.
            'credit' => [
                'rates' => round((float) $credits->sum('amount'), 2),
                'count' => $credits->count(),
                'items' => $credits,
            ],
            'spending' => $spending,
            'biggest' => $biggest,
            'recurring' => $recurring,
            // Calendar purchases still ahead this month (EventSpend) --
            // inside `spent`, like `recurring`; shown apart as "planificat".
            'planned' => $planned,
            'recurringBills' => $recurringBills,
            'savingsGoal' => $this->goalPayload($savingsGoal, $now),
            // "Ritmul lunii": recorded spend per local day + this month's
            // Calendar purchases, per label (paceForLabel). User's zone.
            'pace' => [
                'month' => $now->format('Y-m'),
                'today' => $now->day,
                'days_in_month' => $now->daysInMonth,
                'labels' => $paceLabels,
            ],
        ]);
    }

    // PUT /api/budget/plan -- Buget simplu (2026-11): the fixed monthly net
    // income and the fixed amount put aside each month (0 <= set_aside <=
    // income). De cheltuit = income - set_aside. Never touches the old
    // budget_split. The first save stamps budget_plan_set_at (from that
    // month on the savings rollover uses the plan -- applyMonthlySavings)
    // and creates the Economii goal (target 0) when the user has none.
    //
    // Compat: a client from before Buget simplu sends `split` (the 5 jars)
    // and no `set_aside`; it then gets income x split.short_term %, the same
    // value the 2026_11_02 migration backfilled, instead of a 422.
    public function savePlan(Request $request)
    {
        $validated = $request->validate([
            'monthly_income' => ['required', 'numeric', 'min:1', 'max:9999999999'],
            'set_aside' => ['required_without:split.short_term', 'nullable', 'numeric', 'min:0'],
            'split' => ['sometimes', 'array'],
            'split.short_term' => ['sometimes', 'numeric', 'min:0', 'max:100'],
        ]);

        $income = round((float) $validated['monthly_income'], 2);
        $aside = isset($validated['set_aside'])
            ? round((float) $validated['set_aside'], 2)
            : round($income * (float) ($validated['split']['short_term'] ?? 0) / 100, 2);

        if ($aside > $income) {
            $message = 'Nu poți pune deoparte mai mult decât venitul.';

            return response()->json(['message' => $message, 'errors' => ['set_aside' => [$message]]], 422);
        }

        // Until the 2026_11_02 migration runs there's nowhere to store the
        // set-aside amount: refuse rather than save half a plan.
        if (!$this->hasSetAsideColumn()) {
            return response()->json([
                'message' => 'Bugetul se actualizează. Încearcă din nou puțin mai târziu.',
            ], 503);
        }

        $user = $request->user();
        $user->monthly_income = $income;
        $user->monthly_set_aside = $aside;
        if (!$user->budget_plan_set_at) {
            $user->budget_plan_set_at = now();
        }
        $user->save();

        $goal = SavingsGoal::firstOrCreate(
            ['user_id' => $user->id],
            ['target_amount' => 0, 'current_amount' => 0],
        );

        return response()->json([
            'plan' => $this->plan($user),
            'budget_plan_set_at' => $user->budget_plan_set_at,
            'savingsGoal' => $goal->fresh(),
        ]);
    }

    // GET /api/budget/spaces/{category} -- opened by tapping a space's
    // ring card on the Budget tab (see BudgetSpaceDetailPage.tsx). Same
    // types-for-label lookup as index() above, but scoped to one space
    // and returning enough to actually compare months, not just this
    // month's single total: a short trend (last 4 months, oldest
    // first, zero-filled for a month with nothing spent so the chart
    // never reads as "broken") plus the real line items behind the
    // current total, newest first.
    public function spaceDetail(Request $request, string $category)
    {
        $user = $request->user();
        $now = Carbon::now($user->timezone ?? 'UTC');
        $types = $this->typesForLabel($category);

        if (!$types) {
            return response()->json(['category' => $category, 'months' => [], 'items' => []]);
        }

        $months = [];
        for ($i = 3; $i >= 0; $i--) {
            $d = $now->copy()->subMonthsNoOverflow($i);

            $months[] = [
                'year' => $d->year,
                'month' => $d->month - 1, // 0-11, matches JS Date#getMonth
                'label' => $d->format('M'),
                'total' => $this->monthlySumForLabel($user->id, $types, $d, $category),
            ];
        }

        $items = Item::where('user_id', $user->id)
            ->whereIn('type', array_values(array_diff($types, ['custom_event'], HomeSpend::TYPES)))
            ->whereNotNull('amount')
            ->orderByDesc('due_at')
            ->limit(100)
            ->get(['id', 'type', 'title', 'amount', 'currency', 'due_at', 'guilt_free', 'space_id'])
            ->toBase();

        // Casă purchases / maintenance: one row per payment, on its day,
        // over the same months as the trend above (HomeSpend).
        if (array_intersect($types, HomeSpend::TYPES)) {
            $items = $items
                ->concat(HomeSpend::payments($user->id, $now->copy()->subMonthsNoOverflow(3)->startOfMonth(), $now->copy()->endOfMonth()))
                ->sortByDesc(fn ($i) => is_array($i) ? $i['due_at'] : $i->due_at->toJSON())
                ->values();
        }

        // Calendar purchases, one row per occurrence over the months above
        // (a repeating one shows each time); a planned one is flagged so
        // the list can say so instead of reading as already spent.
        $planned = 0.0;
        if (in_array('custom_event', $types, true)) {
            $events = EventSpend::occurrences($user->id, $now->copy()->subMonthsNoOverflow(3)->startOfMonth(), $now->copy()->endOfMonth(), $now);
            $planned = (float) $events->where('planned', true)->sum('amount');
            $items = $items
                ->concat($events->map(fn (array $e) => [
                    'id' => 'ev-' . $e['id'] . '-' . substr($e['due_at'], 0, 10),
                    'type' => 'custom_event',
                    'title' => $e['title'],
                    'amount' => $e['amount'],
                    'currency' => 'RON',
                    'due_at' => $e['due_at'],
                    'planned' => $e['planned'],
                    'guilt_free' => $e['guilt_free'],
                ]))
                ->sortByDesc(fn ($i) => is_array($i) ? $i['due_at'] : $i->due_at->toJSON())
                ->values();
        }

        // A recurring bill (e.g. home_recurring) is folded into every
        // month's `total` above via monthlySumForLabel, but it's NOT a
        // dated transaction, so it never appears as a row in `items` --
        // returned separately so the frontend can show it as its own
        // line instead of a total that silently doesn't match the sum
        // of the list underneath it.
        $recurringMonthly = $this->recurringMonthlyForLabel($user->id, $category);

        return response()->json([
            'category' => $category,
            'months' => $months,
            'items' => $items,
            'recurring_monthly' => $recurringMonthly,
            // This month's Calendar purchases still ahead -- inside the
            // current month's `total`, shown apart as "planificat".
            'planned' => $planned,
        ]);
    }

    public function saveSavingsGoal(Request $request)
    {
        $validated = $request->validate([
            'target_amount' => ['required', 'numeric', 'min:0'],
            // No min:0 -- the auto-rollup can leave this negative
            // (overspent the planned budgets), and a manual correction
            // needs to be able to reflect that too, not just clamp back
            // to a floor that hides it.
            'current_amount' => ['required', 'numeric'],
            'target_date' => ['nullable', 'date'],
            // Obiectiv de economii's optional name ("Vacanță"); blank = none.
            'name' => ['sometimes', 'nullable', 'string', 'max:80'],
        ]);
        if (array_key_exists('name', $validated)) {
            $validated['name'] = trim((string) $validated['name']) ?: null;
            // Before the 2026_11_02_000002 migration runs there is no
            // column: keep everything else saving.
            if (! Schema::hasColumn('savings_goals', 'name')) {
                unset($validated['name']);
            }
        }

        // No target any more: nothing to keep a rhythm for.
        if ((float) $validated['target_amount'] <= 0 && $this->hasCadence()) {
            $validated += ['cadence' => null, 'cadence_amount' => null, 'cadence_since' => null, 'reminders_since' => null];
        }

        $goal = SavingsGoal::updateOrCreate(
            ['user_id' => $request->user()->id],
            $validated,
        );

        return response()->json(['message' => 'Obiectivul de economii a fost salvat.', 'goal' => $goal]);
    }

    // PUT /api/budget/savings-goal/cadence -- the first tap on one of the
    // Economii card's "pe zi / pe săptămână / pe lună" cells picks that
    // rhythm (cadence null = stop). Picking one restarts the streak and
    // the reminders, and -- with an income plan -- makes Pui deoparte the
    // month's estimate: amount x periods per month, at most the income
    // (user decision 2026-11-02: the confirmations replace the fixed sum).
    public function saveSavingsCadence(Request $request)
    {
        $validated = $request->validate([
            'cadence' => ['present', 'nullable', 'in:'.implode(',', SavingsCadence::CADENCES)],
            'amount' => ['required_with:cadence', 'nullable', 'numeric', 'min:1', 'max:9999999999'],
        ]);
        if (!$this->hasCadence()) {
            return response()->json(['message' => 'Economiile se actualizează. Încearcă din nou puțin mai târziu.'], 503);
        }

        $user = $request->user();
        $today = Carbon::now($user->timezone ?? 'UTC');
        $goal = SavingsGoal::firstOrCreate(['user_id' => $user->id], ['target_amount' => 0, 'current_amount' => 0]);
        $cadence = $validated['cadence'] ?? null;
        if ($cadence && $cadence === $goal->cadence && $goal->cadence_since) {
            // The same rhythm again (the goal's target or date changed):
            // only the amount moves; the streak and reminders carry on.
            $goal->cadence_amount = round((float) $validated['amount'], 2);
            $goal->save();
        } else {
            $goal->fill([
                'cadence' => $cadence,
                'cadence_amount' => $cadence ? round((float) $validated['amount'], 2) : null,
                'cadence_since' => $cadence ? $today->toDateString() : null,
                'reminders_since' => null,
            ])->save();
        }

        $capped = false;
        if ($cadence && $user->monthly_income !== null && $this->hasSetAsideColumn()) {
            $estimate = round((float) $validated['amount'] * SavingsCadence::PER_MONTH[$cadence]);
            $capped = $estimate > (float) $user->monthly_income;
            $user->monthly_set_aside = min($estimate, (float) $user->monthly_income);
            $user->save();
        }

        return response()->json([
            'savingsGoal' => $this->goalPayload($goal->fresh(), $today),
            'plan' => $this->plan($user),
            'capped' => $capped,
        ]);
    }

    // POST /api/budget/savings-goal/deposits -- "Am pus deoparte X lei":
    // adds X to Economii now (the month's rollover leaves it out, see
    // applyMonthlySavings) in the current period of the goal's rhythm.
    // The 3rd period in a row turns the reminders on (reminders_since),
    // and they stay on until the rhythm changes.
    public function saveSavingsDeposit(Request $request)
    {
        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:0.01', 'max:9999999999'],
        ]);
        if (!$this->hasCadence()) {
            return response()->json(['message' => 'Economiile se actualizează. Încearcă din nou puțin mai târziu.'], 503);
        }

        $user = $request->user();
        $today = Carbon::now($user->timezone ?? 'UTC');
        $goal = SavingsGoal::where('user_id', $user->id)->first();
        if (!$goal || !$goal->cadence || !$goal->cadence_since) {
            $message = 'Alege întâi cât pui deoparte: pe zi, pe săptămână sau pe lună.';

            return response()->json(['message' => $message, 'errors' => ['cadence' => [$message]]], 422);
        }

        $since = Carbon::parse($goal->cadence_since->toDateString(), $today->getTimezone());
        $amount = round((float) $validated['amount'], 2);
        SavingsDeposit::create([
            'user_id' => $user->id,
            'amount' => $amount,
            'cadence' => $goal->cadence,
            'deposited_on' => $today->toDateString(),
            'period_start' => SavingsCadence::periodStart($goal->cadence, $since, $today)->toDateString(),
        ]);
        $goal->current_amount = round((float) $goal->current_amount + $amount, 2);
        if (!$goal->reminders_since && SavingsCadence::streak($goal, $today) >= SavingsCadence::STREAK_TO_REMIND) {
            $goal->reminders_since = $today->toDateString();
        }
        $goal->save();

        return response()->json(['savingsGoal' => $this->goalPayload($goal->fresh(), $today)], 201);
    }

    // GET /api/budget/archive -- the read side of archiveCompletedMonths,
    // grouped one entry per month (newest first) with that month's
    // per-space rows nested inside, plus the month's totals already
    // summed so the frontend doesn't have to.
    public function archive(Request $request)
    {
        $rows = BudgetArchive::where('user_id', $request->user()->id)
            ->orderByDesc('month')
            ->orderBy('category')
            ->get();

        $months = $rows->groupBy(fn (BudgetArchive $row) => $row->month->toDateString())
            ->map(function ($all, $month) {
                // Every row is listed in `categories` (the frontend keeps
                // Credit/Spendable/GuiltFree out of its space list). Month
                // totals: from the Spendable row when there is one (Buget
                // simplu, 2026-11: De cheltuit vs committed incl. credit
                // rates); otherwise over the space rows only, as before --
                // null budget/diff when no space row had a limit.
                $spendable = $all->firstWhere('category', self::ARCHIVE_SPENDABLE);
                $group = $all->reject(fn (BudgetArchive $r) => in_array($r->category, [self::ARCHIVE_GUILT_FREE, self::ARCHIVE_CREDIT, self::ARCHIVE_SPENDABLE], true));
                $categories = $all->map(fn (BudgetArchive $row) => [
                    'category' => $row->category,
                    'budget_limit' => $row->budget_limit !== null ? (float) $row->budget_limit : null,
                    'spent' => (float) $row->spent,
                    'diff' => $row->diff !== null ? (float) $row->diff : null,
                ])->values();
                $limited = $group->whereNotNull('budget_limit');
                $diffed = $group->whereNotNull('diff');

                return [
                    'month' => $month,
                    'label' => Carbon::parse($month)->format('M Y'),
                    'total_spent' => $spendable ? (float) $spendable->spent : (float) $group->sum('spent'),
                    'total_budget' => $spendable
                        ? ($spendable->budget_limit !== null ? (float) $spendable->budget_limit : null)
                        : ($limited->isNotEmpty() ? (float) $limited->sum('budget_limit') : null),
                    'total_diff' => $spendable
                        ? ($spendable->diff !== null ? (float) $spendable->diff : null)
                        : ($diffed->isNotEmpty() ? (float) $diffed->sum('diff') : null),
                    'categories' => $categories,
                ];
            })
            ->values();

        return response()->json(['months' => $months]);
    }
}
