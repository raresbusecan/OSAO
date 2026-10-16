<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Symfony\Component\HttpFoundation\Response;

/**
 * Answers every API request in the app's language (2026-10-15). The app
 * sends its choice (Settings > Limbă, frontend lib/i18n) as
 * Accept-Language: "ro" or "en". Anything else -- no header, a browser's
 * "fr-FR,fr;q=0.9" -- falls back to the default (config app.locale = ro).
 * Validation messages come from lang/<locale>/validation.php; strings a
 * controller wraps in __() follow too.
 */
class SetLocale
{
    public const SUPPORTED = ['ro', 'en'];

    public function handle(Request $request, Closure $next): Response
    {
        $wanted = strtolower(substr((string) $request->header('Accept-Language', ''), 0, 2));
        App::setLocale(in_array($wanted, self::SUPPORTED, true) ? $wanted : config('app.locale'));

        return $next($request);
    }
}
