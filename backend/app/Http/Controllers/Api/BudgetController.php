<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BudgetArchive;
use App\Models\BudgetCategory;
use App\Models\Item;
use App\Models\SavingsGoal;
use App\Models\User;
use App\Services\EventSpend;
use App\Services\HomeSpend;
use App\Services\RecurrenceProjector;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

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
            // A "Bani fără vină" bill counts against that jar, not here.
            ->where('guilt_free', false)
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
                ->where('guilt_free', false)
                ->whereBetween('due_at', [$startUtc, $endUtc])
                ->sum('amount')
            : 0.0;
        // Casă purchases / maintenance: on the day each was paid (HomeSpend).
        if (array_intersect($types, HomeSpend::TYPES)) {
            $dated += HomeSpend::total($userId, $month, false);
        }
        // "Bani fără vină" records are left out of every per-space figure
        // (spent, limits, avg, archive, savings) -- see guiltFreeForMonth.
        $events = in_array('custom_event', $types, true)
            ? EventSpend::totals($userId, $month, Carbon::now($month->getTimezone()), false)
            : ['spent' => 0.0, 'planned' => 0.0];

        return $dated + $events['spent'] + $events['planned'] + $this->recurringMonthlyForLabel($userId, $label);
    }

    // Calendar purchases still ahead this month, per space label -- already
    // inside `spent`/`this_month` (monthlySumForLabel), shown apart as
    // "planificat" (hatched in BudgetSplitBar), never as "Cheltuit".
    private function plannedForLabel(int $userId, array $types, Carbon $now): float
    {
        return in_array('custom_event', $types, true) ? EventSpend::totals($userId, $now, $now, false)['planned'] : 0.0;
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
                ->where('guilt_free', false)
                ->whereBetween('due_at', [$startUtc, $endUtc])
                ->orderByDesc('amount')
                ->first(['title', 'amount'])
            : null;
        $best = $item ? ['title' => $item->title, 'amount' => (float) $item->amount] : null;

        if (array_intersect($types, HomeSpend::TYPES)) {
            $payment = HomeSpend::payments($userId, $month->copy()->startOfMonth(), $month->copy()->endOfMonth(), false)->sortByDesc('amount')->first();
            if ($payment && (!$best || $payment['amount'] > $best['amount'])) {
                $best = ['title' => $payment['title'], 'amount' => $payment['amount']];
            }
        }

        if (in_array('custom_event', $types, true)) {
            $event = EventSpend::occurrences($userId, $month->copy()->startOfMonth(), $month->copy()->endOfMonth(), Carbon::now($month->getTimezone()), false)
                ->where('planned', false)
                ->sortByDesc('amount')
                ->first();
            if ($event && (!$best || $event['amount'] > $best['amount'])) {
                $best = ['title' => $event['title'], 'amount' => $event['amount']];
            }
        }

        return $best;
    }

    // ---- Buget din venit (2026-10) -----------------------------------

    /** budget_archives.category values of the two non-space rows. */
    private const ARCHIVE_GUILT_FREE = 'GuiltFree';
    private const ARCHIVE_CREDIT = 'Credit';

    /** The 5 jars, in display order. */
    public const SPLIT_KEYS = ['needs', 'guilt_free', 'third', 'short_term', 'long_term'];

    /** Space label for each `spaces.type` -- which labels a user "has". */
    private const SPACE_TYPE_LABEL = ['car' => 'Car', 'home' => 'Home', 'grocery' => 'Grocery', 'expenses' => 'Expenses'];

    /** The user's income plan, or null when none was ever saved. */
    private function plan(User $user): ?array
    {
        if ($user->monthly_income === null || !is_array($user->budget_split)) {
            return null;
        }

        return [
            'monthly_income' => (float) $user->monthly_income,
            // Rebuilt in SPLIT_KEYS order -- MySQL's JSON column reorders keys.
            'split' => array_combine(self::SPLIT_KEYS, array_map(fn ($k) => (int) ($user->budget_split[$k] ?? 0), self::SPLIT_KEYS)),
        ];
    }

    /** One jar's monthly amount (income x percent), null without a plan. */
    private function jarAmount(?array $plan, string $key): ?float
    {
        if (!$plan) {
            return null;
        }

        return round($plan['monthly_income'] * ($plan['split'][$key] ?? 0) / 100, 2);
    }

    /** Dated types a guilt-free record can be (everything summed by due_at,
     * i.e. not custom_event -- EventSpend -- and not the recurring types). */
    private function guiltFreeDatedTypes(): array
    {
        return array_values(array_diff(Item::SPENDING_TYPES, ['custom_event'], array_keys(Item::RECURRING_TYPE_SPACE), HomeSpend::TYPES));
    }

    /** What the "Bani fără vină" jar used in $month: flagged dated records,
     * flagged recurring bills (monthly-equivalent, every month, like
     * recurringMonthlyForLabel), flagged Calendar purchases (EventSpend:
     * spent from their day, planned before). count = records/occurrences. */
    private function guiltFreeForMonth(int $userId, Carbon $month): array
    {
        [$startUtc, $endUtc] = $this->monthWindowUtc($month);
        $dated = Item::where('user_id', $userId)
            ->whereIn('type', $this->guiltFreeDatedTypes())
            ->where('guilt_free', true)
            ->whereBetween('due_at', [$startUtc, $endUtc])
            ->get(['amount']);
        $recurring = Item::where('user_id', $userId)
            ->whereIn('type', array_keys(Item::RECURRING_TYPE_SPACE))
            ->whereNotNull('recurrence')
            ->whereNotIn('status', Item::CLOSED_STATUSES)
            ->where('guilt_free', true)
            ->get(['amount', 'recurrence']);
        $events = EventSpend::occurrences($userId, $month->copy()->startOfMonth(), $month->copy()->endOfMonth(), Carbon::now($month->getTimezone()), true);
        $home = HomeSpend::payments($userId, $month->copy()->startOfMonth(), $month->copy()->endOfMonth(), true);

        $spent = (float) $dated->sum('amount')
            + (float) $home->sum('amount')
            + (float) $recurring->sum(fn (Item $i) => $this->monthlyRecurringEquivalent((float) $i->amount, $i->recurrence))
            + (float) $events->where('planned', false)->sum('amount');

        return [
            'spent' => round($spent, 2),
            'planned' => round((float) $events->where('planned', true)->sum('amount'), 2),
            'count' => $dated->count() + $home->count() + $recurring->count() + $events->count(),
        ];
    }

    /** Σ monthly rates of the credits still running in $month. */
    private function creditRatesForMonth(int $userId, Carbon $month): array
    {
        $credits = Item::where('user_id', $userId)->activeCredits($month)->get(['amount']);

        return ['rates' => round((float) $credits->sum('amount'), 2), 'count' => $credits->count()];
    }

    /** Space labels this user "has": a typed space of theirs, a limit set,
     * or any spend/recurring base. Legacy spaces (null `type`) can't be
     * mapped, which is why limits/spend also count. */
    private function userLabels(User $user, array $base): array
    {
        $labels = array_unique(array_column(Item::SPENDING_TYPE_SPACE, 'label'));
        $fromSpaces = $user->spaces()->whereNotNull('type')->pluck('type')
            ->map(fn ($t) => self::SPACE_TYPE_LABEL[$t] ?? null)->filter()->all();
        $fromLimits = BudgetCategory::where('user_id', $user->id)->pluck('category')->all();
        $fromSpend = array_keys(array_filter($base, fn ($v) => $v > 0));
        $mine = array_values(array_intersect($labels, array_unique([...$fromSpaces, ...$fromLimits, ...$fromSpend])));

        return $mine ?: array_values($labels);
    }

    /**
     * Suggested per-space split of the Necesități envelope:
     * base = max(avg of last 3 months excl. fără vină, recurring); share =
     * base / Σbase (equal split if Σ = 0); x envelope. Recurring is a floor:
     * a label whose share falls under it is pinned there first and the
     * remainder is re-scaled over the others (repeated until stable).
     * Rounded to 10 (floors rounded UP so they stay floors); the largest
     * unpinned label absorbs the rounding so the total equals the envelope (unless the
     * floors alone exceed it -- then it's just the floors).
     */
    private function suggestSplit(float $envelope, array $avg, array $recurring, array $labels): array
    {
        $base = [];
        foreach ($labels as $l) {
            $base[$l] = max($avg[$l] ?? 0.0, $recurring[$l] ?? 0.0);
        }
        $sumBase = array_sum($base);
        $weights = $sumBase > 0 ? $base : array_fill_keys($labels, 1.0);

        $pinned = [];
        for ($pass = 0; $pass <= count($labels); $pass++) {
            $free = array_diff_key($weights, $pinned);
            $remaining = $envelope - array_sum($pinned);
            $freeWeight = array_sum($free);
            $result = $pinned;
            foreach ($free as $l => $w) {
                $result[$l] = $freeWeight > 0 ? max(0.0, $remaining) * $w / $freeWeight : 0.0;
            }
            $newlyPinned = false;
            foreach ($free as $l => $w) {
                $floor = $recurring[$l] ?? 0.0;
                if ($result[$l] < $floor) {
                    $pinned[$l] = $floor;
                    $newlyPinned = true;
                }
            }
            if (!$newlyPinned) {
                break;
            }
        }
        $result = array_merge(array_fill_keys($labels, 0.0), $pinned, array_diff_key($result, $pinned));

        $rounded = [];
        foreach ($result as $l => $v) {
            $rounded[$l] = isset($pinned[$l]) ? ceil($v / 10) * 10 : round($v / 10) * 10;
        }
        // The largest UNPINNED label absorbs the rounding, so a floor
        // is never rounded back under its recurring bills.
        $absorbers = array_diff_key($rounded, $pinned) ?: $rounded;
        if (array_sum($pinned) <= $envelope && $absorbers) {
            $largest = array_keys($absorbers, max($absorbers))[0];
            $rounded[$largest] = round($rounded[$largest] + ($envelope - array_sum($rounded)), 2);
        }

        return array_map(fn ($v) => (float) $v, $rounded);
    }

    // Rolls (budget - spent) across every space with a limit into the
    // savings goal, one completed calendar month at a time, since the
    // last month already applied -- called from index() so it happens
    // lazily on whatever GET /api/budget request first notices a newly
    // completed month, no cron/queue needed. Uses TODAY's limit values
    // for past months too (limits have no history of their own): "if
    // you'd been under this budget those months, this is what you'd
    // have saved" is the deliberate approximation, same spirit as the
    // Budget tab's own preset suggestions.
    //
    // A month where spending ran over budget subtracts -- current_amount
    // can go negative, which is the point: a negative goal is a visible
    // signal "you went X RON over what you planned", not something to
    // hide behind a floor of 0. The frontend is the one that decides how
    // to *show* a negative number (red text, no progress bar), not this
    // method.
    //
    // Buget din venit (decision 7): a month on/after the one the income plan
    // was first saved in (users.budget_plan_set_at) instead adds
    //   Σ spaces (limit - spent excl. fără vină)
    //   + (guilt-free jar - guilt-free spent)
    //   + the short-term jar (it's saved automatically, no transfer tracking)
    // using TODAY's plan values, like the limits. Credit overflow is not
    // included (decision 5: credits never reduce Economii). Months before
    // the plan keep the formula above.
    private function applyMonthlySavings(User $user, SavingsGoal $goal, Carbon $lastMonth): SavingsGoal
    {
        $userId = $user->id;
        $plan = $this->plan($user);
        $planStart = $plan && $user->budget_plan_set_at
            ? $user->budget_plan_set_at->copy()->setTimezone($lastMonth->getTimezone())->startOfMonth()
            : null;
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
        // is summed over UTC boundaries (a fill-up at 00:30 Bucharest on
        // the 1st landed in the previous month).
        $cursor = Carbon::parse($goal->last_applied_month->toDateString(), $lastMonth->getTimezone())->startOfMonth();
        if (!$cursor->lt($lastMonthStart)) {
            return $goal;
        }

        $budgetLimits = BudgetCategory::where('user_id', $userId)->get(['category', 'monthly_limit']);
        $added = 0.0;

        while ($cursor->lt($lastMonthStart)) {
            $cursor->addMonthNoOverflow();
            foreach ($budgetLimits as $limit) {
                $types = $this->typesForLabel($limit->category);
                $spent = $this->monthlySumForLabel($userId, $types, $cursor, $limit->category);
                $added += (float) $limit->monthly_limit - $spent;
            }
            if ($planStart && $cursor->format('Y-m') >= $planStart->format('Y-m')) {
                $gf = $this->guiltFreeForMonth($userId, $cursor);
                $added += (float) $this->jarAmount($plan, 'guilt_free') - ($gf['spent'] + $gf['planned'])
                    + (float) $this->jarAmount($plan, 'short_term');
            }
        }

        $goal->current_amount = (float) $goal->current_amount + $added;
        $goal->last_applied_month = $lastMonthStart;
        $goal->save();

        return $goal;
    }

    // Writes one row per space, per completed month, so later changing
    // a budget limit or the space-label map can never rewrite what a
    // past month's numbers actually were -- unlike every other figure
    // in this controller (all computed live from `items` + today's
    // BudgetCategory rows), this one is a permanent, point-in-time
    // record. Runs unconditionally from index() (not gated on a
    // savings goal existing, unlike applyMonthlySavings): it's general
    // history, useful on its own.
    //
    // Idempotent via updateOrCreate on (user, month, category). Same
    // bootstrapping rule as applyMonthlySavings: with nothing archived
    // yet, this call archives only the single most-recently-completed
    // month, never a deep backfill -- there's no record of when a
    // limit was actually set, so pretending budgets existed many
    // months before the user ever opened the app would just be
    // fabricated history. Every call after that just catches up
    // whatever completed month(s) it hasn't seen yet.
    //
    // Buget din venit: two extra rows per month -- 'GuiltFree'
    // (budget_limit = the guilt-free jar, spent = flagged spending) and
    // 'Credit' (budget_limit = the third jar, spent = Σ rates of the credits
    // running that month; only written when a credit ran). Same "today's
    // plan values" approximation as the limits. GET /budget/archive's
    // month totals stay over the SPACE rows only (the Necesități picture).
    private function archiveCompletedMonths(User $user, Carbon $lastMonth): void
    {
        $userId = $user->id;
        $plan = $this->plan($user);
        $lastMonthStart = $lastMonth->copy()->startOfMonth();
        $latestArchived = BudgetArchive::where('user_id', $userId)->max('month');

        $cursor = $latestArchived
            // Parsed in the user's zone: a UTC cursor (1st 00:00 UTC) is
            // AFTER the user's 1st 00:00 in any UTC+ zone, so the last
            // completed month used to be skipped until a month later.
            ? Carbon::parse($latestArchived, $lastMonth->getTimezone())->startOfMonth()->addMonthNoOverflow()
            : $lastMonthStart->copy();

        if ($cursor->gt($lastMonthStart)) {
            return;
        }

        $budgetLimits = BudgetCategory::where('user_id', $userId)->get()->keyBy('category');
        $labels = array_unique(array_column(Item::SPENDING_TYPE_SPACE, 'label'));

        while ($cursor->lte($lastMonthStart)) {
            foreach ($labels as $label) {
                $types = $this->typesForLabel($label);
                $spent = $this->monthlySumForLabel($userId, $types, $cursor, $label);
                $limit = $budgetLimits->get($label);
                $limitAmount = $limit ? (float) $limit->monthly_limit : null;

                // Nothing spent and no budget ever set for this space
                // that month -- e.g. a space created well after this
                // month passed. Skip it: an empty row would just be
                // noise in the archive, not information.
                if ($spent <= 0 && $limitAmount === null) {
                    continue;
                }

                BudgetArchive::updateOrCreate(
                    ['user_id' => $userId, 'month' => $cursor->toDateString(), 'category' => $label],
                    [
                        'budget_limit' => $limitAmount,
                        'spent' => $spent,
                        'diff' => $limitAmount !== null ? $limitAmount - $spent : null,
                    ],
                );
            }

            $extra = [];
            $gf = $this->guiltFreeForMonth($userId, $cursor);
            $extra[self::ARCHIVE_GUILT_FREE] = [$this->jarAmount($plan, 'guilt_free'), $gf['spent'] + $gf['planned']];
            $credit = $this->creditRatesForMonth($userId, $cursor);
            if ($credit['count'] > 0) {
                $extra[self::ARCHIVE_CREDIT] = [$this->jarAmount($plan, 'third'), $credit['rates']];
            }
            foreach ($extra as $category => [$limitAmount, $spent]) {
                if ($spent <= 0 && $limitAmount === null) {
                    continue;
                }
                BudgetArchive::updateOrCreate(
                    ['user_id' => $userId, 'month' => $cursor->toDateString(), 'category' => $category],
                    [
                        'budget_limit' => $limitAmount,
                        'spent' => $spent,
                        'diff' => $limitAmount !== null ? $limitAmount - $spent : null,
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
        }

        $limits = BudgetCategory::where('user_id', $user->id)
            ->orderBy('category')
            ->get()
            ->map(function (BudgetCategory $limit) use ($user, $now) {
                $types = $this->typesForLabel($limit->category);

                return [
                    'category' => $limit->category,
                    'monthly_limit' => (float) $limit->monthly_limit,
                    'spent' => $this->monthlySumForLabel($user->id, $types, $now, $limit->category),
                ];
            });

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

        // ---- Buget din venit ----
        $plan = $this->plan($user);
        $envelope = $this->jarAmount($plan, 'needs');
        $avgByLabel = array_map(fn ($s) => $s['avg_last_3_months'], $spending);
        $gf = $this->guiltFreeForMonth($user->id, $now);
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
            // null until PUT /budget/plan was called once.
            'plan' => $plan,
            'necessities' => [
                'envelope' => $envelope,
                'avg_last_3_months' => round(array_sum($avgByLabel), 2),
            ],
            'guiltFree' => [
                'budget' => $this->jarAmount($plan, 'guilt_free'),
                'spent' => $gf['spent'],
                'planned' => $gf['planned'],
                'count' => $gf['count'],
            ],
            'credit' => [
                'budget' => $this->jarAmount($plan, 'third'),
                'rates' => round((float) $credits->sum('amount'), 2),
                'count' => $credits->count(),
                'items' => $credits,
            ],
            'suggested' => $plan
                ? $this->suggestSplit((float) $envelope, $avgByLabel, $recurring, $this->userLabels($user, array_map(
                    fn ($l) => max($avgByLabel[$l] ?? 0, $recurring[$l] ?? 0),
                    array_combine($labels, $labels),
                )))
                : null,
            'limits' => $limits,
            'spending' => $spending,
            'biggest' => $biggest,
            'recurring' => $recurring,
            // Calendar purchases still ahead this month (EventSpend) --
            // inside `spent`, like `recurring`; shown apart as "planificat".
            'planned' => $planned,
            'recurringBills' => $recurringBills,
            'savingsGoal' => $savingsGoal,
        ]);
    }

    public function saveLimit(Request $request)
    {
        $validated = $request->validate([
            'category' => ['required', 'string', 'max:100'],
            'monthly_limit' => ['required', 'numeric', 'min:0'],
        ]);

        $limit = BudgetCategory::updateOrCreate(
            ['user_id' => $request->user()->id, 'category' => $validated['category']],
            ['monthly_limit' => $validated['monthly_limit']],
        );

        return response()->json(['message' => 'Limita a fost salvată.', 'limit' => $limit]);
    }

    public function deleteLimit(Request $request, string $category)
    {
        BudgetCategory::where('user_id', $request->user()->id)
            ->where('category', $category)
            ->delete();

        return response()->json(['message' => 'Limita a fost ștearsă.']);
    }

    // PUT /api/budget/plan -- the fixed monthly net income and its 5-jar
    // split (integer percents, must add up to 100). The first save stamps
    // budget_plan_set_at (from that month on, the savings rollover uses
    // the plan -- applyMonthlySavings) and creates the Economii goal
    // (target 0) when the user has none, since the short-term jar feeds it.
    public function savePlan(Request $request)
    {
        $rules = [
            'monthly_income' => ['required', 'numeric', 'min:1', 'max:9999999999'],
            'split' => ['required', 'array'],
        ];
        foreach (self::SPLIT_KEYS as $key) {
            $rules["split.$key"] = ['required', 'integer', 'min:0', 'max:100'];
        }
        $validated = $request->validate($rules);

        $split = [];
        foreach (self::SPLIT_KEYS as $key) {
            $split[$key] = (int) $validated['split'][$key];
        }
        if (array_sum($split) !== 100) {
            return response()->json([
                'message' => 'Procentele trebuie să adune 100%.',
                'errors' => ['split' => ['Procentele trebuie să adune 100%.']],
            ], 422);
        }

        $user = $request->user();
        $user->monthly_income = $validated['monthly_income'];
        $user->budget_split = $split;
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

    // PUT /api/budget/limits -- every space's share of Necesități at once
    // (the "Reîmparte" sheet), in one transaction: all saved or none.
    public function saveLimits(Request $request)
    {
        $labels = array_values(array_unique(array_column(Item::SPENDING_TYPE_SPACE, 'label')));
        $validated = $request->validate([
            'limits' => ['required', 'array', 'min:1'],
            'limits.*.category' => ['required', 'string', \Illuminate\Validation\Rule::in($labels)],
            'limits.*.monthly_limit' => ['required', 'numeric', 'min:0'],
        ]);
        $userId = $request->user()->id;

        \Illuminate\Support\Facades\DB::transaction(function () use ($validated, $userId) {
            foreach ($validated['limits'] as $row) {
                BudgetCategory::updateOrCreate(
                    ['user_id' => $userId, 'category' => $row['category']],
                    ['monthly_limit' => $row['monthly_limit']],
                );
            }
        });

        return response()->json([
            'message' => 'Limitele au fost salvate.',
            'limits' => BudgetCategory::where('user_id', $userId)->orderBy('category')->get()
                ->map(fn (BudgetCategory $l) => ['category' => $l->category, 'monthly_limit' => (float) $l->monthly_limit])
                ->values(),
        ]);
    }

    // GET /api/budget/guilt-free -- the "Bani fără vină" page: the jar vs
    // what it used over the last 3 months + this one (oldest first), and
    // this month's flagged records (spaceDetail's item shape + the space
    // `label` they'd otherwise count under). Flagged recurring bills show
    // once, dated at their current due date, with `recurring: true`.
    public function guiltFreeDetail(Request $request)
    {
        $user = $request->user();
        $now = Carbon::now($user->timezone ?? 'UTC');
        $budget = $this->jarAmount($this->plan($user), 'guilt_free');

        $months = [];
        for ($i = 3; $i >= 0; $i--) {
            $d = $now->copy()->subMonthsNoOverflow($i);
            $gf = $this->guiltFreeForMonth($user->id, $d);
            $months[] = [
                'month' => $d->format('Y-m'),
                'budget' => $budget,
                'spent' => $gf['spent'],
                'planned' => $gf['planned'],
            ];
        }

        [$startUtc, $endUtc] = $this->monthWindowUtc($now);
        $labelOf = fn (string $type) => Item::SPENDING_TYPE_SPACE[$type]['label'] ?? Item::RECURRING_TYPE_SPACE[$type] ?? null;

        $dated = Item::where('user_id', $user->id)
            ->whereIn('type', $this->guiltFreeDatedTypes())
            ->where('guilt_free', true)
            ->whereBetween('due_at', [$startUtc, $endUtc])
            ->orderByDesc('due_at')
            ->get(['id', 'type', 'title', 'amount', 'currency', 'due_at', 'guilt_free', 'space_id'])
            ->map(fn (Item $i) => [...$i->toArray(), 'amount' => (float) $i->amount, 'label' => $labelOf($i->type)]);

        $recurring = Item::where('user_id', $user->id)
            ->whereIn('type', array_keys(Item::RECURRING_TYPE_SPACE))
            ->whereNotNull('recurrence')
            ->whereNotIn('status', Item::CLOSED_STATUSES)
            ->where('guilt_free', true)
            ->get()
            ->map(fn (Item $i) => [
                'id' => $i->id,
                'type' => $i->type,
                'title' => $i->title,
                'amount' => round($this->monthlyRecurringEquivalent((float) $i->amount, $i->recurrence), 2),
                'currency' => $i->currency,
                'due_at' => RecurrenceProjector::currentDue($i, $now)['due']->toJSON(),
                'guilt_free' => true,
                'space_id' => $i->space_id,
                'label' => $labelOf($i->type),
                'recurring' => true,
                'recurrence' => $i->recurrence,
            ]);

        $events = EventSpend::occurrences($user->id, $now->copy()->startOfMonth(), $now->copy()->endOfMonth(), $now, true)
            ->map(fn (array $e) => [
                'id' => 'ev-' . $e['id'] . '-' . substr($e['due_at'], 0, 10),
                'type' => 'custom_event',
                'title' => $e['title'],
                'amount' => $e['amount'],
                'currency' => 'RON',
                'due_at' => $e['due_at'],
                'guilt_free' => true,
                'space_id' => null,
                'label' => $labelOf('custom_event'),
                'planned' => $e['planned'],
            ]);

        $home = HomeSpend::payments($user->id, $now->copy()->startOfMonth(), $now->copy()->endOfMonth(), true)
            ->map(fn (array $p) => [...$p, 'label' => $labelOf($p['type'])]);

        $items = collect($dated)->concat($home)->concat($recurring)->concat($events)
            ->sortByDesc(fn ($i) => $i['due_at'])
            ->values();

        return response()->json(['months' => $months, 'items' => $items]);
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
            // Flagged ("fără vină") purchases are listed (with guilt_free)
            // but aren't inside this space's total, so not in `planned`.
            $planned = (float) $events->where('planned', true)->where('guilt_free', false)->sum('amount');
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
        ]);

        $goal = SavingsGoal::updateOrCreate(
            ['user_id' => $request->user()->id],
            $validated,
        );

        return response()->json(['message' => 'Obiectivul de economii a fost salvat.', 'goal' => $goal]);
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
                // GuiltFree/Credit rows are listed in `categories` but the
                // totals stay over the space rows (Necesități) only.
                $group = $all->reject(fn (BudgetArchive $r) => in_array($r->category, [self::ARCHIVE_GUILT_FREE, self::ARCHIVE_CREDIT], true));
                $categories = $all->map(fn (BudgetArchive $row) => [
                    'category' => $row->category,
                    'budget_limit' => $row->budget_limit !== null ? (float) $row->budget_limit : null,
                    'spent' => (float) $row->spent,
                    'diff' => $row->diff !== null ? (float) $row->diff : null,
                ])->values();

                return [
                    'month' => $month,
                    'label' => Carbon::parse($month)->format('M Y'),
                    'total_spent' => (float) $group->sum('spent'),
                    'total_budget' => (float) $group->sum('budget_limit'),
                    'total_diff' => $group->whereNotNull('diff')->sum('diff') !== null
                        ? (float) $group->whereNotNull('diff')->sum('diff')
                        : null,
                    'categories' => $categories,
                ];
            })
            ->values();

        return response()->json(['months' => $months]);
    }
}
