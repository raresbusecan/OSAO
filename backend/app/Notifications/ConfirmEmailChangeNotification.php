<?php

namespace App\Notifications;

use App\Support\AppLink;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class ConfirmEmailChangeNotification extends Notification
{
    use Queueable;

    /**
     * Sent to the NEW address, not the account's current one -- proves
     * the user actually controls it before the swap takes effect. Same
     * link shape as ResetPasswordNotification: an HTTPS link to this
     * backend's /open/confirm-email page, which deep-links into the
     * app's confirm-email screen (see App\Support\AppLink).
     */
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
        $url = AppLink::openUrl('confirm-email', [
            'token' => $this->token,
            'email' => $this->email,
        ]);

        return (new MailMessage)
            ->subject('Confirmă noua adresă de email pentru orgOS')
            ->greeting('Salut!')
            ->line('Cineva (probabil tu) a cerut schimbarea adresei de email a contului orgOS către această adresă.')
            ->action('Confirmă email-ul', $url)
            ->line('Acest link expiră în 60 de minute.')
            ->line('Dacă nu tu ai cerut asta, poți ignora acest email -- adresa curentă a contului rămâne neschimbată.')
            ->salutation('Echipa orgOS');
    }

    public function toArray(object $notifiable): array
    {
        return [
            //
        ];
    }
}
