<?php

namespace Database\Factories;

use App\Models\Item;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Item>
 */
class ItemFactory extends Factory
{
    protected $model = Item::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'space_id' => null,
            'type' => 'task',
            'title' => fake()->sentence(4),
            'notes' => null,
            'status' => 'pending',
            'priority' => 'medium',
            'due_at' => null,
            'completed_at' => null,
            'amount' => null,
            'currency' => null,
            'category' => null,
            'recurrence' => null,
            'metadata' => null,
        ];
    }
}
