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
