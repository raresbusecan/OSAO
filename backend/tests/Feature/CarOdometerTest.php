<?php

namespace Tests\Feature;

use App\Models\CarProfile;
use App\Models\Item;
use App\Models\Space;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** PUT /spaces/{id}/car-profile/odometer -- the km typed on the Mașină top card. */
class CarOdometerTest extends TestCase
{
    use RefreshDatabase;

    private function car(User $user): Space
    {
        $space = Space::factory()->create(['user_id' => $user->id, 'name' => 'BMW', 'type' => 'car']);
        CarProfile::create([
            'space_id' => $space->id, 'make' => 'BMW', 'model' => '340d', 'year' => 2020,
            'purchase_price' => 0, 'tank_capacity' => 57,
        ]);

        return $space;
    }

    private function logEntry(User $user, Space $space, string $type, $odometer): void
    {
        Item::create([
            'user_id' => $user->id, 'space_id' => $space->id, 'type' => $type,
            'title' => $type === 'car_fuel' ? 'Fuel' : 'Oil change', 'amount' => 100,
            'status' => 'completed', 'due_at' => now(),
            'metadata' => ['odometer' => $odometer],
        ]);
    }

    public function test_valid_update_saves_and_stamps_date(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $space = $this->car($user);
        $this->logEntry($user, $space, 'car_fuel', 120000);

        $this->putJson("/api/spaces/{$space->id}/car-profile/odometer", ['odometer' => 123456])
            ->assertOk()
            ->assertJsonPath('profile.odometer', 123456)
            ->assertJsonPath('logged_odometer', 120000);

        $profile = $space->carProfile()->first();
        $this->assertSame(123456, $profile->odometer);
        $this->assertNotNull($profile->odometer_updated_at);

        // Shows on GET /spaces/{id} too.
        $this->getJson("/api/spaces/{$space->id}")
            ->assertJsonPath('space.car_profile.odometer', 123456);

        // Equal to the logged max is fine.
        $this->putJson("/api/spaces/{$space->id}/car-profile/odometer", ['odometer' => 120000])->assertOk();
    }

    public function test_profile_edit_keeps_the_odometer(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $space = $this->car($user);
        $this->putJson("/api/spaces/{$space->id}/car-profile/odometer", ['odometer' => 5000])->assertOk();

        $this->putJson("/api/spaces/{$space->id}/car-profile", [
            'make' => 'BMW', 'model' => '330i', 'year' => 2020, 'purchase_price' => 0, 'tank_capacity' => 57,
        ])->assertOk()->assertJsonPath('profile.odometer', 5000);
    }

    public function test_lower_than_logged_is_rejected_in_romanian(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $space = $this->car($user);
        $this->logEntry($user, $space, 'car_fuel', 120000);
        $this->logEntry($user, $space, 'car_maintenance', '130500');

        $res = $this->putJson("/api/spaces/{$space->id}/car-profile/odometer", ['odometer' => 125000])
            ->assertStatus(422)
            ->assertJsonValidationErrors('odometer');
        $this->assertStringContainsString('130.500 km', $res->json('message'));
        $this->assertStringContainsString('130.500 km', $res->json('errors.odometer.0'));
        $this->assertNull($space->carProfile()->first()->odometer);
    }

    public function test_overflow_zero_and_fractions_are_rejected(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $space = $this->car($user);

        foreach ([2000001, 99999999999999999999, 0, -5, 12.5, 'abc', null] as $bad) {
            $this->putJson("/api/spaces/{$space->id}/car-profile/odometer", ['odometer' => $bad])
                ->assertStatus(422)
                ->assertJsonValidationErrors('odometer');
        }
        $this->putJson("/api/spaces/{$space->id}/car-profile/odometer", ['odometer' => 2000000])->assertOk();
    }

    public function test_other_users_space_is_404(): void
    {
        $owner = User::factory()->create();
        $space = $this->car($owner);

        Sanctum::actingAs(User::factory()->create());
        $this->putJson("/api/spaces/{$space->id}/car-profile/odometer", ['odometer' => 1000])->assertNotFound();
        $this->assertNull($space->carProfile()->first()->odometer);
    }

    public function test_non_car_space_and_missing_profile(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $home = Space::factory()->create(['user_id' => $user->id, 'type' => 'home']);
        $this->putJson("/api/spaces/{$home->id}/car-profile/odometer", ['odometer' => 1000])->assertNotFound();

        $bare = Space::factory()->create(['user_id' => $user->id, 'type' => 'car']);
        $this->putJson("/api/spaces/{$bare->id}/car-profile/odometer", ['odometer' => 1000])
            ->assertStatus(422)->assertJsonValidationErrors('odometer');
    }

    public function test_manual_odometer_feeds_dashboard_car_summary(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $space = $this->car($user);
        $this->logEntry($user, $space, 'car_fuel', 100000);
        $this->putJson("/api/spaces/{$space->id}/car-profile/odometer", ['odometer' => 110000])->assertOk();

        $cars = collect($this->getJson('/api/dashboard')->assertOk()->json('cars'));
        $this->assertSame(110000, $cars->firstWhere('space_id', $space->id)['odometer'] ?? null);
    }
}
