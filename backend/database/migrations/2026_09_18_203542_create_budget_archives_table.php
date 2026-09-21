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
        Schema::create('budget_archives', function (Blueprint $table) {
            $table->id();

            $table->foreignId('user_id')
                ->constrained('users')
                ->cascadeOnDelete();

            // First of the calendar month this row is a snapshot of --
            // never the in-progress current month, only completed ones.
            $table->date('month');
            $table->string('category');

            // The budget limit and Item due_at aggregation ACTIVE AT THE
            // TIME this archive row was written, not recomputed live --
            // this is the whole point of archiving: BudgetCategory has
            // no history of its own, so changing a limit today would
            // otherwise silently rewrite what every past month "would
            // have" looked like. null budget_limit/diff means the space
            // had no limit set that month (just real spend, still worth
            // keeping).
            $table->decimal('budget_limit', 10, 2)->nullable();
            $table->decimal('spent', 10, 2);
            $table->decimal('diff', 10, 2)->nullable();

            $table->timestamps();

            $table->unique(['user_id', 'month', 'category']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('budget_archives');
    }
};
