<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class ConfirmEmailChangeNotification extends Notification
{
    use Queueable;

    /**
     * Sent to the NEW address, not the account's current one -- proves
     * the user actually controls it before the swap takes effect. Same
     * FRONTEND_URL + query-param link shape as ResetPasswordNotification
     * (see that class for why: no named route exists on this API-only
     * backend, the real screen is the Expo app's web build).
     */
    public function __construct(
        public string $token,
        public string $email,
    ) {
        //
    }

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $url = rtrim(config('app.frontend_url'), '/')
            . '/confirm-email?token=' . urlencode($this->token)
            . '&email=' . urlencode($this->email);

        return (new MailMessage)
            ->subject('Confirmă noua adresă de email pentru orgOS')
            ->line('Cineva (probabil tu) a cerut schimbarea adresei de email a contului orgOS către această adresă.')
            ->action('Confirmă email-ul', $url)
            ->line('Acest link expiră în 60 de minute.')
            ->line('Dacă nu tu ai cerut asta, poți ignora acest email -- adresa curentă a contului rămâne neschimbată.');
    }

    public function toArray(object $notifiable): array
    {
        return [
            //
        ];
    }
}
