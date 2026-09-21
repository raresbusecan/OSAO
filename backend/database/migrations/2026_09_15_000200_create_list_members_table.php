<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Finer-grained than space_members -- a row here grants access to
     * ONE grocery list (an `items` row with type='grocery_list'), not
     * the whole space. The space's owner always sees every list in
     * their own space regardless of this table; this is only consulted
     * for anyone else (see ItemController::canAccessList).
     */
    public function up(): void
    {
        Schema::create('list_members', function (Blueprint $table) {
            $table->id();

            $table->foreignId('list_item_id')
                ->constrained('items')
                ->cascadeOnDelete();

            $table->foreignId('user_id')
                ->constrained('users')
                ->cascadeOnDelete();

            $table->timestamps();

            $table->unique(['list_item_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('list_members');
    }
};
