<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Obiectiv de economii, interactive (2026-11): the rhythm the user
        // picked on the Economii card (day / week / month), the amount per
        // period at the time, when it started (week periods count from that
        // day) and when 3 confirmed periods in a row turned the reminders on.
        Schema::table('savings_goals', function (Blueprint $table) {
            $table->string('cadence', 10)->nullable()->after('target_date');
            $table->decimal('cadence_amount', 12, 2)->nullable()->after('cadence');
            $table->date('cadence_since')->nullable()->after('cadence_amount');
            $table->date('reminders_since')->nullable()->after('cadence_since');
        });

        // One row per "Am pus deoparte" tap: already added to Economii, so
        // the monthly rollover takes them out of that month's leftover.
        Schema::create('savings_deposits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->decimal('amount', 12, 2);
            $table->string('cadence', 10);
            // Local (user tz) day of the tap and the start of its period.
            $table->date('deposited_on');
            $table->date('period_start');
            $table->timestamps();
            $table->index(['user_id', 'deposited_on']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('savings_deposits');
        Schema::table('savings_goals', function (Blueprint $table) {
            $table->dropColumn(['cadence', 'cadence_amount', 'cadence_since', 'reminders_since']);
        });
    }
};
