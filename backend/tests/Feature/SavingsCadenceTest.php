<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\SavingsDeposit;
use App\Models\SavingsGoal;
use App\Models\Space;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Obiectiv de economii, interactive (2026-11): picking a rhythm on the
 * Economii card (Pui deoparte becomes its monthly estimate), "Am pus
 * deoparte" deposits, the 3-in-a-row reminder switch, the rollover leaving
 * deposits out, and the Calendar reminder rows. */
class SavingsCadenceTest extends TestCase
{
    use RefreshDatabase;

    private const TZ = 'Europe/Bucharest';

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
        $this->user->forceFill([
            'timezone' => self::TZ,
            'monthly_income' => 3000,
            'monthly_set_aside' => 450,
            'budget_plan_set_at' => '2026-10-01 09:00:00',
        ])->save();
        Sanctum::actingAs($this->user);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function at(string $local): void
    {
        Carbon::setTestNow(Carbon::parse($local, self::TZ)->setTimezone('UTC'));
    }

    private function goal(): SavingsGoal
    {
        return SavingsGoal::where('user_id', $this->user->id)->firstOrFail();
    }

    public function test_picking_a_rhythm_makes_pui_deoparte_its_monthly_estimate(): void
    {
        $this->at('2026-11-02 10:00:00');
        $this->putJson('/api/budget/savings-goal/cadence', ['cadence' => 'day', 'amount' => 25])
            ->assertOk()
            ->assertJsonPath('plan.set_aside', 761) // 25 x 30.44
            ->assertJsonPath('plan.spendable', 2239)
            ->assertJsonPath('capped', false)
            ->assertJsonPath('savingsGoal.cadence', 'day')
            ->assertJsonPath('savingsGoal.cadence_since', '2026-11-02')
            ->assertJsonPath('savingsGoal.streak', 0);

        $this->putJson('/api/budget/savings-goal/cadence', ['cadence' => 'week', 'amount' => 900])
            ->assertJsonPath('plan.set_aside', 3000)
            ->assertJsonPath('capped', true);

        $this->putJson('/api/budget/savings-goal/cadence', ['cadence' => 'year', 'amount' => 1])->assertStatus(422);
        $this->putJson('/api/budget/savings-goal/cadence', ['cadence' => 'day'])->assertStatus(422);
        $this->putJson('/api/budget/savings-goal/cadence', ['cadence' => null])
            ->assertOk()->assertJsonPath('savingsGoal.cadence', null);
    }

    public function test_a_deposit_adds_to_economii_and_marks_the_period(): void
    {
        $this->at('2026-11-02 10:00:00');
        $this->postJson('/api/budget/savings-goal/deposits', ['amount' => 25])
            ->assertStatus(422)->assertJsonValidationErrors('cadence');

        SavingsGoal::create(['user_id' => $this->user->id, 'target_amount' => 1000, 'current_amount' => 100]);
        $this->putJson('/api/budget/savings-goal/cadence', ['cadence' => 'day', 'amount' => 25])->assertOk();
        $this->getJson('/api/budget')->assertJsonPath('savingsGoal.period_done', false);

        $this->postJson('/api/budget/savings-goal/deposits', ['amount' => 25])
            ->assertCreated()
            ->assertJsonPath('savingsGoal.current_amount', '125.00')
            ->assertJsonPath('savingsGoal.period_done', true)
            ->assertJsonPath('savingsGoal.streak', 1)
            ->assertJsonPath('savingsGoal.deposited_this_month', 25);
        $this->assertSame('2026-11-02', SavingsDeposit::first()->period_start->toDateString());
    }

    public function test_three_days_in_a_row_turn_the_reminders_on(): void
    {
        $this->at('2026-11-02 10:00:00');
        $this->putJson('/api/budget/savings-goal/cadence', ['cadence' => 'day', 'amount' => 25]);
        $this->postJson('/api/budget/savings-goal/deposits', ['amount' => 25]);
        $this->at('2026-11-03 21:00:00');
        $this->postJson('/api/budget/savings-goal/deposits', ['amount' => 25])
            ->assertJsonPath('savingsGoal.reminders_since', null);
        // A day off breaks the run.
        $this->at('2026-11-05 08:00:00');
        $this->postJson('/api/budget/savings-goal/deposits', ['amount' => 25])
            ->assertJsonPath('savingsGoal.streak', 1)
            ->assertJsonPath('savingsGoal.reminders_since', null);
        $this->at('2026-11-06 08:00:00');
        $this->postJson('/api/budget/savings-goal/deposits', ['amount' => 25]);
        $this->at('2026-11-07 23:30:00');
        $this->postJson('/api/budget/savings-goal/deposits', ['amount' => 25])
            ->assertJsonPath('savingsGoal.streak', 3)
            ->assertJsonPath('savingsGoal.reminders_since', '2026-11-07');

        // Not confirmed yet today: yesterday's run still counts.
        $this->at('2026-11-08 09:00:00');
        $this->getJson('/api/budget')->assertJsonPath('savingsGoal.streak', 3)->assertJsonPath('savingsGoal.period_done', false);

        // A new rhythm starts over.
        $this->putJson('/api/budget/savings-goal/cadence', ['cadence' => 'week', 'amount' => 150])
            ->assertJsonPath('savingsGoal.reminders_since', null)
            ->assertJsonPath('savingsGoal.streak', 0);
    }

    public function test_week_periods_count_from_the_day_the_rhythm_was_picked(): void
    {
        $this->at('2026-11-04 10:00:00'); // a Wednesday
        $this->putJson('/api/budget/savings-goal/cadence', ['cadence' => 'week', 'amount' => 150]);
        $this->postJson('/api/budget/savings-goal/deposits', ['amount' => 150]);
        $this->at('2026-11-13 10:00:00'); // 2nd week (11-11 .. 11-17)
        $this->postJson('/api/budget/savings-goal/deposits', ['amount' => 150]);
        $this->assertSame('2026-11-11', SavingsDeposit::latest('id')->first()->period_start->toDateString());
        $this->at('2026-11-18 07:00:00'); // 3rd week starts
        $this->postJson('/api/budget/savings-goal/deposits', ['amount' => 150])
            ->assertJsonPath('savingsGoal.streak', 3)
            ->assertJsonPath('savingsGoal.reminders_since', '2026-11-18');
    }

    public function test_the_rollover_leaves_out_what_was_already_deposited(): void
    {
        $space = Space::factory()->create(['user_id' => $this->user->id, 'name' => 'Cheltuieli', 'type' => 'expenses']);
        SavingsGoal::create(['user_id' => $this->user->id, 'target_amount' => 5000, 'current_amount' => 0, 'last_applied_month' => '2026-10-01']);
        $this->at('2026-11-10 10:00:00');
        $this->putJson('/api/budget/savings-goal/cadence', ['cadence' => 'day', 'amount' => 10]);
        // 30 deposits of 10 lei in November.
        SavingsDeposit::insert(array_map(fn ($d) => [
            'user_id' => $this->user->id, 'amount' => 10, 'cadence' => 'day',
            'deposited_on' => sprintf('2026-11-%02d', $d), 'period_start' => sprintf('2026-11-%02d', $d),
            'created_at' => now(), 'updated_at' => now(),
        ], range(1, 30)));
        $this->goal()->forceFill(['current_amount' => 300])->save();
        Item::unguarded(fn () => Item::create([
            'user_id' => $this->user->id, 'space_id' => $space->id, 'type' => 'expense_item',
            'title' => 'x', 'status' => 'pending', 'amount' => 1000, 'due_at' => '2026-11-12 10:00:00',
        ]));

        $this->at('2026-12-03 10:00:00');
        // 300 deposited + (3000 income - 1000 spent - 300 deposited) = 2000, not 2300.
        $this->getJson('/api/budget')->assertJsonPath('savingsGoal.current_amount', '2000.00');
    }

    public function test_calendar_shows_a_reminder_on_each_day_of_the_rhythm(): void
    {
        $this->at('2026-11-04 10:00:00');
        SavingsGoal::create(['user_id' => $this->user->id, 'name' => 'Vacanță', 'target_amount' => 1000, 'current_amount' => 0]);
        $this->putJson('/api/budget/savings-goal/cadence', ['cadence' => 'week', 'amount' => 150]);
        $this->postJson('/api/budget/savings-goal/deposits', ['amount' => 150]);

        $days = $this->getJson('/api/calendar?month=2026-11')->assertOk()->json('days');
        $rows = collect($days)->map(fn ($items) => collect($items)->where('type', 'savings_reminder')->values())->filter->isNotEmpty();
        $this->assertSame(['2026-11-04', '2026-11-11', '2026-11-18', '2026-11-25'], $rows->keys()->values()->all());
        $first = $rows['2026-11-04'][0];
        $this->assertSame('Vacanță', $first['title']);
        $this->assertTrue($first['reminder']);
        $this->assertTrue($first['done']);
        $this->assertFalse($rows['2026-11-11'][0]['done']);
    }

    public function test_the_same_rhythm_again_only_moves_the_amount(): void
    {
        $this->at('2026-11-02 10:00:00');
        $this->putJson('/api/budget/savings-goal/cadence', ['cadence' => 'day', 'amount' => 25]);
        $this->postJson('/api/budget/savings-goal/deposits', ['amount' => 25]);
        $this->at('2026-11-03 10:00:00');
        $this->putJson('/api/budget/savings-goal/cadence', ['cadence' => 'day', 'amount' => 40])
            ->assertJsonPath('savingsGoal.cadence_amount', '40.00')
            ->assertJsonPath('savingsGoal.cadence_since', '2026-11-02')
            ->assertJsonPath('savingsGoal.streak', 1)
            ->assertJsonPath('plan.set_aside', 1218);
    }

    public function test_no_target_clears_the_rhythm(): void
    {
        $this->at('2026-11-02 10:00:00');
        $this->putJson('/api/budget/savings-goal/cadence', ['cadence' => 'day', 'amount' => 25]);
        $this->putJson('/api/budget/savings-goal', ['target_amount' => 0, 'current_amount' => 0])->assertOk();
        $this->assertNull($this->goal()->cadence);
        $this->assertNull($this->goal()->cadence_since);
    }

    public function test_calendar_rows_stop_at_the_goal_date_and_once_it_is_reached(): void
    {
        $this->at('2026-11-02 10:00:00');
        SavingsGoal::create(['user_id' => $this->user->id, 'target_amount' => 100, 'current_amount' => 0, 'target_date' => '2026-11-05']);
        $this->putJson('/api/budget/savings-goal/cadence', ['cadence' => 'day', 'amount' => 25]);
        $rows = fn () => collect($this->getJson('/api/calendar?month=2026-11')->json('days'))
            ->filter(fn ($items) => collect($items)->contains('type', 'savings_reminder'))->keys()->values()->all();
        $this->assertSame(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'], $rows());

        $this->postJson('/api/budget/savings-goal/deposits', ['amount' => 100]);
        $this->assertSame([], $rows());
    }
}
