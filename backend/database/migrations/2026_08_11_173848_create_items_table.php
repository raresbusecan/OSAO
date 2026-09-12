<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('items', function (Blueprint $table) {
            $table->id();

            $table->foreignId('user_id')
                ->constrained('users')
                ->cascadeOnDelete();

            $table->foreignId('space_id')
                ->nullable()
                ->constrained('spaces')
                ->nullOnDelete();

            $table->string('type', 30);
            $table->string('title', 255);
            $table->text('notes')->nullable();

            $table->string('status', 30)->default('pending');
            $table->string('priority', 20)->default('medium');

            $table->timestamp('due_at')->nullable();
            $table->timestamp('completed_at')->nullable();

            $table->decimal('amount', 12, 2)->nullable();
            $table->string('currency', 3)->nullable();

            $table->string('category', 100)->nullable();
            $table->string('recurrence', 100)->nullable();

            $table->json('metadata')->nullable();

            $table->timestamps();

            $table->index(['user_id', 'type']);
            $table->index(['user_id', 'status']);
            $table->index(['user_id', 'due_at']);
            $table->index(['space_id', 'type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('items');
    }
};