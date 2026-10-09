<?php

namespace App\Support;

/**
 * Validation for the Car / Home profile rows, shared by
 * SpaceController::updateCarProfile / updateHomeProfile (PUT, edits) and
 * SpaceController::store (POST /spaces with `profile`, create in one
 * transaction). One copy of the rules and their Romanian messages.
 */
class SpaceProfileRules
{
    public static function car(): array
    {
        return [
            'make' => ['required', 'string', 'max:100'],
            'model' => ['required', 'string', 'max:100'],
            'color' => ['nullable', 'string', 'max:50'],
            'year' => ['required', 'integer', 'min:1900', 'max:2100'],
            'purchase_price' => ['required', 'numeric', 'min:0'],
            'tank_capacity' => ['required', 'numeric', 'gt:0'],
        ];
    }

    public static function home(): array
    {
        return [
            'county' => ['required', 'string', 'max:100'],
            'city' => ['required', 'string', 'max:100'],
            'ownership' => ['required', 'string', 'in:bought,inherited'],
            'purchase_price' => ['nullable', 'numeric', 'min:0'],
        ];
    }

    /** Rules for `kind` ('car' | 'home'), or null for any other kind. */
    public static function for(?string $kind): ?array
    {
        return match ($kind) {
            'car' => self::car(),
            'home' => self::home(),
            default => null,
        };
    }

    /** Romanian messages, keyed for the given field prefix ('' for the
     * profile endpoints, 'profile.' for POST /spaces). */
    public static function messages(string $prefix = ''): array
    {
        $m = [
            'make.required' => 'Scrie marca mașinii.',
            'make.max' => 'Marca e prea lungă.',
            'model.required' => 'Scrie modelul mașinii.',
            'model.max' => 'Modelul e prea lung.',
            'color.max' => 'Culoarea e prea lungă.',
            'year.required' => 'Scrie anul mașinii.',
            'year.integer' => 'Anul trebuie să fie un număr întreg.',
            'year.min' => 'Anul trebuie să fie între 1900 și 2100.',
            'year.max' => 'Anul trebuie să fie între 1900 și 2100.',
            'purchase_price.required' => 'Prețul de cumpărare e obligatoriu (poate fi 0).',
            'purchase_price.numeric' => 'Prețul de cumpărare trebuie să fie un număr.',
            'purchase_price.min' => 'Prețul de cumpărare nu poate fi negativ.',
            'tank_capacity.required' => 'Capacitatea rezervorului e obligatorie.',
            'tank_capacity.numeric' => 'Capacitatea rezervorului trebuie să fie un număr.',
            'tank_capacity.gt' => 'Capacitatea rezervorului trebuie să fie mai mare decât 0.',
            'county.required' => 'Scrie județul.',
            'county.max' => 'Numele județului e prea lung.',
            'city.required' => 'Scrie localitatea.',
            'city.max' => 'Numele localității e prea lung.',
            'ownership.required' => 'Alege cum ai obținut casa.',
            'ownership.in' => 'Alege „Cumpărată” sau „Moștenită”.',
            '*.string' => 'Câmpul trebuie să fie text.',
        ];
        $out = [];
        foreach ($m as $key => $message) {
            $out[$prefix . $key] = $message;
        }
        return $out;
    }
}
