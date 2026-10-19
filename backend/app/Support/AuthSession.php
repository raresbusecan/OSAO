<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Support\Facades\DB;

class AuthSession
{
    public static function fingerprint(User $user): string
    {
        return hash_hmac('sha256', json_encode([
            $user->id,
            $user->getRawOriginal('password'),
            $user->getRawOriginal('email'),
            $user->getRawOriginal('email_verified_at'),
        ], JSON_THROW_ON_ERROR), (string) config('app.key'));
    }

    /** Issue only for the credentials that authenticated this request.
     * The account lock serializes issuance with mailbox proof and revocation.
     *
     * @return array{0: User, 1: string}|null
     */
    public static function issueToken(User $snapshot): ?array
    {
        return DB::transaction(function () use ($snapshot) {
            $current = User::whereKey($snapshot->id)->lockForUpdate()->first();
            if (! $current || ! hash_equals(self::fingerprint($snapshot), self::fingerprint($current))) {
                return null;
            }

            return [$current, $current->createToken('mobile-app')->plainTextToken];
        });
    }
}
