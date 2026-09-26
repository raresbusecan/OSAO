<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Keeps `users.timezone` in sync with whatever IANA zone the frontend's
 * device actually reports (Intl.DateTimeFormat().resolvedOptions().timeZone,
 * sent as the X-Timezone header on every request -- see frontend/lib/api.ts).
 * Never asked for by hand, never a Settings field: this is the one place
 * it's collected, and CalendarController is the one place it's read back,
 * per the design decision to auto-collect-then-persist rather than a
 * stateless per-request header alone (so it's still there for a future
 * non-request context, e.g. a notification job) and rather than a manual
 * Settings toggle (so it self-corrects if the user travels, no stale value
 * to remember to update by hand).
 *
 * A no-op whenever the header is missing (a client that hasn't been
 * updated yet, or a guest request) or already matches what's stored --
 * only ever writes when it's genuinely new/changed.
 */
class SyncUserTimezone
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $tz = $request->header('X-Timezone');

        if ($user && $tz && $tz !== $user->timezone && in_array($tz, timezone_identifiers_list(), true)) {
            $user->update(['timezone' => $tz]);
        }

        return $next($request);
    }
}
