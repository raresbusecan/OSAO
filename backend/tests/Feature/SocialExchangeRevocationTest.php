<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\SocialAuth\SocialAuthService;
use App\Support\AuthSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Tests\TestCase;

class SocialExchangeRevocationTest extends TestCase
{
    use RefreshDatabase;

    private function unprovenIdentity(): array
    {
        return app(SocialAuthService::class)->resolveUser('facebook', 'unproven-provider-id', 'owner@example.test', false);
    }

    private function verify(User $user): void
    {
        DB::table('email_verification_tokens')->insert([
            'user_id' => $user->id, 'token' => hash('sha256', 'mailbox-proof'), 'created_at' => now(),
        ]);
        $this->postJson('/api/email/verify', [
            'email' => $user->email, 'token' => 'mailbox-proof',
            'password' => 'owner-password', 'password_confirmation' => 'owner-password',
        ])->assertOk();
    }

    private function assertRejected(string $code, User $user): void
    {
        $this->postJson('/api/auth/exchange', ['code' => $code])->assertUnprocessable()->assertJsonPath('error', 'invalid_code');
        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_email_proof_revokes_every_previously_issued_exchange_code(): void
    {
        [$user] = $this->unprovenIdentity();
        $social = app(SocialAuthService::class);
        $first = $social->createExchangeCode($user, true);
        $second = $social->createExchangeCode($user, false);
        $this->verify($user);
        $this->assertRejected($first, $user);
        $this->assertRejected($second, $user);
    }

    public function test_callback_resolved_before_proof_cannot_issue_a_valid_code_after_proof(): void
    {
        [$staleUser] = $this->unprovenIdentity();
        $this->verify($staleUser);
        $this->assertRejected(app(SocialAuthService::class)->createExchangeCode($staleUser, true), $staleUser);
    }

    public function test_password_recovery_invalidates_pending_exchange_code(): void
    {
        [$user] = $this->unprovenIdentity();
        $code = app(SocialAuthService::class)->createExchangeCode($user, true);
        $token = Password::createToken($user);
        $this->postJson('/api/reset-password', [
            'email' => $user->email, 'token' => $token,
            'password' => 'owner-password', 'password_confirmation' => 'owner-password',
        ])->assertOk();
        $this->assertRejected($code, $user);
    }

    public function test_provider_verified_owner_eviction_invalidates_pending_code(): void
    {
        [$user] = $this->unprovenIdentity();
        $code = app(SocialAuthService::class)->createExchangeCode($user, true);
        app(SocialAuthService::class)->resolveUser('google', 'verified-owner', $user->email, true);
        $this->assertRejected($code, $user);
    }

    public function test_confirming_email_change_invalidates_pending_code(): void
    {
        [$user] = $this->unprovenIdentity();
        $code = app(SocialAuthService::class)->createExchangeCode($user, true);
        DB::table('email_change_requests')->insert([
            'user_id' => $user->id, 'new_email' => 'new-owner@example.test',
            'token' => Hash::make('change-proof'), 'created_at' => now(),
        ]);
        $this->postJson('/api/confirm-email', ['email' => 'new-owner@example.test', 'token' => 'change-proof'])->assertOk();
        $this->assertRejected($code, $user);
    }

    public function test_unchanged_credentials_allow_exchange_once_despite_display_name_edit(): void
    {
        [$user] = $this->unprovenIdentity();
        $code = app(SocialAuthService::class)->createExchangeCode($user, true);
        $user->update(['name' => 'New display name']);
        $this->postJson('/api/auth/exchange', ['code' => $code])->assertOk()->assertJsonPath('created', true)->assertJsonPath('user.name', 'New display name');
        $this->postJson('/api/auth/exchange', ['code' => $code])->assertUnprocessable();
        $this->assertSame(1, $user->tokens()->count());
    }

    public function test_codes_created_without_credential_binding_are_rejected(): void
    {
        [$user] = $this->unprovenIdentity();
        $code = str_repeat('x', 64);
        Cache::put('social:code:'.hash('sha256', $code), ['user_id' => $user->id, 'created' => true], 120);
        $this->assertRejected($code, $user);
    }

    public function test_stale_identity_cannot_issue_a_token_but_new_credentials_can(): void
    {
        [$snapshot] = $this->unprovenIdentity();
        $this->verify($snapshot);
        $this->assertNull(AuthSession::issueToken($snapshot));
        $this->assertSame(0, $snapshot->tokens()->count());
        [$current, $token] = AuthSession::issueToken($snapshot->fresh());
        $this->assertEquals($snapshot->id, $current->id);
        $this->withToken($token)->getJson('/api/user')->assertOk();
    }

    public function test_login_rechecks_credentials_changed_after_its_initial_user_read(): void
    {
        $user = User::factory()->create(['email' => 'owner@example.test', 'password' => 'old-password', 'email_verified_at' => null]);
        $proofCompleted = false;
        Event::listen('eloquent.retrieved: '.User::class, function (User $snapshot) use (&$proofCompleted, $user) {
            if (! $proofCompleted && $snapshot->id === $user->id) {
                $proofCompleted = true;
                $this->verify($snapshot);
            }
        });
        $this->postJson('/api/login', ['email' => $user->email, 'password' => 'old-password'])->assertUnprocessable();
        $this->assertTrue($proofCompleted);
        $this->assertSame(0, $user->tokens()->count());
        $this->postJson('/api/login', ['email' => $user->email, 'password' => 'owner-password'])->assertOk();
    }
}
