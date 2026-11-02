<?php

namespace Tests\Feature;

use App\Models\Space;
use App\Models\User;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ApiSmokeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('sqlite', config('database.default'));
        $this->assertSame(':memory:', config('database.connections.sqlite.database'));
        Http::preventStrayRequests();
        Notification::fake();
    }

    public function test_seeded_primary_and_secondary_account_endpoints(): void
    {
        $this->seed(DemoSeeder::class);
        foreach (DemoSeeder::DEMO_EMAILS as $email) {
            $user = User::where('email', $email)->firstOrFail();
            Sanctum::actingAs($user);
            $paths = ['/api/user', '/api/spaces', '/api/items', '/api/dashboard', '/api/dashboard/layout', '/api/calendar?month='.now()->format('Y-m'), '/api/calendar?month='.now()->addMonthNoOverflow()->format('Y-m'), '/api/calendar/purchases', '/api/budget', '/api/budget/archive', '/api/recipes', '/api/ingredient-references'];
            foreach (Space::where('user_id', $user->id)->get() as $space) {
                $paths[] = '/api/spaces/'.$space->id;
                $paths[] = '/api/items?space_id='.$space->id;
                if ($space->type === 'grocery') {
                    $paths[] = '/api/grocery/mine?space_id='.$space->id;
                }
            }
            foreach (['Car', 'Home', 'Grocery', 'Expenses'] as $label) {
                $paths[] = '/api/budget/spaces/'.$label;
            }
            foreach ($paths as $path) {
                $this->getJson($path)->assertOk();
            }
        }
    }

    public function test_all_four_space_records_survive_create_read_update_delete(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $kinds = ['car' => ['car_expense', ['amount' => 50]], 'home' => ['home_task', ['metadata' => ['isRecurring' => false]]], 'grocery' => ['grocery_list', []], 'expenses' => ['expense_item', ['amount' => 75]]];
        foreach ($kinds as $spaceType => [$itemType,$extra]) {
            $space = $this->postJson('/api/spaces', ['name' => 'Audit '.$spaceType, 'type' => $spaceType])->assertCreated()->json('space.id');
            $this->assertNotNull($space);
            $body = array_merge(['space_id' => $space, 'type' => $itemType, 'title' => 'Audit created', 'due_at' => now()->toISOString()], $extra);
            $id = $this->postJson('/api/items', $body)->assertCreated()->json('id');
            $this->getJson('/api/items/'.$id)->assertOk()->assertJsonPath('title', 'Audit created');
            $this->putJson('/api/items/'.$id, ['title' => 'Audit updated'])->assertOk();
            $this->getJson('/api/items/'.$id)->assertOk()->assertJsonPath('title', 'Audit updated');
            $this->deleteJson('/api/items/'.$id)->assertOk();
            $this->getJson('/api/items/'.$id)->assertNotFound();
        }
    }

    public function test_shared_list_product_is_stored_in_owner_space(): void
    {
        $owner = User::factory()->create();
        $guest = User::factory()->create();
        $space = Space::factory()->create(['user_id' => $owner->id, 'type' => 'grocery']);
        $guestSpace = Space::factory()->create(['user_id' => $guest->id, 'type' => 'grocery']);
        Sanctum::actingAs($owner);
        $list = $this->postJson('/api/items', ['space_id' => $space->id, 'type' => 'grocery_list', 'title' => 'Audit shared'])->assertCreated()->json('id');
        $this->postJson('/api/items/'.$list.'/members', ['email' => $guest->email])->assertCreated();
        Sanctum::actingAs($guest);
        $product = $this->postJson('/api/items', ['space_id' => $guestSpace->id, 'type' => 'grocery_item', 'title' => 'Audit guest product', 'metadata' => ['listId' => (string) $list]])->assertCreated();
        $this->assertEquals($space->id, $product->json('space_id'));
        $this->deleteJson('/api/items/'.$list)->assertForbidden();
        $mine = $this->getJson('/api/grocery/mine?space_id='.$guestSpace->id)->assertOk();
        $this->assertContains($product->json('id'), array_column($mine->json('items'), 'id'));
    }

    public function test_spending_totals_follow_create_update_delete(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $space = Space::factory()->create(['user_id' => $user->id, 'type' => 'car']);
        $id = $this->postJson('/api/items', ['space_id' => $space->id, 'type' => 'car_expense', 'title' => 'Audit expense', 'amount' => 125, 'due_at' => now()->toISOString()])->assertCreated()->json('id');
        $this->getJson('/api/dashboard')->assertOk()->assertJsonPath('monthlyExpenses.total', 125);
        $this->getJson('/api/budget')->assertOk()->assertJsonPath('spending.Car.this_month', 125);
        $this->putJson('/api/items/'.$id, ['amount' => 150])->assertOk();
        $this->getJson('/api/dashboard')->assertOk()->assertJsonPath('monthlyExpenses.total', 150);
        $this->getJson('/api/budget')->assertOk()->assertJsonPath('spending.Car.this_month', 150);
        $this->deleteJson('/api/items/'.$id)->assertOk();
        $this->getJson('/api/dashboard')->assertOk()->assertJsonPath('monthlyExpenses.total', 0);
        $this->getJson('/api/budget')->assertOk()->assertJsonPath('spending.Car.this_month',0);
    }
}
