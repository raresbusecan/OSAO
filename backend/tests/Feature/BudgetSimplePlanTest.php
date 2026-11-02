<?php

namespace Tests\Feature;

use App\Models\BudgetArchive;
use App\Models\BudgetCategory;
use App\Models\Item;
use App\Models\SavingsGoal;
use App\Models\Space;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Buget simplu (2026-11): Venit -> Pui deoparte -> De cheltuit. Plan
 * shape, PUT /budget/plan validation, the Economii rollover
 * (income - (spent + credit rates)), the Spendable archive row, the removed
 * guilt-free/limit endpoints and keys, and the set-aside backfill. */
class BudgetSimplePlanTest extends TestCase
{
    use RefreshDatabase;

    private const TZ = 'Europe/Bucharest';

    private User $user;
    private Space $expenses;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
        $this->user->forceFill(['timezone' => self::TZ])->save();
        $this->expenses = Space::factory()->create(['user_id' => $this->user->id, 'name' => 'Cheltuieli', 'type' => 'expenses']);
        Sanctum::actingAs($this->user);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function nowLocal(string $local): void
    {
        Carbon::setTestNow(Carbon::parse($local, self::TZ)->setTimezone('UTC'));
    }

    private function item(string $type, array $attrs): Item
    {
        return Item::unguarded(fn () => Item::create(array_merge([
            'user_id' => $this->user->id,
            'space_id' => $this->expenses->id,
            'type' => $type,
            'title' => $type,
            'status' => 'pending',
        ], $attrs)));
    }

    /** Plan 7000 / 1400, first saved in October 2026; Economii applied up to
     * October. Now = 5 December, so November is the month to roll. */
    private function novemberToRoll(float $spentInNovember, bool $withCredit = true): void
    {
        $this->nowLocal('2026-12-05 12:00:00');
        $this->user->forceFill([
            'monthly_income' => 7000,
            'monthly_set_aside' => 1400,
            'budget_plan_set_at' => '2026-10-10 09:00:00',
        ])->save();
        SavingsGoal::create(['user_id' => $this->user->id, 'target_amount' => 10000, 'current_amount' => 0, 'last_applied_month' => '2026-10-01']);
        $this->item('expense_item', ['amount' => $spentInNovember, 'due_at' => '2026-11-10 10:00:00']);
        if ($withCredit) {
            $this->item(Item::CREDIT_TYPE, [
                'title' => 'Credit mașină', 'amount' => 610, 'recurrence' => 'monthly', 'due_at' => '2026-12-15 00:00:00',
                'metadata' => ['day_of_month' => 15, 'end_date' => '2027-06-30', 'linked_space_id' => null],
            ]);
        }
    }

    public function test_save_plan_returns_income_set_aside_and_spendable(): void
    {
        $this->putJson('/api/budget/plan', ['monthly_income' => 7000, 'set_aside' => 1400])
            ->assertOk()
            ->assertJsonPath('plan.monthly_income', 7000)
            ->assertJsonPath('plan.set_aside', 1400)
            ->assertJsonPath('plan.spendable', 5600)
            ->assertJsonPath('savingsGoal.target_amount', '0.00');

        $json = $this->getJson('/api/budget')->assertOk()->json();
        $this->assertEquals(['monthly_income' => 7000, 'set_aside' => 1400, 'spendable' => 5600], $json['plan']);
        $this->assertEquals(5600, $json['necessities']['envelope']);
        $this->assertNull($this->user->fresh()->budget_split);
        $this->assertNotNull($this->user->fresh()->budget_plan_set_at);
    }

    public function test_set_aside_over_income_is_rejected_zero_is_fine(): void
    {
        $this->putJson('/api/budget/plan', ['monthly_income' => 7000, 'set_aside' => 7000.01])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Nu poți pune deoparte mai mult decât venitul.')
            ->assertJsonPath('errors.set_aside.0', 'Nu poți pune deoparte mai mult decât venitul.');
        $this->assertNull($this->user->fresh()->monthly_income);

        $this->putJson('/api/budget/plan', ['monthly_income' => 7000, 'set_aside' => 0])
            ->assertOk()
            ->assertJsonPath('plan.spendable', 7000);

        // set_aside = income is allowed (De cheltuit 0).
        $this->putJson('/api/budget/plan', ['monthly_income' => 7000, 'set_aside' => 7000])
            ->assertOk()
            ->assertJsonPath('plan.spendable', 0);

        $this->putJson('/api/budget/plan', ['monthly_income' => 7000, 'set_aside' => -1])->assertStatus(422);
        $this->putJson('/api/budget/plan', ['monthly_income' => 0, 'set_aside' => 0])->assertStatus(422);
        $this->putJson('/api/budget/plan', ['monthly_income' => 7000])->assertStatus(422);
    }

    public function test_an_old_client_sending_the_split_gets_the_short_term_share(): void
    {
        $this->putJson('/api/budget/plan', [
            'monthly_income' => 7000,
            'split' => ['needs' => 55, 'guilt_free' => 5, 'third' => 10, 'short_term' => 15, 'long_term' => 15],
        ])->assertOk()->assertJsonPath('plan.set_aside', 1050)->assertJsonPath('plan.spendable', 5950);
        $this->assertNull($this->user->fresh()->budget_split);
    }

    public function test_income_without_a_split_is_a_plan(): void
    {
        $this->user->forceFill(['monthly_income' => 6000, 'budget_split' => null, 'monthly_set_aside' => null])->save();

        $json = $this->getJson('/api/budget')->assertOk()->json();
        $this->assertEquals(['monthly_income' => 6000, 'set_aside' => 0, 'spendable' => 6000], $json['plan']);
    }

    public function test_rollover_adds_income_minus_spent_and_credit_rates(): void
    {
        $this->novemberToRoll(5100);

        $goal = $this->getJson('/api/budget')->assertOk()->json('savingsGoal');
        $this->assertEquals(1290, $goal['current_amount']); // 7000 - (5100 + 610)
        $this->assertSame('2026-11-01', substr($goal['last_applied_month'], 0, 10));

        // Never applied twice.
        $this->assertEquals(1290, $this->getJson('/api/budget')->json('savingsGoal.current_amount'));
    }

    public function test_rollover_overspending_reduces_economii(): void
    {
        $this->novemberToRoll(6590);

        $this->assertEquals(-200, $this->getJson('/api/budget')->assertOk()->json('savingsGoal.current_amount')); // 7000 - 7200
    }

    public function test_rollover_ignores_leftover_limits(): void
    {
        $this->novemberToRoll(5100);
        BudgetCategory::create(['user_id' => $this->user->id, 'category' => 'Expenses', 'monthly_limit' => 3000]);
        BudgetCategory::create(['user_id' => $this->user->id, 'category' => 'Car', 'monthly_limit' => 800]);

        $this->assertEquals(1290, $this->getJson('/api/budget')->assertOk()->json('savingsGoal.current_amount'));
    }

    public function test_rollover_counts_flagged_records(): void
    {
        $this->novemberToRoll(5000);
        $this->item('expense_item', ['amount' => 100, 'due_at' => '2026-11-12 10:00:00', 'guilt_free' => true]);

        $this->assertEquals(1290, $this->getJson('/api/budget')->assertOk()->json('savingsGoal.current_amount'));
    }

    public function test_no_plan_only_moves_the_cursor(): void
    {
        $this->nowLocal('2026-12-05 12:00:00');
        SavingsGoal::create(['user_id' => $this->user->id, 'target_amount' => 1000, 'current_amount' => 500, 'last_applied_month' => '2026-10-01']);
        BudgetCategory::create(['user_id' => $this->user->id, 'category' => 'Expenses', 'monthly_limit' => 3000]);
        $this->item('expense_item', ['amount' => 100, 'due_at' => '2026-11-10 10:00:00']);

        $json = $this->getJson('/api/budget')->assertOk()->json();
        $this->assertNull($json['plan']);
        $this->assertEquals(500, $json['savingsGoal']['current_amount']);
        $this->assertSame('2026-11-01', substr($json['savingsGoal']['last_applied_month'], 0, 10));
    }

    public function test_months_before_the_plan_are_not_rolled(): void
    {
        $this->novemberToRoll(5100);
        $this->user->forceFill(['budget_plan_set_at' => '2026-12-02 09:00:00'])->save();

        $this->assertEquals(0, $this->getJson('/api/budget')->assertOk()->json('savingsGoal.current_amount'));
    }

    public function test_archive_writes_a_spendable_row_and_no_limits(): void
    {
        $this->novemberToRoll(5100);
        BudgetCategory::create(['user_id' => $this->user->id, 'category' => 'Expenses', 'monthly_limit' => 3000]);
        $this->item('expense_item', ['amount' => 40, 'due_at' => '2026-11-12 10:00:00', 'guilt_free' => true]);

        $this->getJson('/api/budget')->assertOk();

        $rows = BudgetArchive::where('user_id', $this->user->id)->get()->keyBy('category');
        $this->assertEqualsCanonicalizing(['Expenses', 'Credit', 'Spendable'], $rows->keys()->all());
        $this->assertSame('2026-11-01', $rows['Spendable']->month->toDateString());
        $this->assertEquals(5600, $rows['Spendable']->budget_limit);
        $this->assertEquals(5750, $rows['Spendable']->spent); // 5100 + 40 + 610
        $this->assertEquals(-150, $rows['Spendable']->diff);
        $this->assertNull($rows['Expenses']->budget_limit);
        $this->assertNull($rows['Expenses']->diff);
        $this->assertEquals(5140, $rows['Expenses']->spent);
        $this->assertNull($rows['Credit']->budget_limit);
        $this->assertEquals(610, $rows['Credit']->spent);

        $month = $this->getJson('/api/budget/archive')->assertOk()->json('months.0');
        $this->assertSame('2026-11-01', $month['month']);
        $this->assertEquals(5600, $month['total_budget']);
        $this->assertEquals(5750, $month['total_spent']);
        $this->assertEquals(-150, $month['total_diff']);
    }

    public function test_archive_without_a_plan_has_no_budget_totals(): void
    {
        $this->nowLocal('2026-12-05 12:00:00');
        $this->item('expense_item', ['amount' => 300, 'due_at' => '2026-11-10 10:00:00']);

        $month = $this->getJson('/api/budget/archive')->json('months');
        $this->assertSame([], $month);
        $this->getJson('/api/budget')->assertOk();

        $month = $this->getJson('/api/budget/archive')->assertOk()->json('months.0');
        $this->assertEquals(300, $month['total_spent']);
        $this->assertNull($month['total_budget']);
        $this->assertNull($month['total_diff']);
        $this->assertSame(['Expenses'], array_column($month['categories'], 'category'));
    }

    public function test_old_guilt_free_rows_stay_out_of_legacy_totals(): void
    {
        foreach ([['Car', 800, 700], ['GuiltFree', 350, 100], ['Credit', 700, 610]] as [$category, $limit, $spent]) {
            BudgetArchive::create(['user_id' => $this->user->id, 'month' => '2026-09-01', 'category' => $category, 'budget_limit' => $limit, 'spent' => $spent, 'diff' => $limit - $spent]);
        }

        $month = $this->getJson('/api/budget/archive')->assertOk()->json('months.0');
        $this->assertEquals(700, $month['total_spent']);
        $this->assertEquals(800, $month['total_budget']);
        $this->assertEquals(100, $month['total_diff']);
        $this->assertCount(3, $month['categories']);
    }

    public function test_removed_keys_and_endpoints(): void
    {
        $this->user->forceFill(['monthly_income' => 7000, 'monthly_set_aside' => 1400])->save();

        $json = $this->getJson('/api/budget')->assertOk()->json();
        foreach (['guiltFree', 'limits', 'suggested'] as $key) {
            $this->assertArrayNotHasKey($key, $json);
        }
        $this->assertArrayNotHasKey('budget', $json['credit']);
        foreach (['rates', 'count', 'items'] as $key) {
            $this->assertArrayHasKey($key, $json['credit']);
        }
        foreach (['plan', 'necessities', 'spending', 'recurring', 'planned', 'pace', 'recurringBills', 'savingsGoal', 'biggest'] as $key) {
            $this->assertArrayHasKey($key, $json);
        }

        $this->getJson('/api/budget/guilt-free')->assertNotFound();
        $this->putJson('/api/budget/limits', ['limits' => [['category' => 'Car', 'monthly_limit' => 1]]])->assertNotFound();
        $this->postJson('/api/budget/limits', ['category' => 'Car', 'monthly_limit' => 1])->assertNotFound();
        $this->deleteJson('/api/budget/limits/Car')->assertNotFound();
    }

    public function test_migration_backfills_the_short_term_share(): void
    {
        $withJars = User::factory()->create();
        $withJars->forceFill([
            'monthly_income' => 7000,
            'budget_split' => ['needs' => 55, 'guilt_free' => 5, 'third' => 10, 'short_term' => 15, 'long_term' => 15],
            'monthly_set_aside' => null,
        ])->save();
        $odd = User::factory()->create();
        $odd->forceFill(['monthly_income' => 6543, 'budget_split' => ['short_term' => 10], 'monthly_set_aside' => null])->save();
        $noSplit = User::factory()->create();
        $noSplit->forceFill(['monthly_income' => 5000, 'budget_split' => null, 'monthly_set_aside' => null])->save();
        $alreadySet = User::factory()->create();
        $alreadySet->forceFill(['monthly_income' => 5000, 'budget_split' => ['short_term' => 20], 'monthly_set_aside' => 300])->save();

        $migration = require database_path('migrations/2026_11_02_000001_add_monthly_set_aside_to_users_table.php');
        $migration->backfill();

        $this->assertEquals(1050, $withJars->fresh()->monthly_set_aside);
        $this->assertEquals(654.3, $odd->fresh()->monthly_set_aside);
        $this->assertNull($noSplit->fresh()->monthly_set_aside);
        $this->assertEquals(300, $alreadySet->fresh()->monthly_set_aside);
        $this->assertNull(DB::table('users')->where('id', $this->user->id)->value('monthly_set_aside'));
    }

    public function test_item_update_ignores_guilt_free(): void
    {
        $item = $this->item('expense_item', ['amount' => 50, 'due_at' => '2026-11-10 10:00:00']);
        $flagged = $this->item('expense_item', ['amount' => 60, 'due_at' => '2026-11-10 10:00:00', 'guilt_free' => true]);

        $this->putJson("/api/items/{$item->id}", ['guilt_free' => true, 'title' => 'Renamed'])->assertOk();
        $this->assertFalse((bool) DB::table('items')->where('id', $item->id)->value('guilt_free'));
        $this->assertSame('Renamed', $item->fresh()->title);

        $this->putJson("/api/items/{$flagged->id}", ['guilt_free' => false])->assertOk();
        $this->assertTrue((bool) DB::table('items')->where('id', $flagged->id)->value('guilt_free'));

        // A type that could never carry the flag no longer 422s either.
        $this->postJson('/api/items', ['space_id' => $this->expenses->id, 'type' => 'home_task', 'title' => 'T', 'guilt_free' => true])->assertCreated();
    }
}
