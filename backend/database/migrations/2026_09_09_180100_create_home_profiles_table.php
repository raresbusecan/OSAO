<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('home_profiles', function (Blueprint $table) {
            $table->id();

            $table->foreignId('space_id')
                ->unique()
                ->constrained('spaces')
                ->cascadeOnDelete();

            $table->string('county', 100);
            $table->string('city', 100);
            $table->string('ownership', 20); // 'bought' | 'inherited'
            $table->decimal('purchase_price', 12, 2)->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('home_profiles');
    }
};
