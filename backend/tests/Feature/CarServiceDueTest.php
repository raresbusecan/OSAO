<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\Space;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** GET /dashboard -- a car service due by km shows in "De făcut" from the
 * Mașină space's own window (2,000 km left), not only once overdue. */
class CarServiceDueTest extends TestCase
{
    use RefreshDatabase;

    private function service(User $user, Space $space, int $at, ?int $nextKm, ?string $nextDate = null): Item
    {
        return Item::create([
            'user_id' => $user->id, 'space_id' => $space->id, 'type' => 'car_maintenance',
            'title' => 'Oil Change', 'amount' => 300, 'status' => 'pending', 'due_at' => now()->subMonths(6),
            'metadata' => ['odometer' => $at, 'nextServiceOdometer' => $nextKm, 'nextServiceDate' => $nextDate],
        ]);
    }

    private function odometer(User $user, Space $space, int $km): void
    {
        Item::create([
            'user_id' => $user->id, 'space_id' => $space->id, 'type' => 'car_fuel',
            'title' => 'Fuel', 'amount' => 100, 'status' => 'completed', 'due_at' => now(),
            'metadata' => ['odometer' => $km],
        ]);
    }

    /** @return array<int, array<string, mixed>> every car_maintenance row in the 3 buckets */
    private function services(): array
    {
        $d = $this->getJson('/api/dashboard')->assertOk()->json();

        return collect([...$d['overdue'], ...$d['today'], ...$d['upcoming']])->where('type', 'car_maintenance')->values()->all();
    }

    public function test_service_within_the_space_km_window_is_upcoming_with_km_left(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $space = Space::factory()->create(['user_id' => $user->id, 'type' => 'car']);
        $this->service($user, $space, 400, 10400);
        $this->odometer($user, $space, 10200);

        $rows = $this->services();
        $this->assertCount(1, $rows);
        $this->assertSame(200, $rows[0]['km_left']);
        // due_at is the next due day; the visit's own date travels alongside
        // (Acasă's "log again" derives the day interval from it).
        $this->assertSame(Item::where('type', 'car_maintenance')->first()->due_at->toJSON(), $rows[0]['service_date']);
        $this->assertArrayNotHasKey('overdue_km', $rows[0]);
        $upcoming = collect($this->getJson('/api/dashboard')->json('upcoming'))->pluck('type');
        $this->assertContains('car_maintenance', $upcoming, 'groups with the coming week, not as restant');
    }

    public function test_window_edges_and_overdue_stay_as_before(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $space = Space::factory()->create(['user_id' => $user->id, 'type' => 'car']);
        $this->service($user, $space, 400, 12200); // 2,000 left at 10,200: just inside
        $this->odometer($user, $space, 10200);
        $this->assertSame(2000, $this->services()[0]['km_left']);

        Item::where('type', 'car_maintenance')->update(['metadata->nextServiceOdometer' => 12201]);
        $this->assertCount(0, $this->services(), '2,001 km left is outside the window');

        Item::where('type', 'car_maintenance')->update(['metadata->nextServiceOdometer' => 9700]);
        $rows = $this->services();
        $this->assertSame(500, $rows[0]['overdue_km']);
        $this->assertArrayNotHasKey('km_left', $rows[0]);
    }

    public function test_no_km_logged_counts_as_zero_like_the_masina_screen(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $space = Space::factory()->create(['user_id' => $user->id, 'type' => 'car']);
        Item::create([
            'user_id' => $user->id, 'space_id' => $space->id, 'type' => 'car_maintenance',
            'title' => 'Oil Change', 'amount' => 300, 'status' => 'pending', 'due_at' => now()->subMonth(),
            'metadata' => ['odometer' => null, 'nextServiceOdometer' => 1500],
        ]);

        $this->assertSame(1500, $this->services()[0]['km_left']);
    }

    public function test_a_date_within_the_week_still_wins_over_the_km_window(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $space = Space::factory()->create(['user_id' => $user->id, 'type' => 'car']);
        $this->service($user, $space, 400, 11000, now()->addDays(2)->format('d.m.Y'));
        $this->odometer($user, $space, 10200);

        $rows = $this->services();
        $this->assertCount(1, $rows);
        $this->assertArrayNotHasKey('km_left', $rows[0]);
    }
}
