<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** false = the account's password is a random one the user never knew
 * (created via social login, or burned by the pre-takeover guard). The
 * app then offers "Setează o parolă" (POST /profile/password/set) instead
 * of the change-password form that asks for the current one. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('has_password')->default(true)->after('password');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('has_password');
        });
    }
};
