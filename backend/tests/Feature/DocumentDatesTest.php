<?php

namespace Tests\Feature;

use App\Models\Space;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** POST /items for a document: expiry required, issue date optional
 * (Simplu's quick add sends only the expiry -- it used to 422). */
class DocumentDatesTest extends TestCase
{
    use RefreshDatabase;

    private function createDoc(array $meta)
    {
        $user = User::factory()->create();
        $car = Space::factory()->create(['user_id' => $user->id, 'name' => 'Golf', 'type' => 'car']);
        Sanctum::actingAs($user);

        return $this->postJson('/api/items', [
            'space_id' => (string) $car->id, 'type' => 'car_document', 'title' => 'RCA',
            'amount' => null, 'due_at' => now()->toISOString(),
            'metadata' => array_merge(['documentType' => 'RCA', 'issuer' => null, 'issueDate' => null, 'expiryDate' => null, 'notes' => null, 'renewedFromId' => null], $meta),
        ]);
    }

    public function test_document_without_issue_date_is_created(): void
    {
        $this->createDoc(['expiryDate' => '15.10.2027'])->assertCreated();
    }

    public function test_expiry_is_still_required(): void
    {
        $this->createDoc(['issueDate' => '15.10.2026'])->assertStatus(422)->assertJsonValidationErrors('metadata.expiryDate');
    }

    public function test_expiry_before_issue_is_rejected(): void
    {
        $this->createDoc(['issueDate' => '15.10.2026', 'expiryDate' => '01.10.2026'])->assertStatus(422)->assertJsonValidationErrors('metadata.expiryDate');
    }

    public function test_unparseable_issue_date_is_rejected(): void
    {
        $this->createDoc(['issueDate' => 'mâine', 'expiryDate' => '15.10.2027'])->assertStatus(422)->assertJsonValidationErrors('metadata.issueDate');
    }

    public function test_impossible_calendar_dates_are_rejected_on_create(): void
    {
        $this->createDoc(['expiryDate' => '31.02.2027'])->assertStatus(422)->assertJsonValidationErrors('metadata.expiryDate');
    }

    public function test_partial_updates_validate_the_merged_document(): void
    {
        $id = $this->createDoc(['issueDate' => '15.10.2026', 'expiryDate' => '15.10.2027'])->assertCreated()->json('id');
        foreach ([['expiryDate' => null], ['expiryDate' => '01.10.2026'], ['expiryDate' => '31.02.2027'], ['issueDate' => 'tomorrow']] as $metadata) {
            $this->putJson('/api/items/'.$id, ['metadata' => $metadata])->assertStatus(422);
        }
        $this->putJson('/api/items/'.$id, ['metadata' => null])->assertStatus(422);
        $this->putJson('/api/items/'.$id, ['metadata' => ['notes' => 'Kept validity']])
            ->assertOk()->assertJsonPath('metadata.expiryDate', '15.10.2027');
        $this->putJson('/api/items/'.$id, ['metadata' => ['expiryDate' => '15.10.2028']])->assertOk();
    }

    public function test_home_documents_share_the_same_update_rules(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $id = $this->postJson('/api/items', ['type' => 'home_document', 'title' => 'Contract', 'metadata' => ['expiryDate' => '2028-02-29T10:00:00.000Z']])->assertCreated()->json('id');
        $this->putJson('/api/items/'.$id, ['metadata' => ['expiryDate' => '2027-02-29']])->assertStatus(422);
    }
}
