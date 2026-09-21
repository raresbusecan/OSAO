<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A space always has exactly one owner (spaces.user_id, unchanged) --
     * this table adds everyone *else* who's allowed into it. A row here
     * means "this user can see and edit this space's items", nothing
     * more (renaming/deleting the space, or managing who else is a
     * member, stays owner-only -- see SpaceController).
     */
    public function up(): void
    {
        Schema::create('space_members', function (Blueprint $table) {
            $table->id();

            $table->foreignId('space_id')
                ->constrained('spaces')
                ->cascadeOnDelete();

            $table->foreignId('user_id')
                ->constrained('users')
                ->cascadeOnDelete();

            $table->timestamps();

            $table->unique(['space_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('space_members');
    }
};
