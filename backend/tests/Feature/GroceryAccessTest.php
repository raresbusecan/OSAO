<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\Space;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class GroceryAccessTest extends TestCase
{
    use RefreshDatabase;

    private function sharedLists(): array
    {
        $owner = User::factory()->create();
        $guest = User::factory()->create();
        $space = Space::factory()->create(['user_id' => $owner->id, 'type' => 'grocery']);
        $shared = Item::factory()->create(['user_id' => $owner->id, 'space_id' => $space->id, 'type' => 'grocery_list']);
        $private = Item::factory()->create(['user_id' => $owner->id, 'space_id' => $space->id, 'type' => 'grocery_list']);
        $shared->members()->attach($guest->id);
        $product = Item::factory()->create(['user_id' => $guest->id, 'space_id' => $space->id, 'type' => 'grocery_item', 'metadata' => ['listId' => (string) $shared->id]]);
        $privateProduct = Item::factory()->create(['user_id' => $owner->id, 'space_id' => $space->id, 'type' => 'grocery_item', 'metadata' => ['listId' => (string) $private->id]]);

        return compact('owner', 'guest', 'space', 'shared', 'private', 'product', 'privateProduct');
    }

    public function test_space_member_only_sees_lists_and_products_shared_with_them(): void
    {
        extract($this->sharedLists());
        $space->members()->attach($guest->id);
        Sanctum::actingAs($guest);

        $this->getJson('/api/items/'.$private->id)->assertNotFound();
        $ids = array_column($this->getJson('/api/items?space_id='.$space->id)->assertOk()->json(), 'id');
        $this->assertEqualsCanonicalizing([$shared->id, $product->id], $ids);
    }

    public function test_space_owner_can_still_list_every_list_and_product(): void
    {
        extract($this->sharedLists());
        Sanctum::actingAs($owner);
        $response = $this->getJson('/api/items?space_id='.$space->id)->assertOk();
        $this->assertCount(4, $response->json());
    }

    public function test_creator_cannot_list_products_after_list_access_is_removed(): void
    {
        extract($this->sharedLists());
        $shared->members()->detach($guest->id);
        Sanctum::actingAs($guest);
        $this->getJson('/api/items?type=grocery_item')->assertOk()->assertExactJson([]);
    }

    public function test_non_grocery_items_keep_space_member_visibility(): void
    {
        extract($this->sharedLists());
        $space->members()->attach($guest->id);
        $task = Item::factory()->create(['user_id' => $owner->id, 'space_id' => $space->id, 'type' => 'home_task']);
        Sanctum::actingAs($guest);
        $this->getJson('/api/items?space_id='.$space->id.'&type=home_task')->assertOk()->assertJsonPath('0.id', $task->id);
    }

    public function test_product_cannot_be_moved_to_a_private_list(): void
    {
        extract($this->sharedLists());
        Sanctum::actingAs($guest);
        $this->putJson('/api/items/'.$product->id, ['metadata' => ['listId' => (string) $private->id]])->assertNotFound();
        $this->assertSame((string) $shared->id, $product->fresh()->metadata['listId']);
    }

    public function test_product_move_to_an_accessible_list_tracks_its_space(): void
    {
        extract($this->sharedLists());
        $targetSpace = Space::factory()->create(['user_id' => $guest->id, 'type' => 'grocery']);
        $target = Item::factory()->create(['user_id' => $guest->id, 'space_id' => $targetSpace->id, 'type' => 'grocery_list']);
        Sanctum::actingAs($guest);
        $this->putJson('/api/items/'.$product->id, ['metadata' => ['listId' => $target->id]])
            ->assertOk()->assertJsonPath('space_id', $targetSpace->id)->assertJsonPath('metadata.listId', (string) $target->id);
        $this->getJson('/api/items/'.$product->id)->assertOk();
    }

    public function test_product_and_list_cannot_be_retyped_into_each_other(): void
    {
        extract($this->sharedLists());
        Sanctum::actingAs($guest);
        $this->postJson('/api/items', ['space_id' => $space->id, 'type' => 'grocery_list', 'title' => 'Unauthorized'])->assertNotFound();
        $this->putJson('/api/items/'.$product->id, ['type' => 'grocery_list'])->assertStatus(422);
        Sanctum::actingAs($owner);
        $this->putJson('/api/items/'.$shared->id, ['type' => 'grocery_item', 'metadata' => ['listId' => (string) $private->id]])->assertStatus(422);
    }

    public function test_product_requires_a_real_list_parent(): void
    {
        extract($this->sharedLists());
        Sanctum::actingAs($guest);
        foreach ([null, ['bad'], (string) $privateProduct->id] as $parent) {
            $this->putJson('/api/items/'.$product->id, ['metadata' => ['listId' => $parent]])->assertNotFound();
            $this->postJson('/api/items', ['type' => 'grocery_item', 'title' => 'Bad parent', 'metadata' => ['listId' => $parent]])->assertNotFound();
        }
        $this->putJson('/api/items/'.$product->id, ['metadata' => null])->assertNotFound();
    }

    public function test_partial_product_metadata_keeps_parent_and_other_fields(): void
    {
        extract($this->sharedLists());
        Sanctum::actingAs($guest);
        $this->putJson('/api/items/'.$product->id, ['metadata' => ['quantity' => '2 kg']])
            ->assertOk()->assertJsonPath('metadata.listId', (string) $shared->id)->assertJsonPath('metadata.quantity', '2 kg');
    }

    public function test_deleting_list_removes_only_its_products_and_keeps_trip_history(): void
    {
        extract($this->sharedLists());
        $numeric = Item::factory()->create(['user_id' => $owner->id, 'space_id' => $space->id, 'type' => 'grocery_item', 'metadata' => ['listId' => $shared->id]]);
        $trip = Item::factory()->create(['user_id' => $owner->id, 'space_id' => $space->id, 'type' => 'grocery_trip', 'metadata' => ['listId' => (string) $shared->id]]);
        Sanctum::actingAs($owner);
        $this->deleteJson('/api/items/'.$shared->id)->assertOk();
        foreach ([$shared, $product, $numeric] as $deleted) {
            $this->assertDatabaseMissing('items', ['id' => $deleted->id]);
        }
        foreach ([$private, $privateProduct, $trip] as $kept) {
            $this->assertDatabaseHas('items', ['id' => $kept->id]);
        }
    }

    public function test_guest_cannot_delete_list_or_its_products(): void
    {
        extract($this->sharedLists());
        Sanctum::actingAs($guest);
        $this->deleteJson('/api/items/'.$shared->id)->assertForbidden();
        $this->assertDatabaseHas('items', ['id' => $product->id]);
    }

    public function test_failed_list_delete_rolls_back_product_deletion(): void
    {
        extract($this->sharedLists());
        Sanctum::actingAs($owner);
        $event = 'eloquent.deleting: '.Item::class;
        Event::listen($event, function (Item $item) use ($shared) {
            if ($item->id === $shared->id) {
                throw new \RuntimeException('Simulated list deletion failure');
            }
        });
        $this->withoutExceptionHandling();
        try {
            $this->deleteJson('/api/items/'.$shared->id);
            $this->fail('Expected the simulated failure.');
        } catch (\RuntimeException $error) {
            $this->assertSame('Simulated list deletion failure', $error->getMessage());
        } finally {
            Event::forget($event);
        }
        $this->assertDatabaseHas('items', ['id' => $shared->id]);
        $this->assertDatabaseHas('items', ['id' => $product->id]);
    }
}
