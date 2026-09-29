<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * items.space_id was nullOnDelete -- deleting a space left its items
 * behind forever with space_id=null: invisible in every screen (each
 * space's own load query filters by space_id), but still summed into
 * Budget/Dashboard spend totals with no way to ever see or remove
 * them again (confirmed live: a deleted space's grocery_trip spend
 * kept counting in Budget after deletion). car_profiles/home_profiles/
 * space_members already correctly cascadeOnDelete -- items was the
 * one inconsistent relation. Deleting a space now deletes everything
 * that lived in it too, matching what "delete this space" already
 * means everywhere else in the schema.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropForeign(['space_id']);
        });

        Schema::table('items', function (Blueprint $table) {
            $table->foreign('space_id')
                ->references('id')->on('spaces')
                ->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropForeign(['space_id']);
        });

        Schema::table('items', function (Blueprint $table) {
            $table->foreign('space_id')
                ->references('id')->on('spaces')
                ->nullOnDelete();
        });
    }
};
