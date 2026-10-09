<?php

namespace App\Support;

/**
 * Builds the two halves of every auth-email link (auth-emails spec,
 * goal 2):
 *
 *  - openUrl(): the HTTPS link that actually goes in the email --
 *    "{APP_URL}/open/{screen}?token=..&email=..". Mail clients only make
 *    http(s) links clickable, so the email can't carry exp:// / orgos://.
 *    Built from config('app.url') explicitly (NOT url()/route(), which
 *    would use the current request's host/scheme -- behind a Cloudflare
 *    tunnel that's http://127.0.0.1:8000).
 *  - deepLink(): what that page then redirects to --
 *    "{APP_DEEP_LINK_BASE}/{screen}?token=..&email=..", e.g.
 *    exp://abc.trycloudflare.com/--/reset-password?... in Expo Go, or
 *    orgos://reset-password?... in an own build.
 *
 * Only the allow-listed screens can ever be produced, and the base always
 * comes from config, never from the request -- so /open/ can't be used as
 * an open redirect.
 */
class AppLink
{
    public const SCREENS = ['reset-password', 'verify-email', 'confirm-email'];

    /** Query params /open/ forwards to the app; anything else is dropped. */
    public const PARAMS = ['token', 'email'];

    public static function openUrl(string $screen, array $params): string
    {
        self::assertScreen($screen);

        return rtrim((string) config('app.url'), '/') . '/open/' . $screen . self::query($params);
    }

    public static function deepLink(string $screen, array $params): string
    {
        self::assertScreen($screen);

        $base = (string) config('app.deep_link_base');
        // "orgos://" must stay "orgos://screen" (not "orgos:/screen");
        // "exp://host/--" needs the slash added.
        $separator = str_ends_with($base, '/') ? '' : '/';

        return $base . $separator . $screen . self::query($params);
    }

    private static function query(array $params): string
    {
        $params = array_filter(
            array_intersect_key($params, array_flip(self::PARAMS)),
            fn ($v) => is_string($v) && $v !== '',
        );

        return $params ? '?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986) : '';
    }

    private static function assertScreen(string $screen): void
    {
        if (!in_array($screen, self::SCREENS, true)) {
            throw new \InvalidArgumentException("Unknown app screen [$screen].");
        }
    }
}
