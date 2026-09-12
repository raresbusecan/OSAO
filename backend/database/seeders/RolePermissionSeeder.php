<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Seeder;

class RolePermissionSeeder extends Seeder
{
    public function run(): void
    {
        $allPermissions = Permission::pluck('id')->all();

        Role::where('slug', 'owner')
            ->firstOrFail()
            ->permissions()
            ->sync($allPermissions);

        Role::where('slug', 'admin')
            ->firstOrFail()
            ->permissions()
            ->sync(
                Permission::whereIn('slug', [
                    'items.view',
                    'items.create',
                    'items.update',
                    'items.delete',

                    'spaces.view',
                    'spaces.create',
                    'spaces.update',
                    'spaces.delete',

                    'users.view',
                    'users.update',

                    'settings.view',
                    'settings.update',
                ])->pluck('id')
            );

        Role::where('slug', 'manager')
            ->firstOrFail()
            ->permissions()
            ->sync(
                Permission::whereIn('slug', [
                    'items.view',
                    'items.create',
                    'items.update',
                    'items.delete',

                    'spaces.view',
                    'spaces.create',
                    'spaces.update',
                ])->pluck('id')
            );

        Role::where('slug', 'user')
            ->firstOrFail()
            ->permissions()
            ->sync([
                Permission::where('slug', 'items.view')->firstOrFail()->id,
                Permission::where('slug', 'items.create')->firstOrFail()->id,
                Permission::where('slug', 'items.update')->firstOrFail()->id,
                Permission::where('slug', 'items.delete')->firstOrFail()->id,

                Permission::where('slug', 'spaces.view')->firstOrFail()->id,
                Permission::where('slug', 'spaces.create')->firstOrFail()->id,
                Permission::where('slug', 'spaces.update')->firstOrFail()->id,
            ]);
    }
}