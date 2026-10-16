<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** Whether this social sign-in CREATED the user (vs. being linked to an
 * existing account). When the user later proves the link's own address
 * (verify email / reset password / confirm email change), an unverified
 * link that created the account is promoted to email_verified=true instead
 * of being dropped -- otherwise a Facebook-created user who verifies their
 * email loses Facebook sign-in for good. See
 * SocialAuthService::settleLinksAfterAddressProven. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('social_accounts', function (Blueprint $table) {
            $table->boolean('created_account')->default(false)->after('email_verified');
        });

        // Backfill: a link written within a few seconds of its user (same
        // resolve transaction) is the one that created the account.
        DB::table('social_accounts')
            ->join('users', 'users.id', '=', 'social_accounts.user_id')
            ->select('social_accounts.id', 'social_accounts.created_at as link_at', 'users.created_at as user_at')
            ->orderBy('social_accounts.id')
            ->get()
            ->each(function ($row) {
                if ($row->link_at && $row->user_at && abs(strtotime($row->link_at) - strtotime($row->user_at)) <= 5) {
                    DB::table('social_accounts')->where('id', $row->id)->update(['created_account' => true]);
                }
            });
    }

    public function down(): void
    {
        Schema::table('social_accounts', function (Blueprint $table) {
            $table->dropColumn('created_account');
        });
    }
};
