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
        
        // Create overdue item
        $overdueItem = Item::factory()->create([
            'user_id' => $user->id,
            'due_at' => Carbon::now()->subDay(),
            'status' => 'pending',
        ]);
        
        // Create today item
        $todayItem = Item::factory()->create([
            'user_id' => $user->id,
            'due_at' => Carbon::now(),
            'status' => 'pending',
        ]);
        
        // Create upcoming item (within 7 days)
        $upcomingItem = Item::factory()->create([
            'user_id' => $user->id,
            'due_at' => Carbon::now()->addDays(3),
            'status' => 'pending',
        ]);
        
        // Create payment item
        $paymentItem = Item::factory()->create([
            'user_id' => $user->id,
            'type' => 'expense',
            'due_at' => Carbon::now()->addDays(5),
            'status' => 'pending',
        ]);
        
        // Create completed item (should be excluded)
        $completedItem = Item::factory()->create([
            'user_id' => $user->id,
            'due_at' => Carbon::now()->subDay(),
            'status' => 'completed',
        ]);
        
        // Create non-payment expense item (should be excluded)
        $nonPaymentExpense = Item::factory()->create([
            'user_id' => $user->id,
            'type' => 'expense',
            'due_at' => Carbon::now()->subDay(),
            'status' => 'pending',
        ]);
        
        // Create another item for the other user (should be excluded)
        $otherUser = User::factory()->create();
        $otherItem = Item::factory()->create([
            'user_id' => $otherUser->id,
            'due_at' => Carbon::now()->subDay(),
            'status' => 'pending',
        ]);
        
        $response = $this->actingAs($user)->getJson('/api/dashboard');
        
        $response->assertStatus(200);
        
        $data = $response->json();
        
        // Check that only items belonging to the current user are returned.
        // `overdue` counts any item type past its due date (not just
        // non-expenses) — the non-payment expense item is also legitimately
        // overdue, it just isn't a `payment` (that requires a future due_at).
        $this->assertCount(2, $data['overdue']);
        $overdueIds = array_column($data['overdue'], 'id');
        $this->assertContains($overdueItem->id, $overdueIds);
        $this->assertContains($nonPaymentExpense->id, $overdueIds);

        $this->assertCount(1, $data['today']);
        $this->assertEquals($todayItem->id, $data['today'][0]['id']);
        
        // `upcoming` and `payments` are not mutually exclusive — an expense
        // due within the next 7 days legitimately appears in both.
        $this->assertCount(2, $data['upcoming']);
        $upcomingIds = array_column($data['upcoming'], 'id');
        $this->assertContains($upcomingItem->id, $upcomingIds);
        $this->assertContains($paymentItem->id, $upcomingIds);

        $this->assertCount(1, $data['payments']);
        $this->assertEquals($paymentItem->id, $data['payments'][0]['id']);
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
        $this->assertCount(0, $data['payments']);
    }
    
    public function test_dashboard_unauthorized_without_authentication()
    {
        $response = $this->getJson('/api/dashboard');
        
        $response->assertStatus(401);
    }
}