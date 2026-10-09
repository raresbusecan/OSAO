<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // The Acasă screen's card arrangement (which cards, in what
            // order, size, color and per-card settings) -- one JSON list
            // per user so it's the same on the phone and on the web.
            // Null = never customized: the app shows its default layout.
            $table->json('dashboard_layout')->nullable()->after('timezone');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('dashboard_layout');
        });
    }
};
