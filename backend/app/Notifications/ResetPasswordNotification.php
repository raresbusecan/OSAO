<?php

namespace App\Notifications;

use App\Support\AppLink;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class ResetPasswordNotification extends Notification
{
    use Queueable;

    /**
     * Laravel's own default ResetPassword notification builds its link
     * via route('password.reset', ...), which doesn't exist here -- this
     * is an API-only backend, the actual reset SCREEN lives in the Expo
     * app (app/(auth)/reset-password.tsx). The email carries an HTTPS
     * link to this backend's /open/reset-password page, which deep-links
     * into the app (exp://<tunnel>/--/reset-password?... in Expo Go) --
     * see App\Support\AppLink and the auth-emails spec.
     */
    public function __construct(
        public string $token,
        public string $email,
    ) {
        $this->locale('ro');
    }

    /**
     * Get the notification's delivery channels.
     *
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    /**
     * Get the mail representation of the notification.
     */
    public function toMail(object $notifiable): MailMessage
    {
        $url = AppLink::openUrl('reset-password', [
            'token' => $this->token,
            'email' => $this->email,
        ]);

        return (new MailMessage)
            ->subject('Resetează-ți parola orgOS')
            ->greeting('Salut!')
            ->line('Ai cerut resetarea parolei contului tău orgOS.')
            ->action('Resetează parola', $url)
            ->line('Acest link expiră în 60 de minute.')
            ->line('Dacă nu tu ai cerut asta, poți ignora acest email -- parola ta rămâne neschimbată.')
            ->salutation('Echipa orgOS');
    }

    /**
     * Get the array representation of the notification.
     *
     * @return array<string, mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            //
        ];
    }
}
