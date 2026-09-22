<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\User;
use App\Notifications\ConfirmEmailChangeNotification;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
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

        $token = $user->createToken('mobile-app')->plainTextToken;

        return response()->json([
            'message' => 'Registration successful.',
            'user' => $user->load('roles'),
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

        $token = $user->createToken('mobile-app')->plainTextToken;

        return response()->json([
            'message' => 'Login successful.',
            'user' => $user->load('roles'),
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

        Password::sendResetLink($validated);

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
                $user->forceFill(['password' => $password])->save();
                $user->tokens()->delete();

                event(new PasswordReset($user));
            }
        );

        if ($status !== Password::PASSWORD_RESET) {
            throw ValidationException::withMessages([
                'email' => [__($status)],
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

        $user->forceFill(['password' => $validated['password']])->save();

        $currentTokenId = $request->user()->currentAccessToken()->id;
        $user->tokens()->where('id', '!=', $currentTokenId)->delete();

        return response()->json([
            'message' => 'Parola a fost schimbată.',
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

        Notification::route('mail', $validated['email'])
            ->notify(new ConfirmEmailChangeNotification($token, $validated['email']));

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

        if (now()->diffInMinutes($pending->created_at) > 60) {
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

        $user->forceFill(['email' => $pending->new_email])->save();
        DB::table('email_change_requests')->where('user_id', $pending->user_id)->delete();

        return response()->json([
            'message' => 'Emailul a fost actualizat.',
            'email' => $user->email,
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json([
            'message' => 'Logout successful.',
        ]);
    }

    public function user(Request $request): JsonResponse
    {
        return response()->json([
            'user' => $request->user()->load('roles'),
        ]);
    }
}

