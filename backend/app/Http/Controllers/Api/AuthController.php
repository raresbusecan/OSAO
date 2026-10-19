<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\User;
use App\Notifications\ConfirmEmailChangeNotification;
use App\Notifications\VerifyEmailNotification;
use App\Services\SocialAuth\SocialAuthService;
use App\Support\AuthSession;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:50'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => $validated['password'],
        ]);

        $role = Role::where('slug', 'user')->first();

        if ($role) {
            $user->roles()->attach($role->id);
        }

        // Account confirmation (auth-emails spec, goal 5). Unverified
        // users are NOT blocked -- they get a token and use the app
        // normally; the frontend shows a "Confirmă-ți adresa" banner off
        // user.email_verified_at === null. A mail failure (SMTP down,
        // quota) must not fail the registration itself: the account
        // exists, and the user can resend from the banner.
        try {
            $this->sendVerificationEmail($user);
        } catch (\Throwable $e) {
            Log::warning('Verification email failed on register', ['user_id' => $user->id, 'error' => $e->getMessage()]);
        }

        $issued = AuthSession::issueToken($user);
        if (!$issued) {
            throw ValidationException::withMessages([
                'email' => ['Sesiunea de înregistrare a expirat. Autentifică-te din nou.'],
            ]);
        }
        [$user, $token] = $issued;

        return response()->json([
            'message' => 'Cont creat.',
            'user' => $user->fresh()->toAuthPayload(), // fresh(): include email_verified_at: null explicitly
            'token' => $token,
        ], 201);
    }

    public function login(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('email', $validated['email'])->first();

        if (!$user || !Hash::check($validated['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        $issued = AuthSession::issueToken($user);
        if (!$issued) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }
        [$user, $token] = $issued;

        return response()->json([
            'message' => 'Te-ai conectat.',
            'user' => $user->toAuthPayload(),
            'token' => $token,
        ]);
    }

    /** Sends a reset-password email if the address matches a real
     * account -- ALWAYS returns the same generic success message either
     * way, never revealing whether the email exists (see the frontend's
     * own copy, which is written to match: "if an account exists...").
     * Without this, the response itself would let anyone enumerate
     * which emails have accounts just by trying /forgot-password. */
    public function forgotPassword(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
        ]);

        // Mail is sent inside the request. An SMTP failure is only logged:
        // a 503 would reveal the account exists (only real users reach the
        // send). The token row the broker already wrote is dropped, so a
        // retry sends again instead of hitting the 60s "already sent"
        // throttle for a mail that never left.
        try {
            Password::sendResetLink($validated);
        } catch (\Throwable $e) {
            DB::table('password_reset_tokens')->where('email', $validated['email'])->delete();
            Log::warning('Password reset email failed', ['error' => $e->getMessage()]);
        }

        return response()->json([
            'message' => 'Dacă există un cont cu acest email, am trimis un link de resetare.',
        ]);
    }

    /** Consumes the token from ResetPasswordNotification's link -- valid
     * for 60 minutes (config/auth.php's passwords.users.expire), single
     * use (Password::reset deletes the row on success). Revokes every
     * existing Sanctum token for the account: a password reset almost
     * always means "I think someone else might have gotten in," so
     * every session it might have started should end too, not just the
     * one making this request. */
    public function resetPassword(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'token' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $status = Password::reset(
            $validated,
            function (User $user, string $password) {
                $user->forceFill(['password' => $password, 'has_password' => true])->save();
                $user->tokens()->delete();
                // The reset link proved the address: unverified social
                // links (Facebook / unverified Google) lose the account,
                // including any link that originally created the account.
                SocialAuthService::settleLinksAfterAddressProven($user, $user->email);

                event(new PasswordReset($user));
            }
        );

        if ($status !== Password::PASSWORD_RESET) {
            // Was __($status) -- Laravel's English "This password reset
            // token is invalid." (no ro lang file for it). An expired
            // token also comes back as INVALID_TOKEN, and an unknown
            // email (INVALID_USER) gets the same message so this
            // endpoint can't be used to probe which emails exist.
            throw ValidationException::withMessages([
                'email' => ['Linkul de resetare nu este valid sau a expirat. Cere unul nou.'],
            ]);
        }

        return response()->json([
            'message' => 'Parola a fost schimbată. Te poți autentifica din nou.',
        ]);
    }

    /** Task #9 subtask 2 -- the only field this endpoint ever touches is
     * `name`; email/password each get their own dedicated endpoint in a
     * later subtask instead of one combined "update profile" action, so
     * each stays independently validated/throttled/auditable. */
    public function updateName(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:50'],
        ]);

        $request->user()->update(['name' => $validated['name']]);

        return response()->json([
            'message' => 'Numele a fost actualizat.',
            'user' => $request->user()->fresh()->load('roles'),
        ]);
    }

    /** Task #9 subtask 3 -- changing a password while already logged in,
     * distinct from forgotPassword/resetPassword above (which exist for
     * the opposite case: no session, no proof of identity except the
     * email link). Here the current password IS the proof, so no email
     * round-trip. Ends every OTHER session/token on success (someone
     * changing their password on purpose is a reasonable moment to also
     * kick out any device they no longer recognize) but deliberately
     * keeps THIS request's own token alive -- unlike resetPassword's
     * "burn everything," a deliberate in-app change shouldn't log the
     * user themselves out mid-flow. */
    public function updatePassword(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $user = $request->user();

        if (!Hash::check($validated['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['Parola actuală este incorectă.'],
            ]);
        }

        $user->forceFill(['password' => $validated['password'], 'has_password' => true])->save();

        $currentTokenId = $request->user()->currentAccessToken()->id;
        $user->tokens()->where('id', '!=', $currentTokenId)->delete();

        return response()->json([
            'message' => 'Parola a fost schimbată.',
        ]);
    }

    /** POST /profile/password/set {password, password_confirmation} --
     * the FIRST password of an account that has none it knows
     * (has_password=false: created via social login, or burned by the
     * social pre-takeover guard). Refused once a password exists: changing
     * one goes through updatePassword, which asks for the current one.
     * updatePassword / requestEmailChange keep requiring current_password,
     * so a social-only user sets a password here first. */
    public function setPassword(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->has_password) {
            return response()->json([
                'message' => 'Contul are deja o parolă. Folosește „Schimbă parola”.',
                'error' => 'password_already_set',
            ], 409);
        }

        $validated = $request->validate([
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $user->forceFill(['password' => $validated['password'], 'has_password' => true])->save();

        return response()->json([
            'message' => 'Parola a fost setată.',
            'user' => $user->fresh()->toAuthPayload(),
        ]);
    }

    /** Task #9 subtask 4, step 1 of 2 -- starts an email change, doesn't
     * apply it yet. Requires the current password (same identity proof
     * as updatePassword) AND, per the user's own call when we discussed
     * this feature, a confirmation link sent to the NEW address --
     * unlike name/password, a wrong or attacker-supplied email here
     * would silently steal the account (whoever controls the new
     * address controls future password resets), so it needs proof the
     * user actually controls that inbox before it takes effect. One
     * pending request per user (upsert on user_id) -- a second request
     * replaces the first rather than leaving two live tokens around. */
    public function requestEmailChange(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'current_password' => ['required', 'string'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
        ]);

        $user = $request->user();

        if (!Hash::check($validated['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['Parola actuală este incorectă.'],
            ]);
        }

        $token = Str::random(64);

        DB::table('email_change_requests')->updateOrInsert(
            ['user_id' => $user->id],
            [
                'new_email' => $validated['email'],
                'token' => Hash::make($token),
                'created_at' => now(),
            ],
        );

        try {
            Notification::route('mail', $validated['email'])
                ->notify(new ConfirmEmailChangeNotification($token, $validated['email']));
        } catch (\Throwable $e) {
            // No email went out, so don't leave a pending change nobody
            // can confirm.
            DB::table('email_change_requests')->where('user_id', $user->id)->delete();
            Log::warning('Email change confirmation failed', ['user_id' => $user->id, 'error' => $e->getMessage()]);

            return response()->json([
                'message' => 'Nu am putut trimite emailul acum. Încearcă din nou mai târziu.',
            ], 503);
        }

        return response()->json([
            'message' => 'Verifică noua adresă de email pentru a confirma schimbarea.',
        ]);
    }

    /** Task #9 subtask 4, step 2 of 2 -- consumes the link from
     * ConfirmEmailChangeNotification. Deliberately NOT behind
     * auth:sanctum: this request comes from whatever browser opened the
     * email link, which usually isn't the same authenticated app
     * session that started the request (see the frontend's
     * confirm-email.tsx, reachable while logged out for exactly this
     * reason -- same shape as resetPassword). The token is the only
     * proof of identity here, same as a password reset. */
    public function confirmEmailChange(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'token' => ['required', 'string'],
        ]);

        $pending = DB::table('email_change_requests')->where('new_email', $validated['email'])->first();

        if (!$pending || !Hash::check($validated['token'], $pending->token)) {
            throw ValidationException::withMessages([
                'token' => ['Acest link nu este valid.'],
            ]);
        }

        // Carbon 3's diff is signed (negative for a past time) -- measure
        // from created_at forward, or the link never expires.
        if (Carbon::parse($pending->created_at)->diffInMinutes(now()) > 60) {
            DB::table('email_change_requests')->where('user_id', $pending->user_id)->delete();

            throw ValidationException::withMessages([
                'token' => ['Acest link a expirat.'],
            ]);
        }

        // Re-check uniqueness -- the address could have been taken by a
        // different registration in the time between the request and
        // this confirmation (the original validation only ran once, at
        // request time).
        if (User::where('email', $pending->new_email)->where('id', '!=', $pending->user_id)->exists()) {
            DB::table('email_change_requests')->where('user_id', $pending->user_id)->delete();

            throw ValidationException::withMessages([
                'email' => ['Acest email este deja folosit de alt cont.'],
            ]);
        }

        $user = User::find($pending->user_id);

        if (!$user) {
            throw ValidationException::withMessages([
                'token' => ['Acest link nu este valid.'],
            ]);
        }

        // Clicking the link just proved control of the new address, so
        // it counts as verified too -- and any pending registration-
        // verification token (for the OLD address) is now moot.
        $user->forceFill([
            'email' => $pending->new_email,
            'email_verified_at' => now(),
        ])->save();
        DB::table('email_change_requests')->where('user_id', $pending->user_id)->delete();
        DB::table('email_verification_tokens')->where('user_id', $pending->user_id)->delete();
        SocialAuthService::settleLinksAfterAddressProven($user, $user->email);

        return response()->json([
            'message' => 'Emailul a fost actualizat.',
            'email' => $user->email,
        ]);
    }

    /** POST /email/verify {email, token, password, password_confirmation} -- consumes the link from
     * VerifyEmailNotification (via /open/verify-email -> the app's
     * verify-email screen). Public (the link may be opened while logged
     * out, same as confirm-email/reset-password), throttled with them.
     * Token: sha256-hashed in email_verification_tokens, 24h, single use
     * (row deleted on success). Wrong email, wrong token, and an already-
     * used token all get the same "not valid" message -- an already-
     * verified account answers that way too, so this can't be used to
     * probe which emails exist/are verified. */
    public function verifyEmail(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'token' => ['required', 'string'],
        ]);

        return DB::transaction(function () use ($request, $validated) {
            $user = User::where('email', $validated['email'])->lockForUpdate()->first();
            $pending = $user
                ? DB::table('email_verification_tokens')->where('user_id', $user->id)->lockForUpdate()->first()
                : null;

            if (!$pending || !hash_equals($pending->token, hash('sha256', $validated['token']))) {
                throw ValidationException::withMessages([
                    'token' => ['Acest link nu este valid sau a fost deja folosit.'],
                ]);
            }

            if (now()->subHours(VerifyEmailNotification::EXPIRE_HOURS)->greaterThan($pending->created_at)) {
                DB::table('email_verification_tokens')->where('user_id', $user->id)->delete();

                throw ValidationException::withMessages([
                    'token' => ['Acest link a expirat. Cere unul nou din aplicație.'],
                ]);
            }

            // Mailbox proof must establish credentials chosen by the mailbox owner,
            // rather than preserving a password/session set by a pre-registrant.
            $credentials = $request->validate(['password' => ['required', 'string', 'min:8', 'confirmed']]);
            $user->forceFill(['email_verified_at' => now(), 'password' => $credentials['password'], 'has_password' => true])->save();
            $user->tokens()->delete();
            DB::table('email_change_requests')->where('user_id', $user->id)->delete();
            DB::table('password_reset_tokens')->where('email', $user->email)->delete();
            DB::table('email_verification_tokens')->where('user_id', $user->id)->delete();
            SocialAuthService::settleLinksAfterAddressProven($user, $user->email);

            return response()->json([
                'message' => 'Adresa de email a fost confirmată.',
                'email_verified_at' => $user->email_verified_at,
            ]);
        });
    }

    /** POST /email/verification-notification -- "Retrimite emailul" from
     * the unverified banner. Auth'd, throttled per user by the
     * 'verification-notification' limiter (1/min + 6/h, Romanian 429
     * with retry_after). A resend replaces the previous token. */
    public function resendVerification(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->email_verified_at) {
            return response()->json([
                'message' => 'Adresa de email este deja confirmată.',
                'already_verified' => true,
            ]);
        }

        try {
            $this->sendVerificationEmail($user);
        } catch (\Throwable $e) {
            Log::warning('Verification email resend failed', ['user_id' => $user->id, 'error' => $e->getMessage()]);

            return response()->json([
                'message' => 'Nu am putut trimite emailul acum. Încearcă din nou mai târziu.',
            ], 503);
        }

        return response()->json([
            'message' => 'Ți-am trimis un nou email de confirmare.',
            'already_verified' => false,
        ]);
    }

    /** New 64-char token (replacing any pending one), stored sha256-
     * hashed, emailed in plain text inside the /open/verify-email link. */
    private function sendVerificationEmail(User $user): void
    {
        $token = Str::random(64);

        DB::table('email_verification_tokens')->updateOrInsert(
            ['user_id' => $user->id],
            ['token' => hash('sha256', $token), 'created_at' => now()],
        );

        $user->notify(new VerifyEmailNotification($token, $user->email));
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json([
            'message' => 'Te-ai deconectat.',
        ]);
    }

    public function user(Request $request): JsonResponse
    {
        return response()->json([
            'user' => $request->user()->toAuthPayload(),
        ]);
    }

    /** Tour keys the app knows (frontend lib/tours.ts TourKey). */
    private const TOUR_KEYS = ['home', 'spaces', 'budget', 'calendar', 'space_car', 'space_home', 'space_grocery', 'space_expenses'];

    // PUT /user/tours/{key} -- the user finished ("done") or skipped a
    // first-use tour. Merged into users.tours[key] = {status, v, at}.
    public function markTour(Request $request, string $key): JsonResponse
    {
        if (!in_array($key, self::TOUR_KEYS, true)) {
            return response()->json(['message' => 'Ghid necunoscut.'], 404);
        }

        $validated = $request->validate([
            'status' => 'required|in:done,skipped',
            'version' => 'required|integer|min:1|max:100',
        ]);

        $user = $request->user();
        $tours = is_array($user->tours) ? $user->tours : [];
        $tours[$key] = [
            'status' => $validated['status'],
            'v' => (int) $validated['version'],
            'at' => now()->toIso8601String(),
        ];
        $user->tours = $tours;
        $user->save();

        return response()->json(['tours' => $tours]);
    }

    // DELETE /user/tours -- "Arată-le din nou pe toate": every tour shows
    // again on its screen's next visit.
    public function resetTours(Request $request): JsonResponse
    {
        $user = $request->user();
        $user->tours = null;
        $user->save();

        return response()->json(['tours' => new \stdClass()]);
    }
}

