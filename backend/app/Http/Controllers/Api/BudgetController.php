<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BudgetArchive;
use App\Models\BudgetCategory;
use App\Models\Item;
use App\Models\SavingsGoal;
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
            ->whereNotIn('status', ['completed', 'archived'])
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
    private function monthlySumForLabel(int $userId, array $types, Carbon $month, string $label): float
    {
        $dated = $types
            ? (float) Item::where('user_id', $userId)
                ->whereIn('type', $types)
                ->whereYear('due_at', $month->year)
                ->whereMonth('due_at', $month->month)
                ->sum('amount')
            : 0.0;

        return $dated + $this->recurringMonthlyForLabel($userId, $label);
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
    private function applyMonthlySavings(int $userId, SavingsGoal $goal, Carbon $lastMonth): SavingsGoal
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

        $cursor = $goal->last_applied_month->copy()->startOfMonth();
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
    private function archiveCompletedMonths(int $userId, Carbon $lastMonth): void
    {
        $lastMonthStart = $lastMonth->copy()->startOfMonth();
        $latestArchived = BudgetArchive::where('user_id', $userId)->max('month');

        $cursor = $latestArchived
            ? Carbon::parse($latestArchived)->startOfMonth()->addMonthNoOverflow()
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

            $cursor->addMonthNoOverflow();
        }
    }

    public function index(Request $request)
    {
        $user = $request->user();
        $now = Carbon::now();
        $lastMonth = $now->copy()->subMonthNoOverflow();

        $this->archiveCompletedMonths($user->id, $lastMonth);

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
            $topItem = $types
                ? Item::where('user_id', $user->id)
                    ->whereIn('type', $types)
                    ->whereNotNull('amount')
                    ->whereYear('due_at', $now->year)
                    ->whereMonth('due_at', $now->month)
                    ->orderByDesc('amount')
                    ->first(['title', 'amount'])
                : null;
            $biggestFromLastMonth = false;

            if (!$topItem && $types) {
                $topItem = Item::where('user_id', $user->id)
                    ->whereIn('type', $types)
                    ->whereNotNull('amount')
                    ->whereYear('due_at', $lastMonth->year)
                    ->whereMonth('due_at', $lastMonth->month)
                    ->orderByDesc('amount')
                    ->first(['title', 'amount']);
                $biggestFromLastMonth = (bool) $topItem;
            }
            $biggest[$label] = $topItem
                ? ['title' => $topItem->title, 'amount' => (float) $topItem->amount, 'from_last_month' => $biggestFromLastMonth]
                : null;

            // Purely informational now -- "of which X RON is recurring"
            // -- since recurringMonthlyForLabel is already folded into
            // `spent`/`this_month` above via monthlySumForLabel. Works
            // for any label with a RECURRING_TYPE_SPACE entry, not just
            // Home; normalized the same monthly-equivalent way (a
            // weekly or yearly bill no longer under- or over-states
            // itself here vs. in the total it's part of).
            $recurring[$label] = $this->recurringMonthlyForLabel($user->id, $label);
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
        $recurringBills = Item::where('user_id', $user->id)
            ->whereNotNull('recurrence')
            ->whereNotIn('status', ['completed', 'archived'])
            ->get()
            ->map(function (Item $item) use ($now) {
                $next = RecurrenceProjector::nextOccurrence($item, $now);
                $item->due_at = $next['due'];

                return $item;
            })
            ->sortBy('due_at')
            ->values();

        $savingsGoal = SavingsGoal::where('user_id', $user->id)->first();
        if ($savingsGoal) {
            $savingsGoal = $this->applyMonthlySavings($user->id, $savingsGoal, $lastMonth);
        }

        return response()->json([
            'limits' => $limits,
            'spending' => $spending,
            'biggest' => $biggest,
            'recurring' => $recurring,
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

        return response()->json(['message' => 'Budget limit saved.', 'limit' => $limit]);
    }

    public function deleteLimit(Request $request, string $category)
    {
        BudgetCategory::where('user_id', $request->user()->id)
            ->where('category', $category)
            ->delete();

        return response()->json(['message' => 'Budget limit removed.']);
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
        $now = Carbon::now();
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
            ->whereIn('type', $types)
            ->whereNotNull('amount')
            ->orderByDesc('due_at')
            ->limit(100)
            ->get(['id', 'type', 'title', 'amount', 'currency', 'due_at']);

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

        return response()->json(['message' => 'Savings goal saved.', 'goal' => $goal]);
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
            ->map(function ($group, $month) {
                $categories = $group->map(fn (BudgetArchive $row) => [
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
