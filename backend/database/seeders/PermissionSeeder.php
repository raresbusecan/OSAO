<?php

namespace Database\Seeders;

use App\Models\Permission;
use Illuminate\Database\Seeder;

class PermissionSeeder extends Seeder
{
    public function run(): void
    {
        $permissions = [
            [
                'name' => 'View Items',
                'slug' => 'items.view',
                'description' => 'View items.',
            ],
            [
                'name' => 'Create Items',
                'slug' => 'items.create',
                'description' => 'Create items.',
            ],
            [
                'name' => 'Update Items',
                'slug' => 'items.update',
                'description' => 'Update items.',
            ],
            [
                'name' => 'Delete Items',
                'slug' => 'items.delete',
                'description' => 'Delete items.',
            ],

            [
                'name' => 'View Spaces',
                'slug' => 'spaces.view',
                'description' => 'View spaces.',
            ],
            [
                'name' => 'Create Spaces',
                'slug' => 'spaces.create',
                'description' => 'Create spaces.',
            ],
            [
                'name' => 'Update Spaces',
                'slug' => 'spaces.update',
                'description' => 'Update spaces.',
            ],
            [
                'name' => 'Delete Spaces',
                'slug' => 'spaces.delete',
                'description' => 'Delete spaces.',
            ],

            [
                'name' => 'View Users',
                'slug' => 'users.view',
                'description' => 'View users.',
            ],
            [
                'name' => 'Update Users',
                'slug' => 'users.update',
                'description' => 'Update users.',
            ],

            [
                'name' => 'View Settings',
                'slug' => 'settings.view',
                'description' => 'View settings.',
            ],
            [
                'name' => 'Update Settings',
                'slug' => 'settings.update',
                'description' => 'Update settings.',
            ],
        ];

        foreach ($permissions as $permission) {
            Permission::updateOrCreate(
                ['slug' => $permission['slug']],
                $permission
            );
        }
    }
}