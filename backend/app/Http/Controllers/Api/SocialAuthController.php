<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\SocialAuth\AppleIdentityVerifier;
use App\Services\SocialAuth\SocialAuthException;
use App\Services\SocialAuth\SocialAuthService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Social login, API half (the Google/Facebook browser redirects live in
 * App\Http\Controllers\SocialWebController):
 *  - GET  /api/auth/providers  {apple, google, facebook} booleans
 *  - POST /api/auth/apple/nonce  -> {nonce} (10 min, single use)
 *  - POST /api/auth/apple      {identity_token, nonce, full_name?: {given, family}}
 *  - POST /api/auth/exchange   {code} -- the one-time code the web flow's
 *    callback put in the app deep link.
 * Success answers like /login plus `created` (true = brand-new account).
 * Failures: {message (Romanian), error (code)} -- see SocialAuthException.
 */
class SocialAuthController extends Controller
{
    public function __construct(private SocialAuthService $social)
    {
    }

    public function providers(): JsonResponse
    {
        return response()->json(SocialAuthService::enabledProviders());
    }

    public function appleNonce(): JsonResponse
    {
        return response()->json(['nonce' => $this->social->createAppleNonce()]);
    }

    public function apple(Request $request, AppleIdentityVerifier $verifier): JsonResponse
    {
        $validated = $request->validate([
            'identity_token' => ['required', 'string', 'max:8192'],
            'nonce' => ['required', 'string', 'max:255'],
            'full_name' => ['nullable', 'array'],
            'full_name.given' => ['nullable', 'string', 'max:100'],
            'full_name.family' => ['nullable', 'string', 'max:100'],
        ], [
            'identity_token.*' => 'Autentificarea cu Apple nu a trimis datele necesare. Încearcă din nou.',
            'nonce.*' => 'Autentificarea cu Apple nu a trimis datele necesare. Încearcă din nou.',
            'full_name*' => 'Numele primit de la Apple nu este valid.',
        ]);

        try {
            // Consumed up front: a nonce is good for exactly one attempt,
            // successful or not.
            if (!$this->social->pullAppleNonce($validated['nonce'])) {
                throw new SocialAuthException('invalid_nonce', 401);
            }

            $claims = $verifier->verify($validated['identity_token'], $validated['nonce']);

            // Apple only sends the name to the CLIENT, and only on the first
            // authorization -- used solely when this creates the account.
            $name = trim(($validated['full_name']['given'] ?? '') . ' ' . ($validated['full_name']['family'] ?? ''));

            [$user, $created] = $this->social->resolveUser(
                'apple',
                $claims['sub'],
                $claims['email'],
                $claims['email_verified'],
                $name,
            );
        } catch (SocialAuthException $e) {
            return $e->toResponse();
        }

        return $this->signedIn($user, $created);
    }

    public function exchange(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:255'],
        ], [
            'code.*' => 'Codul de autentificare lipsește sau nu este valid.',
        ]);

        try {
            [$user, $created] = $this->social->consumeExchangeCode($validated['code']);
        } catch (SocialAuthException $e) {
            return $e->toResponse();
        }

        return $this->signedIn($user, $created);
    }

    private function signedIn(User $user, bool $created): JsonResponse
    {
        $token = $user->createToken('mobile-app')->plainTextToken;

        return response()->json([
            'message' => 'Login successful.',
            'user' => $user->fresh()->toAuthPayload(),
            'token' => $token,
            'created' => $created,
        ]);
    }
}
