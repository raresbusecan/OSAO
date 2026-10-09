<?php

namespace App\Services\SocialAuth;

use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Verifies a Sign in with Apple identity token (the JWT
 * expo-apple-authentication's signInAsync() returns):
 *  - RS256 signature against Apple's JWKS (https://appleid.apple.com/auth/keys,
 *    cached 24h; refetched once when the token's `kid` isn't in the cache
 *    -- Apple rotates keys),
 *  - iss = https://appleid.apple.com,
 *  - aud in config('services.apple.client_ids') (Expo Go: host.exp.Exponent;
 *    an own build: its bundle id),
 *  - exp/iat/nbf (firebase/php-jwt, 5s leeway),
 *  - a non-empty `sub`,
 *  - the `nonce` claim = the server-issued nonce (raw, or hex sha256 of
 *    it -- what lands in the token depends on what the client passed to
 *    signInAsync), so a captured token can't be replayed: the nonce is
 *    single use (SocialAuthService::pullAppleNonce, done by the caller).
 *
 * A `kid` that is still unknown after a refetch is remembered for 5 min
 * (negative cache), so junk tokens can't make every request refetch
 * Apple's keys.
 *
 * Returns the claims: sub, email (may be absent for a returning user),
 * email_verified (bool), is_private_email (bool).
 */
class AppleIdentityVerifier
{
    public const ISSUER = 'https://appleid.apple.com';
    public const JWKS_URL = 'https://appleid.apple.com/auth/keys';
    private const CACHE_KEY = 'social:apple:jwks';

    /** @throws SocialAuthException */
    public function verify(string $identityToken, string $nonce): array
    {
        $kid = $this->headerKid($identityToken);
        $badKidKey = 'social:apple:badkid:' . hash('sha256', $kid);
        if (Cache::has($badKidKey)) {
            throw SocialAuthException::invalidToken();
        }

        $jwks = $this->jwks(false);
        if (!$this->hasKid($jwks, $kid)) {
            $jwks = $this->jwks(true);
        }
        if (!$this->hasKid($jwks, $kid)) {
            Cache::put($badKidKey, true, now()->addMinutes(5));
            throw SocialAuthException::invalidToken();
        }

        JWT::$leeway = 5;

        try {
            // defaultAlg RS256: Apple's JWKS keys carry alg, but don't
            // trust a key set entry without one to pick something weaker.
            $claims = (array) JWT::decode($identityToken, JWK::parseKeySet($jwks, 'RS256'));
        } catch (\Throwable $e) {
            throw SocialAuthException::invalidToken();
        }

        if (($claims['iss'] ?? null) !== self::ISSUER) {
            throw SocialAuthException::invalidToken();
        }

        $allowed = (array) config('services.apple.client_ids', []);
        $aud = (array) ($claims['aud'] ?? []);
        if (!array_intersect($aud, $allowed)) {
            throw SocialAuthException::invalidToken();
        }

        $sub = $claims['sub'] ?? null;
        if (!is_string($sub) || $sub === '') {
            throw SocialAuthException::invalidToken();
        }

        $tokenNonce = $claims['nonce'] ?? null;
        if (!is_string($tokenNonce)
            || !(hash_equals($tokenNonce, $nonce) || hash_equals($tokenNonce, hash('sha256', $nonce)))) {
            throw new SocialAuthException('invalid_nonce', 401);
        }

        $email = isset($claims['email']) && is_string($claims['email']) && $claims['email'] !== ''
            ? $claims['email']
            : null;

        return [
            'sub' => $sub,
            'email' => $email,
            // Apple sends these as "true"/"false" strings or real bools.
            'email_verified' => filter_var($claims['email_verified'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'is_private_email' => filter_var($claims['is_private_email'] ?? false, FILTER_VALIDATE_BOOLEAN),
        ];
    }

    private function headerKid(string $token): string
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            throw SocialAuthException::invalidToken();
        }
        $header = json_decode((string) JWT::urlsafeB64Decode($parts[0]), true);
        if (!is_array($header) || !is_string($header['kid'] ?? null) || ($header['alg'] ?? null) !== 'RS256') {
            throw SocialAuthException::invalidToken();
        }

        return $header['kid'];
    }

    private function hasKid(array $jwks, string $kid): bool
    {
        foreach ($jwks['keys'] ?? [] as $key) {
            if (($key['kid'] ?? null) === $kid) {
                return true;
            }
        }

        return false;
    }

    private function jwks(bool $refresh): array
    {
        if (!$refresh && is_array($cached = Cache::get(self::CACHE_KEY))) {
            return $cached;
        }

        try {
            $response = Http::timeout(5)->acceptJson()->get(self::JWKS_URL);
            $data = $response->successful() ? $response->json() : null;
        } catch (\Throwable $e) {
            $data = null;
            Log::warning('Apple JWKS fetch failed', ['error' => $e->getMessage()]);
        }

        if (!is_array($data) || !is_array($data['keys'] ?? null)) {
            throw SocialAuthException::providerUnavailable();
        }

        Cache::put(self::CACHE_KEY, $data, now()->addDay());

        return $data;
    }
}
