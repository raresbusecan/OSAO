<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Login/register are unauthenticated -- keyed by IP (there's no
        // user yet to key by), so unlimited credential-stuffing/registration
        // spam isn't possible just because the API has no other rate
        // limiting at all (see routes/api.php).
        RateLimiter::for('auth', function ($request) {
            return Limit::perMinute(5)->by($request->ip());
        });

        // forgot-password/reset-password share 'auth's threat model
        // (unauthenticated, keyed by IP) but not its abuse profile --
        // login is what credential-stuffing actually targets, while a
        // genuinely confused user recovering their own account (a
        // couple of mistyped-password attempts, then requesting a
        // reset, then fumbling the new password once) can plausibly
        // reach 5 requests on its own with zero malicious intent. A
        // bit more headroom here, still well short of anything useful
        // for scripted abuse.
        RateLimiter::for('password-reset', function ($request) {
            return Limit::perMinute(10)->by($request->ip());
        });

        // POST /api/auth/apple/nonce -- issued once per Apple sign-in
        // attempt. Own bucket (not 'auth'), so a nonce fetch doesn't eat
        // the 5/min login budget; still capped per IP.
        RateLimiter::for('apple-nonce', function ($request) {
            return Limit::perMinute(20)->by($request->ip());
        });

        // GET /open/{screen} (routes/web.php) -- the public landing page
        // for auth-email links. Cheap and harmless, but unauthenticated,
        // so still capped per IP.
        RateLimiter::for('open-link', function ($request) {
            return Limit::perMinute(30)->by($request->ip());
        });

        // POST /email/verification-notification (resend the registration
        // verification email) -- per user, 1/min + 6/hour, so the
        // "Retrimite emailul" button can't be used to spam an inbox (or
        // burn the SMTP provider's 300/day free quota). The 429 body is
        // Romanian and carries retry_after (seconds) so the frontend can
        // show a cooldown; the Retry-After header is set too.
        RateLimiter::for('verification-notification', function ($request) {
            $key = 'verify-resend:' . ($request->user()?->id ?: $request->ip());
            $respond = fn ($request, array $headers) => response()->json([
                'message' => 'Ai cerut deja un email de confirmare. Mai încearcă peste puțin timp.',
                'retry_after' => (int) ($headers['Retry-After'] ?? 60),
            ], 429, $headers);

            return [
                Limit::perMinute(1)->by($key . ':m')->response($respond),
                Limit::perHour(6)->by($key . ':h')->response($respond),
            ];
        });

        // Everything behind auth:sanctum -- a much looser cap than 'auth'
        // above, since a normal session fires several requests on every
        // screen open (Dashboard/Budget/Calendar all load together). This
        // is a backstop against a compromised/malicious token hammering
        // the API, not something legitimate usage should ever approach.
        RateLimiter::for('api', function ($request) {
            return Limit::perMinute(120)->by($request->user()?->id ?: $request->ip());
        });
    }
}
