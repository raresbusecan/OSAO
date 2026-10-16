<?php

namespace Tests\Feature;

use Tests\TestCase;

/** API messages follow the app's language (SetLocale): Accept-Language
 * ro|en, anything else -> the Romanian default. */
class LocaleTest extends TestCase
{
    private function emailError(?string $language): string
    {
        // null = no preference. Symfony's test request defaults to
        // "en-us,en;q=0.5", so "none" has to be sent as an empty header.
        $headers = ['Accept-Language' => $language ?? ''];

        return $this->postJson('/api/forgot-password', [], $headers)->assertStatus(422)->json('errors.email.0');
    }

    public function test_romanian_is_the_default(): void
    {
        $this->assertSame('Câmpul email este obligatoriu.', $this->emailError(null));
        $this->assertSame('Câmpul email este obligatoriu.', $this->emailError('ro'));
    }

    public function test_english_when_asked(): void
    {
        $this->assertSame('The email field is required.', $this->emailError('en'));
        $this->assertSame('The email field is required.', $this->emailError('en-US,en;q=0.9'));
    }

    public function test_unsupported_language_falls_back_to_romanian(): void
    {
        $this->assertSame('Câmpul email este obligatoriu.', $this->emailError('fr-FR'));
    }
}
