<?php

namespace Tests\Feature;

use App\Models\SocialAccount;
use App\Models\User;
use App\Notifications\ConfirmEmailChangeNotification;
use App\Notifications\ResetPasswordNotification;
use App\Services\SocialAuth\AppleIdentityVerifier;
use App\Services\SocialAuth\SocialAuthService;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\FacebookProvider;
use Laravel\Socialite\Two\GoogleProvider;
use Laravel\Socialite\Two\User as SocialiteUser;
use Mockery;
use phpseclib4\Crypt\RSA;
use Tests\TestCase;

/** Social login: Apple identity tokens (mock JWKS, server nonce), linking
 * rules incl. the pre-takeover guard and unverified-origin links, the
 * Google/Facebook web flow (state, app_redirect allow-list, one-time
 * exchange codes), GET /auth/providers, has_password + set-password. */
class SocialLoginTest extends TestCase
{
    use RefreshDatabase;

    private static ?string $privateKey = null;
    private static array $jwk = [];

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'app.url' => 'https://api.example.test',
            'app.deep_link_base' => 'exp://front.example.test/--',
            'services.apple.client_ids' => ['host.exp.Exponent'],
            'services.google.client_id' => 'gid',
            'services.google.client_secret' => 'gsecret',
            'services.facebook.client_id' => 'fid',
            'services.facebook.client_secret' => 'fsecret',
        ]);

        if (self::$privateKey === null) {
            // phpseclib (a Socialite dependency) rather than openssl_pkey_new,
            // which needs an openssl.cnf that Windows PHP builds lack.
            $key = RSA::createKey(2048);
            self::$privateKey = $key->toString('PKCS8');
            $pub = json_decode($key->getPublicKey()->toString('JWK'), true)['keys'][0];
            self::$jwk = $pub + ['kid' => 'test-kid', 'use' => 'sig', 'alg' => 'RS256'];
        }

        Http::fake([AppleIdentityVerifier::JWKS_URL => Http::response(['keys' => [self::$jwk]])]);
    }

    private function nonce(): string
    {
        $nonce = $this->postJson('/api/auth/apple/nonce')->assertOk()->json('nonce');
        $this->assertGreaterThanOrEqual(32, strlen($nonce));

        return $nonce;
    }

    /** $nonceClaim: 'raw' | 'sha' | any literal string | null (absent). */
    private function appleToken(array $overrides = [], string $kid = 'test-kid', ?string $key = null): string
    {
        $claims = array_merge([
            'iss' => 'https://appleid.apple.com',
            'aud' => 'host.exp.Exponent',
            'exp' => time() + 600,
            'iat' => time(),
            'sub' => '001234.abcdef.0001',
            'email' => 'ana@example.com',
            'email_verified' => 'true',
        ], $overrides);

        return JWT::encode(array_filter($claims, fn ($v) => $v !== null), $key ?? self::$privateKey, 'RS256', $kid);
    }

    /** Full Apple sign-in: fetch nonce, mint a token carrying it, POST. */
    private function apple(array $claims = [], array $body = [], string $nonceForm = 'sha')
    {
        $nonce = $this->nonce();
        $claims += ['nonce' => $nonceForm === 'raw' ? $nonce : hash('sha256', $nonce)];

        return $this->postJson('/api/auth/apple', $body + [
            'identity_token' => $this->appleToken($claims),
            'nonce' => $nonce,
        ]);
    }

    // ---- Apple ---------------------------------------------------------

    public function test_apple_rejects_identity_snapshot_changed_before_session_issuance(): void
    {
        $snapshot = User::factory()->create(['email' => 'ana@example.com', 'email_verified_at' => null]);
        $social = Mockery::mock(SocialAuthService::class)->makePartial();
        $social->shouldReceive('resolveUser')->once()->andReturnUsing(function () use ($snapshot) {
            DB::table('email_verification_tokens')->insert([
                'user_id' => $snapshot->id, 'token' => hash('sha256', 'proof-during-sign-in'), 'created_at' => now(),
            ]);
            $this->postJson('/api/email/verify', [
                'email' => $snapshot->email, 'token' => 'proof-during-sign-in',
                'password' => 'owner-password', 'password_confirmation' => 'owner-password',
            ])->assertOk();

            return [$snapshot, false];
        });
        $this->app->instance(SocialAuthService::class, $social);
        $this->apple()->assertUnprocessable()->assertJsonPath('error', 'invalid_code');
        $this->assertSame(0, $snapshot->tokens()->count());
    }

    public function test_apple_creates_verified_user_and_links(): void
    {
        $res = $this->apple([], ['full_name' => ['given' => 'Ana', 'family' => 'Pop']])->assertOk();

        $res->assertJsonPath('created', true)
            ->assertJsonPath('user.name', 'Ana Pop')
            ->assertJsonPath('user.email', 'ana@example.com')
            ->assertJsonPath('user.providers', ['apple'])
            ->assertJsonPath('user.has_password', false);
        $this->assertNotNull($res->json('user.email_verified_at'));
        $this->assertDatabaseHas('social_accounts', ['provider' => 'apple', 'provider_user_id' => '001234.abcdef.0001', 'email_verified' => true]);

        $this->withToken($res->json('token'))->getJson('/api/user')
            ->assertOk()->assertJsonPath('user.providers', ['apple'])->assertJsonPath('user.has_password', false);
    }

    public function test_apple_accepts_raw_nonce_claim_too(): void
    {
        $this->apple([], [], 'raw')->assertOk();
    }

    public function test_apple_nonce_is_required_single_use_and_must_match(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);

        // Missing nonce field.
        $this->postJson('/api/auth/apple', ['identity_token' => $this->appleToken()])
            ->assertStatus(422)->assertJsonValidationErrors('nonce');

        // A nonce the server never issued.
        $fake = str_repeat('x', 48);
        $this->postJson('/api/auth/apple', ['identity_token' => $this->appleToken(['nonce' => hash('sha256', $fake)]), 'nonce' => $fake])
            ->assertStatus(401)->assertJsonPath('error', 'invalid_nonce');

        // Token minted for a different nonce.
        $n = $this->nonce();
        $this->postJson('/api/auth/apple', ['identity_token' => $this->appleToken(['nonce' => hash('sha256', 'other')]), 'nonce' => $n])
            ->assertStatus(401)->assertJsonPath('error', 'invalid_nonce');
        // ...and that failed attempt consumed $n.
        $this->postJson('/api/auth/apple', ['identity_token' => $this->appleToken(['nonce' => hash('sha256', $n)]), 'nonce' => $n])
            ->assertStatus(401)->assertJsonPath('error', 'invalid_nonce');

        // Token without a nonce claim.
        $n = $this->nonce();
        $this->postJson('/api/auth/apple', ['identity_token' => $this->appleToken(), 'nonce' => $n])
            ->assertStatus(401)->assertJsonPath('error', 'invalid_nonce');

        // Replay: a successful token+nonce can't be used again.
        $n = $this->nonce();
        $body = ['identity_token' => $this->appleToken(['nonce' => hash('sha256', $n)]), 'nonce' => $n];
        $this->postJson('/api/auth/apple', $body)->assertOk();
        $this->postJson('/api/auth/apple', $body)->assertStatus(401)->assertJsonPath('error', 'invalid_nonce');

        // Nonce expires after 10 minutes.
        $n = $this->nonce();
        $this->travel(11)->minutes();
        $this->postJson('/api/auth/apple', ['identity_token' => $this->appleToken(['nonce' => hash('sha256', $n)]), 'nonce' => $n])
            ->assertStatus(401)->assertJsonPath('error', 'invalid_nonce');
    }

    public function test_nonce_endpoint_has_its_own_limiter(): void
    {
        // 5 nonces do not use up the 5/min login bucket.
        for ($i = 0; $i < 6; $i++) {
            $this->postJson('/api/auth/apple/nonce')->assertOk();
        }
        $this->postJson('/api/login', ['email' => 'x@example.com', 'password' => 'whatever'])->assertStatus(422);
    }

    public function test_apple_returning_user_without_email_matches_by_sub(): void
    {
        $this->apple()->assertOk();

        $this->apple(['email' => null, 'email_verified' => null])->assertOk()
            ->assertJsonPath('created', false)->assertJsonPath('user.email', 'ana@example.com');
        $this->assertSame(1, User::count());
    }

    public function test_apple_unknown_sub_without_email_is_rejected(): void
    {
        $this->apple(['email' => null, 'email_verified' => null])
            ->assertStatus(422)->assertJsonPath('error', 'email_missing');
        $this->assertSame(0, User::count());
    }

    public function test_apple_rejects_bad_tokens(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $otherPem = RSA::createKey(2048)->toString('PKCS8');

        $bad = [
            'garbage' => fn ($n) => 'not.a.jwt',
            'wrong aud' => fn ($n) => $this->appleToken(['aud' => 'com.evil.app', 'nonce' => hash('sha256', $n)]),
            'wrong iss' => fn ($n) => $this->appleToken(['iss' => 'https://evil.example', 'nonce' => hash('sha256', $n)]),
            'expired' => fn ($n) => $this->appleToken(['exp' => time() - 30, 'iat' => time() - 7200, 'nonce' => hash('sha256', $n)]),
            'wrong signature' => fn ($n) => $this->appleToken(['nonce' => hash('sha256', $n)], 'test-kid', $otherPem),
            'unknown kid' => fn ($n) => $this->appleToken(['nonce' => hash('sha256', $n)], 'nope'),
        ];

        foreach ($bad as $label => $make) {
            $n = $this->nonce();
            $this->postJson('/api/auth/apple', ['identity_token' => $make($n), 'nonce' => $n])
                ->assertStatus(401)
                ->assertJsonPath('error', 'invalid_token');
        }

        $this->postJson('/api/auth/apple', [])->assertStatus(422)->assertJsonValidationErrors(['identity_token', 'nonce']);
        $this->assertSame(0, User::count());
    }

    public function test_apple_jwks_is_cached_and_unknown_kid_is_negative_cached(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->apple()->assertOk();
        $this->apple()->assertOk();
        Http::assertSentCount(1);

        // Unknown kid: one refetch, then remembered -- no fetch per request.
        for ($i = 0; $i < 3; $i++) {
            $n = $this->nonce();
            $this->postJson('/api/auth/apple', ['identity_token' => $this->appleToken(['nonce' => hash('sha256', $n)], 'rotated-kid'), 'nonce' => $n])
                ->assertStatus(401);
        }
        Http::assertSentCount(2);
    }

    public function test_jwks_unreachable_gives_503(): void
    {
        Cache::flush();
        Http::swap(new \Illuminate\Http\Client\Factory());
        Http::fake([AppleIdentityVerifier::JWKS_URL => Http::response('down', 500)]);
        $this->apple()->assertStatus(503)->assertJsonPath('error', 'provider_unavailable');
    }

    // ---- Linking rules -------------------------------------------------

    public function test_verified_email_links_existing_account(): void
    {
        $user = User::factory()->create(['email' => 'Ana@Example.com', 'email_verified_at' => now()]);
        $hash = $user->password;

        $this->apple()->assertOk()->assertJsonPath('created', false)->assertJsonPath('user.id', $user->id)
            ->assertJsonPath('user.has_password', true);

        $this->assertSame(1, User::count());
        $this->assertSame($hash, $user->fresh()->password);
    }

    public function test_linking_to_unverified_account_burns_its_password_and_tokens(): void
    {
        $user = User::factory()->create(['email' => 'ana@example.com', 'email_verified_at' => null, 'password' => 'secret123']);
        $user->createToken('old');

        $this->apple()->assertOk()->assertJsonPath('user.id', $user->id)->assertJsonPath('user.has_password', false);

        $user->refresh();
        $this->assertNotNull($user->email_verified_at);
        $this->assertFalse($user->has_password);
        $this->assertSame(1, $user->tokens()->count()); // only the new one
        $this->postJson('/api/login', ['email' => 'ana@example.com', 'password' => 'secret123'])->assertStatus(422);
    }

    /** QA's chain: attacker pre-registers the victim's address (unverified),
     * queues an email change to their own inbox and a password reset; the
     * victim then signs in with Apple. Neither attacker link may work. */
    public function test_pre_takeover_chain_kills_pending_email_change_and_reset(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        Notification::fake();

        $reg = $this->postJson('/api/register', [
            'name' => 'Attacker', 'email' => 'ana@example.com',
            'password' => 'attacker1', 'password_confirmation' => 'attacker1',
        ])->assertCreated();
        $attackerToken = $reg->json('token');

        $this->withToken($attackerToken)->putJson('/api/profile/email', [
            'current_password' => 'attacker1', 'email' => 'attacker@evil.example',
        ])->assertOk();
        $changeToken = null;
        Notification::assertSentOnDemand(ConfirmEmailChangeNotification::class, function ($n) use (&$changeToken) {
            $changeToken = $n->token;
            return true;
        });

        $this->postJson('/api/forgot-password', ['email' => 'ana@example.com'])->assertOk();
        $resetToken = null;
        Notification::assertSentTo(User::first(), ResetPasswordNotification::class, function ($n) use (&$resetToken) {
            $resetToken = $n->token;
            return true;
        });

        $this->app['auth']->forgetGuards();

        // Victim signs in with Apple (verified email).
        $this->apple()->assertOk()->assertJsonPath('created', false);

        $this->postJson('/api/confirm-email', ['email' => 'attacker@evil.example', 'token' => $changeToken])
            ->assertStatus(422);
        $this->postJson('/api/reset-password', [
            'email' => 'ana@example.com', 'token' => $resetToken,
            'password' => 'attacker2', 'password_confirmation' => 'attacker2',
        ])->assertStatus(422);
        $this->assertSame('ana@example.com', User::first()->email);
        $this->assertSame(0, DB::table('email_change_requests')->count());
        $this->assertSame(0, DB::table('password_reset_tokens')->count());

        $this->app['auth']->forgetGuards();
        $this->withToken($attackerToken)->getJson('/api/user')->assertUnauthorized();
        $this->postJson('/api/login', ['email' => 'ana@example.com', 'password' => 'attacker1'])->assertStatus(422);
    }

    public function test_unverified_provider_email_never_links(): void
    {
        User::factory()->create(['email' => 'ana@example.com']);

        $this->apple(['email_verified' => 'false'])
            ->assertStatus(409)->assertJsonPath('error', 'email_unverified_exists')
            ->assertJsonPath('message', 'Există deja un cont cu acest email. Intră cu emailul și parola.')
            ->assertJsonMissingPath('hint');

        $this->assertSame(0, SocialAccount::count());
        $this->assertSame(1, User::count());
    }

    public function test_unverified_provider_email_creates_unverified_user_when_free(): void
    {
        $res = $this->apple(['email_verified' => false])->assertOk()->assertJsonPath('created', true);
        $this->assertNull($res->json('user.email_verified_at'));
        $this->assertDatabaseHas('social_accounts', ['provider' => 'apple', 'email_verified' => false]);
    }

    public function test_social_only_user_cannot_password_login(): void
    {
        $this->apple()->assertOk();

        $this->postJson('/api/login', ['email' => 'ana@example.com', 'password' => 'whatever1'])
            ->assertStatus(422)->assertJsonValidationErrors('email');
    }

    public function test_race_on_first_sign_in_returns_existing_user_instead_of_500(): void
    {
        // Simulate the other request winning: the first create of a link
        // hits the unique index (a conflicting row inserted just before).
        $fired = false;
        SocialAccount::creating(function (SocialAccount $a) use (&$fired) {
            if ($fired) {
                return;
            }
            $fired = true;
            DB::table('social_accounts')->insert([
                'user_id' => $a->user_id, 'provider' => $a->provider, 'provider_user_id' => $a->provider_user_id,
                'email' => $a->email, 'email_verified' => true, 'created_at' => now(), 'updated_at' => now(),
            ]);
        });

        $this->apple()->assertOk();
        $this->assertSame(1, User::count());
        $this->assertSame(1, SocialAccount::count());
    }

    // ---- Unverified-origin links (Facebook, unverified Google) ---------

    public function test_facebook_is_unverified_and_creates_unverified_account(): void
    {
        // Free address: creates an unverified account + unverified link.
        $state = $this->startWebFlow('facebook');
        $this->mockProvider('facebook', ['id' => 'fb-1', 'email' => 'new@example.com', 'name' => 'Nou']);
        $code = $this->callbackCode('facebook', $state);
        $this->postJson('/api/auth/exchange', ['code' => $code])->assertOk()
            ->assertJsonPath('created', true)->assertJsonPath('user.email_verified_at', null);
        $this->assertDatabaseHas('social_accounts', ['provider' => 'facebook', 'email_verified' => false]);
    }

    public function test_facebook_never_links_to_existing_account(): void
    {
        // Existing (even verified) account: 409, never linked.
        User::factory()->create(['email' => 'ion@example.com', 'email_verified_at' => now()]);
        $state = $this->startWebFlow('facebook');
        $this->mockProvider('facebook', ['id' => 'fb-2', 'email' => 'ion@example.com']);
        $this->get('/auth/facebook/callback?code=x&state=' . $state)
            ->assertRedirect('exp://front.example.test/--/auth-callback?error=email_unverified_exists');
        $this->assertSame(0, SocialAccount::where('provider_user_id', 'fb-2')->count());
    }

    /** Unverified links that did NOT create the account with the proven
     * address are dropped: u1/u2 carry a link flagged as not the creator
     * (e.g. a backfilled row), u3 is the creator but the address proven is
     * a NEW one (email change), so the link's address was never proven. */
    public function test_proving_the_address_drops_unverified_links(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        Notification::fake();

        $mk = function (string $email, bool $createdAccount, string $sub) {
            [$user] = app(SocialAuthService::class)->resolveUser('facebook', $sub, $email, false);
            SocialAccount::where('user_id', $user->id)->update(['created_account' => $createdAccount]);
            SocialAccount::create(['user_id' => $user->id, 'provider' => 'apple', 'provider_user_id' => $sub . '-a', 'email' => $email, 'email_verified' => true]);
            return $user;
        };

        // 1. reset-password success
        $u1 = $mk('one@example.com', false, 'fb-1');
        $this->postJson('/api/forgot-password', ['email' => 'one@example.com'])->assertOk();
        $resetToken = null;
        Notification::assertSentTo($u1, ResetPasswordNotification::class, function ($n) use (&$resetToken) {
            $resetToken = $n->token;
            return true;
        });
        $this->postJson('/api/reset-password', [
            'email' => 'one@example.com', 'token' => $resetToken,
            'password' => 'newpass1', 'password_confirmation' => 'newpass1',
        ])->assertOk();
        $this->assertSame(['apple'], SocialAccount::where('user_id', $u1->id)->pluck('provider')->all());
        $this->assertTrue($u1->fresh()->has_password);

        // 2. verify-email success
        $u2 = $mk('two@example.com', false, 'fb-2');
        $token = str_repeat('t', 64);
        DB::table('email_verification_tokens')->insert(['user_id' => $u2->id, 'token' => hash('sha256', $token), 'created_at' => now()]);
        $this->postJson('/api/email/verify', ['email' => 'two@example.com', 'token' => $token, 'password' => 'owner-secret123', 'password_confirmation' => 'owner-secret123'])->assertOk();
        $this->assertSame(['apple'], SocialAccount::where('user_id', $u2->id)->pluck('provider')->all());

        // 3. confirm-email-change success
        $u3 = $mk('three@example.com', true, 'fb-3');
        $changeToken = str_repeat('c', 64);
        DB::table('email_change_requests')->insert(['user_id' => $u3->id, 'new_email' => 'three-new@example.com', 'token' => \Illuminate\Support\Facades\Hash::make($changeToken), 'created_at' => now()]);
        $this->postJson('/api/confirm-email', ['email' => 'three-new@example.com', 'token' => $changeToken])->assertOk();
        $this->assertSame(['apple'], SocialAccount::where('user_id', $u3->id)->pluck('provider')->all());
    }

    // ---- Account created by an unverified provider (NEW-1) -------------

    /** Full Facebook web sign-in (provider mocked once per test). */
    private function facebookSignIn()
    {
        // State minted directly: once the provider is mocked, /redirect
        // would hit the mock too.
        $state = app(SocialAuthService::class)->createState('facebook', 'exp://front.example.test/--/auth-callback');

        return $this->postJson('/api/auth/exchange', ['code' => $this->callbackCode('facebook', $state)]);
    }

    private function assertUnverifiedFacebookRejected(): void
    {
        $state = app(SocialAuthService::class)->createState('facebook', 'exp://front.example.test/--/auth-callback');
        $this->get('/auth/facebook/callback?state='.$state.'&code=audit-code')
            ->assertRedirect('exp://front.example.test/--/auth-callback?error=email_unverified_exists');
    }

    public function test_email_proof_removes_unverified_creator_link(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->mockProvider('facebook', ['id' => 'fb-1', 'email' => 'Nou@Example.com', 'name' => 'Nou']);
        $userId = $this->facebookSignIn()->assertOk()->assertJsonPath('created', true)->json('user.id');
        $user = User::find($userId);

        // An unrelated unverified link on the same account (not its creator).
        SocialAccount::create(['user_id' => $userId, 'provider' => 'google', 'provider_user_id' => 'g-x', 'email' => 'nou@example.com', 'email_verified' => false, 'created_account' => false]);

        $token = str_repeat('v', 64);
        DB::table('email_verification_tokens')->insert(['user_id' => $userId, 'token' => hash('sha256', $token), 'created_at' => now()]);
        $this->postJson('/api/email/verify', ['email' => 'nou@example.com', 'token' => $token, 'password' => 'owner-secret123', 'password_confirmation' => 'owner-secret123'])->assertOk();

        $this->assertDatabaseMissing('social_accounts', ['provider' => 'facebook', 'user_id' => $userId]);
        $this->assertDatabaseMissing('social_accounts', ['provider' => 'google']);
        $this->assertNotNull($user->fresh()->email_verified_at);

        $this->app['auth']->forgetGuards();
        $this->assertUnverifiedFacebookRejected();
        $this->assertSame(1, User::count());
    }

    public function test_password_reset_removes_unverified_creator_link(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        Notification::fake();
        $this->mockProvider('facebook', ['id' => 'fb-1', 'email' => 'nou@example.com']);
        $userId = $this->facebookSignIn()->assertOk()->json('user.id');
        SocialAccount::create(['user_id' => $userId, 'provider' => 'google', 'provider_user_id' => 'g-x', 'email' => 'nou@example.com', 'email_verified' => false, 'created_account' => false]);

        $this->postJson('/api/forgot-password', ['email' => 'nou@example.com'])->assertOk();
        $resetToken = null;
        Notification::assertSentTo(User::find($userId), ResetPasswordNotification::class, function ($n) use (&$resetToken) {
            $resetToken = $n->token;
            return true;
        });
        $this->postJson('/api/reset-password', [
            'email' => 'nou@example.com', 'token' => $resetToken,
            'password' => 'newpass1', 'password_confirmation' => 'newpass1',
        ])->assertOk();

        $this->assertSame([], SocialAccount::where('user_id', $userId)->pluck('provider')->all());

        $this->app['auth']->forgetGuards();
        $this->assertUnverifiedFacebookRejected();
        $this->postJson('/api/login', ['email' => 'nou@example.com', 'password' => 'newpass1'])->assertOk();
    }

    /** Someone creates the account via an unverified Facebook email; the
     * provider-verified owner then signs in with Apple. The eviction must
     * still drop the Facebook link (promotion only happens on reset /
     * verify / confirm, never on eviction). */
    public function test_eviction_still_drops_unverified_creator_link(): void
    {
        $this->mockProvider('facebook', ['id' => 'fb-evil', 'email' => 'ana@example.com']);
        $userId = $this->facebookSignIn()->assertOk()->json('user.id');
        $this->assertDatabaseHas('social_accounts', ['provider' => 'facebook', 'created_account' => true]);

        $this->app['auth']->forgetGuards();
        $this->apple()->assertOk()->assertJsonPath('created', false)->assertJsonPath('user.id', $userId);

        $this->assertSame(['apple'], SocialAccount::where('user_id', $userId)->pluck('provider')->all());
        $this->assertSame(1, User::find($userId)->tokens()->count()); // the Facebook session is gone
        $this->get('/auth/facebook/callback?code=x&state=' . app(SocialAuthService::class)->createState('facebook', 'exp://front.example.test/--/auth-callback'))
            ->assertRedirect('exp://front.example.test/--/auth-callback?error=email_unverified_exists&hint=no_password');
    }

    public function test_unverified_exists_hints_reset_when_account_has_no_password(): void
    {
        // Social-only account (has_password=false), unverified provider.
        $this->apple(['sub' => 'apple-1'])->assertOk();
        $this->assertFalse(User::first()->has_password);

        $this->apple(['sub' => 'apple-2', 'email_verified' => 'false'])
            ->assertStatus(409)->assertJsonPath('error', 'email_unverified_exists')
            ->assertJsonPath('hint', 'no_password')
            ->assertJsonPath('message', 'Există deja un cont cu acest email. Intră cu emailul și parola sau folosește „Ai uitat parola?”.');

        $state = $this->startWebFlow('facebook');
        $this->mockProvider('facebook', ['id' => 'fb-9', 'email' => 'ana@example.com']);
        $this->get('/auth/facebook/callback?code=x&state=' . $state)
            ->assertRedirect('exp://front.example.test/--/auth-callback?error=email_unverified_exists&hint=no_password');
    }

    public function test_deadlock_on_first_sign_in_is_retried(): void
    {
        // Thrown before the first write of the attempt: inside RefreshDatabase's
        // outer transaction Laravel doesn't roll the savepoint back on a
        // concurrency error (MySQL rolls back the whole real transaction).
        $fired = false;
        User::creating(function () use (&$fired) {
            if (!$fired) {
                $fired = true;
                throw new \Illuminate\Database\QueryException('mysql', 'insert', [], new \PDOException('SQLSTATE[40001]: Serialization failure: 1213 Deadlock found when trying to get lock; try restarting transaction'));
            }
        });

        $this->apple()->assertOk()->assertJsonPath('created', true);
        $this->assertSame(1, User::count());
        $this->assertSame(1, SocialAccount::count());
    }

    // ---- has_password / set-password -----------------------------------

    public function test_set_password_only_when_account_has_none(): void
    {
        $res = $this->apple()->assertOk();
        $token = $res->json('token');

        $this->withToken($token)->postJson('/api/profile/password/set', ['password' => 'short', 'password_confirmation' => 'short'])
            ->assertStatus(422)->assertJsonValidationErrors('password');

        $this->withToken($token)->postJson('/api/profile/password/set', ['password' => 'firstpass1', 'password_confirmation' => 'firstpass1'])
            ->assertOk()->assertJsonPath('user.has_password', true);

        // Now it can log in with that password...
        $this->postJson('/api/login', ['email' => 'ana@example.com', 'password' => 'firstpass1'])->assertOk()
            ->assertJsonPath('user.has_password', true);

        // ...and set-password is refused from now on.
        $this->withToken($token)->postJson('/api/profile/password/set', ['password' => 'otherpass1', 'password_confirmation' => 'otherpass1'])
            ->assertStatus(409)->assertJsonPath('error', 'password_already_set');
    }

    public function test_registered_user_has_password_and_cannot_use_set(): void
    {
        Notification::fake();
        $res = $this->postJson('/api/register', [
            'name' => 'Ana', 'email' => 'reg@example.com', 'password' => 'secret123', 'password_confirmation' => 'secret123',
        ])->assertCreated()->assertJsonPath('user.has_password', true)->assertJsonPath('user.providers', []);

        $this->withToken($res->json('token'))->postJson('/api/profile/password/set', ['password' => 'otherpass1', 'password_confirmation' => 'otherpass1'])
            ->assertStatus(409);
    }

    // ---- Providers -----------------------------------------------------

    public function test_providers_endpoint_reflects_config(): void
    {
        config(['services.facebook.client_id' => null]);
        $this->getJson('/api/auth/providers')->assertOk()->assertExactJson([
            'apple' => true, 'google' => true, 'facebook' => false,
        ]);
    }

    // ---- Web flow ------------------------------------------------------

    private function mockProvider(string $provider, array $raw): void
    {
        $socialiteUser = (new SocialiteUser())->setRaw($raw)->map([
            'id' => $raw['id'] ?? $raw['sub'],
            'name' => $raw['name'] ?? null,
            'email' => $raw['email'] ?? null,
        ]);

        $driver = Mockery::mock($provider === 'google' ? GoogleProvider::class : FacebookProvider::class);
        $driver->shouldReceive('stateless', 'redirectUrl', 'setScopes')->andReturnSelf();
        $driver->shouldReceive('user')->andReturn($socialiteUser);
        Socialite::shouldReceive('driver')->with($provider)->andReturn($driver);
    }

    private function startWebFlow(string $provider = 'google', string $appRedirect = 'exp://front.example.test/--/auth-callback'): string
    {
        $res = $this->get("/auth/$provider/redirect?app_redirect=" . urlencode($appRedirect));
        $res->assertRedirect();
        $location = $res->headers->get('Location');
        $this->assertStringContainsString(urlencode("https://api.example.test/auth/$provider/callback"), $location);
        parse_str(parse_url($location, PHP_URL_QUERY), $q);
        $this->assertSame(64, strlen($q['state']));

        return $q['state'];
    }

    private function callbackCode(string $provider, string $state): string
    {
        $location = $this->get("/auth/$provider/callback?code=provider-code&state=" . $state)->headers->get('Location');
        $this->assertStringStartsWith('exp://front.example.test/--/auth-callback?code=', $location);
        parse_str(parse_url($location, PHP_URL_QUERY), $q);

        return $q['code'];
    }

    public function test_redirect_rejects_foreign_app_redirect(): void
    {
        foreach ([
            'https://evil.example/cb',
            'javascript:alert(1)',
            'exp://front.example.test.evil.com/--/auth-callback',
            'exp://other.example/--/auth-callback',
            'orgos:/x',
            '',
        ] as $bad) {
            $this->get('/auth/google/redirect?app_redirect=' . urlencode($bad))->assertStatus(400);
        }
        $this->get('/auth/google/redirect')->assertStatus(400);
        $this->get('/auth/twitter/redirect?app_redirect=orgos://auth-callback')->assertNotFound();
    }

    public function test_redirect_for_disabled_provider_goes_back_with_error(): void
    {
        config(['services.facebook.client_id' => null]);
        $this->get('/auth/facebook/redirect?app_redirect=' . urlencode('orgos://auth-callback'))
            ->assertRedirect('orgos://auth-callback?error=provider_disabled');
    }

    public function test_full_web_flow_and_single_use_exchange(): void
    {
        $state = $this->startWebFlow();
        $this->mockProvider('google', ['sub' => 'g-1', 'email' => 'ion@example.com', 'email_verified' => true, 'name' => 'Ion Pop']);
        $code = $this->callbackCode('google', $state);
        $this->assertSame(64, strlen($code));

        $this->postJson('/api/auth/exchange', ['code' => $code])->assertOk()
            ->assertJsonPath('created', true)
            ->assertJsonPath('user.email', 'ion@example.com')
            ->assertJsonPath('user.name', 'Ion Pop')
            ->assertJsonPath('user.providers', ['google'])
            ->assertJsonPath('user.has_password', false);
        $this->assertDatabaseHas('social_accounts', ['provider' => 'google', 'email_verified' => true]);

        $this->postJson('/api/auth/exchange', ['code' => $code])
            ->assertStatus(422)->assertJsonPath('error', 'invalid_code');

        $this->get('/auth/google/callback?code=provider-code&state=' . $state)
            ->assertRedirect('exp://front.example.test/--/auth-callback?error=invalid_state');
    }

    public function test_exchange_code_expires(): void
    {
        $state = $this->startWebFlow();
        $this->mockProvider('google', ['sub' => 'g-1', 'email' => 'ion@example.com', 'email_verified' => true]);
        $code = $this->callbackCode('google', $state);

        $this->travel(3)->minutes();
        $this->postJson('/api/auth/exchange', ['code' => $code])
            ->assertStatus(422)->assertJsonPath('error', 'invalid_code');
        $this->postJson('/api/auth/exchange', ['code' => str_repeat('a', 64)])->assertStatus(422);
    }

    public function test_callback_cancel_and_bad_state(): void
    {
        $state = $this->startWebFlow('google', 'orgos://auth-callback');
        $this->get('/auth/google/callback?error=access_denied&state=' . $state)
            ->assertRedirect('orgos://auth-callback?error=cancelled');

        $this->get('/auth/google/callback?code=x&state=forged')
            ->assertRedirect('exp://front.example.test/--/auth-callback?error=invalid_state');
    }

    public function test_google_unverified_email_with_existing_account_is_rejected(): void
    {
        User::factory()->create(['email' => 'ion@example.com', 'email_verified_at' => now()]);
        $state = $this->startWebFlow();
        $this->mockProvider('google', ['sub' => 'g-1', 'email' => 'ion@example.com', 'email_verified' => false]);

        $this->get('/auth/google/callback?code=x&state=' . $state)
            ->assertRedirect('exp://front.example.test/--/auth-callback?error=email_unverified_exists');
        $this->assertSame(0, DB::table('social_accounts')->count());
    }
}
