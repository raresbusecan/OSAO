<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Nullable, no default -- null means "we don't know yet"
            // (never logged in since this shipped), read as UTC
            // everywhere that falls back on it (see CalendarController).
            // Populated automatically by SyncUserTimezone middleware
            // from the frontend's own device-read X-Timezone header,
            // never asked for by hand.
            $table->string('timezone')->nullable()->after('email');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('timezone');
        });
    }
};
