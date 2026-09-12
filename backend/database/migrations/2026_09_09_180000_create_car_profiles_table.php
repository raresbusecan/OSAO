<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('car_profiles', function (Blueprint $table) {
            $table->id();

            $table->foreignId('space_id')
                ->unique()
                ->constrained('spaces')
                ->cascadeOnDelete();

            $table->string('make', 100);
            $table->string('model', 100);
            $table->string('color', 50)->nullable();
            $table->unsignedSmallInteger('year');
            $table->decimal('purchase_price', 12, 2)->default(0);
            $table->decimal('tank_capacity', 6, 2);

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('car_profiles');
    }
};
