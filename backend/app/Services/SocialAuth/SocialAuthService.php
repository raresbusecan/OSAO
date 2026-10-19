<?php

namespace App\Services\SocialAuth;

use App\Models\Role;
use App\Models\SocialAccount;
use App\Models\User;
use App\Support\AuthSession;
use Illuminate\Database\DeadlockException;
use Illuminate\Database\DetectsConcurrencyErrors;
use Illuminate\Database\QueryException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Social login core: find/link/create the orgOS user for a provider
 * identity, plus the web flow's short-lived state and one-time exchange
 * codes. Linking rules (spec "Account linking"):
 *
 *  1. (provider, provider_user_id) already linked -> that user.
 *  2. Else the provider gave an email:
 *     - an orgOS user has it and the provider says it's VERIFIED -> link
 *       to that user and sign in (no password prompt). If that orgOS
 *       account was itself never verified, evictUnprovenOwner() burns its
 *       password (has_password=false), tokens, pending email change,
 *       password-reset and verification tokens and unverified social
 *       links: whoever registered it without proving the address
 *       (pre-account-takeover) loses every way back in.
 *     - an orgOS user has it but the provider email is NOT verified
 *       (Facebook always; Google email_verified=false) -> reject
 *       (`email_unverified_exists`, 409). Never auto-link.
 *     - no user has it -> create one (email_verified_at = now when the
 *       provider verified it, null otherwise).
 *  3. No email at all (an Apple user whose first authorization we never
 *     saw) -> reject (`email_missing`).
 *
 * New users get a random, never-revealed password (users.password is
 * NOT NULL) and has_password=false: email+password login fails with the
 * usual "credentials incorrect" until they set one (POST
 * /profile/password/set, or forgot-password). social_accounts.email_verified
 * records whether the provider vouched for the email; created_account
 * whether that sign-in created the user. Address proof drops every
 * unverified link, including the creator: it may belong to a pre-registrant.
 */
class SocialAuthService
{
    use DetectsConcurrencyErrors;

    public const STATE_TTL_SECONDS = 600;
    public const CODE_TTL_SECONDS = 120;

    /**
     * $emailVerified = the provider vouches for the address (Apple's
     * email_verified, Google's email_verified; Facebook never -- its Graph
     * email isn't guaranteed confirmed).
     *
     * @return array{0: User, 1: bool} [user, created]
     * @throws SocialAuthException
     */
    public function resolveUser(
        string $provider,
        string $providerUserId,
        ?string $email,
        bool $emailVerified,
        ?string $name = null,
    ): array {
        $email = $email !== null ? Str::lower(trim($email)) : null;
        if ($email === '' || ($email !== null && !filter_var($email, FILTER_VALIDATE_EMAIL))) {
            $email = null;
        }

        // Two first sign-ins racing (double tap, retried request) either hit
        // the unique index (the other one created the user / link first) or,
        // on MySQL, deadlock (1213: gap locks from lockForUpdate on a row
        // that doesn't exist yet). Either way the retry finds the winner's
        // row. Retried here rather than via DB::transaction($cb, 3), which
        // never retries when nested inside an outer transaction (Laravel
        // then rethrows a DeadlockException, a PDOException, instead).
        for ($try = 1; ; $try++) {
            try {
                return DB::transaction(
                    fn () => $this->resolveInTransaction($provider, $providerUserId, $email, $emailVerified, $name)
                );
            } catch (UniqueConstraintViolationException $e) {
                if ($try >= 2) {
                    throw $e;
                }
            } catch (QueryException|DeadlockException $e) {
                if ($try >= 3 || !$this->causedByConcurrencyError($e)) {
                    throw $e;
                }
            }
        }
    }

    private function resolveInTransaction(string $provider, string $providerUserId, ?string $email, bool $emailVerified, ?string $name): array
    {
        $account = SocialAccount::where('provider', $provider)
            ->where('provider_user_id', $providerUserId)
            ->lockForUpdate()
            ->first();

        if ($account && $account->user) {
            if ($email !== null && $account->email !== $email) {
                $account->update(['email' => $email]);
            }

            return [$account->user, false];
        }

        if ($email === null) {
            throw new SocialAuthException('email_missing', 422);
        }

        $existing = User::whereRaw('LOWER(email) = ?', [$email])->lockForUpdate()->first();

        if ($existing) {
            // Only a provider-verified address may attach to an existing
            // account (never Facebook, never Google email_verified=false).
            if (!$emailVerified) {
                // A social-only account (no password it knows) can't "sign
                // in with email and password" -- point at the reset flow.
                throw $existing->has_password
                    ? new SocialAuthException('email_unverified_exists', 409)
                    : SocialAuthException::unverifiedExistsWithoutPassword();
            }

            if ($existing->email_verified_at === null) {
                $this->evictUnprovenOwner($existing);
            }

            $this->link($existing, $provider, $providerUserId, $email, true, false);

            return [$existing, false];
        }

        $user = new User();
        $user->forceFill([
            'name' => $this->cleanName($name, $email),
            'email' => $email,
            'password' => Str::random(64),
            'has_password' => false,
            'email_verified_at' => $emailVerified ? now() : null,
        ])->save();

        if ($role = Role::where('slug', 'user')->first()) {
            $user->roles()->attach($role->id);
        }

        $this->link($user, $provider, $providerUserId, $email, $emailVerified, true);

        return [$user, true];
    }

    /** Pre-account-takeover guard: an orgOS account that never proved its
     * address is being claimed by the provider-verified owner of that
     * address. Whoever registered it may know the password, hold tokens,
     * or have queued an email change / password reset -- burn all of it,
     * plus any unverified social link they attached. */
    private function evictUnprovenOwner(User $user): void
    {
        DB::table('email_change_requests')->where('user_id', $user->id)->delete();
        DB::table('password_reset_tokens')->whereRaw('LOWER(email) = ?', [Str::lower($user->email)])->delete();
        DB::table('email_verification_tokens')->where('user_id', $user->id)->delete();
        $user->tokens()->delete();
        self::dropUnverifiedLinks($user);

        $user->forceFill([
            'password' => Str::random(64),
            'has_password' => false,
            'email_verified_at' => now(),
        ])->save();
    }

    /** Every unverified social link loses the account -- used by the
     * pre-takeover eviction, where the account itself was never proven. */
    public static function dropUnverifiedLinks(User $user): void
    {
        SocialAccount::where('user_id', $user->id)->where('email_verified', false)->delete();
    }

    /** Address proof does not prove ownership of an unverified social identity.
     * Called after verification, password recovery and email change. */
    public static function settleLinksAfterAddressProven(User $user, string $provenEmail): void
    {
        // Even a creator link may belong to a pre-registrant. Mailbox proof
        // cannot prove control of that provider identity; never promote it.
        self::dropUnverifiedLinks($user);
    }

    private function link(User $user, string $provider, string $providerUserId, ?string $email, bool $emailVerified, bool $createdAccount): void
    {
        SocialAccount::create([
            'user_id' => $user->id,
            'provider' => $provider,
            'provider_user_id' => $providerUserId,
            'email' => $email,
            'email_verified' => $emailVerified,
            'created_account' => $createdAccount,
        ]);
    }

    private function cleanName(?string $name, string $email): string
    {
        $name = trim((string) preg_replace('/\s+/u', ' ', (string) $name));
        if ($name === '') {
            $name = Str::before($email, '@');
        }

        $name = trim(mb_substr($name, 0, 50));

        return $name !== '' ? $name : 'Utilizator';
    }

    /** Which providers the app should offer (GET /api/auth/providers).
     * Apple needs no server credentials; Google/Facebook need their
     * client id + secret in .env. */
    public static function enabledProviders(): array
    {
        return [
            'apple' => true,
            'google' => self::isConfigured('google'),
            'facebook' => self::isConfigured('facebook'),
        ];
    }

    public static function isConfigured(string $provider): bool
    {
        return in_array($provider, SocialAccount::WEB_PROVIDERS, true)
            && filled(config("services.$provider.client_id"))
            && filled(config("services.$provider.client_secret"));
    }

    /** Deep-link targets the web flow may send the user back to: under
     * config('app.deep_link_base') (Expo Go: exp://<tunnel>/--) or the own
     * build's orgos:// scheme. Anything else (https://evil, javascript:,
     * a look-alike host) is rejected so /auth/{p}/callback can't be used
     * as an open redirect. */
    public static function isAllowedAppRedirect(mixed $url): bool
    {
        if (!is_string($url) || $url === '' || strlen($url) > 500 || preg_match('/[\s\x00-\x1F\x7F\\\\]/', $url)) {
            return false;
        }

        foreach (array_unique(array_filter([(string) config('app.deep_link_base'), 'orgos://'])) as $base) {
            if (!str_starts_with($url, $base)) {
                continue;
            }
            // The base must end at a boundary, so "exp://host" doesn't
            // also allow "exp://host.evil.com/...".
            if (str_ends_with($base, '/') || strlen($url) === strlen($base) || in_array($url[strlen($base)], ['/', '?', '#'], true)) {
                return true;
            }
        }

        return false;
    }

    /** Appends query params to an (already validated) app redirect. */
    public static function withQuery(string $url, array $params): string
    {
        $fragment = '';
        if (($pos = strpos($url, '#')) !== false) {
            $fragment = substr($url, $pos);
            $url = substr($url, 0, $pos);
        }

        return $url . (str_contains($url, '?') ? '&' : '?')
            . http_build_query($params, '', '&', PHP_QUERY_RFC3986) . $fragment;
    }

    /** Web-flow state: random, cached server-side with where to send the
     * user back, consumed once by the callback. */
    public function createState(string $provider, string $appRedirect): string
    {
        $state = Str::random(64);
        Cache::put('social:state:' . hash('sha256', $state), [
            'provider' => $provider,
            'app_redirect' => $appRedirect,
        ], self::STATE_TTL_SECONDS);

        return $state;
    }

    public function pullState(mixed $state, string $provider): ?array
    {
        if (!is_string($state) || strlen($state) !== 64) {
            return null;
        }
        $data = Cache::pull('social:state:' . hash('sha256', $state));

        return is_array($data) && ($data['provider'] ?? null) === $provider ? $data : null;
    }

    /** Apple replay guard: a random nonce the app passes to
     * signInAsync({nonce}); it comes back in the identity token's `nonce`
     * claim. 10 min, single use. */
    public function createAppleNonce(): string
    {
        $nonce = Str::random(48);
        Cache::put('social:nonce:' . hash('sha256', $nonce), true, self::STATE_TTL_SECONDS);

        return $nonce;
    }

    /** Consumes the nonce (whatever happens next) -- true if it was live. */
    public function pullAppleNonce(string $nonce): bool
    {
        return strlen($nonce) >= 32 && strlen($nonce) <= 128
            && Cache::pull('social:nonce:' . hash('sha256', $nonce)) === true;
    }

    /** One-time exchange code: 64 random chars, 2 minutes, single use.
     * Stored hashed, so the cache never holds a usable code. */
    public function createExchangeCode(User $user, bool $created): string
    {
        $code = Str::random(64);
        // Bind the resolved snapshot; refreshing here could authorize a
        // callback whose credentials were revoked while it was running.
        Cache::put('social:code:' . hash('sha256', $code), [
            'user_id' => $user->id,
            'created' => $created,
            'credential_state' => AuthSession::fingerprint($user),
        ], self::CODE_TTL_SECONDS);

        return $code;
    }

    /** The caller must keep the transaction open through token issuance.
     * @return array{0: User, 1: bool} @throws SocialAuthException */
    public function consumeExchangeCode(string $code): array
    {
        $key = 'social:code:' . hash('sha256', $code);
        $pending = strlen($code) === 64 ? Cache::get($key) : null;
        $user = is_array($pending)
            ? User::whereKey($pending['user_id'] ?? 0)->lockForUpdate()->first()
            : null;

        // Pull only after locking the account: parallel exchanges for this
        // code cannot both consume it before either transaction commits.
        $data = $user ? Cache::pull($key) : null;

        if (!$user || !is_array($data)
            || !is_string($data['credential_state'] ?? null)
            || !hash_equals(AuthSession::fingerprint($user), $data['credential_state'])) {
            throw new SocialAuthException('invalid_code', 422);
        }

        return [$user, (bool) ($data['created'] ?? false)];
    }
}
