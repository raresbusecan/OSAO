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
        // A space's kind (car/home/grocery/expenses/...), set once at
        // creation and never touched again -- unlike `name`, which the
        // user is free to rename to anything ("Expenses Rares"). Nullable
        // for every space created before this column existed; those keep
        // resolving via their profile row (Car/Home) or the old name/icon
        // heuristic (Grocery/Expenses) -- see spaceProfile.ts's
        // detectSpaceType, which now checks this column first.
        Schema::table('spaces', function (Blueprint $table) {
            $table->string('type', 50)->nullable()->after('icon');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('spaces', function (Blueprint $table) {
            $table->dropColumn('type');
        });
    }
};
