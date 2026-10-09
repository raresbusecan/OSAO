<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            // "Bani fără vină": a spending/recurring record paid from the
            // guilt-free jar instead of its space's budget -- left out of
            // every per-space spent/limit/avg (BudgetController) and counted
            // against the guilt-free share instead. Only allowed on
            // Item::guiltFreeTypes() (ItemController enforces it).
            $table->boolean('guilt_free')->default(false)->after('amount');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn('guilt_free');
        });
    }
};
