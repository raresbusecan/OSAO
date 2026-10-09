<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A provider identity (Apple/Google/Facebook) linked to a user -- see
 * App\Services\SocialAuth\SocialAuthService. */
class SocialAccount extends Model
{
    public const PROVIDERS = ['apple', 'google', 'facebook'];

    /** Providers that go through the Socialite web flow
     * (/auth/{provider}/redirect -> callback -> exchange code). Apple
     * signs in natively instead (POST /api/auth/apple). */
    public const WEB_PROVIDERS = ['google', 'facebook'];

    protected $fillable = ['user_id', 'provider', 'provider_user_id', 'email', 'email_verified'];

    protected $casts = ['email_verified' => 'boolean'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
