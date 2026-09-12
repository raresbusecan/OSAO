<?php

use App\Http\Controllers\Api\AuthController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\SpaceController;
use App\Http\Controllers\Api\ItemController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\QuickAddController;


Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'user']);

    Route::get('/dashboard', [DashboardController::class, 'index']);

    Route::get('/spaces', [SpaceController::class, 'index']);
    Route::post('/spaces', [SpaceController::class, 'store']);
    Route::get('/spaces/{id}', [SpaceController::class, 'show']);
    Route::put('/spaces/{id}', [SpaceController::class, 'update']);
    Route::delete('/spaces/{id}', [SpaceController::class, 'destroy']);
    Route::put('/spaces/{id}/car-profile', [SpaceController::class, 'updateCarProfile']);
    Route::put('/spaces/{id}/home-profile', [SpaceController::class, 'updateHomeProfile']);


    Route::apiResource('items', ItemController::class);
    
    // Quick Add endpoint
    Route::post('/quick-add', [QuickAddController::class, 'parse']);
});

