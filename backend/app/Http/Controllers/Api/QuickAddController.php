<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class QuickAddController extends Controller
{
    /**
     * Heuristic (non-LLM) parsing of free text into a structured item
     * preview. Returns `{ preview: {...} }` — this must stay in sync with
     * what frontend/components/quick_add/quickAdd.tsx expects
     * (`r.preview.type`, `r.preview.title`, ...).
     */
    public function parse(Request $request)
    {
        $validated = $request->validate([
            'text' => ['required', 'string'],
        ]);

        $working = trim($validated['text']);
        $original = $working;

        $preview = [
            'type' => 'task',
            'title' => $original,
            'notes' => null,
            'due_at' => null,
            'amount' => null,
            'currency' => null,
            'category' => null,
            'recurrence' => null,
            'priority' => null,
        ];

        // --- amount + currency -------------------------------------------------
        // "€450", "450 EUR", "$45.99", "45.99 USD"
        if (preg_match(
            '/([€$£]|EUR|USD|GBP)\s?(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s?(€|\$|£|EUR|USD|GBP)/iu',
            $working,
            $matches
        )) {
            $symbol = $matches[1] !== '' ? $matches[1] : $matches[4];
            $number = $matches[2] !== '' ? $matches[2] : $matches[3];

            $preview['amount'] = (float) str_replace(',', '.', $number);
            $preview['currency'] = $this->normalizeCurrency($symbol);
            $preview['type'] = 'expense';

            $working = trim(str_replace($matches[0], '', $working));
        }

        // --- due date phrases ----------------------------------------------------
        $dueAt = null;

        if (preg_match('/\btoday\b/i', $working, $m)) {
            $dueAt = Carbon::now();
        } elseif (preg_match('/\btomorrow\b/i', $working, $m)) {
            $dueAt = Carbon::now()->addDay();
        } elseif (preg_match('/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i', $working, $m)) {
            $dueAt = Carbon::parse($m[1]);
        } elseif (preg_match('/\bon\s+([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?)\b/i', $working, $m)) {
            $parsed = Carbon::parse($m[1] . ' ' . Carbon::now()->year);
            $dueAt = $parsed->isPast() ? $parsed->addYear() : $parsed;
        }

        if ($dueAt !== null) {
            $preview['due_at'] = $dueAt->toIso8601String();
            $working = trim(str_replace($m[0], '', $working));
        }

        // --- type inference (skip if amount already forced 'expense') -----------
        if ($preview['type'] !== 'expense') {
            if (preg_match('/\bremind(?:er)?\b/i', $working, $m)) {
                $preview['type'] = 'reminder';
                $working = trim(str_replace($m[0], '', $working));
            } elseif ($dueAt !== null && preg_match('/\b(meeting|call)\b/i', $working)) {
                $preview['type'] = 'event';
            } elseif (preg_match('/\bnote\b/i', $working, $m)) {
                $preview['type'] = 'note';
                $working = trim(str_replace($m[0], '', $working));
            }
        }

        // --- priority --------------------------------------------------------
        if (preg_match('/\burgent\b/i', $working, $m)) {
            $preview['priority'] = 'high';
            $working = trim(str_replace($m[0], '', $working));
        }

        // --- title: whatever is left after stripping matched phrases ------------
        $cleanedTitle = trim(preg_replace('/\s{2,}/', ' ', $working) ?? $working);
        $preview['title'] = $cleanedTitle !== '' ? $cleanedTitle : $original;

        return response()->json(['preview' => $preview]);
    }

    private function normalizeCurrency(string $symbol): string
    {
        return match (strtoupper($symbol)) {
            '€', 'EUR' => 'EUR',
            '$', 'USD' => 'USD',
            '£', 'GBP' => 'GBP',
            default => strtoupper($symbol),
        };
    }
}
