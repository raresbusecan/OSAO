<?php

namespace App\Http\Controllers;

use App\Support\AppLink;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * GET /open/{screen} -- the landing page every auth-email link points at
 * (see App\Support\AppLink). No auth (it's opened from a mail client),
 * throttled ('open-link'), screen allow-listed by the route constraint.
 * Returns a tiny Romanian HTML page that immediately tries the app deep
 * link and also shows a big "Deschide în orgOS" button, for browsers that
 * block the automatic custom-scheme redirect (iOS Safari usually asks
 * first) or when Expo Go isn't running yet.
 */
class OpenAppController extends Controller
{
    public function __invoke(Request $request, string $screen): Response
    {
        $params = [];
        foreach (AppLink::PARAMS as $key) {
            $value = $request->query($key);
            // Real tokens are 64 chars, emails max 255 -- anything longer
            // or non-string (token[]=...) is junk; drop it rather than 500.
            if (is_string($value) && strlen($value) <= 255) {
                $params[$key] = $value;
            }
        }

        $deepLink = AppLink::deepLink($screen, $params);

        $titles = [
            'reset-password' => 'Resetează parola',
            'verify-email' => 'Confirmă adresa de email',
            'confirm-email' => 'Confirmă noua adresă de email',
        ];

        return response()
            ->view('open-app', [
                'deepLink' => $deepLink,
                'title' => $titles[$screen],
            ])
            ->header('Cache-Control', 'no-store')
            ->header('Referrer-Policy', 'no-referrer')
            ->header('X-Robots-Tag', 'noindex');
    }
}
