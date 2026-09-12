<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
use App\Models\User;

class QuickAddControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_quick_add_parse_with_amount_and_currency()
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/quick-add', [
            'text' => 'Pay car insurance €450',
        ]);

        $response->assertStatus(200);

        $preview = $response->json('preview');

        $this->assertEquals('expense', $preview['type']);
        $this->assertEquals(450.0, $preview['amount']);
        $this->assertEquals('EUR', $preview['currency']);
        $this->assertEquals('Pay car insurance', $preview['title']);
    }

    public function test_quick_add_parse_with_due_date()
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/quick-add', [
            'text' => 'Team meeting tomorrow',
        ]);

        $response->assertStatus(200);

        $preview = $response->json('preview');

        $this->assertEquals('event', $preview['type']);
        $this->assertNotNull($preview['due_at']);
        $this->assertStringStartsWith(
            now()->addDay()->toDateString(),
            $preview['due_at'],
        );
    }

    public function test_quick_add_parse_with_priority()
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/quick-add', [
            'text' => 'Finish report urgent',
        ]);

        $response->assertStatus(200);

        $preview = $response->json('preview');

        $this->assertEquals('high', $preview['priority']);
        $this->assertEquals('Finish report', $preview['title']);
    }

    public function test_quick_add_parse_with_reminder_keyword()
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/quick-add', [
            'text' => 'Reminder to call the dentist',
        ]);

        $response->assertStatus(200);

        $preview = $response->json('preview');

        $this->assertEquals('reminder', $preview['type']);
    }

    public function test_quick_add_defaults_to_task_with_no_special_signals()
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/quick-add', [
            'text' => 'Clean the garage',
        ]);

        $response->assertStatus(200);

        $preview = $response->json('preview');

        $this->assertEquals('task', $preview['type']);
        $this->assertEquals('Clean the garage', $preview['title']);
        $this->assertNull($preview['amount']);
        $this->assertNull($preview['due_at']);
    }

    public function test_quick_add_rejects_missing_text()
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/quick-add', [
            'text' => '',
        ]);

        $response->assertStatus(422);
    }

    public function test_quick_add_requires_authentication()
    {
        $response = $this->postJson('/api/quick-add', [
            'text' => 'Buy milk',
        ]);

        $response->assertStatus(401);
    }
}
