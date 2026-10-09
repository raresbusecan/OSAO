<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** First-use tours (PUT /user/tours/{key}, DELETE /user/tours) and the
 * dashboard_layout array cast that came with them. */
class UserToursTest extends TestCase
{
    use RefreshDatabase;

    public function test_new_user_has_no_tours(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/user')->assertOk()->assertJsonPath('user.tours', null);
    }

    public function test_mark_tour_merges_per_key(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->putJson('/api/user/tours/home', ['status' => 'done', 'version' => 1])
            ->assertOk()
            ->assertJsonPath('tours.home.status', 'done')
            ->assertJsonPath('tours.home.v', 1);

        $this->putJson('/api/user/tours/budget', ['status' => 'skipped', 'version' => 2])
            ->assertOk()
            ->assertJsonPath('tours.home.status', 'done')
            ->assertJsonPath('tours.budget.status', 'skipped')
            ->assertJsonPath('tours.budget.v', 2);

        $this->assertSame('skipped', $user->fresh()->tours['budget']['status']);
        $this->getJson('/api/user')->assertJsonPath('user.tours.home.status', 'done');
    }

    public function test_mark_tour_validates(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->putJson('/api/user/tours/nope', ['status' => 'done', 'version' => 1])->assertNotFound();
        $this->putJson('/api/user/tours/home', ['status' => 'seen', 'version' => 1])->assertStatus(422);
        $this->putJson('/api/user/tours/home', ['status' => 'done', 'version' => 0])->assertStatus(422);
        $this->putJson('/api/user/tours/home', ['status' => 'done', 'version' => 101])->assertStatus(422);
    }

    public function test_reset_tours(): void
    {
        $user = User::factory()->create(['tours' => ['home' => ['status' => 'done', 'v' => 1]]]);
        Sanctum::actingAs($user);

        $this->deleteJson('/api/user/tours')->assertOk()->assertExactJson(['tours' => []]);
        $this->assertNull($user->fresh()->tours);
    }

    public function test_tours_require_auth(): void
    {
        $this->putJson('/api/user/tours/home', ['status' => 'done', 'version' => 1])->assertUnauthorized();
        $this->deleteJson('/api/user/tours')->assertUnauthorized();
    }

    public function test_dashboard_layout_round_trips_through_cast(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/dashboard/layout')->assertOk()->assertJsonPath('layout', null);

        $layout = [['id' => 'w1', 'type' => 'spend', 'size' => 'wide', 'color' => null, 'hidden' => false, 'settings' => []]];
        $this->putJson('/api/dashboard/layout', ['layout' => $layout])->assertOk();
        $this->getJson('/api/dashboard/layout')->assertOk()->assertJsonPath('layout.0.type', 'spend');

        $this->putJson('/api/dashboard/layout', ['layout' => null])->assertOk();
        $this->getJson('/api/dashboard/layout')->assertJsonPath('layout', null);
    }
}
