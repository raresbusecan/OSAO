<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Item;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class DashboardController extends Controller
{
    public function index()
    {
        $user = Auth::user();
        
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }
        
        $now = now();
        
        // Overdue items (due_at < now AND status != 'completed')
        $overdue = Item::where('user_id', $user->id)
            ->where('due_at', '<', $now)
            ->where('status', '!=', 'completed')
            ->orderBy('due_at', 'asc')
            ->get();
        
        // Today items (due_at is today AND status != 'completed')
        $today = Item::where('user_id', $user->id)
            ->whereDate('due_at', $now->toDateString())
            ->where('status', '!=', 'completed')
            ->orderBy('due_at', 'asc')
            ->get();
        
        // Upcoming items (due_at within the next 7 days, excluding today AND status != 'completed')
        $upcoming = Item::where('user_id', $user->id)
            ->where('due_at', '>', $now)
            ->where('due_at', '<=', $now->copy()->addDays(7))
            ->where('status', '!=', 'completed')
            ->orderBy('due_at', 'asc')
            ->get();
        
        // Payments (type = 'expense' AND due_at in the future AND status != 'completed')
        $payments = Item::where('user_id', $user->id)
            ->where('type', 'expense')
            ->where('due_at', '>', $now)
            ->where('status', '!=', 'completed')
            ->orderBy('due_at', 'asc')
            ->get();
        
        return response()->json([
            'today' => $today,
            'upcoming' => $upcoming,
            'overdue' => $overdue,
            'payments' => $payments
        ]);
    }
}