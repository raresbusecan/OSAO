<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
use App\Models\User;
use App\Models\Item;
use Carbon\Carbon;

class DashboardControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_dashboard_returns_correct_categories()
    {
        $user = User::factory()->create();

        // Overdue -- an ACTIONABLE_TYPES item past its due date, not completed.
        $overdueItem = Item::factory()->create([
            'user_id' => $user->id,
            'type' => 'home_task',
            'due_at' => Carbon::now()->subDay(),
            'status' => 'pending',
        ]);

        // Today.
        $todayItem = Item::factory()->create([
            'user_id' => $user->id,
            'type' => 'home_task',
            'due_at' => Carbon::now(),
            'status' => 'pending',
        ]);

        // Upcoming (within 7 days).
        $upcomingItem = Item::factory()->create([
            'user_id' => $user->id,
            'type' => 'home_task',
            'due_at' => Carbon::now()->addDays(3),
            'status' => 'pending',
        ]);

        // Completed -- excluded from every bucket regardless of due_at.
        Item::factory()->create([
            'user_id' => $user->id,
            'type' => 'home_task',
            'due_at' => Carbon::now()->subDay(),
            'status' => 'completed',
        ]);

        // A non-actionable type with a due_at (e.g. a fuel fill-up) --
        // that's a log of something that already happened, not a
        // deadline, so it must never show up here even though it's
        // technically "overdue" by date alone (see DashboardController's
        // own comment on this exact distinction).
        Item::factory()->create([
            'user_id' => $user->id,
            'type' => 'car_fuel',
            'due_at' => Carbon::now()->subDay(),
            'status' => 'pending',
        ]);

        // Another user's item -- excluded.
        $otherUser = User::factory()->create();
        Item::factory()->create([
            'user_id' => $otherUser->id,
            'type' => 'home_task',
            'due_at' => Carbon::now()->subDay(),
            'status' => 'pending',
        ]);

        $response = $this->actingAs($user)->getJson('/api/dashboard');

        $response->assertStatus(200);

        $data = $response->json();

        $this->assertCount(1, $data['overdue']);
        $this->assertEquals($overdueItem->id, $data['overdue'][0]['id']);

        $this->assertCount(1, $data['today']);
        $this->assertEquals($todayItem->id, $data['today'][0]['id']);

        $this->assertCount(1, $data['upcoming']);
        $this->assertEquals($upcomingItem->id, $data['upcoming'][0]['id']);

        $this->assertArrayHasKey('monthlyExpenses', $data);
        $this->assertArrayHasKey('total', $data['monthlyExpenses']);
        $this->assertArrayHasKey('sources', $data['monthlyExpenses']);
    }

    public function test_dashboard_sums_monthly_expenses_by_space()
    {
        $user = User::factory()->create();

        Item::factory()->create([
            'user_id' => $user->id,
            'type' => 'home_expense',
            'due_at' => Carbon::now(),
            'amount' => 150,
            'status' => 'pending',
        ]);

        Item::factory()->create([
            'user_id' => $user->id,
            'type' => 'car_fuel',
            'due_at' => Carbon::now(),
            'amount' => 200,
            'status' => 'pending',
        ]);

        // Last month's spend -- must not count toward this month's total.
        Item::factory()->create([
            'user_id' => $user->id,
            'type' => 'home_expense',
            'due_at' => Carbon::now()->subMonth(),
            'amount' => 999,
            'status' => 'pending',
        ]);

        $response = $this->actingAs($user)->getJson('/api/dashboard');

        $response->assertStatus(200);

        $data = $response->json();

        $this->assertEquals(350, $data['monthlyExpenses']['total']);
        $labels = array_column($data['monthlyExpenses']['sources'], 'spaceName');
        $this->assertContains('Home', $labels);
        $this->assertContains('Car', $labels);
    }

    public function test_dashboard_returns_empty_arrays_when_no_items()
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->getJson('/api/dashboard');

        $response->assertStatus(200);

        $data = $response->json();

        $this->assertCount(0, $data['overdue']);
        $this->assertCount(0, $data['today']);
        $this->assertCount(0, $data['upcoming']);
        $this->assertEquals(0, $data['monthlyExpenses']['total']);
        $this->assertCount(0, $data['monthlyExpenses']['sources']);
    }

    public function test_dashboard_unauthorized_without_authentication()
    {
        $response = $this->getJson('/api/dashboard');

        $response->assertStatus(401);
    }
}
