<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    public function createApplication()
    {
        $app = parent::createApplication();
        // Runs before RefreshDatabase: never migrate a real database when a
        // shell environment or cached configuration overrides test settings.
        if ($app['config']->get('database.default') !== 'sqlite'
            || $app['config']->get('database.connections.sqlite.database') !== ':memory:') {
            throw new \RuntimeException('Tests require SQLite :memory:; refusing to access another database.');
        }

        return $app;
    }
}
