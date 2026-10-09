<?php

namespace App\Services\SocialAuth;

/**
 * A social-login failure with a stable machine code (sent to the app as
 * `error`, both in JSON bodies and in the ?error= of the web-flow deep
 * link) and a Romanian message.
 */
class SocialAuthException extends \RuntimeException
{
    public const MESSAGES = [
        'invalid_token' => 'Autentificarea nu a putut fi verificată. Încearcă din nou.',
        'provider_unavailable' => 'Serviciul de autentificare nu răspunde acum. Încearcă din nou mai târziu.',
        'email_missing' => 'Nu am primit adresa de email de la furnizor. Permite accesul la email și încearcă din nou.',
        'email_unverified_exists' => 'Există deja un cont cu acest email. Intră cu emailul și parola.',
        'cancelled' => 'Autentificarea a fost anulată.',
        'invalid_state' => 'Sesiunea de autentificare a expirat. Încearcă din nou.',
        'provider_error' => 'Autentificarea cu acest furnizor a eșuat. Încearcă din nou.',
        'provider_disabled' => 'Această metodă de autentificare nu este disponibilă momentan.',
        'invalid_nonce' => 'Sesiunea de autentificare cu Apple a expirat. Încearcă din nou.',
        'invalid_code' => 'Codul de autentificare nu este valid sau a expirat. Încearcă din nou.',
    ];

    public function __construct(public readonly string $errorCode, public readonly int $status = 422)
    {
        parent::__construct(self::MESSAGES[$errorCode] ?? self::MESSAGES['provider_error']);
    }

    public static function invalidToken(): self
    {
        return new self('invalid_token', 401);
    }

    public static function providerUnavailable(): self
    {
        return new self('provider_unavailable', 503);
    }

    public function toResponse(): \Illuminate\Http\JsonResponse
    {
        return response()->json(['message' => $this->getMessage(), 'error' => $this->errorCode], $this->status);
    }
}
