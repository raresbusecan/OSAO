<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\Space;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** POST /spaces with an optional `credit` -- a car/home bought "în rate":
 * the space, the Cheltuieli space (reused or a new "Default") and the
 * expense_credit are created together or not at all. */
class SpaceCreditTest extends TestCase
{
    use RefreshDatabase;

    private function credit(array $over = []): array
    {
        return array_merge([
            'title' => 'Leasing BMW',
            'amount' => 1450,
            'day_of_month' => 15,
            'end_date' => Carbon::now()->addYears(3)->format('Y-m') . '-15',
        ], $over);
    }

    public function test_budget_credit_links_identify_the_owning_expenses_space_not_the_linked_asset(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        // Multiple Expenses spaces and a linked car make a generic Space
        // shortcut ambiguous: each credit must carry its actual owner.
        Space::factory()->create(['user_id' => $user->id, 'type' => 'expenses']);
        $owner = Space::factory()->create(['user_id' => $user->id, 'type' => 'expenses']);
        $car = Space::factory()->create(['user_id' => $user->id, 'type' => 'car']);
        $credit = Item::factory()->create([
            'user_id' => $user->id, 'space_id' => $owner->id,
            'type' => Item::CREDIT_TYPE, 'amount' => 100, 'recurrence' => 'monthly',
            'metadata' => [
                'day_of_month' => 15,
                'end_date' => Carbon::now()->addYears(3)->format('Y-m-d'),
                'linked_space_id' => $car->id,
            ],
        ]);
        Item::factory()->create([
            'type' => Item::CREDIT_TYPE, 'amount' => 200, 'recurrence' => 'monthly',
            'metadata' => ['day_of_month' => 15, 'end_date' => Carbon::now()->addYears(3)->format('Y-m-d')],
        ]);

        $this->getJson('/api/budget')->assertOk()
            ->assertJsonCount(1, 'credit.items')
            ->assertJsonPath('credit.items.0.id', $credit->id)
            ->assertJsonPath('credit.items.0.space_id', $owner->id)
            ->assertJsonPath('credit.items.0.linked_space_id', $car->id);
    }

    public function test_car_with_credit_and_no_expenses_space_creates_default(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $res = $this->postJson('/api/spaces', [
            'name' => 'BMW', 'icon' => 'car-outline', 'type' => 'car',
            'credit' => $this->credit(),
        ])->assertCreated()
            ->assertJsonPath('expenses_space_created', true)
            ->assertJsonPath('expenses_space.name', 'Default')
            ->assertJsonPath('expenses_space.type', 'expenses')
            ->assertJsonPath('credit.type', Item::CREDIT_TYPE)
            ->assertJsonPath('credit.title', 'Leasing BMW')
            ->assertJsonPath('credit.recurrence', 'monthly');

        $carId = $res->json('space.id');
        $credit = Item::findOrFail($res->json('credit.id'));
        $this->assertSame($res->json('expenses_space.id'), $credit->space_id);
        $this->assertSame($carId, $credit->metadata['linked_space_id']);
        $this->assertSame(15, $credit->metadata['day_of_month']);
        $this->assertSame($user->id, $credit->user_id);
        $this->assertNotNull($credit->due_at);
        $this->assertSame(2, Space::where('user_id', $user->id)->count());
    }

    public function test_home_with_credit_reuses_existing_expenses_space(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $existing = Space::factory()->create(['user_id' => $user->id, 'name' => 'Cheltuieli', 'type' => 'expenses']);

        $res = $this->postJson('/api/spaces', [
            'name' => 'Băiuț', 'icon' => 'home-outline', 'type' => 'home',
            'credit' => $this->credit(['title' => 'Credit Băiuț', 'day_of_month' => 31]),
        ])->assertCreated()
            ->assertJsonPath('expenses_space_created', false)
            ->assertJsonPath('expenses_space.id', $existing->id);

        $this->assertSame(2, Space::where('user_id', $user->id)->count());
        $credit = Item::where('type', Item::CREDIT_TYPE)->sole();
        $this->assertSame($existing->id, $credit->space_id);
        $this->assertSame($res->json('space.id'), $credit->metadata['linked_space_id']);
    }

    public function test_invalid_credit_creates_nothing(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/spaces', [
            'name' => 'BMW', 'type' => 'car',
            'credit' => $this->credit(['amount' => 0]),
        ])->assertStatus(422)
            ->assertJsonPath('message', 'Rata lunară trebuie să fie mai mare decât 0.')
            ->assertJsonStructure(['errors' => ['credit.amount']]);

        $this->postJson('/api/spaces', [
            'name' => 'BMW', 'type' => 'car',
            'credit' => $this->credit(['end_date' => Carbon::now()->subMonth()->format('Y-m-d')]),
        ])->assertStatus(422)->assertJsonStructure(['errors' => ['credit.end_date']]);

        $this->postJson('/api/spaces', [
            'name' => 'BMW', 'type' => 'car',
            'credit' => $this->credit(['day_of_month' => 32]),
        ])->assertStatus(422)->assertJsonStructure(['errors' => ['credit.day_of_month']]);

        $this->postJson('/api/spaces', [
            'name' => 'BMW', 'type' => 'car',
            'credit' => $this->credit(['title' => '   ']),
        ])->assertStatus(422);

        $this->assertSame(0, Space::count());
        $this->assertSame(0, Item::count());
    }

    public function test_credit_only_for_car_or_home(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/spaces', [
            'name' => 'Cumpărături', 'type' => 'grocery',
            'credit' => $this->credit(),
        ])->assertStatus(422)->assertJsonStructure(['errors' => ['credit']]);

        $this->assertSame(0, Space::count());
    }

    private function carProfile(array $over = []): array
    {
        return array_merge([
            'make' => 'BMW', 'model' => '340d', 'color' => null,
            'year' => 2020, 'purchase_price' => 0, 'tank_capacity' => 57,
        ], $over);
    }

    public function test_car_with_profile_and_credit_in_one_request(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $res = $this->postJson('/api/spaces', [
            'name' => 'BMW', 'icon' => 'car-outline', 'type' => 'car',
            'profile' => $this->carProfile(),
            'credit' => $this->credit(),
        ])->assertCreated()
            ->assertJsonPath('profile.make', 'BMW')
            ->assertJsonPath('space.car_profile.model', '340d')
            ->assertJsonPath('expenses_space_created', true);

        $space = Space::findOrFail($res->json('space.id'));
        $this->assertSame('340d', $space->carProfile->model);
        $this->assertEquals(57, $space->carProfile->tank_capacity);
        $this->assertSame(1, Item::where('type', Item::CREDIT_TYPE)->count());
    }

    public function test_home_with_profile_stored(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $res = $this->postJson('/api/spaces', [
            'name' => 'Băiuț', 'type' => 'home',
            'profile' => ['county' => 'Maramureș', 'city' => 'Băiuț', 'ownership' => 'bought', 'purchase_price' => 120000],
        ])->assertCreated()
            ->assertJsonPath('profile.city', 'Băiuț')
            ->assertJsonMissingPath('credit');

        $this->assertSame('Maramureș', Space::findOrFail($res->json('space.id'))->homeProfile->county);
    }

    public function test_invalid_profile_creates_nothing(): void
    {
        Sanctum::actingAs(User::factory()->create());

        // Valid credit, bad profile: neither the car, nor "Default", nor the credit.
        $this->postJson('/api/spaces', [
            'name' => 'BMW', 'type' => 'car',
            'profile' => $this->carProfile(['tank_capacity' => 0]),
            'credit' => $this->credit(),
        ])->assertStatus(422)
            ->assertJsonPath('message', 'Capacitatea rezervorului trebuie să fie mai mare decât 0.')
            ->assertJsonStructure(['errors' => ['profile.tank_capacity']]);

        $this->postJson('/api/spaces', [
            'name' => 'X', 'type' => 'home',
            'profile' => ['county' => 'Cluj', 'city' => '', 'ownership' => 'rented'],
        ])->assertStatus(422)
            ->assertJsonStructure(['errors' => ['profile.city', 'profile.ownership']]);

        // Good profile, bad credit: the profile is rolled back with the space.
        $this->postJson('/api/spaces', [
            'name' => 'BMW', 'type' => 'car',
            'profile' => $this->carProfile(),
            'credit' => $this->credit(['amount' => -5]),
        ])->assertStatus(422)->assertJsonStructure(['errors' => ['credit.amount']]);

        // A profile on a kind that has none.
        $this->postJson('/api/spaces', [
            'name' => 'Cumpărături', 'type' => 'grocery',
            'profile' => $this->carProfile(),
        ])->assertStatus(422)->assertJsonStructure(['errors' => ['profile']]);

        $this->assertSame(0, Space::count());
        $this->assertSame(0, Item::count());
        $this->assertSame(0, \App\Models\CarProfile::count());
        $this->assertSame(0, \App\Models\HomeProfile::count());
    }

    public function test_profile_endpoint_still_works_for_edits(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $space = Space::factory()->create(['user_id' => $user->id, 'type' => 'car']);

        $this->putJson("/api/spaces/{$space->id}/car-profile", $this->carProfile(['model' => 'M3']))
            ->assertOk()->assertJsonPath('profile.model', 'M3');
        $this->putJson("/api/spaces/{$space->id}/car-profile", $this->carProfile(['make' => '']))
            ->assertStatus(422)->assertJsonPath('errors.make.0', 'Scrie marca mașinii.');
    }

    public function test_space_without_credit_unchanged(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/spaces', ['name' => 'BMW', 'type' => 'car'])
            ->assertCreated()
            ->assertJsonPath('space.name', 'BMW')
            ->assertJsonMissingPath('credit');

        $this->assertSame(1, Space::count());
        $this->assertSame(0, Item::count());
    }
}
