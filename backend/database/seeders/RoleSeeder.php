<?php

namespace Database\Seeders;

use App\Models\Role;
use Illuminate\Database\Seeder;

class RoleSeeder extends Seeder
{
    public function run(): void
    {
        $roles = [
            [
                'name' => 'Owner',
                'slug' => 'owner',
                'description' => 'Full ownership and control of the account.',
            ],
            [
                'name' => 'Admin',
                'slug' => 'admin',
                'description' => 'Administrative access to the application.',
            ],
            [
                'name' => 'Manager',
                'slug' => 'manager',
                'description' => 'Management access to assigned resources.',
            ],
            [
                'name' => 'User',
                'slug' => 'user',
                'description' => 'Standard user access.',
            ],
        ];

        foreach ($roles as $role) {
            Role::updateOrCreate(
                ['slug' => $role['slug']],
                $role
            );
        }
    }
}