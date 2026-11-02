<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\SocialAuthController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\SpaceController;
use App\Http\Controllers\Api\ItemController;
use App\Http\Controllers\Api\RecipeController;
use App\Http\Controllers\Api\IngredientReferenceController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\QuickAddController;
use App\Http\Controllers\Api\CalendarController;
use App\Http\Controllers\Api\BudgetController;
use App\Http\Middleware\SyncUserTimezone;


Route::middleware('throttle:auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);
    // Social login (SocialAuthController): Apple identity token, and the
    // one-time code from the Google/Facebook web flow (routes/web.php).
    Route::post('/auth/apple', [SocialAuthController::class, 'apple']);
    Route::post('/auth/exchange', [SocialAuthController::class, 'exchange']);
});

// Apple sign-in nonce (replay guard) -- own limiter, so fetching one
// doesn't eat the 5/min login bucket.
Route::middleware('throttle:apple-nonce')->post('/auth/apple/nonce', [SocialAuthController::class, 'appleNonce']);

// Which social providers the login/register screens should show.
Route::middleware('throttle:open-link')->get('/auth/providers', [SocialAuthController::class, 'providers']);

Route::middleware('throttle:password-reset')->group(function () {
    Route::post('/forgot-password', [AuthController::class, 'forgotPassword']);
    Route::post('/reset-password', [AuthController::class, 'resetPassword']);
    // Same throttle as the password-reset pair above -- an unauthenticated,
    // token-consuming endpoint with the same abuse shape (someone hammering
    // it trying to guess a valid token).
    Route::post('/confirm-email', [AuthController::class, 'confirmEmailChange']);
    // Registration email verification (link from VerifyEmailNotification
    // via /open/verify-email) -- same public, token-consuming shape.
    Route::post('/email/verify', [AuthController::class, 'verifyEmail']);
});

// Resend the verification email -- auth'd, with its own per-user limiter
// (1/min + 6/h, Romanian 429 + retry_after) on top of the usual 'api' one.
Route::middleware(['auth:sanctum', 'throttle:api', 'throttle:verification-notification'])
    ->post('/email/verification-notification', [AuthController::class, 'resendVerification']);

Route::middleware(['auth:sanctum', 'throttle:api', SyncUserTimezone::class])->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'user']);
    // First-use tours seen/skipped (frontend lib/tours.ts).
    Route::put('/user/tours/{key}', [AuthController::class, 'markTour']);
    Route::delete('/user/tours', [AuthController::class, 'resetTours']);
    Route::put('/profile/name', [AuthController::class, 'updateName']);
    Route::put('/profile/password', [AuthController::class, 'updatePassword']);
    // First password for a social-only account (has_password=false).
    Route::post('/profile/password/set', [AuthController::class, 'setPassword']);
    Route::put('/profile/email', [AuthController::class, 'requestEmailChange']);

    Route::get('/dashboard', [DashboardController::class, 'index']);
    Route::get('/dashboard/layout', [DashboardController::class, 'layout']);
    Route::put('/dashboard/layout', [DashboardController::class, 'saveLayout']);
    Route::get('/calendar', [CalendarController::class, 'index']);
    Route::get('/calendar/purchases', [CalendarController::class, 'purchases']);

    Route::get('/budget', [BudgetController::class, 'index']);
    // Buget simplu (2026-11): income + monthly set-aside. The per-space
    // limit routes and GET /budget/guilt-free are gone (no callers).
    Route::put('/budget/plan', [BudgetController::class, 'savePlan']);
    Route::put('/budget/savings-goal', [BudgetController::class, 'saveSavingsGoal']);
    Route::get('/budget/spaces/{category}', [BudgetController::class, 'spaceDetail']);
    Route::get('/budget/archive', [BudgetController::class, 'archive']);

    Route::get('/spaces', [SpaceController::class, 'index']);
    Route::post('/spaces', [SpaceController::class, 'store']);
    Route::patch('/spaces/reorder', [SpaceController::class, 'reorder']);
    Route::get('/spaces/{id}', [SpaceController::class, 'show']);
    Route::put('/spaces/{id}', [SpaceController::class, 'update']);
    Route::delete('/spaces/{id}', [SpaceController::class, 'destroy']);
    Route::put('/spaces/{id}/car-profile', [SpaceController::class, 'updateCarProfile']);
    Route::put('/spaces/{id}/car-profile/odometer', [SpaceController::class, 'updateCarOdometer']);
    Route::put('/spaces/{id}/home-profile', [SpaceController::class, 'updateHomeProfile']);
    Route::get('/spaces/{id}/members', [SpaceController::class, 'members']);
    Route::post('/spaces/{id}/members', [SpaceController::class, 'addMember']);
    Route::delete('/spaces/{id}/members/{userId}', [SpaceController::class, 'removeMember']);


    // Everything Grocery's Home shows -- this user's own lists plus any
    // list shared with them, regardless of whose space it lives in. See
    // ItemController::myGrocery.
    Route::get('/grocery/mine', [ItemController::class, 'myGrocery']);

    // Registered before apiResource() -- that macro's own PATCH
    // /items/{item} would otherwise swallow "reorder" as the {item}
    // route parameter (Laravel matches route registration order, not
    // specificity) and hand it to update() instead of this method.
    Route::patch('/items/reorder', [ItemController::class, 'reorder']);
    Route::apiResource('items', ItemController::class);
    Route::get('/items/{id}/members', [ItemController::class, 'members']);
    Route::post('/items/{id}/members', [ItemController::class, 'addMember']);
    Route::delete('/items/{id}/members/{userId}', [ItemController::class, 'removeMember']);
    Route::apiResource('recipes', RecipeController::class);
    Route::get('/ingredient-references', [IngredientReferenceController::class, 'index']);

    // Quick Add endpoint
    Route::post('/quick-add', [QuickAddController::class, 'parse']);
});

