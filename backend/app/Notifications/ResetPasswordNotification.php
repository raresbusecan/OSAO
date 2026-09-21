<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class ResetPasswordNotification extends Notification
{
    use Queueable;

    /**
     * Laravel's own default ResetPassword notification builds its link
     * via route('password.reset', ...), which doesn't exist here -- this
     * is an API-only backend, the actual reset SCREEN lives in the Expo
     * app (app/(auth)/reset-password.tsx), reachable at whatever
     * FRONTEND_URL currently points at (see config/app.php's
     * 'frontend_url' -- an env var because, like EXPO_PUBLIC_BACKEND_URL
     * on the frontend side, it's a Cloudflare tunnel URL that changes on
     * every restart until real hosting exists).
     */
    public function __construct(
        public string $token,
        public string $email,
    ) {
        //
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
        $url = rtrim(config('app.frontend_url'), '/')
            . '/reset-password?token=' . urlencode($this->token)
            . '&email=' . urlencode($this->email);

        return (new MailMessage)
            ->subject('Resetează-ți parola orgOS')
            ->line('Ai cerut resetarea parolei contului tău orgOS.')
            ->action('Resetează parola', $url)
            ->line('Acest link expiră în 60 de minute.')
            ->line('Dacă nu tu ai cerut asta, poți ignora acest email -- parola ta rămâne neschimbată.');
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
