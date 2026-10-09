<?php

namespace App\Notifications;

use App\Support\AppLink;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Registration email verification (auth-emails spec, goal 5). Sent on
 * /register and on POST /email/verification-notification (resend). The
 * link goes through the backend's /open/verify-email page, which deep-
 * links into the app's verify-email screen, which calls POST
 * /email/verify {email, token}. Token: 64 random chars, stored sha256-
 * hashed in email_verification_tokens, 24h, single use.
 */
class VerifyEmailNotification extends Notification
{
    use Queueable;

    public const EXPIRE_HOURS = 24;

    public function __construct(
        public string $token,
        public string $email,
    ) {
        $this->locale('ro');
    }

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $url = AppLink::openUrl('verify-email', [
            'token' => $this->token,
            'email' => $this->email,
        ]);

        return (new MailMessage)
            ->subject('Confirmă-ți adresa de email pentru orgOS')
            ->greeting('Bun venit în orgOS!')
            ->line('Mai e un pas: confirmă că această adresă de email îți aparține.')
            ->action('Confirmă emailul', $url)
            ->line('Linkul expiră în ' . self::EXPIRE_HOURS . ' de ore. Poți cere oricând unul nou din aplicație.')
            ->line('Dacă nu tu ți-ai creat un cont orgOS, poți ignora acest email.')
            ->salutation('Echipa orgOS');
    }
}
