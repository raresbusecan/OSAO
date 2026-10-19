<?php

namespace App\Support;

use Illuminate\Support\Carbon;

/** Document validity rules shared by create and partial update. */
class DocumentDates
{
    public static function parse(mixed $value): ?Carbon
    {
        if (! is_string($value)) {
            return null;
        }
        try {
            if (preg_match('/^\d{2}\.\d{2}\.\d{4}$/D', $value)) {
                $date = Carbon::createFromFormat('!d.m.Y', $value);

                return $date && $date->format('d.m.Y') === $value ? $date : null;
            }
            if (! preg_match('/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2}))?$/D', $value)) {
                return null;
            }
            $parts = date_parse($value);
            if ($parts['warning_count'] || $parts['error_count']) {
                return null;
            }

            return Carbon::parse($value);
        } catch (\Exception) {
            return null;
        }
    }

    public static function errors(string $type, ?array $metadata): array
    {
        if (! in_array($type, ['car_document', 'home_document'], true)) {
            return [];
        }
        $rawIssue = $metadata['issueDate'] ?? null;
        $issue = self::parse($rawIssue);
        $expiry = self::parse($metadata['expiryDate'] ?? null);
        $errors = [];
        if (! $issue && $rawIssue !== null && $rawIssue !== '') {
            $errors['metadata.issueDate'] = ['Data emiterii nu e validă.'];
        }
        if (! $expiry) {
            $errors['metadata.expiryDate'] = ['Data expirării este obligatorie și trebuie să fie validă.'];
        } elseif ($issue && $expiry->lt($issue)) {
            $errors['metadata.expiryDate'] = ['Data expirării nu poate fi înaintea celei de emitere.'];
        }

        return $errors;
    }
}
