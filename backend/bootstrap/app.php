<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Sentry\Laravel\Integration;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // This is an API-only app -- there is no "login" web route to
        // redirect an unauthenticated request to. Without this, the
        // default `Authenticate` middleware tries route('login') for
        // any request whose Accept header doesn't explicitly say
        // "application/json" (expectsJson() false), which throws
        // RouteNotFoundException -> a raw 500 instead of a clean 401.
        $middleware->redirectGuestsTo(null);

        // Every API response in the app's language (Accept-Language: ro|en,
        // default ro) -- public routes (login, forgot-password) included.
        $middleware->api(prepend: [\App\Http\Middleware\SetLocale::class]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*'),
        );

        Integration::handles($exceptions);
    })->create();
