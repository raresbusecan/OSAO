<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // One row per ingredient per recipe -- not a JSON blob on
        // `recipes` -- specifically so matching a recipe against the
        // grocery list (which ingredients are already on it, which are
        // missing) can be a real query/comparison instead of parsing a
        // packed string every time.
        Schema::create('recipe_ingredients', function (Blueprint $table) {
            $table->id();

            $table->foreignId('recipe_id')
                ->constrained('recipes')
                ->cascadeOnDelete();

            $table->string('name', 150);
            $table->string('quantity', 50)->nullable();
            $table->unsignedInteger('sort_order')->default(0);

            $table->timestamps();

            $table->index(['recipe_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('recipe_ingredients');
    }
};
