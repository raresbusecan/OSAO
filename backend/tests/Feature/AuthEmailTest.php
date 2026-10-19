<?php

namespace Tests\Feature;

use App\Models\User;
use App\Notifications\ConfirmEmailChangeNotification;
use App\Notifications\ResetPasswordNotification;
use App\Notifications\VerifyEmailNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/** Auth emails: registration verification, /open/{screen} landing page,
 * and the email links of reset-password / email-change. */
class AuthEmailTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'app.url' => 'https://api.example.test',
            'app.deep_link_base' => 'exp://front.example.test/--',
        ]);
    }

    private function register(string $email = 'new@example.com'): array
    {
        Notification::fake();

        $res = $this->postJson('/api/register', [
            'name' => 'Nou',
            'email' => $email,
            'password' => 'secret123',
            'password_confirmation' => 'secret123',
        ])->assertCreated();

        $user = User::where('email', $email)->first();
        $token = null;
        Notification::assertSentTo($user, VerifyEmailNotification::class, function ($n) use (&$token) {
            $token = $n->token;
            return true;
        });

        return [$user, $token, $res];
    }

    public function test_register_sends_verification_and_user_is_unverified(): void
    {
        [$user, $token, $res] = $this->register();

        $this->assertNull($res->json('user.email_verified_at'));
        $this->assertTrue(array_key_exists('email_verified_at', $res->json('user')));
        $this->assertSame(64, strlen($token));
        // Stored hashed, never in plain text.
        $this->assertSame(hash('sha256', $token), DB::table('email_verification_tokens')->where('user_id', $user->id)->value('token'));

        $mail = (new VerifyEmailNotification($token, $user->email))->toMail($user);
        $this->assertSame(
            'https://api.example.test/open/verify-email?token=' . $token . '&email=new%40example.com',
            $mail->actionUrl,
        );
    }

    public function test_verify_valid_then_reused(): void
    {
        [$user, $token] = $this->register();

        $this->postJson('/api/email/verify', ['email' => $user->email, 'token' => $token, 'password' => 'owner-secret123', 'password_confirmation' => 'owner-secret123'])
            ->assertOk()
            ->assertJsonPath('message', 'Adresa de email a fost confirmată.');
        $this->assertNotNull($user->fresh()->email_verified_at);
        $this->assertTrue(\Illuminate\Support\Facades\Hash::check('owner-secret123', $user->fresh()->password));
        $this->assertSame(0, $user->tokens()->count());

        $this->postJson('/api/email/verify', ['email' => $user->email, 'token' => $token])
            ->assertStatus(422)
            ->assertJsonPath('errors.token.0', 'Acest link nu este valid sau a fost deja folosit.');
    }

    public function test_verify_wrong_token_and_wrong_email(): void
    {
        [$user, $token] = $this->register();

        $this->postJson('/api/email/verify', ['email' => $user->email, 'token' => 'wrong'])
            ->assertStatus(422)->assertJsonValidationErrors('token');
        $this->postJson('/api/email/verify', ['email' => 'other@example.com', 'token' => $token])
            ->assertStatus(422)->assertJsonValidationErrors('token');
        $this->assertNull($user->fresh()->email_verified_at);
    }

    public function test_confirmation_requires_owner_password_without_consuming_the_link_on_error(): void
    {
        [$user, $token] = $this->register();
        $this->postJson('/api/email/verify', ['email' => $user->email, 'token' => $token])
            ->assertStatus(422)->assertJsonValidationErrors('password');
        $this->assertNull($user->fresh()->email_verified_at);
        $this->assertDatabaseHas('email_verification_tokens', ['user_id' => $user->id]);
    }

    public function test_confirmation_replaces_unproven_password_and_revokes_old_bearer_token(): void
    {
        [$user, $token, $registration] = $this->register();
        $oldToken = $registration->json('token');
        $this->postJson('/api/email/verify', ['email' => $user->email, 'token' => $token, 'password' => 'owner-secret123', 'password_confirmation' => 'owner-secret123'])->assertOk();
        $this->app['auth']->forgetGuards();
        $this->withToken($oldToken)->getJson('/api/user')->assertUnauthorized();
        $this->withHeader('Authorization', '')->postJson('/api/login', ['email' => $user->email, 'password' => 'secret123'])->assertStatus(422);
        $this->postJson('/api/login', ['email' => $user->email, 'password' => 'owner-secret123'])->assertOk();
    }

    public function test_verify_expired(): void
    {
        [$user, $token] = $this->register();
        DB::table('email_verification_tokens')->where('user_id', $user->id)
            ->update(['created_at' => now()->subHours(25)]);

        $this->postJson('/api/email/verify', ['email' => $user->email, 'token' => $token])
            ->assertStatus(422)
            ->assertJsonPath('errors.token.0', 'Acest link a expirat. Cere unul nou din aplicație.');
        $this->assertNull($user->fresh()->email_verified_at);
    }

    public function test_resend_replaces_token_and_is_throttled(): void
    {
        [$user, $first] = $this->register();
        $api = $user->createToken('t')->plainTextToken;

        $this->withToken($api)->postJson('/api/email/verification-notification')
            ->assertOk()->assertJsonPath('already_verified', false);

        $second = null;
        Notification::assertSentToTimes($user, VerifyEmailNotification::class, 2);
        Notification::assertSentTo($user, VerifyEmailNotification::class, function ($n) use (&$second) {
            $second = $n->token;
            return true;
        });
        // assertSentTo's callback runs for every match; $second ends on the last one.
        $this->assertNotSame($first, $second);
        $this->postJson('/api/email/verify', ['email' => $user->email, 'token' => $first])->assertStatus(422);

        $this->withToken($api)->postJson('/api/email/verification-notification')
            ->assertStatus(429)
            ->assertJsonStructure(['message', 'retry_after']);
    }

    public function test_resend_when_already_verified(): void
    {
        $user = User::factory()->create(['email_verified_at' => now()]);

        $this->actingAs($user)->postJson('/api/email/verification-notification')
            ->assertOk()->assertJsonPath('already_verified', true);
    }

    public function test_user_endpoint_exposes_email_verified_at(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->getJson('/api/user')
            ->assertOk()->assertJsonPath('user.email_verified_at', null);
    }

    public function test_open_page_redirects_to_allow_listed_deep_link(): void
    {
        $res = $this->get('/open/reset-password?token=abc123&email=a%2Bb%40example.com&next=https://evil.test');

        $res->assertOk();
        $res->assertHeader('Cache-Control', 'no-store, private');
        $res->assertSee('href="exp://front.example.test/--/reset-password?token=abc123&amp;email=a%2Bb%40example.com"', false);
        $res->assertSee('Deschide în orgOS');
        $res->assertDontSee('evil.test');
    }

    public function test_open_page_rejects_unknown_screen(): void
    {
        $this->get('/open/settings?token=x')->assertNotFound();
        $this->get('/open/..%2F..%2Fevil')->assertNotFound();
    }

    public function test_open_page_with_own_build_scheme(): void
    {
        config(['app.deep_link_base' => 'orgos://']);

        $this->get('/open/confirm-email?token=t&email=e%40x.ro')
            ->assertSee('href="orgos://confirm-email?token=t&amp;email=e%40x.ro"', false);
    }

    public function test_reset_and_email_change_links_use_open_page(): void
    {
        $user = User::factory()->create(['email' => 'me@example.com']);

        $reset = (new ResetPasswordNotification('tok', 'me@example.com'))->toMail($user);
        $this->assertSame('https://api.example.test/open/reset-password?token=tok&email=me%40example.com', $reset->actionUrl);

        $change = (new ConfirmEmailChangeNotification('tok', 'new@example.com'))->toMail($user);
        $this->assertSame('https://api.example.test/open/confirm-email?token=tok&email=new%40example.com', $change->actionUrl);
    }

    public function test_reset_password_invalid_token_is_romanian(): void
    {
        $user = User::factory()->create();

        $this->postJson('/api/reset-password', [
            'email' => $user->email,
            'token' => 'nope',
            'password' => 'newpass123',
            'password_confirmation' => 'newpass123',
        ])->assertStatus(422)
            ->assertJsonPath('errors.email.0', 'Linkul de resetare nu este valid sau a expirat. Cere unul nou.');
    }

    public function test_confirming_email_change_marks_verified(): void
    {
        $user = User::factory()->create(['password' => 'secret123']);
        Notification::fake();

        $this->actingAs($user)->putJson('/api/profile/email', [
            'current_password' => 'secret123',
            'email' => 'changed@example.com',
        ])->assertOk();

        $token = null;
        Notification::assertSentOnDemand(ConfirmEmailChangeNotification::class, function ($n) use (&$token) {
            $token = $n->token;
            return true;
        });

        $this->postJson('/api/confirm-email', ['email' => 'changed@example.com', 'token' => $token])->assertOk();
        $fresh = $user->fresh();
        $this->assertSame('changed@example.com', $fresh->email);
        $this->assertNotNull($fresh->email_verified_at);
    }
}
