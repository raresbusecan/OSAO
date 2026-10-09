<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Whether the provider vouched for the email when this link was made.
 * Unverified links (Facebook, Google with email_verified=false) may only
 * ever CREATE an account, never attach to an existing one, and are
 * dropped once the user proves an address another way (reset password,
 * verify email, confirm email change) -- see SocialAuthService. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('social_accounts', function (Blueprint $table) {
            $table->boolean('email_verified')->default(false)->after('email');
        });
    }

    public function down(): void
    {
        Schema::table('social_accounts', function (Blueprint $table) {
            $table->dropColumn('email_verified');
        });
    }
};
