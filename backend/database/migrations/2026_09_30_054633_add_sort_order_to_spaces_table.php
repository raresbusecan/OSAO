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
        Schema::table('spaces', function (Blueprint $table) {
            // Null until a user actually drags a card -- SpaceController::index()
            // falls back to created_at ordering (the pre-existing behavior) for
            // any space that's never been manually reordered. A global column,
            // not per-user: space_members only tracks INVITED members (the
            // owner has no row there), so there's no existing per-user
            // preference table this could hang off of without inventing one.
            $table->integer('sort_order')->nullable()->after('type');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('spaces', function (Blueprint $table) {
            $table->dropColumn('sort_order');
        });
    }
};
