<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('savings_goals', function (Blueprint $table) {
            // Obiectiv de economii (2026-11): what the money is for
            // ("Vacanță"), optional. null = just "Economii".
            $table->string('name', 80)->nullable()->after('user_id');
        });
    }

    public function down(): void
    {
        Schema::table('savings_goals', function (Blueprint $table) {
            $table->dropColumn('name');
        });
    }
};
