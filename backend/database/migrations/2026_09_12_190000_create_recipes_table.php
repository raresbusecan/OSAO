<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('recipes', function (Blueprint $table) {
            $table->id();

            // Null = base library recipe (seeded, shared by everyone).
            // Set = a personal recipe added by that user. Cascades so a
            // deleted user's own recipes go with them, but never touches
            // library recipes (they have no user_id to cascade from).
            $table->foreignId('user_id')
                ->nullable()
                ->constrained('users')
                ->cascadeOnDelete();

            $table->string('title', 255);
            $table->string('image_key', 100)->nullable();
            $table->unsignedInteger('time_minutes')->nullable();
            $table->string('difficulty', 20)->nullable();

            // Ordered list of instruction strings.
            $table->json('steps')->nullable();

            // Non-exclusive filter labels (e.g. ["quick","vegetarian"]) --
            // see the app's own reasoning against a table per recipe type:
            // a recipe can carry several of these at once.
            $table->json('tags')->nullable();

            $table->timestamps();

            $table->index(['user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('recipes');
    }
};
