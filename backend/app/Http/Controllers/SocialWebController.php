<?php

namespace App\Http\Controllers;

use App\Services\SocialAuth\SocialAuthException;
use App\Services\SocialAuth\SocialAuthService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Laravel\Socialite\Facades\Socialite;

/**
 * Social login, browser half -- Google/Facebook (works in Expo Go via
 * WebBrowser.openAuthSessionAsync). Stateless web routes (no session /
 * cookies, like /open/), throttled 'open-link':
 *
 *  GET /auth/{provider}/redirect?app_redirect=<deep link>
 *      app_redirect must be under APP_DEEP_LINK_BASE or orgos:// (else
 *      400, never redirected to). Stores {provider, app_redirect} under a
 *      random `state` (cache, 10 min) and 302s to the provider.
 *  GET /auth/{provider}/callback
 *      Consumes the state, gets the provider user (Socialite stateless),
 *      finds/links/creates the orgOS user, then 302s to
 *      {app_redirect}?code=<one-time code, 2 min> -- or ?error=<code>
 *      (cancelled, invalid_state, provider_error, email_missing,
 *      email_unverified_exists, provider_disabled). The app trades the
 *      code at POST /api/auth/exchange.
 *
 * Provider redirect URI = {APP_URL}/auth/{provider}/callback (built from
 * config, not the request host -- behind the tunnel that's 127.0.0.1).
 */
class SocialWebController extends Controller
{
    public function __construct(private SocialAuthService $social)
    {
    }

    public function redirect(Request $request, string $provider): RedirectResponse|\Illuminate\Http\Response
    {
        $appRedirect = $request->query('app_redirect');

        if (!SocialAuthService::isAllowedAppRedirect($appRedirect)) {
            return response('Link de revenire invalid.', 400)->header('Content-Type', 'text/plain; charset=UTF-8');
        }

        if (!SocialAuthService::isConfigured($provider)) {
            return $this->back($appRedirect, ['error' => 'provider_disabled']);
        }

        $state = $this->social->createState($provider, $appRedirect);

        return $this->driver($provider)->with(['state' => $state])->redirect();
    }

    public function callback(Request $request, string $provider): RedirectResponse
    {
        $stateData = $this->social->pullState($request->query('state'), $provider);

        if (!$stateData) {
            // No trusted app_redirect to go back to -- fall back to the
            // configured deep-link base (never anything from the request).
            $base = (string) config('app.deep_link_base');

            return $this->back($base . (str_ends_with($base, '/') ? '' : '/') . 'auth-callback', ['error' => 'invalid_state']);
        }

        $appRedirect = $stateData['app_redirect'];

        if ($request->query('error') !== null || $request->query('code') === null) {
            // access_denied / user cancelled on the provider's page.
            return $this->back($appRedirect, ['error' => 'cancelled']);
        }

        if (!SocialAuthService::isConfigured($provider)) {
            return $this->back($appRedirect, ['error' => 'provider_disabled']);
        }

        try {
            $providerUser = $this->driver($provider)->user();
        } catch (\Throwable $e) {
            Log::warning('Social login provider error', ['provider' => $provider, 'error' => $e->getMessage()]);

            return $this->back($appRedirect, ['error' => 'provider_error']);
        }

        $raw = (array) $providerUser->getRaw();
        // Google reports email_verified explicitly. Facebook's Graph email
        // is NOT guaranteed to be confirmed, so a Facebook login is always
        // "unverified": it may create an account, never link to one.
        $emailVerified = $provider === 'google'
            && filter_var($raw['email_verified'] ?? false, FILTER_VALIDATE_BOOLEAN);

        try {
            [$user, $created] = $this->social->resolveUser(
                $provider,
                (string) $providerUser->getId(),
                $providerUser->getEmail(),
                $emailVerified,
                $providerUser->getName(),
            );
        } catch (SocialAuthException $e) {
            return $this->back($appRedirect, ['error' => $e->errorCode]);
        }

        return $this->back($appRedirect, ['code' => $this->social->createExchangeCode($user, $created)]);
    }

    private function driver(string $provider)
    {
        $scopes = $provider === 'google' ? ['openid', 'email', 'profile'] : ['email', 'public_profile'];

        return Socialite::driver($provider)
            ->stateless()
            ->redirectUrl(rtrim((string) config('app.url'), '/') . "/auth/$provider/callback")
            ->setScopes($scopes);
    }

    private function back(string $url, array $params): RedirectResponse
    {
        return redirect()->away(SocialAuthService::withQuery($url, $params))
            ->header('Cache-Control', 'no-store')
            ->header('Referrer-Policy', 'no-referrer');
    }
}
