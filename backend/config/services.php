<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    // Social login (App\Services\SocialAuth). Apple needs no secret: the
    // identity token's `aud` must be one of these bundle ids
    // (Expo Go = host.exp.Exponent; add the own build's id later).
    'apple' => [
        'client_ids' => array_values(array_filter(array_map('trim', explode(',', (string) env('APPLE_CLIENT_IDS', 'host.exp.Exponent'))))),
    ],

    // Google/Facebook: web OAuth via Socialite. Empty id/secret = provider
    // hidden (GET /api/auth/providers). The redirect URI registered with
    // the provider must be {APP_URL}/auth/{provider}/callback; SocialWebController
    // also sets it at runtime from config('app.url').
    'google' => [
        'client_id' => env('GOOGLE_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
        'redirect' => rtrim((string) env('APP_URL', 'http://localhost'), '/') . '/auth/google/callback',
    ],

    'facebook' => [
        'client_id' => env('FACEBOOK_CLIENT_ID'),
        'client_secret' => env('FACEBOOK_CLIENT_SECRET'),
        'redirect' => rtrim((string) env('APP_URL', 'http://localhost'), '/') . '/auth/facebook/callback',
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

];
