<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // "Buget simplu" (2026-11): the fixed amount put aside each month
            // (Venit -> Pui deoparte -> De cheltuit = venit - pus deoparte).
            // null = 0. Replaces the 5-jar budget_split, which stays in place
            // untouched and is no longer read (BudgetController::plan()).
            $table->decimal('monthly_set_aside', 12, 2)->nullable()->after('budget_split');
        });

        $this->backfill();
    }

    // Backfill: users who had a jar plan keep the same monthly
    // contribution to Economii -- the short-term jar was the only one that
    // ever fed it. The long-term jar (a target nothing tracked) is not
    // added. Only rows still null are touched, so re-running is a no-op.
    // JSON decoded in PHP so this runs the same on MySQL and the tests'
    // sqlite. Public so BudgetSimplePlanTest can run it on its own.
    public function backfill(): void
    {
        DB::table('users')
            ->whereNotNull('monthly_income')
            ->whereNotNull('budget_split')
            ->whereNull('monthly_set_aside')
            ->select(['id', 'monthly_income', 'budget_split'])
            ->chunkById(200, function ($users) {
                foreach ($users as $user) {
                    $split = json_decode((string) $user->budget_split, true);
                    $percent = is_array($split) ? (float) ($split['short_term'] ?? 0) : 0.0;
                    $income = (float) $user->monthly_income;
                    $aside = min($income, max(0.0, round($income * $percent / 100, 2)));
                    DB::table('users')->where('id', $user->id)->update(['monthly_set_aside' => $aside]);
                }
            });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('monthly_set_aside');
        });
    }
};
