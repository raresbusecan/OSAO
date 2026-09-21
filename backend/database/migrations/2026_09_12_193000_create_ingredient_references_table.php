<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A shared, global dictionary -- not per-user data, no user_id.
        // Two jobs: (1) auto-suggest a category the moment someone types
        // a recognized product name into Add Product, (2) later,
        // normalize recipe ingredient names against the grocery list
        // (e.g. "chicken breast" vs "chicken") instead of a brittle
        // exact string match. Seeded via IngredientReferenceSeeder, not
        // user-editable through the app.
        Schema::create('ingredient_references', function (Blueprint $table) {
            $table->id();

            $table->string('name', 100)->unique();
            $table->string('category', 30);

            // Other names/spellings that mean the same product, e.g.
            // "scallion" for "Green onion" -- lets a lookup match more
            // than the one canonical `name`.
            $table->json('aliases')->nullable();

            $table->timestamps();

            $table->index(['category']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ingredient_references');
    }
};
