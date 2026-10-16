<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\Space;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** spaces.color = a key of the frontend's SPACE_PALETTE (Space::PALETTE_KEYS)
 * or null (= the kind's default colour). Anything else is a Romanian 422. */
class SpaceColorTest extends TestCase
{
    use RefreshDatabase;

    public function test_store_accepts_a_palette_key_and_null(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/spaces', ['name' => 'Cumpărături', 'type' => 'grocery', 'color' => 'pink'])
            ->assertCreated()
            ->assertJsonPath('space.color', 'pink');

        $this->postJson('/api/spaces', ['name' => 'Cheltuieli', 'type' => 'expenses', 'color' => null])
            ->assertCreated()
            ->assertJsonPath('space.color', null);
    }

    public function test_store_rejects_a_colour_outside_the_palette(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/spaces', ['name' => 'BMW', 'type' => 'car', 'color' => '#111111'])
            ->assertStatus(422)
            ->assertJsonPath('errors.color.0', Space::COLOR_MESSAGE);

        $this->assertSame(0, Space::count());
    }

    public function test_update_sets_resets_and_validates_the_colour(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $space = $user->spaces()->create(['name' => 'Casa', 'type' => 'home']);

        $this->putJson("/api/spaces/{$space->id}", ['color' => 'teal'])
            ->assertOk()
            ->assertJsonPath('space.color', 'teal');

        $this->putJson("/api/spaces/{$space->id}", ['color' => 'red'])
            ->assertStatus(422)
            ->assertJsonPath('errors.color.0', Space::COLOR_MESSAGE);
        $this->assertSame('teal', $space->fresh()->color);

        // A rename alone leaves the colour alone.
        $this->putJson("/api/spaces/{$space->id}", ['name' => 'Casa nouă'])->assertOk();
        $this->assertSame('teal', $space->fresh()->color);

        // null = back to the kind's default.
        $this->putJson("/api/spaces/{$space->id}", ['color' => null])
            ->assertOk()
            ->assertJsonPath('space.color', null);
    }

    public function test_dashboard_items_carry_their_space_colour(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $space = $user->spaces()->create(['name' => 'Casa', 'type' => 'home', 'color' => 'sky']);
        Item::create([
            'user_id' => $user->id,
            'space_id' => $space->id,
            'type' => 'home_task',
            'title' => 'Schimbă filtrul',
            'status' => 'pending',
            'due_at' => now()->subDay(),
        ]);

        $this->getJson('/api/dashboard')
            ->assertOk()
            ->assertJsonPath('overdue.0.space.color', 'sky');
    }
}
