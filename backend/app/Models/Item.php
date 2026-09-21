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
        // 200 RON birthday gift". Counts as an Expenses-space cost the
        // same way expense_item does; a plain reminder-only event never
        // sets `amount`, so it naturally contributes 0 here (SUM skips
        // nulls) without needing its own exclusion.
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
    ];

    protected $casts = [
        'due_at' => 'datetime',
        'completed_at' => 'datetime',
        'amount' => 'decimal:2',
        'metadata' => 'array',
    ];

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
    public function effectiveDueAt(): ?Carbon
    {
        if ($this->type === 'car_document') {
            $expiry = $this->metadata['expiryDate'] ?? null;
            if (is_string($expiry) && preg_match('/^\d{2}\.\d{2}\.\d{4}$/', $expiry)) {
                try {
                    return Carbon::createFromFormat('d.m.Y', $expiry)->endOfDay();
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