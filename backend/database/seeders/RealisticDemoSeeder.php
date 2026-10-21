<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/** Opt-in, create-only preview: never invokes DemoSeeder's reset path.
 * ORGOS_DEMO_PASSWORD=<unique password> php artisan db:seed --class=RealisticDemoSeeder */
class RealisticDemoSeeder extends Seeder
{
    public const EMAIL = 'realist@orgos.test';
    public const PARTNER_EMAIL = 'realist.ana@orgos.test';

    public function run(): void
    {
        $password = getenv('ORGOS_DEMO_PASSWORD');
        if (!is_string($password) || strlen($password) < 12) {
            throw new \RuntimeException('Setează ORGOS_DEMO_PASSWORD la o parolă unică de minimum 12 caractere.');
        }
        [$user, $partner] = (new DemoSeeder())->createFreshAccounts(self::EMAIL, self::PARTNER_EMAIL, $password);
        $this->command?->info(sprintf(
            'Cont demonstrativ creat: %s; %d înregistrări, %d spații proprii. Partener fictiv: %s.',
            $user->email, $user->items()->count(), $user->spaces()->count(), $partner->email,
        ));
    }
}
