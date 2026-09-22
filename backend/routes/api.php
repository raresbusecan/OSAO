<?php

use App\Http\Controllers\Api\AuthController;
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


Route::middleware('throttle:auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);
});

Route::middleware('throttle:password-reset')->group(function () {
    Route::post('/forgot-password', [AuthController::class, 'forgotPassword']);
    Route::post('/reset-password', [AuthController::class, 'resetPassword']);
});

Route::middleware(['auth:sanctum', 'throttle:api'])->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'user']);
    Route::put('/profile/name', [AuthController::class, 'updateName']);

    Route::get('/dashboard', [DashboardController::class, 'index']);
    Route::get('/calendar', [CalendarController::class, 'index']);

    Route::get('/budget', [BudgetController::class, 'index']);
    Route::post('/budget/limits', [BudgetController::class, 'saveLimit']);
    Route::delete('/budget/limits/{category}', [BudgetController::class, 'deleteLimit']);
    Route::put('/budget/savings-goal', [BudgetController::class, 'saveSavingsGoal']);
    Route::get('/budget/spaces/{category}', [BudgetController::class, 'spaceDetail']);
    Route::get('/budget/archive', [BudgetController::class, 'archive']);

    Route::get('/spaces', [SpaceController::class, 'index']);
    Route::post('/spaces', [SpaceController::class, 'store']);
    Route::get('/spaces/{id}', [SpaceController::class, 'show']);
    Route::put('/spaces/{id}', [SpaceController::class, 'update']);
    Route::delete('/spaces/{id}', [SpaceController::class, 'destroy']);
    Route::put('/spaces/{id}/car-profile', [SpaceController::class, 'updateCarProfile']);
    Route::put('/spaces/{id}/home-profile', [SpaceController::class, 'updateHomeProfile']);
    Route::get('/spaces/{id}/members', [SpaceController::class, 'members']);
    Route::post('/spaces/{id}/members', [SpaceController::class, 'addMember']);
    Route::delete('/spaces/{id}/members/{userId}', [SpaceController::class, 'removeMember']);


    // Everything Grocery's Home shows -- this user's own lists plus any
    // list shared with them, regardless of whose space it lives in. See
    // ItemController::myGrocery.
    Route::get('/grocery/mine', [ItemController::class, 'myGrocery']);

    Route::apiResource('items', ItemController::class);
    Route::get('/items/{id}/members', [ItemController::class, 'members']);
    Route::post('/items/{id}/members', [ItemController::class, 'addMember']);
    Route::delete('/items/{id}/members/{userId}', [ItemController::class, 'removeMember']);
    Route::apiResource('recipes', RecipeController::class);
    Route::get('/ingredient-references', [IngredientReferenceController::class, 'index']);

    // Quick Add endpoint
    Route::post('/quick-add', [QuickAddController::class, 'parse']);
});

