<?php

namespace Tests\Unit;

use App\Support\DocumentDates;
use PHPUnit\Framework\TestCase;

class DocumentDatesTest extends TestCase
{
    public function test_supported_dates_include_real_leap_days_and_iso_timestamps(): void
    {
        foreach (['29.02.2028', '2028-02-29', '2028-02-29T10:30:00.000Z', '2028-02-29T10:30:00+02:00'] as $date) {
            $this->assertNotNull(DocumentDates::parse($date), $date);
        }
    }

    public function test_impossible_dates_relative_text_and_wrong_types_are_rejected(): void
    {
        foreach (['31.02.2027', '29.02.2027', '2027-02-31', '2027-01-01T25:00:00Z', 'tomorrow', '2027-01-01 garbage', [], 123, null] as $date) {
            $this->assertNull(DocumentDates::parse($date));
        }
    }

    public function test_issue_is_optional_but_validity_order_and_expiry_are_enforced(): void
    {
        $this->assertSame([], DocumentDates::errors('car_document', ['expiryDate' => '29.02.2028']));
        $this->assertArrayHasKey('metadata.expiryDate', DocumentDates::errors('home_document', ['issueDate' => '2028-03-01', 'expiryDate' => '2028-02-29']));
        $this->assertArrayHasKey('metadata.expiryDate', DocumentDates::errors('car_document', null));
        $this->assertSame([], DocumentDates::errors('home_task', null));
    }
}
