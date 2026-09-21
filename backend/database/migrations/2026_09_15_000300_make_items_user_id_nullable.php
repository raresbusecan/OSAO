<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Lets a grocery_item survive its creator being removed from the
     * list without a dangling reference -- see
     * ItemController::removeMember's "remove just the person, keep
     * their items" path, which nulls this out instead of deleting the
     * item. Raw SQL rather than Schema::table(...)->change() -- that
     * needs doctrine/dbal, which this project doesn't have installed;
     * MODIFY doesn't touch the existing FK (still ON DELETE CASCADE for
     * a real user deletion), only whether NULL is allowed.
     */
    public function up(): void
    {
        DB::statement('ALTER TABLE items MODIFY user_id BIGINT UNSIGNED NULL');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE items MODIFY user_id BIGINT UNSIGNED NOT NULL');
    }
};
