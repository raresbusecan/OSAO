<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * First-use tours (frontend lib/tours.ts): which guide each user has
     * seen, as {"<key>": {"status": "done"|"skipped", "v": int, "at": ISO}}.
     * null = nothing seen yet. Written by PUT /user/tours/{key}, cleared by
     * DELETE /user/tours (AuthController).
     *
     * Every EXISTING account is marked as having seen the Acasă tour --
     * they already know the screen, and the tour auto-starts only for
     * accounts created from now on (product decision, 2026-10-08).
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->json('tours')->nullable()->after('dashboard_layout');
        });

        DB::table('users')->update([
            'tours' => json_encode(['home' => ['status' => 'done', 'v' => 1, 'at' => now()->toIso8601String()]]),
        ]);
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('tours');
        });
    }
};
