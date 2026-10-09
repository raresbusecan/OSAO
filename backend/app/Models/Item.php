<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Carbon;

class Item extends Model
{
    use HasFactory;

    /** Every real, currently-supported `type` string -- whitelisted at
     * ItemController::store/update so a typo'd or invalid type can no
     * longer be silently accepted (previously `required|string|max:30`
     * only). A permanently-invisible orphan row was a real, confirmed
     * finding: every space's own load query filters strictly on its
     * own known type constants, so a bad type just vanished from every
     * screen while still occupying a row. One space's own set of types
     * (see each space's own carItems.ts/homeItems.ts/etc. on the
     * frontend) plus custom_event (Calendar, not tied to any one
     * space). Add a new type here the moment a space gains one --
     * nothing else enforces this list.
     */
    public const VALID_TYPES = [
        'car_fuel',
        'car_maintenance',
        'car_document',
        'car_expense',
        'home_document',
        'home_expense',
        'home_maintenance',
        'home_recurring',
        'home_supply',
        'home_task',
        'grocery_list',
        'grocery_item',
        'grocery_trip',
        'expense_item',
        'custom_event',
        // A loan/credit instalment (Cheltuieli's "Credite" section) -- see
        // CREDIT_TYPE below.
        'expense_credit',
    ];

    /** A credit (loan) whose monthly rate is paid from the "Credit" jar of
     * the income split (Buget din venit, 2026-10), never from Necesități:
     * deliberately in NONE of SPENDING_TYPES / SPENDING_TYPE_SPACE /
     * RECURRING_TYPE_SPACE / ACTIONABLE_TYPES, so no per-space total,
     * Dashboard total or "De făcut" query picks it up by accident. One row
     * per credit: space_id = the Expenses space, amount = monthly rate,
     * recurrence = 'monthly', due_at = next due date (server-computed by
     * ItemController from metadata.day_of_month), metadata
     * {day_of_month 1-31, end_date 'YYYY-MM-DD' (last instalment),
     * linked_space_id car/home space id | null -- a label only}.
     * Read through scopeActiveCredits; shown as a reminder (no paid/restant
     * state) on its day by CalendarController and DashboardController. */
    public const CREDIT_TYPE = 'expense_credit';

    /** Item types whose `amount` counts as real spending -- used to
     * compute Budget's per-category `spent` and the dashboard's Monthly
     * Expenses total from the same list, so they can never drift apart.
     * Deliberately more than just the dedicated "expense" types: Car's
     * fuel/maintenance/document entries all carry a real price too (a
     * fill-up, a service, an RCA renewal), and a user's actual monthly
     * spend is meaningless without them -- most of what shows up on the
     * Car dashboard's Overdue list is exactly these, not car_expense.
     * home_recurring is deliberately excluded from this due_at-driven
     * list -- a recurring bill's due_at is just whatever date it was
     * last set to, not a real transaction date, so summing it the same
     * way as everything else would count it in exactly one calendar
     * month and never again. It still counts toward "spent" every
     * month, just via a flat monthly-equivalent add instead (see
     * BudgetController::monthlySumForLabel and RECURRING_TYPE_SPACE
     * below). home_supply stays excluded outright: it never carries a
     * price at all.
     */
    public const SPENDING_TYPES = [
        'car_fuel',
        'car_maintenance',
        'car_document',
        'car_expense',
        'home_expense',
        'home_maintenance',
        // A home_task only carries an amount once it's resolved as a
        // purchase (see homeItems.ts's taskEntryToItemBody) -- due_at is
        // repointed to the resolution date at that same moment, so this
        // sums correctly by the month the money was actually spent, not
        // whatever month the task was originally due.
        'home_task',
        // One record per "Finalizează cumpărăturile" tap with a price
        // entered (see groceryItems.ts's groceryTripToItemBody) -- due_at
        // is always the moment the trip was finished, never a list's
        // creation date.
        'grocery_trip',
        // The dedicated Expenses space's own free-form entries (see
        // expensesItems.ts) -- everything that doesn't fit another
        // space, one item per row, no sub-categories.
        'expense_item',
        // A custom calendar event with its "implică o cumpărare" toggle
        // on (see CalendarController/calendar.tsx) -- e.g. "buy Maria a
        // 200 RON birthday gift". Counts as an Expenses-space cost, but
        // NOT as a plain due_at sum: App\Services\EventSpend makes it
        // "planned" until its day, spent from then on, and counts every
        // occurrence of a repeating one -- Budget and Dashboard exclude
        // custom_event from their SQL sums and add EventSpend instead.
        'custom_event',
    ];

    /** Which space label/icon a spending type rolls up under, for the
     * dashboard's per-space Monthly Expenses breakdown (grouped, not
     * itemized -- one row per space, not per type). */
    public const SPENDING_TYPE_SPACE = [
        'car_fuel' => ['label' => 'Car', 'icon' => 'car-outline'],
        'car_maintenance' => ['label' => 'Car', 'icon' => 'car-outline'],
        'car_document' => ['label' => 'Car', 'icon' => 'car-outline'],
        'car_expense' => ['label' => 'Car', 'icon' => 'car-outline'],
        'home_expense' => ['label' => 'Home', 'icon' => 'home-outline'],
        'home_maintenance' => ['label' => 'Home', 'icon' => 'home-outline'],
        'home_task' => ['label' => 'Home', 'icon' => 'home-outline'],
        'grocery_trip' => ['label' => 'Grocery', 'icon' => 'cart-outline'],
        'expense_item' => ['label' => 'Expenses', 'icon' => 'receipt-outline'],
        'custom_event' => ['label' => 'Expenses', 'icon' => 'receipt-outline'],
    ];

    /** Which space label a RECURRING type (has `recurrence` set, e.g.
     * home_recurring's monthly/weekly/yearly bills) rolls up under --
     * kept separate from SPENDING_TYPE_SPACE above because these are
     * summed differently (a flat monthly-equivalent, not a due_at sum;
     * see BudgetController::recurringMonthlyForLabel). Only home_recurring
     * exists today, but this map is where a future car_recurring,
     * grocery_recurring or expense_recurring type would go -- every
     * space's recurring commitments fold into its own budget the same
     * way, not just Home's. */
    public const RECURRING_TYPE_SPACE = [
        'home_recurring' => 'Home',
    ];

    /** Types Home's "De făcut" (overdue/today/upcoming) treats as
     * something to actually DO or be aware of -- deliberately a much
     * narrower list than SPENDING_TYPES. car_fuel, car_maintenance,
     * car_expense, grocery_trip, home_expense and expense_item all carry
     * a due_at too, but it's the date something ALREADY happened (a
     * fill-up, a finished shopping trip), not a deadline -- surfacing
     * those here is what made a 10-day-old fuel log show up as
     * "overdue". home_task and custom_event are plain to-dos/reminders;
     * home_recurring carries a real future deadline (a bill) directly in
     * due_at. car_document's OWN due_at is not a deadline at all -- it's
     * just whenever the row was logged (see CarDocumentForm.tsx: `date:
     * new Date().toISOString()`), so its real deadline is only ever read
     * through effectiveDueAt() below, never due_at directly. See
     * DashboardController::index. */
    public const ACTIONABLE_TYPES = [
        'home_task',
        'home_recurring',
        'car_document',
        'custom_event',
    ];

    /** Superset of ACTIONABLE_TYPES used only where `recurrence` is
     * already set -- home_maintenance joins the list here, not above,
     * because a ONE-OFF maintenance visit is a historical log exactly
     * like car_maintenance (deliberately excluded from ACTIONABLE_TYPES),
     * but a visit with its "Recurent" toggle on (see
     * homeCategoryConfig.ts's maintenance category) is a real future
     * deadline the same way a recurring bill is. Every other entry in
     * ACTIONABLE_TYPES can have `recurrence` too (home_recurring always
     * does; a custom_event or home_task can), so this only ever ADDS
     * home_maintenance to the recurring-branch query, never removes
     * anything the plain-branch query already covers. */
    public const RECURRING_ACTIONABLE_TYPES = [
        ...self::ACTIONABLE_TYPES,
        'home_maintenance',
    ];

    /** Every status that means "no longer open". `completed` is the
     * canonical value; `done` is what the Home space wrote for resolved
     * tasks/maintenance before 2026-10 (frontend homeItems.ts) and still
     * exists in stored rows, so every "still open?" filter must exclude
     * both or a finished Casă task resurfaces as overdue on Acasă. */
    public const CLOSED_STATUSES = ['completed', 'done', 'archived'];

    protected $fillable = [
        'user_id',
        'space_id',
        'type',
        'title',
        'notes',
        'status',
        'priority',
        'due_at',
        'completed_at',
        'amount',
        'currency',
        'category',
        'recurrence',
        'metadata',
        'guilt_free',
    ];

    protected $casts = [
        'due_at' => 'datetime',
        'completed_at' => 'datetime',
        'amount' => 'decimal:2',
        'metadata' => 'array',
        'guilt_free' => 'boolean',
    ];

    // So a freshly created model serializes `guilt_free: false` too (the DB
    // default isn't read back after an insert).
    protected $attributes = [
        'guilt_free' => false,
    ];

    /** Types that may carry the "Bani fără vină" flag (items.guilt_free):
     * everything that rolls into a space's budget -- the dated spending
     * types plus the recurring ones (e.g. a Netflix home_recurring). A
     * flagged record leaves its space's spent/limit/avg and counts against
     * the guilt-free jar instead (BudgetController). Never a credit. */
    public static function guiltFreeTypes(): array
    {
        return array_values(array_unique([...self::SPENDING_TYPES, ...array_keys(self::RECURRING_TYPE_SPACE)]));
    }

    /** Credits still being paid in $month: open, and whose last instalment
     * (metadata.end_date) falls on/after the first of that month -- so a
     * credit ending on the 5th still counts in its last month, and stops
     * counting automatically from the next one. Not user-scoped (callers
     * add that). $month should carry the user's zone. */
    public function scopeActiveCredits(Builder $query, Carbon $month): Builder
    {
        return $query->where('type', self::CREDIT_TYPE)
            ->whereNotIn('status', self::CLOSED_STATUSES)
            ->where('metadata->end_date', '>=', $month->copy()->startOfMonth()->toDateString());
    }

    /** A credit's due date inside $month (any day of it, user's zone):
     * metadata.day_of_month clamped to that month's length (31 -> 30 in
     * April, 28/29 in February), start of day. Null if the credit has no
     * valid day or that date is past its end_date. */
    public function creditDueIn(Carbon $month): ?Carbon
    {
        $day = (int) ($this->metadata['day_of_month'] ?? 0);
        if ($this->type !== self::CREDIT_TYPE || $day < 1 || $day > 31) {
            return null;
        }
        $due = $month->copy()->startOfMonth();
        $due->day(min($day, $due->daysInMonth));
        $end = $this->creditEndDate($month->getTimezone()->getName());

        return $end && $due->gt($end) ? null : $due;
    }

    /** metadata.end_date (the last instalment's day) as end of that day in
     * $tz, or null if missing/unparseable. */
    public function creditEndDate(string $tz): ?Carbon
    {
        $end = $this->metadata['end_date'] ?? null;
        if (!is_string($end) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $end)) {
            return null;
        }
        try {
            return Carbon::createFromFormat('Y-m-d', $end, $tz)->endOfDay();
        } catch (\Exception $e) {
            return null;
        }
    }

    /** Instalments still ahead from $now (today's included) through
     * end_date -- 0 once the last one has passed. */
    public function creditRemainingRates(Carbon $now): int
    {
        $today = $now->copy()->startOfDay();
        $cursor = $now->copy()->startOfMonth();
        $count = 0;
        for ($i = 0; $i < 600; $i++) {
            $day = (int) ($this->metadata['day_of_month'] ?? 0);
            $end = $this->creditEndDate($now->getTimezone()->getName());
            if ($day < 1 || !$end || $cursor->gt($end)) {
                break;
            }
            $due = $this->creditDueIn($cursor);
            if ($due && $due->gte($today)) {
                $count++;
            }
            $cursor->addMonthNoOverflow();
        }

        return $count;
    }

    /** The next due date on/after $now (start of day, user's zone), or
     * null once the credit is finished. */
    public function creditNextDue(Carbon $now): ?Carbon
    {
        $today = $now->copy()->startOfDay();
        $cursor = $now->copy()->startOfMonth();
        for ($i = 0; $i < 2; $i++) {
            $due = $this->creditDueIn($cursor);
            if ($due && $due->gte($today)) {
                return $due;
            }
            $cursor->addMonthNoOverflow();
        }

        return null;
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function space(): BelongsTo
    {
        return $this->belongsTo(Space::class);
    }

    /**
     * The date "when is this actually due" logic (DashboardController's
     * overdue/today/upcoming, CalendarController's day grouping) should
     * use -- almost always just due_at, EXCEPT for car_document, whose
     * due_at is only ever "whenever this row was logged" (CarDocumentForm
     * defaults it to the moment the form is submitted and never touches
     * it again). A document's real deadline lives in
     * metadata.expiryDate, a free-text "DD.MM.YYYY" string (see
     * frontend/lib/spaces/car/utils/dateInput.ts) that Car's own
     * dashboard already reads for its urgency tiers -- everywhere else
     * read due_at instead, so a document logged today looked permanently
     * "overdue" regardless of how far away its real expiry actually was.
     * Falls back to due_at if expiryDate is missing or unparseable.
     */
    /** A ONE-OFF home_maintenance visit is only a log -- unless Casă set a
     * "next due" date on it (metadata.nextDueDate), which makes it a real
     * deadline: Casă counts it as restant, so Acasă and Calendar must too.
     * Returned in the app zone (it's assigned to the datetime-cast due_at). */
    public function maintenanceNextDue(): ?Carbon
    {
        if ($this->type !== 'home_maintenance' || $this->recurrence) {
            return null;
        }
        $next = $this->metadata['nextDueDate'] ?? null;
        if (!is_string($next) || $next === '') {
            return null;
        }
        try {
            return Carbon::parse($next)->setTimezone(config('app.timezone'));
        } catch (\Exception $e) {
            return null;
        }
    }

    /** Car documents replaced by a renewal: same space + documentType,
     * and another record expiring later. A renewal made BEFORE the old
     * one expires leaves the old one active (it's still valid until
     * then), so without this it kept showing up in "De făcut" next to
     * its own renewal -- the Car screen already hides it the same way
     * (isDocumentSuperseded in lib/spaces/car/calculations). */
    public static function supersededCarDocumentIds(int $userId): array
    {
        $docs = self::where('user_id', $userId)
            ->where('type', 'car_document')
            ->get(['id', 'space_id', 'metadata'])
            ->map(function (self $d) {
                $exp = $d->metadata['expiryDate'] ?? null;
                $ts = is_string($exp) && preg_match('/^\d{2}\.\d{2}\.\d{4}$/', $exp)
                    ? Carbon::createFromFormat('d.m.Y', $exp)->startOfDay()->timestamp
                    : null;

                return ['id' => $d->id, 'key' => $d->space_id . '|' . ($d->metadata['documentType'] ?? ''), 'ts' => $ts];
            })
            ->filter(fn ($d) => $d['ts'] !== null);

        return $docs
            ->filter(fn ($d) => $docs->contains(fn ($o) => $o['id'] !== $d['id'] && $o['key'] === $d['key'] && $o['ts'] > $d['ts']))
            ->pluck('id')
            ->all();
    }

    public function effectiveDueAt(?string $tz = null): ?Carbon
    {
        if ($this->type === 'car_document') {
            $expiry = $this->metadata['expiryDate'] ?? null;
            if (is_string($expiry) && preg_match('/^\d{2}\.\d{2}\.\d{4}$/', $expiry)) {
                try {
                    // The expiry is a calendar date in the USER's zone --
                    // end of that day there, not 23:59 UTC (= 02:59 the
                    // next day in Bucharest, which made RCA read "în 7
                    // zile" on Acasă but "în 6 zile" on Mașină).
                    // Back to the app zone before returning: callers assign
                    // this to the datetime-cast due_at, which drops the
                    // zone and re-reads the wall-clock time as UTC.
                    return Carbon::createFromFormat('d.m.Y', $expiry, $tz ?? config('app.timezone'))
                        ->endOfDay()
                        ->setTimezone(config('app.timezone'));
                } catch (\Exception $e) {
                    // Malformed despite matching the regex (e.g. day 31 in
                    // a 30-day month) -- fall through to due_at below.
                }
            }
        }

        return $this->due_at ? Carbon::parse($this->due_at) : null;
    }

    /** Only meaningful for a type='grocery_list' item -- everyone this
     * one specific list has been shared with, on top of the parent
     * space's owner (who always sees every list in their own space).
     * See ItemController::canAccessList. */
    public function members(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'list_members', 'list_item_id', 'user_id')->withTimestamps();
    }

    /** Everything a user is allowed to see: items they own directly, plus
     * items in any space they're accessible in (owner or space_members --
     * see Space::scopeAccessibleBy). Deliberately does NOT add list_members
     * (grocery per-list sharing) nuance -- grocery keeps its own
     * myGrocery/visibleGroceryLists for that, and grocery items rarely
     * carry due_at anyway. Used by Calendar today; a reusable boundary for
     * anything else cross-space (search, dashboard) that wants it later. */
    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        return $query->where(function (Builder $q) use ($user) {
            $q->where('user_id', $user->id)
                ->orWhereHas('space', fn (Builder $q2) => $q2->accessibleBy($user));
        });
    }
}