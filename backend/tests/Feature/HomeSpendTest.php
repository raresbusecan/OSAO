<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\Space;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Casă spend counts on the day each payment was made (spendHistory),
 * not on the record's due_at -- Acasă's month total and Buget agree. */
class HomeSpendTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Space $home;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-10-15 12:00:00');
        $this->user = User::factory()->create();
        $this->home = Space::factory()->create(['user_id' => $this->user->id, 'name' => 'Casa', 'type' => 'home']);
        Sanctum::actingAs($this->user);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function item(string $type, array $attrs): Item
    {
        return Item::unguarded(fn () => Item::create(array_merge([
            'user_id' => $this->user->id,
            'space_id' => $this->home->id,
            'type' => $type,
            'title' => $type,
            'status' => 'pending',
        ], $attrs)));
    }

    public function test_home_payments_count_on_their_own_day(): void
    {
        // Recurring visit first due in May, paid twice this month.
        $this->item('home_maintenance', [
            'amount' => 100, 'recurrence' => 'monthly', 'due_at' => '2026-05-01 00:00:00',
            'metadata' => ['spendHistory' => [
                ['date' => '2026-09-20T10:00:00.000Z', 'amount' => 100],
                ['date' => '2026-10-02T10:00:00.000Z', 'amount' => 100],
                ['date' => '2026-10-10T10:00:00.000Z', 'amount' => 120],
            ]],
        ]);
        // Purchase task due in August, bought this month.
        $this->item('home_task', [
            'amount' => 300, 'due_at' => '2026-08-01 00:00:00', 'status' => 'completed', 'completed_at' => '2026-10-05 09:00:00',
            'metadata' => ['isPurchase' => true, 'spendHistory' => [['date' => '2026-10-05T09:00:00.000Z', 'amount' => 300]]],
        ]);
        // Recurring purchase task: next date in November, bought today.
        $this->item('home_task', [
            'amount' => 50, 'due_at' => '2026-11-15 00:00:00',
            'metadata' => ['isPurchase' => true, 'isRecurring' => true, 'spendHistory' => [['date' => '2026-10-15T08:00:00.000Z', 'amount' => 50]]],
        ]);
        // Not a purchase: never spend.
        $this->item('home_task', ['amount' => 999, 'due_at' => '2026-10-03 00:00:00', 'metadata' => ['isPurchase' => false]]);
        // Plain expense, still summed by due_at.
        $this->item('home_expense', ['amount' => 30, 'due_at' => '2026-10-07 00:00:00']);

        // 100 + 120 + 300 + 50 + 30
        $this->getJson('/api/dashboard')
            ->assertOk()
            ->assertJsonPath('monthlyExpenses.total', 600);

        $budget = $this->getJson('/api/budget')->assertOk();
        $this->assertEquals(600, $budget->json('spending.Home.this_month'));
        $this->assertEquals(100, $budget->json('spending.Home.last_month'));
    }

    public function test_bills_paid_and_due(): void
    {
        // Paid on the 3rd, so it moved on to 3 Nov.
        $this->item('home_recurring', [
            'amount' => 80, 'recurrence' => 'monthly', 'due_at' => '2026-11-03 00:00:00',
            'metadata' => ['spendHistory' => [['date' => '2026-10-03T10:00:00.000Z', 'amount' => 80]]],
        ]);
        // Restant since September: Sept + Oct still unpaid.
        $this->item('home_recurring', ['amount' => 40, 'recurrence' => 'monthly', 'due_at' => '2026-09-20 00:00:00']);
        // Weekly, from the 20th: 20 and 27 Oct.
        $this->item('home_recurring', ['amount' => 10, 'recurrence' => 'weekly', 'due_at' => '2026-10-20 00:00:00']);

        $this->getJson('/api/dashboard')
            ->assertOk()
            ->assertJsonPath('monthlyExpenses.billsPaid', 80)
            ->assertJsonPath('monthlyExpenses.billsDue', 100)
            // Bills stay out of the Complet total.
            ->assertJsonPath('monthlyExpenses.total', 0);
    }
}
