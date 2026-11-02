<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\Space;
use App\Models\User;
use Database\Seeders\DemoSeeder;
use Database\Seeders\RealisticDemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RealisticDemoSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_fresh_preview_preserves_existing_users_and_populates_real_app_views(): void
    {
        Carbon::setTestNow('2026-10-20 12:00:00');
        try {
            // Existing personal and original demo accounts must not be reset.
            $existing = User::factory()->create(['email' => DemoSeeder::DEMO_EMAIL]);
            $space = Space::factory()->create(['user_id' => $existing->id, 'type' => 'home']);
            $record = Item::factory()->create(['user_id' => $existing->id, 'space_id' => $space->id, 'type' => 'home_task', 'title' => 'Keep unchanged']);
            $before = [$existing->refresh()->getAttributes(), $space->refresh()->getAttributes(), $record->refresh()->getAttributes()];
            [$user, $partner] = (new DemoSeeder())->createFreshAccounts(RealisticDemoSeeder::EMAIL, RealisticDemoSeeder::PARTNER_EMAIL, 'Unique-test-password-2026');

            $this->assertSame($before, [$existing->fresh()->getAttributes(), $space->fresh()->getAttributes(), $record->fresh()->getAttributes()]);
            $this->assertTrue(Hash::check('Unique-test-password-2026', $user->password));
            $this->assertSame(5, $user->spaces()->count());
            $this->assertGreaterThanOrEqual(250, $user->items()->count());
            $this->assertLessThan(1000, $user->items()->count());
            $this->assertEqualsCanonicalizing(Item::VALID_TYPES, $user->items()->distinct()->pluck('type')->all());
            $this->assertEquals(1500, $user->monthly_set_aside);
            $this->assertSame(12, DB::table('budget_archives')->where('user_id', $user->id)->distinct()->count('month'));
            $this->assertGreaterThan(0, $user->items()->where('status', 'completed')->count());
            $this->assertGreaterThan(0, $user->items()->where('due_at', '<', now())->count());
            $this->assertGreaterThan(0, $user->items()->where('due_at', '>', now())->count());

            foreach ([$user, $partner] as $account) {
                Sanctum::actingAs($account);
                foreach (['/api/user', '/api/spaces', '/api/items', '/api/dashboard', '/api/dashboard/layout', '/api/calendar?month=2026-10', '/api/budget', '/api/budget/archive'] as $path) {
                    $this->getJson($path)->assertOk();
                }
                foreach ($account->spaces()->get() as $ownSpace) {
                    $this->getJson('/api/items?space_id='.$ownSpace->id)->assertOk();
                    if ($ownSpace->type === 'grocery') {
                        $this->getJson('/api/grocery/mine?space_id='.$ownSpace->id)->assertOk();
                    }
                }
            }
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_an_existing_preview_email_aborts_without_changing_any_account_or_record(): void
    {
        $existing = User::factory()->create(['email' => RealisticDemoSeeder::PARTNER_EMAIL]);
        $before = $existing->refresh()->getAttributes();
        try {
            (new DemoSeeder())->createFreshAccounts(RealisticDemoSeeder::EMAIL, RealisticDemoSeeder::PARTNER_EMAIL, 'Unique-test-password-2026');
            $this->fail('Must refuse an existing account.');
        } catch (\RuntimeException $error) {
            $this->assertStringContainsString('există deja', $error->getMessage());
        }
        $this->assertSame($before, $existing->fresh()->getAttributes());
        $this->assertSame(1, User::count());
        $this->assertSame(0, Item::count());
        $this->assertSame(0, Space::count());
    }

    public function test_opt_in_seeder_uses_supplied_password_and_refuses_a_repeat_run(): void
    {
        $oldPassword = getenv('ORGOS_DEMO_PASSWORD');
        putenv('ORGOS_DEMO_PASSWORD=Another-unique-test-password');
        try {
            $this->seed(RealisticDemoSeeder::class);
            $user = User::where('email', RealisticDemoSeeder::EMAIL)->firstOrFail();
            $this->assertTrue(Hash::check('Another-unique-test-password', $user->password));
            $before = [User::count(), Space::count(), Item::count(), $user->getAttributes()];
            try {
                $this->seed(RealisticDemoSeeder::class);
                $this->fail('A repeat seed must not reset the preview.');
            } catch (\RuntimeException $error) {
                $this->assertStringContainsString('există deja', $error->getMessage());
            }
            $this->assertSame($before, [User::count(), Space::count(), Item::count(), $user->fresh()->getAttributes()]);
        } finally {
            putenv($oldPassword === false ? 'ORGOS_DEMO_PASSWORD' : 'ORGOS_DEMO_PASSWORD='.$oldPassword);
        }
    }
}
