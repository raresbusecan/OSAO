<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The car's odometer as the user typed it on the Mașină top card
 * (PUT /spaces/{id}/car-profile/odometer). null = never set by hand: the
 * current odometer is then only the highest reading logged on a fuel /
 * service / expense entry. Both readers take max(manual, logged).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('car_profiles', function (Blueprint $table) {
            $table->unsignedInteger('odometer')->nullable()->after('tank_capacity');
            $table->timestamp('odometer_updated_at')->nullable()->after('odometer');
        });
    }

    public function down(): void
    {
        Schema::table('car_profiles', function (Blueprint $table) {
            $table->dropColumn(['odometer', 'odometer_updated_at']);
        });
    }
};
