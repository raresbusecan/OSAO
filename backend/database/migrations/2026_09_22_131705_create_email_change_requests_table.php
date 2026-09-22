<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // One pending request per user (user_id is the primary key, same
        // "upsert by owner" shape as password_reset_tokens' email-keyed
        // row) -- requesting a new change overwrites whatever was
        // pending before rather than stacking multiple live tokens.
        // Looked up by new_email at confirm time (the token alone isn't
        // enough to find the row -- it's hashed, like a password), then
        // verified with Hash::check against the stored token.
        Schema::create('email_change_requests', function (Blueprint $table) {
            $table->foreignId('user_id')->primary()->constrained()->cascadeOnDelete();
            $table->string('new_email');
            $table->string('token');
            $table->timestamp('created_at')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('email_change_requests');
    }
};
