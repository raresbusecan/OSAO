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
        Schema::table('items', function (Blueprint $table) {
            // Null until a user actually drags a row -- every existing
            // read path keeps falling back to whatever it already sorted
            // by (due_at, created_at, ...) for any item never manually
            // reordered. Scoped implicitly by whichever "list" a reorder
            // request's own id array represents (one space+type, or one
            // grocery list) -- the column itself carries no list-id, same
            // as ItemController::reorder() never needs one: it only ever
            // touches exactly the ids the client sends, each already
            // individually access-checked via canAccessItem().
            $table->integer('sort_order')->nullable()->after('metadata');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn('sort_order');
        });
    }
};
