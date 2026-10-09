<?php

use App\Http\Controllers\OpenAppController;
use App\Http\Controllers\SocialWebController;
use App\Support\AppLink;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

// Landing page for every auth-email link (reset password, verify email,
// confirm email change) -- redirects into the app. See AppLink.
// Stateless pages: no session row or cookies per click.
$stateless = [
    \Illuminate\Session\Middleware\StartSession::class,
    \Illuminate\View\Middleware\ShareErrorsFromSession::class,
    \Illuminate\Foundation\Http\Middleware\ValidateCsrfToken::class,
    \Illuminate\Foundation\Http\Middleware\PreventRequestForgery::class,
    \Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse::class,
    \Illuminate\Cookie\Middleware\EncryptCookies::class,
];

Route::get('/open/{screen}', OpenAppController::class)
    ->whereIn('screen', AppLink::SCREENS)
    ->middleware('throttle:open-link')
    ->withoutMiddleware($stateless);

// Social login web flow (Google/Facebook) -- see SocialWebController.
// State lives in the cache, not the session, so these are stateless too.
Route::get('/auth/{provider}/redirect', [SocialWebController::class, 'redirect'])
    ->whereIn('provider', \App\Models\SocialAccount::WEB_PROVIDERS)
    ->middleware('throttle:open-link')
    ->withoutMiddleware($stateless);
Route::get('/auth/{provider}/callback', [SocialWebController::class, 'callback'])
    ->whereIn('provider', \App\Models\SocialAccount::WEB_PROVIDERS)
    ->middleware('throttle:open-link')
    ->withoutMiddleware($stateless);
