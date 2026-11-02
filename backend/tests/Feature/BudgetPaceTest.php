<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\Space;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** GET /budget's `pace` ("Ritmul lunii"): recorded spend per local day in
 * the user's zone + this month's Calendar purchases, per label. Its daily
 * sum must equal this_month − recurring − planned (the hero's "Cheltuit"). */
class BudgetPaceTest extends TestCase
{
    use RefreshDatabase;

    private const TZ = 'Europe/Bucharest';

    private User $user;
    private Space $space;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
        $this->user->forceFill(['timezone' => self::TZ])->save();
        $this->space = Space::factory()->create(['user_id' => $this->user->id, 'name' => 'S', 'type' => 'expenses']);
        Sanctum::actingAs($this->user);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /** "Now" given in the user's local zone. */
    private function nowLocal(string $local): void
    {
        Carbon::setTestNow(Carbon::parse($local, self::TZ)->setTimezone('UTC'));
    }

    /** due_at given in UTC. */
    private function item(string $type, array $attrs): Item
    {
        return Item::unguarded(fn () => Item::create(array_merge([
            'user_id' => $this->user->id,
            'space_id' => $this->space->id,
            'type' => $type,
            'title' => $type,
            'status' => 'pending',
        ], $attrs)));
    }

    private function budget(): array
    {
        return $this->getJson('/api/budget')->assertOk()->json();
    }

    private function assertInvariants(array $json): void
    {
        $pace = $json['pace'];
        foreach (array_keys($json['spending']) as $label) {
            $this->assertArrayHasKey($label, $pace['labels'], "pace missing $label");
            $daily = $pace['labels'][$label]['daily'];
            $events = collect($pace['labels'][$label]['events']);

            $this->assertCount($pace['days_in_month'], $daily, "$label daily length");
            $expected = $json['spending'][$label]['this_month'] - $json['recurring'][$label] - $json['planned'][$label];
            $this->assertEqualsWithDelta($expected, array_sum($daily), 0.01, "$label: Σ daily != this_month − recurring − planned");
            for ($d = $pace['today'] + 1; $d <= $pace['days_in_month']; $d++) {
                $this->assertEquals(0, $daily[$d - 1], "$label: day $d is after today but not 0");
            }
            $this->assertEqualsWithDelta($json['planned'][$label], $events->where('planned', true)->sum('amount'), 0.01, "$label planned events");
        }
    }

    public function test_sum_invariant_holds_for_every_label(): void
    {
        $this->nowLocal('2026-11-13 12:00:00');

        $this->item('car_fuel', ['amount' => 200, 'due_at' => '2026-11-03 08:00:00']);
        $this->item('grocery_trip', ['amount' => 150.55, 'due_at' => '2026-11-10 15:00:00']);
        $this->item('home_task', [
            'amount' => 100, 'due_at' => '2026-12-01 00:00:00',
            'metadata' => ['isPurchase' => true, 'spendHistory' => [
                ['date' => '2026-11-02T10:00:00.000Z', 'amount' => 40],
                ['date' => '2026-11-09T10:00:00.000Z', 'amount' => 60],
            ]],
        ]);
        $this->item('home_expense', ['amount' => 35, 'due_at' => '2026-11-11 09:00:00']);
        $this->item('home_recurring', ['amount' => 520, 'recurrence' => 'monthly', 'due_at' => '2026-11-20 00:00:00']);
        $this->item('expense_item', ['amount' => 75, 'due_at' => '2026-11-05 12:00:00']);
        // Typed with a future date this month: already "spent" in this_month,
        // so it is folded onto today, not drawn ahead.
        $this->item('expense_item', ['amount' => 30, 'due_at' => '2026-11-20 12:00:00']);
        $this->item('custom_event', ['amount' => 120, 'title' => 'Cadou', 'due_at' => '2026-11-08 10:00:00']);
        $this->item('custom_event', ['amount' => 180, 'title' => 'ITP', 'due_at' => '2026-11-24 10:00:00']);

        $json = $this->budget();
        $this->assertInvariants($json);
        $labels = $json['pace']['labels'];

        $this->assertSame('2026-11', $json['pace']['month']);
        $this->assertSame(13, $json['pace']['today']);
        $this->assertEquals(200, $labels['Car']['daily'][2]);
        $this->assertEquals(150.55, $labels['Grocery']['daily'][9]);
        $this->assertEquals(40, $labels['Home']['daily'][1]);
        $this->assertEquals(60, $labels['Home']['daily'][8]);
        $this->assertEquals(35, $labels['Home']['daily'][10]);
        $this->assertEquals(75, $labels['Expenses']['daily'][4]);
        $this->assertEquals(120, $labels['Expenses']['daily'][7]);
        $this->assertEquals(30, $labels['Expenses']['daily'][12]); // folded onto today
        $this->assertEquals(520, $json['recurring']['Home']);
        $this->assertEquals(180, $json['planned']['Expenses']);
        $this->assertSame([
            ['day' => 8, 'amount' => 120, 'planned' => false, 'title' => 'Cadou'],
            ['day' => 24, 'amount' => 180, 'planned' => true, 'title' => 'ITP'],
        ], $labels['Expenses']['events']);
        $this->assertSame([], $labels['Car']['events']);
    }

    public function test_buckets_by_the_users_timezone_at_month_edges(): void
    {
        $this->nowLocal('2026-11-30 12:00:00');

        $this->item('expense_item', ['amount' => 11, 'due_at' => '2026-11-30 22:30:00']); // 1 Dec local
        $this->item('expense_item', ['amount' => 22, 'due_at' => '2026-10-31 22:30:00']); // 1 Nov local
        $this->item('expense_item', ['amount' => 33, 'due_at' => '2026-11-30 21:30:00']); // 30 Nov 23:30 local

        $json = $this->budget();
        $this->assertInvariants($json);
        $daily = $json['pace']['labels']['Expenses']['daily'];

        $this->assertEquals(22, $daily[0]);
        $this->assertEquals(33, $daily[29]);
        $this->assertEqualsWithDelta(55, array_sum($daily), 0.001); // the 1 Dec one is not November
    }

    public function test_buckets_correctly_across_the_october_dst_change(): void
    {
        // 25 Oct 2026, 04:00 local: EEST (+3) -> EET (+2).
        $this->nowLocal('2026-10-27 12:00:00');

        $this->item('expense_item', ['amount' => 1, 'due_at' => '2026-10-24 21:30:00']); // +3 -> 25 Oct 00:30
        $this->item('expense_item', ['amount' => 2, 'due_at' => '2026-10-25 21:30:00']); // +2 -> 25 Oct 23:30
        $this->item('expense_item', ['amount' => 4, 'due_at' => '2026-10-25 22:30:00']); // +2 -> 26 Oct 00:30
        $this->item('expense_item', ['amount' => 8, 'due_at' => '2026-09-30 21:30:00']); // +3 -> 1 Oct 00:30

        $json = $this->budget();
        $this->assertInvariants($json);
        $daily = $json['pace']['labels']['Expenses']['daily'];

        $this->assertSame(31, $json['pace']['days_in_month']);
        $this->assertEquals(8, $daily[0]);
        $this->assertEquals(3, $daily[24]);
        $this->assertEquals(4, $daily[25]);
    }

    /** Buget simplu (2026-11): the old "fără vină" flag is ignored -- a
     * flagged record counts like any other, in daily and in this_month. */
    public function test_flagged_guilt_free_records_count(): void
    {
        $this->nowLocal('2026-11-13 12:00:00');

        $this->item('grocery_trip', ['amount' => 90, 'due_at' => '2026-11-04 10:00:00', 'guilt_free' => true]);
        $this->item('custom_event', ['amount' => 60, 'due_at' => '2026-11-06 10:00:00', 'guilt_free' => true]);
        $this->item('custom_event', ['amount' => 70, 'due_at' => '2026-11-26 10:00:00', 'guilt_free' => true]);
        $this->item('home_recurring', ['amount' => 50, 'recurrence' => 'monthly', 'due_at' => '2026-11-20 00:00:00', 'guilt_free' => true]);

        $json = $this->budget();
        $this->assertInvariants($json);
        $this->assertEquals(90, $json['pace']['labels']['Grocery']['daily'][3]);
        $this->assertEquals(90, $json['spending']['Grocery']['this_month']);
        $this->assertEquals(60, $json['pace']['labels']['Expenses']['daily'][5]);
        $this->assertEquals(130, $json['spending']['Expenses']['this_month']);
        $this->assertEquals(70, $json['planned']['Expenses']);
        $this->assertCount(2, $json['pace']['labels']['Expenses']['events']);
        $this->assertEquals(50, $json['recurring']['Home']);
    }

    public function test_recurring_bills_stay_out_of_daily(): void
    {
        $this->nowLocal('2026-11-13 12:00:00');

        $this->item('home_recurring', [
            'amount' => 300, 'recurrence' => 'monthly', 'due_at' => '2026-12-05 00:00:00',
            'metadata' => ['spendHistory' => [['date' => '2026-11-05T09:00:00.000Z', 'amount' => 300]]],
        ]);

        $json = $this->budget();
        $this->assertInvariants($json);
        $this->assertEquals(0, array_sum($json['pace']['labels']['Home']['daily']));
        $this->assertEquals(300, $json['recurring']['Home']);
        $this->assertEquals(300, $json['spending']['Home']['this_month']);
    }

    public function test_a_purchase_today_is_spent_and_tomorrow_is_planned(): void
    {
        $this->nowLocal('2026-11-13 12:00:00');

        $this->item('custom_event', ['amount' => 45, 'title' => 'Azi', 'due_at' => '2026-11-13 21:00:00']);    // 23:00 local today
        $this->item('custom_event', ['amount' => 55, 'title' => 'Mâine', 'due_at' => '2026-11-14 10:00:00']);

        $json = $this->budget();
        $this->assertInvariants($json);
        $exp = $json['pace']['labels']['Expenses'];

        $this->assertEquals(45, $exp['daily'][12]);
        $this->assertEqualsWithDelta(45, array_sum($exp['daily']), 0.001);
        $this->assertSame([
            ['day' => 13, 'amount' => 45, 'planned' => false, 'title' => 'Azi'],
            ['day' => 14, 'amount' => 55, 'planned' => true, 'title' => 'Mâine'],
        ], $exp['events']);
        $this->assertEquals(55, $json['planned']['Expenses']);
    }

    public function test_a_weekly_purchase_has_one_event_per_occurrence(): void
    {
        $this->nowLocal('2026-11-13 12:00:00');

        $this->item('custom_event', ['amount' => 20, 'title' => 'Piață', 'recurrence' => 'weekly', 'due_at' => '2026-11-02 08:00:00']);

        $json = $this->budget();
        $this->assertInvariants($json);
        $events = $json['pace']['labels']['Expenses']['events'];

        $this->assertSame([2, 9, 16, 23, 30], array_column($events, 'day'));
        $this->assertSame([false, false, true, true, true], array_column($events, 'planned'));
        $this->assertEquals(20, $json['pace']['labels']['Expenses']['daily'][1]);
        $this->assertEquals(20, $json['pace']['labels']['Expenses']['daily'][8]);
    }

    public function test_shape_follows_the_month_length(): void
    {
        $this->nowLocal('2026-11-13 12:00:00');
        $nov = $this->budget()['pace'];
        $this->assertSame(30, $nov['days_in_month']);
        $this->assertSame(['Car', 'Home', 'Grocery', 'Expenses'], array_keys($nov['labels']));
        foreach ($nov['labels'] as $label) {
            $this->assertCount(30, $label['daily']);
        }

        $this->nowLocal('2027-02-03 09:00:00');
        $feb = $this->budget()['pace'];
        $this->assertSame('2027-02', $feb['month']);
        $this->assertSame(3, $feb['today']);
        $this->assertSame(28, $feb['days_in_month']);
        foreach ($feb['labels'] as $label) {
            $this->assertCount(28, $label['daily']);
        }
    }
}
