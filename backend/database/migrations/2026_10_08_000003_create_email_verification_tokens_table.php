<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Registration email verification (auth-emails spec, goal 5).
     *
     * One pending token per user (user_id is the primary key, same
     * "upsert by owner" shape as email_change_requests) -- a resend
     * replaces the previous token instead of stacking live ones. The
     * token is stored as a sha256 hash, never in plain text; it's a
     * 64-char random string, so a fast hash is enough (no brute-force
     * concern like a password). Expiry (24h) is checked against
     * created_at in AuthController::verifyEmail; the row is deleted on
     * use, so a token is single-use.
     *
     * Also ADDS users.email_verified_at -- the original users migration
     * in this project never had it (only User's 'datetime' cast did,
     * left over from the Laravel skeleton) -- and backfills it for every
     * EXISTING account: the
     * verification flow is new, and accounts that predate it shouldn't
     * be nagged with the "Confirmă-ți adresa de email" banner.
     */
    public function up(): void
    {
        Schema::create('email_verification_tokens', function (Blueprint $table) {
            $table->foreignId('user_id')->primary()->constrained()->cascadeOnDelete();
            $table->string('token', 64);
            $table->timestamp('created_at')->nullable();
        });

        if (!Schema::hasColumn('users', 'email_verified_at')) {
            Schema::table('users', function (Blueprint $table) {
                $table->timestamp('email_verified_at')->nullable()->after('email');
            });
        }

        DB::table('users')->whereNull('email_verified_at')->update(['email_verified_at' => now()]);
    }

    public function down(): void
    {
        Schema::dropIfExists('email_verification_tokens');

        if (Schema::hasColumn('users', 'email_verified_at')) {
            Schema::table('users', function (Blueprint $table) {
                $table->dropColumn('email_verified_at');
            });
        }
    }
};
