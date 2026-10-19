<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\Space;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SharedDeadlinesTest extends TestCase
{
    use RefreshDatabase;

    public function test_creator_loses_shared_deadline_access_when_membership_is_revoked(): void
    {
        $owner = User::factory()->create(['timezone' => 'UTC']);
        $guest = User::factory()->create(['timezone' => 'UTC']);
        $space = Space::factory()->create(['user_id' => $owner->id, 'type' => 'home']);
        $space->members()->attach($guest->id);
        $task = Item::factory()->create(['user_id' => $guest->id, 'space_id' => $space->id, 'type' => 'home_task', 'due_at' => now()]);
        Sanctum::actingAs($guest);
        $this->getJson('/api/items/'.$task->id)->assertOk();
        $space->members()->detach($guest->id);
        $this->getJson('/api/items/'.$task->id)->assertNotFound();
        $this->getJson('/api/dashboard')->assertOk()->assertJsonCount(0, 'today');
        $calendar = $this->getJson('/api/calendar?month='.now()->format('Y-m'))->assertOk();
        $ids = collect($calendar->json('days'))->flatten(1)->pluck('id')->all();
        $this->assertNotContains($task->id, $ids);
    }

    public function test_shared_task_and_bill_are_visible_on_both_deadline_views(): void
    {
        $owner = User::factory()->create(['timezone' => 'UTC']);
        $guest = User::factory()->create(['timezone' => 'UTC']);
        $space = Space::factory()->create(['user_id' => $owner->id, 'type' => 'home']);
        $space->members()->attach($guest->id);
        $task = Item::factory()->create(['user_id' => $owner->id, 'space_id' => $space->id, 'type' => 'home_task', 'due_at' => now()]);
        $bill = Item::factory()->create(['user_id' => $owner->id, 'space_id' => $space->id, 'type' => 'home_recurring', 'due_at' => now()->startOfDay(), 'recurrence' => 'monthly', 'amount' => 100]);
        Sanctum::actingAs($guest);
        $dashboard = $this->getJson('/api/dashboard')->assertOk();
        foreach ([$task, $bill] as $item) {
            $this->assertContains($item->id, array_column($dashboard->json('today'), 'id'));
        }
        $calendar = $this->getJson('/api/calendar?month='.now()->format('Y-m'))->assertOk();
        $this->assertContains($task->id, array_column($calendar->json('days.'.now()->toDateString()), 'id'));
        // Deadline visibility does not assign another person's spending to the guest.
        $this->assertEquals(0, $dashboard->json('monthlyExpenses.total'));
        $space->members()->detach($guest->id);
        $this->getJson('/api/dashboard')->assertOk()->assertJsonCount(0, 'today');
    }

    public function test_shared_document_renewals_do_not_show_superseded_deadlines(): void
    {
        $owner = User::factory()->create(['timezone' => 'UTC']);
        $guest = User::factory()->create(['timezone' => 'UTC']);
        $space = Space::factory()->create(['user_id' => $owner->id, 'type' => 'car']);
        $space->members()->attach($guest->id);
        $old = Item::factory()->create(['user_id' => $owner->id, 'space_id' => $space->id, 'type' => 'car_document', 'due_at' => now(), 'metadata' => ['documentType' => 'RCA', 'expiryDate' => now()->format('d.m.Y')]]);
        $new = Item::factory()->create(['user_id' => $owner->id, 'space_id' => $space->id, 'type' => 'car_document', 'due_at' => now(), 'metadata' => ['documentType' => 'RCA', 'expiryDate' => now()->addYear()->format('d.m.Y')]]);
        Sanctum::actingAs($guest);
        $this->assertContains($old->id, Item::supersededCarDocumentIds($guest->id));
        $this->getJson('/api/dashboard')->assertOk()->assertJsonCount(0, 'today');
        $this->assertNotContains($new->id, Item::supersededCarDocumentIds($guest->id));
    }
}
