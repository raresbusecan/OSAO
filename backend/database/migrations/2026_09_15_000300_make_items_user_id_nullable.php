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
     *
     * SQLite (only ever hit by the test suite -- prod is MySQL, see
     * root CLAUDE.md) has no MODIFY/ALTER COLUMN at all; the sanctioned
     * workaround for a constraint-only change is rewriting the stored
     * schema text directly via writable_schema, which needs to run
     * outside a transaction.
     */
    public $withinTransaction = false;

    public function up(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            $this->rewriteSqliteNullability('"user_id" integer not null', '"user_id" integer');

            return;
        }

        DB::statement('ALTER TABLE items MODIFY user_id BIGINT UNSIGNED NULL');
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            $this->rewriteSqliteNullability('"user_id" integer', '"user_id" integer not null');

            return;
        }

        DB::statement('ALTER TABLE items MODIFY user_id BIGINT UNSIGNED NOT NULL');
    }

    private function rewriteSqliteNullability(string $from, string $to): void
    {
        DB::statement('PRAGMA writable_schema = 1');
        DB::statement("UPDATE sqlite_master SET sql = REPLACE(sql, '{$from}', '{$to}') WHERE type = 'table' AND name = 'items'");
        DB::statement('PRAGMA writable_schema = 0');
        // No DB::reconnect() here -- for the ":memory:" DB the test suite
        // uses, reconnecting opens a brand new (empty) in-memory
        // database and silently loses every table migrated so far.
        DB::statement("PRAGMA schema_version = " . (DB::selectOne('PRAGMA schema_version')->schema_version + 1));
    }
};
