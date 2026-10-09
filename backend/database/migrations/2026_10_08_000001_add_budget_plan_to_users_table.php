<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // "Buget din venit" (2026-10): the fixed monthly NET income the
            // Buget tab splits into 5 jars, and the split itself
            // ({"needs","guilt_free","third","short_term","long_term"},
            // integer percents summing to 100 -- validated in
            // BudgetController::savePlan). Both null = no plan yet.
            $table->decimal('monthly_income', 12, 2)->nullable()->after('dashboard_layout');
            $table->json('budget_split')->nullable()->after('monthly_income');
            // Set once, on the first PUT /budget/plan -- months before it
            // keep the old savings-rollover formula (applyMonthlySavings).
            $table->timestamp('budget_plan_set_at')->nullable()->after('budget_split');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['monthly_income', 'budget_split', 'budget_plan_set_at']);
        });
    }
};
