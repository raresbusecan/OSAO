<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('savings_goals', function (Blueprint $table) {
            // First of the last calendar month whose (budget - spent)
            // across all spaces has already been folded into
            // current_amount -- null means "never applied yet", so the
            // first index() call after a goal is created just sets this
            // baseline instead of back-dating a bonus for months before
            // the goal existed.
            $table->date('last_applied_month')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('savings_goals', function (Blueprint $table) {
            $table->dropColumn('last_applied_month');
        });
    }
};
