<?php

namespace Database\Seeders;

use App\Http\Controllers\Api\BudgetController;
use App\Models\BudgetArchive;
use App\Models\BudgetCategory;
use App\Models\CarProfile;
use App\Models\HomeProfile;
use App\Models\Item;
use App\Models\Recipe;
use App\Models\Role;
use App\Models\SavingsGoal;
use App\Models\Space;
use App\Models\User;
use App\Support\ItemBudgetRules;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Demo account that exercises every feature of the app, for manual testing
 * on the phone. NOT part of DatabaseSeeder's default run:
 *
 *   php artisan db:seed --class=DemoSeeder
 *
 * Idempotent: deletes ONLY the users with the emails in DEMO_EMAILS (and
 * everything they own: spaces + their items/profiles/members, their own
 * items, list shares, budget rows, savings goal, archive, recipes, tokens,
 * social links, verification/reset rows), then recreates them. Every date
 * is relative to "now" in Europe/Bucharest, so a re-run months later is
 * just as meaningful. Shapes mirror the frontend mappers
 * (frontend/lib/spaces/{car,home,grocery,expenses}/*Items.ts, credits.ts,
 * calendar.tsx's NewEventSheet, lib/dashboard/layout.ts, lib/budget/plan.ts)
 * -- see backend/CLAUDE.md "Demo seed".
 */
class DemoSeeder extends Seeder
{
    public const DEMO_EMAIL = 'demo@orgos.test';
    public const DEMO2_EMAIL = 'demo2@orgos.test';
    public const DEMO_EMAILS = [self::DEMO_EMAIL, self::DEMO2_EMAIL];
    public const PASSWORD = 'demo1234';
    /** The real databases (backend/.env). Demo data never goes there: the
     * demo logins have known passwords on a tunnel-exposed backend, and
     * wipe() deletes rows. Use the QA sandbox (APP_ENV=qa -> lifeos_qa)
     * or the tests' sqlite. qa-lead found demo accounts in lifeos,
     * 2026-11-01. */
    public const LIVE_DATABASES = ['lifeos'];

    private string $tz = 'Europe/Bucharest';
    private Carbon $now;
    private string $primaryEmail = self::DEMO_EMAIL;
    private string $secondaryEmail = self::DEMO2_EMAIL;
    private string $accountPassword = self::PASSWORD;

    public static function assertNotLiveDatabase(): void
    {
        $database = DB::connection()->getDatabaseName();
        if (in_array($database, self::LIVE_DATABASES, true)) {
            throw new \RuntimeException("Datele demonstrative nu se pun în baza reală „{$database}”. Rulează cu APP_ENV=qa (lifeos_qa).");
        }
    }

    public function run(): void
    {
        self::assertNotLiveDatabase();
        $this->primaryEmail = self::DEMO_EMAIL;
        $this->secondaryEmail = self::DEMO2_EMAIL;
        $this->accountPassword = self::PASSWORD;
        mt_srand(20261010); // same amounts on every run; dates follow "now"
        $this->now = Carbon::now($this->tz);

        DB::transaction(function () {
            $this->wipe();
            $this->seed();
        });

        // Outside the transaction on purpose: it reads through the
        // controller's own queries (archive = 12 completed months).
        $this->backfillArchive(User::where('email', self::DEMO_EMAIL)->firstOrFail());

        $this->command?->info('Demo: ' . self::DEMO_EMAIL . ' / ' . self::PASSWORD . '  (+ ' . self::DEMO2_EMAIL . ' / ' . self::PASSWORD . ')');
    }

    /** Reuse the realistic fixtures without resetting any existing account.
     * Failure (including an email collision) rolls back the entire new dataset. */
    public function createFreshAccounts(string $primaryEmail, string $secondaryEmail, string $password): array
    {
        self::assertNotLiveDatabase();
        if ($primaryEmail === $secondaryEmail
            || !str_ends_with($primaryEmail, '@orgos.test')
            || !str_ends_with($secondaryEmail, '@orgos.test')
            || strlen($password) < 12) {
            throw new \InvalidArgumentException('Folosește două adrese demonstrative distincte @orgos.test și o parolă de minimum 12 caractere.');
        }
        $this->primaryEmail = $primaryEmail;
        $this->secondaryEmail = $secondaryEmail;
        $this->accountPassword = $password;
        $this->now = Carbon::now($this->tz);
        mt_srand(20261010);

        return DB::transaction(function () use ($primaryEmail, $secondaryEmail) {
            if (User::whereIn('email', [$primaryEmail, $secondaryEmail])->exists()) {
                throw new \RuntimeException('Contul demonstrativ există deja. Nu am resetat sau modificat datele existente.');
            }
            $this->seed();
            $primary = User::where('email', $primaryEmail)->firstOrFail();
            $primary->name = 'Demo realist';
            $primary->save();
            $this->backfillArchive($primary);

            return [$primary, User::where('email', $secondaryEmail)->firstOrFail()];
        });
    }

    // ------------------------------------------------------------------
    // Cleanup -- strictly the demo users.
    // ------------------------------------------------------------------

    private function wipe(): void
    {
        $users = User::whereIn('email', self::DEMO_EMAILS)->get(['id', 'email']);
        if ($users->isEmpty()) {
            return;
        }
        $ids = $users->pluck('id')->all();
        $spaceIds = Space::whereIn('user_id', $ids)->pluck('id')->all();
        $itemIds = Item::whereIn('user_id', $ids)
            ->orWhereIn('space_id', $spaceIds ?: [0])
            ->pluck('id')->all();

        DB::table('list_members')->whereIn('user_id', $ids)->orWhereIn('list_item_id', $itemIds ?: [0])->delete();
        DB::table('space_members')->whereIn('user_id', $ids)->orWhereIn('space_id', $spaceIds ?: [0])->delete();
        Item::whereIn('id', $itemIds ?: [0])->delete();
        // car_profiles / home_profiles cascade with the space.
        Space::whereIn('id', $spaceIds ?: [0])->delete();
        BudgetCategory::whereIn('user_id', $ids)->delete();
        BudgetArchive::whereIn('user_id', $ids)->delete();
        SavingsGoal::whereIn('user_id', $ids)->delete();
        Recipe::whereIn('user_id', $ids)->delete(); // ingredients cascade
        DB::table('personal_access_tokens')->where('tokenable_type', User::class)->whereIn('tokenable_id', $ids)->delete();
        DB::table('social_accounts')->whereIn('user_id', $ids)->delete();
        DB::table('email_verification_tokens')->whereIn('user_id', $ids)->delete();
        DB::table('email_change_requests')->whereIn('user_id', $ids)->delete();
        DB::table('password_reset_tokens')->whereIn('email', $users->pluck('email'))->delete();
        DB::table('sessions')->whereIn('user_id', $ids)->delete();
        DB::table('user_roles')->whereIn('user_id', $ids)->delete();
        User::whereIn('id', $ids)->delete();
    }

    // ------------------------------------------------------------------
    // Date helpers (all relative to now, user's zone)
    // ------------------------------------------------------------------

    /** Local day $offset days from today, at $h:$m. */
    private function day(int $offset, int $h = 12, int $m = 0): Carbon
    {
        return $this->now->copy()->startOfDay()->addDays($offset)->setTime($h, $m);
    }

    /** What goes into a datetime column (app zone = UTC; the cast drops the zone). */
    private function at(int $offset, int $h = 12, int $m = 0): Carbon
    {
        return $this->day($offset, $h, $m)->setTimezone('UTC');
    }

    private function dmy(int $offset): string
    {
        return $this->day($offset)->format('d.m.Y');
    }

    private function ymd(int $offset): string
    {
        return $this->day($offset)->format('Y-m-d');
    }

    /** A JS-style ISO timestamp ("...T09:00:00.000Z"), as the app writes. */
    private function js(int $offset, int $h = 12, int $m = 0): string
    {
        return $this->at($offset, $h, $m)->format('Y-m-d\TH:i:s.v\Z');
    }

    /** Days from today to $date (a local Carbon). */
    private function offsetOf(Carbon $date): int
    {
        return (int) round($this->now->copy()->startOfDay()->diffInDays($date->copy()->startOfDay(), false));
    }

    private function rnd(float $min, float $max, int $decimals = 2): float
    {
        return round($min + (mt_rand() / mt_getrandmax()) * ($max - $min), $decimals);
    }

    // ------------------------------------------------------------------
    // Record helpers
    // ------------------------------------------------------------------

    private function item(User $user, ?Space $space, string $type, string $title, array $attrs = []): Item
    {
        $item = new Item();
        $item->forceFill(array_merge([
            'user_id' => $user->id,
            'space_id' => $space?->id,
            'type' => $type,
            'title' => $title,
            'status' => 'pending',
            'priority' => 'medium',
        ], $attrs, [
            // Buget simplu (2026-11): "Bani fără vină" is gone; the old
            // $gf arguments below are kept only so call sites stay put.
            'guilt_free' => false,
        ]));
        if ($item->amount !== null && $item->currency === null) {
            $item->currency = 'RON';
        }
        // Logs read better with a creation date = when they happened.
        if ($item->due_at && $item->due_at->lt(now())) {
            $item->created_at = $item->due_at;
        }
        $item->save();

        return $item;
    }

    private function user(string $email, string $name, int $createdDaysAgo): User
    {
        $user = new User();
        $user->forceFill([
            'name' => $name,
            'email' => $email,
            'password' => $this->accountPassword, // 'hashed' cast
            'has_password' => true,
            'email_verified_at' => now(),
            'timezone' => $this->tz,
            'tours' => null, // first-use tours still to see
        ]);
        $user->created_at = $this->at(-$createdDaysAgo);
        $user->save();

        if ($role = Role::where('slug', 'user')->first()) {
            $user->roles()->attach($role->id, ['created_at' => now()]);
        }

        return $user;
    }

    private function space(User $user, string $name, string $type, string $icon, ?string $color, int $sort): Space
    {
        $space = new Space(['name' => $name, 'type' => $type, 'icon' => $icon, 'color' => $color]);
        $space->user_id = $user->id;
        $space->forceFill(['sort_order' => $sort]);
        $space->save();

        return $space;
    }

    /** An expense_credit through the same rules POST /items uses. */
    private function credit(User $user, Space $expenses, string $title, float $rate, int $day, string $endDate, ?Space $linked, bool $ended = false): Item
    {
        $data = [
            'type' => Item::CREDIT_TYPE,
            'space_id' => $expenses->id,
            'title' => $title,
            'amount' => $rate,
            'currency' => 'RON',
            'metadata' => ['day_of_month' => $day, 'end_date' => $endDate, 'linked_space_id' => $linked?->id],
        ];
        // An ended credit can't be CREATED through the API (end_date in the
        // past) -- validate it as an edit of an existing one instead.
        $probe = $ended ? new Item(['type' => Item::CREDIT_TYPE]) : null;
        $errors = ItemBudgetRules::errors($user, $data, $probe);
        if ($errors) {
            throw new \RuntimeException('DemoSeeder credit "' . $title . '": ' . json_encode($errors));
        }
        $data['status'] = $data['status'] ?? 'pending';
        $type = $data['type'];
        unset($data['type']);

        return $this->item($user, $expenses, $type, $title, $data);
    }

    // ------------------------------------------------------------------
    // The data
    // ------------------------------------------------------------------

    private function seed(): void
    {
        $demo = $this->user($this->primaryEmail, 'Demo', 400);
        $ana = $this->user($this->secondaryEmail, 'Ana', 380);

        // ---- Spaces (grid order = sort_order) ----
        $car = $this->space($demo, 'Volkswagen Golf', 'car', 'car-outline', null, 0);
        $home = $this->space($demo, 'Apartament Cluj', 'home', 'home-outline', 'indigo', 1);
        $grocery = $this->space($demo, 'Cumpărături', 'grocery', 'cart-outline', null, 2);
        $expenses = $this->space($demo, 'Cheltuieli', 'expenses', 'receipt-outline', 'sky', 3);
        $parents = $this->space($demo, 'Casa părinților', 'home', 'home-outline', 'pink', 4);

        $anaCar = $this->space($ana, 'Renault Clio', 'car', 'car-outline', 'slate', 0);
        $anaGrocery = $this->space($ana, 'Cumpărături Ana', 'grocery', 'cart-outline', 'fuchsia', 1);

        // Sharing: Ana's car is shared with Demo; Demo's apartment with Ana.
        $anaCar->members()->attach($demo->id);
        $home->members()->attach($ana->id);

        $this->seedCar($demo, $car);
        $this->seedHome($demo, $home);
        $this->seedParents($demo, $parents);
        [$mainList] = $this->seedGrocery($demo, $ana, $grocery, $anaGrocery, $home);
        $this->seedExpenses($demo, $expenses, $car, $home);
        $this->seedCalendar($demo);
        $this->seedAna($ana, $anaCar);
        $this->seedRecipe($demo);
        $this->seedBudget($demo);

        // ---- Acasă: every card kind, each with data behind it ----
        $demo->dashboard_layout = [
            ['id' => 'spend', 'type' => 'spend', 'size' => 'wide', 'color' => null, 'hidden' => false, 'settings' => ['chart' => 'ring']],
            ['id' => 'todo', 'type' => 'todo', 'size' => 'wide', 'color' => null, 'hidden' => false, 'settings' => ['rows' => 5]],
            ['id' => 'bills', 'type' => 'bills', 'size' => 'wide', 'color' => null, 'hidden' => false, 'settings' => ['rows' => 3]],
            ['id' => 'wbudget01', 'type' => 'budget', 'size' => 'wide', 'color' => null, 'hidden' => false],
            ['id' => 'wcar01', 'type' => 'car', 'size' => 'compact', 'color' => null, 'hidden' => false, 'settings' => ['spaceId' => (string) $car->id]],
            ['id' => 'wsupplies01', 'type' => 'supplies', 'size' => 'compact', 'color' => null, 'hidden' => false, 'settings' => ['spaceId' => (string) $home->id]],
            ['id' => 'wgrocery01', 'type' => 'grocery', 'size' => 'wide', 'color' => null, 'hidden' => false, 'settings' => ['listId' => (string) $mainList->id, 'rows' => 5]],
            ['id' => 'wcalendar01', 'type' => 'calendar', 'size' => 'wide', 'color' => null, 'hidden' => false, 'settings' => ['rows' => 5]],
            ['id' => 'savings', 'type' => 'savings', 'size' => 'compact', 'color' => null, 'hidden' => false],
            ['id' => 'wexpenses01', 'type' => 'expenses', 'size' => 'compact', 'color' => null, 'hidden' => false, 'settings' => ['spaceId' => (string) $expenses->id]],
        ];
        $demo->save();
    }

    // ---- Mașină ------------------------------------------------------

    private function seedCar(User $u, Space $car): void
    {
        $tank = 50.0;
        $profile = new CarProfile([
            'make' => 'Volkswagen', 'model' => 'Golf 7 1.6 TDI', 'color' => 'Gri', 'year' => 2017,
            'purchase_price' => 52000, 'tank_capacity' => $tank,
        ]);
        $profile->space_id = $car->id;
        $profile->save();

        // Fill-ups every ~2 weeks for a year, last one today. Consumption
        // comes from odometer + tank levels (fuel.calculations.ts), so every
        // fill-up carries both, and liters = tank x (after - before).
        $stations = ['OMV', 'Petrom', 'MOL', 'Rompetrol', 'Lukoil'];
        $odo = 133200;
        $prevAfter = 100;
        $points = []; // [offset, odometer] for odoAt()
        $offset = -364;
        $n = 0;
        while (true) {
            $dist = (int) round($this->rnd(540, 700, 0));
            $odo += $dist;
            $cons = $this->rnd(5.9, 7.4); // l/100km
            $used = $cons * $dist / 100;
            $before = max(5, (int) round($prevAfter - $used / $tank * 100));
            $after = ($n % 7 === 3) ? 75 : 100; // now and then not a full tank
            $liters = round($tank * ($after - $before) / 100, 2);
            $price = $this->rnd(7.15, 7.95);
            $this->item($u, $car, 'car_fuel', $stations[$n % count($stations)], [
                'amount' => round($liters * $price, 2),
                'due_at' => $this->at($offset, 0),
                'metadata' => ['liters' => $liters, 'odometer' => $odo, 'level_before' => $before, 'level_after' => $after, 'station' => $stations[$n % count($stations)]],
            ]);
            $points[] = [$offset, $odo];
            $prevAfter = $after;
            $n++;
            if ($offset === 0) {
                break;
            }
            $offset = min(0, $offset + mt_rand(12, 16));
        }
        $odoAt = function (int $off) use ($points): int {
            $best = $points[0][1] - 600;
            foreach ($points as [$o, $km]) {
                if ($o <= $off) {
                    $best = $km;
                }
            }

            return $best;
        };
        $lastOdo = $odo;

        // Top-card km typed by hand yesterday, a bit above the last fill-up.
        $profile->forceFill(['odometer' => $lastOdo + 120, 'odometer_updated_at' => $this->at(-1, 19)])->save();

        $mt = function (string $service, int $off, float $price, array $meta = [], string $status = 'pending', bool $gf = false) use ($u, $car, $odoAt) {
            return $this->item($u, $car, 'car_maintenance', $service, [
                'amount' => $price,
                'due_at' => $this->at($off, 0),
                'status' => $status,
                'metadata' => array_merge([
                    'description' => '', 'odometer' => $odoAt($off), 'provider' => null,
                    'nextServiceOdometer' => null, 'nextServiceDate' => null, 'underWarranty' => false, 'renewedFromId' => null,
                ], $meta),
            ]);
        };

        // Oil change: overdue by KM (next target already passed).
        $mt('Oil Change', -300, 465, ['description' => 'Ulei 5W30 + filtru ulei', 'provider' => 'Service Auto Popescu', 'nextServiceOdometer' => $lastOdo - 450, 'nextServiceDate' => $this->dmy(-300 + 365)]);
        // Revizie: due soon by DATE.
        $mt('Service', -358, 890, ['description' => 'Revizie anuală', 'provider' => 'VW Service Cluj', 'nextServiceDate' => $this->dmy(5)]);
        // One visit, several services (the batch form saves N rows).
        $visit = ['provider' => 'Service Auto Popescu', 'description' => 'Vizită service martie'];
        $mt('Filters', -120, 240, $visit + ['nextServiceOdometer' => $odoAt(-120) + 15000]);
        $mt('Brakes', -120, 680, $visit);
        $mt('Fluids', -120, 115, $visit + ['nextServiceDate' => $this->dmy(-120 + 365)]);
        $mt('Tires', -28, 280, ['description' => 'Montaj anvelope de iarnă', 'provider' => 'Vulcanizare Express', 'nextServiceDate' => $this->dmy(150)]);
        $mt('Repair', -60, 85, ['description' => 'Înlocuire bec far stânga', 'provider' => 'Service Auto Popescu']);
        // Renewed battery: the old record is archived (as the app does).
        $oldBattery = $mt('Battery', -1500, 420, ['description' => 'Baterie Varta 60Ah', 'nextServiceDate' => $this->dmy(-1500 + 1825), 'odometer' => 81000], 'archived');
        $mt('Battery', -40, 610, ['description' => 'Baterie Bosch S4 72Ah', 'provider' => 'Auto Total', 'nextServiceDate' => $this->dmy(-40 + 1825), 'renewedFromId' => (string) $oldBattery->id]);
        // A warranty job (price 0).
        $mt('Senzor parcare spate', -200, 0, ['description' => 'Înlocuit în garanție', 'provider' => 'VW Service Cluj', 'underWarranty' => true]);

        // Documents: dates are "DD.MM.YYYY"; due_at = when it was logged.
        $doc = function (string $type, string $title, ?string $issuer, int $issue, int $expiry, ?float $price, string $status = 'pending', ?string $renewedFrom = null, ?string $notes = null) use ($u, $car) {
            return $this->item($u, $car, 'car_document', $title, [
                'amount' => $price,
                'due_at' => $this->at(min($issue, 0), 10),
                'status' => $status,
                'metadata' => ['documentType' => $type, 'issuer' => $issuer, 'issueDate' => $this->dmy($issue), 'expiryDate' => $this->dmy($expiry), 'notes' => $notes, 'renewedFromId' => $renewedFrom],
            ]);
        };
        $oldRca = $doc('RCA', 'RCA', 'Groupama', -725, -360, 1180, 'archived');
        $doc('RCA', 'RCA', 'Allianz-Țiriac', -359, 6, 1250, 'pending', (string) $oldRca->id); // expires in 6 days
        $doc('ITP', 'ITP', 'RAR Cluj', -742, -12, 180, 'pending', null, 'De refăcut -- a expirat'); // expired, still open
        $doc('Rovinieta', 'Rovinietă 12 luni', 'CNAIR', -58, 307, 135);
        $doc('CASCO', 'CASCO', 'Omniasig', -100, 265, 2400);

        // Car expenses (categories = the form's pills).
        for ($m = 11; $m >= 0; $m--) {
            foreach ([[3, 'Parcare', 'Parcare centru'], [17, 'Parcare', 'Parcare aeroport'], [9, 'Spălătorie', 'Spălătorie self-service']] as [$d, $cat, $title]) {
                $date = $this->now->copy()->startOfMonth()->subMonthsNoOverflow($m)->addDays($d - 1);
                if ($date->gt($this->now) || ($cat === 'Parcare' && $d === 17 && $m % 3 !== 0)) {
                    continue;
                }
                $off = $this->offsetOf($date);
                $this->item($u, $car, 'car_expense', $title, [
                    'amount' => $cat === 'Parcare' ? $this->rnd(25, 95, 0) : $this->rnd(30, 55, 0),
                    'category' => $cat,
                    'due_at' => $this->at($off, 0),
                    'metadata' => ['odometer' => null, 'provider' => null, 'notes' => null],
                ]);
            }
        }
        $this->item($u, $car, 'car_expense', 'Amendă parcare', ['amount' => 145, 'category' => 'Amenzi', 'due_at' => $this->at(-150, 0), 'metadata' => ['odometer' => null, 'provider' => 'Poliția Locală Cluj', 'notes' => 'Plătită online']]);
        $this->item($u, $car, 'car_expense', 'Covorașe cauciuc', ['amount' => 189, 'category' => 'Accesorii', 'due_at' => $this->at(-210, 0), 'metadata' => ['odometer' => null, 'provider' => 'eMAG', 'notes' => null]]);
        $this->item($u, $car, 'car_expense', 'Taxă pod Fetești', ['amount' => 15, 'category' => 'Taxe de drum', 'due_at' => $this->at(-75, 0), 'metadata' => ['odometer' => $odoAt(-75), 'provider' => null, 'notes' => 'Drum spre mare']]);
        $this->item($u, $car, 'car_expense', 'Detailing interior complet', ['amount' => 180, 'category' => 'Spălătorie', 'due_at' => $this->at(-2, 0), 'metadata' => ['odometer' => $lastOdo, 'provider' => 'Clean Car Studio', 'notes' => null]]);
    }

    // ---- Casă (Apartament Cluj) ---------------------------------------

    private function seedHome(User $u, Space $home): void
    {
        $p = new HomeProfile(['county' => 'Cluj', 'city' => 'Cluj-Napoca', 'ownership' => 'bought', 'purchase_price' => 485000]);
        $p->space_id = $home->id;
        $p->save();

        $task = function (string $title, ?int $due, array $meta = [], array $attrs = []) use ($u, $home) {
            return $this->item($u, $home, 'home_task', $title, array_merge([
                'due_at' => $due === null ? null : $this->at($due, 0),
                'metadata' => array_merge(['isPurchase' => false, 'isRecurring' => false, 'recurrenceFrequency' => null, 'spendHistory' => []], $meta),
            ], $attrs));
        };
        // One-off, open.
        $task('Schimbă becul din hol', null);
        $task('Sună administratorul pentru citirea apometrelor', -4, [], ['notes' => 'Tel. 0744 000 000']);
        $task('Programează curățarea covoarelor', 3);
        $task('Cumpără perdele noi pentru dormitor', 9, ['isPurchase' => true]);
        $task('Duce hainele vechi la donat', 0);
        // Recurring (frequency in metadata; recurrence column stays null).
        $task('Udă florile', 0, ['isRecurring' => true, 'recurrenceFrequency' => 'daily'], ['completed_at' => $this->at(-1, 19)]);
        $task('Scoate gunoiul reciclabil', 2, ['isRecurring' => true, 'recurrenceFrequency' => 'weekly'], ['completed_at' => $this->at(-5, 20)]);
        $task('Curăță filtrul hotei', 18, ['isRecurring' => true, 'recurrenceFrequency' => 'monthly'], ['completed_at' => $this->at(-12, 11)]);
        $task('Schimbă așternuturile', -1, ['isRecurring' => true, 'recurrenceFrequency' => 'weekly'], ['completed_at' => $this->at(-8, 10)]);
        // Resolved purchase tasks (archive + spend; due_at = when it was paid).
        $task('Cumpără aspirator vertical', -6, ['isPurchase' => true, 'spendHistory' => [['date' => $this->js(-6, 17), 'amount' => 1299]]], ['status' => 'completed', 'completed_at' => $this->at(-6, 17), 'amount' => 1299]);
        $task('Cumpără saltea nouă', -68, ['isPurchase' => true, 'spendHistory' => [['date' => $this->js(-68, 16), 'amount' => 1850]]], ['status' => 'completed', 'completed_at' => $this->at(-68, 16), 'amount' => 1850]);
        $task('Cadou de casă nouă pentru Ioana', -33, ['isPurchase' => true, 'spendHistory' => [['date' => $this->js(-33, 18), 'amount' => 240]]], ['status' => 'completed', 'completed_at' => $this->at(-33, 18), 'amount' => 240]);
        // Resolved, no price.
        $task('Montează rafturile în debara', -40, [], ['status' => 'completed', 'completed_at' => $this->at(-38, 15)]);
        $task('Desfundă scurgerea de la duș', -15, [], ['status' => 'completed', 'completed_at' => $this->at(-15, 21)]);

        // Bills (home_recurring): due_at = next payment; paid = advanced
        // due_at + a spendHistory event; restant = due_at in the past.
        $bill = function (string $title, float $amount, string $freq, int $due, array $paidOffsets, bool $gf = false, ?string $notes = null) use ($u, $home) {
            return $this->item($u, $home, 'home_recurring', $title, [
                'amount' => $amount, 'category' => 'Other', 'recurrence' => $freq, 'due_at' => $this->at($due, 0),
                'metadata' => ['notes' => $notes, 'spendHistory' => array_map(fn ($o) => ['date' => $this->js($o, 18), 'amount' => $amount], $paidOffsets)],
            ]);
        };
        $monthAgo = fn (int $m, int $day) => $this->offsetOf($this->now->copy()->startOfMonth()->subMonthsNoOverflow($m)->addDays($day - 1));
        // Paid this month on the 5th (or, before the 5th, due on it).
        $thisFifth = $monthAgo(0, 5);
        $thisFifth <= 0
            ? $bill('Întreținere asociație', 420, 'monthly', $this->offsetOf($this->now->copy()->startOfMonth()->addMonthNoOverflow()->addDays(4)), [$monthAgo(2, 5), $monthAgo(1, 5), $thisFifth])
            : $bill('Întreținere asociație', 420, 'monthly', $thisFifth, [$monthAgo(2, 5), $monthAgo(1, 5)]);
        $bill('Electricitate (Electrica)', 240, 'monthly', -6, [$monthAgo(2, 4), $monthAgo(1, 4)], false, 'Restantă');
        $bill('Gaze naturale (Engie)', 310, 'monthly', 3, [$monthAgo(2, 13), $monthAgo(1, 13)]);
        $bill('Internet și TV (Digi)', 65, 'monthly', 12, [$monthAgo(2, 22), $monthAgo(1, 22)]);
        $bill('Netflix', 62, 'monthly', 8, [$monthAgo(1, 18)], true);
        $bill('Apă plată la domiciliu', 35, 'weekly', 4, [-3, -10, -17]);
        $bill('Asigurare locuință (PAD)', 130, 'yearly', 150, [-215]);

        // Maintenance.
        $maint = function (string $title, int $date, float $price, ?string $freq, ?int $interval, ?int $next, array $attrs = [], array $spend = []) use ($u, $home) {
            return $this->item($u, $home, 'home_maintenance', $title, array_merge([
                'amount' => $price, 'due_at' => $this->at($date, 0), 'recurrence' => $freq,
                'metadata' => [
                    'description' => $title, 'provider' => null,
                    'nextDueDate' => $next === null ? null : $this->ymd($next),
                    'recurrenceInterval' => $freq ? $interval : null,
                    'spendHistory' => array_map(fn ($o) => ['date' => $this->js($o, 15), 'amount' => $price], $spend),
                ],
            ], $attrs));
        };
        $maint('Revizie centrală termică', -340, 250, 'yearly', 1, 25, [], [-340]);           // next in 25 days
        $maint('Curățare filtre aer condiționat', -85, 150, 'monthly', 3, 5, [], [-85]);      // every 3 months, in 5 days
        $maint('Schimbare cartuș filtru apă', -70, 90, 'monthly', 2, -9, [], [-70]);          // restant (9 days)
        $maint('Reparație robinet bucătărie', -45, 220, null, null, null, ['metadata' => ['description' => 'Garnitură + manoperă', 'provider' => 'Instalator Mihai', 'nextDueDate' => null, 'recurrenceInterval' => null, 'spendHistory' => []]]);
        $maint('Zugrăvit dormitor', -105, 1400, null, null, null, ['status' => 'completed', 'completed_at' => $this->at(-100, 18)]);
        $maint('Verificare instalație electrică', -190, 300, null, null, null, ['status' => 'completed', 'completed_at' => $this->at(-188, 12)]);

        // Expenses.
        $exp = [
            [-2, 'Becuri LED (4 buc.)', 64], [-9, 'Detergenți și consumabile', 138], [-24, 'Set prosoape', 179],
            [-41, 'Ghivece balcon', 96], [-55, 'Mobilier balcon', 890, true], [-77, 'Draperie living', 320],
            [-96, 'Prelungitor + prize', 85], [-131, 'Cuier hol', 210], [-160, 'Veselă nouă', 345], [-205, 'Covor baie', 75],
        ];
        foreach ($exp as $e) {
            $this->item($u, $home, 'home_expense', $e[1], ['amount' => $e[2], 'due_at' => $this->at($e[0], 0), 'metadata' => ['notes' => null]]);
        }

        // Documents (ISO dates).
        $hdoc = function (string $title, string $type, string $issuer, int $issue, int $expiry) use ($u, $home) {
            $this->item($u, $home, 'home_document', $title, [
                'due_at' => $this->at(min($issue, 0), 0),
                'metadata' => ['documentType' => $type, 'issuer' => $issuer, 'issueDate' => $this->ymd($issue), 'expiryDate' => $this->ymd($expiry)],
            ]);
        };
        $hdoc('Asigurare facultativă locuință', 'Asigurare', 'Groupama', -360, 5);   // expires in 5 days
        $hdoc('Contract internet Digi', 'Contract', 'Digi', -60, 670);
        $hdoc('Certificat energetic', 'Certificat', 'Auditor energetic', -900, 2750);
        $hdoc('Garanție centrală termică', 'Garanție', 'Viessmann', -1100, -30);   // expired

        // Supplies: "low" is estimated from restockHistory (>= 2 events).
        $supply = function (string $name, string $cat, string $unit, array $history, ?string $notes = null) use ($u, $home) {
            $last = end($history);

            return $this->item($u, $home, 'home_supply', $name, [
                'category' => $cat,
                'due_at' => $this->at($last[0], 18),
                'metadata' => [
                    'quantity' => $last[1], 'unit' => $unit, 'notes' => $notes,
                    'restockHistory' => array_map(fn ($h) => ['date' => $this->js($h[0], 18), 'quantity' => $h[1]], $history),
                ],
            ]);
        };
        $paper = $supply('Hârtie igienică', 'Baie', 'role', [[-96, 8], [-64, 8], [-33, 8]]);   // low
        $supply('Detergent rufe', 'Spălătorie', 'buc', [[-52, 1], [-27, 1]]);                   // low
        $supply('Cafea boabe', 'Bucătărie', 'pungi', [[-31, 2], [-17, 2]]);                      // low
        $supply('Bureți de vase', 'Bucătărie', 'buc', [[-22, 6], [-6, 6]]);                       // ok (~10 days)
        $supply('Tablete mașina de vase', 'Bucătărie', 'buc', [[-45, 40], [-4, 40]]);             // ok
        $supply('Sare grunjoasă', 'Bucătărie', 'kg', [[-200, 1], [-20, 1]]);                       // ok
        $supply('Săpun lichid', 'Baie', 'buc', [[-12, 2]]);                                         // 1 event: no estimate yet

        $this->homePaperSupplyId = (string) $paper->id;
    }

    private string $homePaperSupplyId = '';

    // ---- Casă părinților (second home, inherited) ---------------------

    private function seedParents(User $u, Space $s): void
    {
        $p = new HomeProfile(['county' => 'Maramureș', 'city' => 'Baia Mare', 'ownership' => 'inherited', 'purchase_price' => null]);
        $p->space_id = $s->id;
        $p->save();

        $this->item($u, $s, 'home_task', 'Repară gardul din spate', ['due_at' => $this->at(14, 0), 'metadata' => ['isPurchase' => false, 'isRecurring' => false, 'recurrenceFrequency' => null, 'spendHistory' => []]]);
        $this->item($u, $s, 'home_task', 'Cumpără vopsea pentru poartă', ['due_at' => $this->at(-2, 0), 'metadata' => ['isPurchase' => true, 'isRecurring' => false, 'recurrenceFrequency' => null, 'spendHistory' => []]]);
        $this->item($u, $s, 'home_recurring', 'Impozit clădire', ['amount' => 480, 'category' => 'Other', 'recurrence' => 'yearly', 'due_at' => $this->at(80, 0), 'metadata' => ['notes' => 'Primăria Baia Mare', 'spendHistory' => [['date' => $this->js(-285, 12), 'amount' => 480]]]]);
        $this->item($u, $s, 'home_recurring', 'Electricitate casă părinți', ['amount' => 110, 'category' => 'Other', 'recurrence' => 'monthly', 'due_at' => $this->at(16, 0), 'metadata' => ['notes' => null, 'spendHistory' => [['date' => $this->js(-14, 12), 'amount' => 110]]]]);
        $this->item($u, $s, 'home_maintenance', 'Curățat coșul de fum', ['amount' => 200, 'recurrence' => 'yearly', 'due_at' => $this->at(-320, 0), 'metadata' => ['description' => 'Coșar autorizat', 'provider' => null, 'nextDueDate' => $this->ymd(45), 'recurrenceInterval' => 1, 'spendHistory' => [['date' => $this->js(-320, 12), 'amount' => 200]]]]);
        $this->item($u, $s, 'home_expense', 'Lemne de foc', ['amount' => 1200, 'due_at' => $this->at(-120, 0), 'metadata' => ['notes' => '3 m³']]);
        $this->item($u, $s, 'home_document', 'Asigurare obligatorie PAD', ['due_at' => $this->at(-165, 0), 'metadata' => ['documentType' => 'Asigurare', 'issuer' => 'PAID', 'issueDate' => $this->ymd(-165), 'expiryDate' => $this->ymd(200)]]);
        $this->item($u, $s, 'home_supply', 'Lemne de foc', ['category' => 'Încălzire', 'due_at' => $this->at(-120, 12), 'metadata' => ['quantity' => 3, 'unit' => 'm³', 'notes' => null, 'restockHistory' => [['date' => $this->js(-480, 12), 'quantity' => 3], ['date' => $this->js(-120, 12), 'quantity' => 3]]]]);
        $this->item($u, $s, 'home_supply', 'Becuri', ['category' => 'Altele', 'due_at' => $this->at(-70, 12), 'metadata' => ['quantity' => 2, 'unit' => 'buc', 'notes' => null, 'restockHistory' => [['date' => $this->js(-150, 12), 'quantity' => 2], ['date' => $this->js(-70, 12), 'quantity' => 2]]]]);
    }

    // ---- Cumpărături ---------------------------------------------------

    private function seedGrocery(User $u, User $ana, Space $grocery, Space $anaGrocery, Space $home): array
    {
        $recipeIds = Recipe::whereNull('user_id')->whereIn('title', ['Chicken & Broccoli Bowl', 'Spaghetti Carbonara'])->pluck('id')->map(fn ($id) => (string) $id)->values()->all();

        $list = function (User $owner, Space $space, string $name, int $createdDaysAgo, array $recipes = []) {
            $l = $this->item($owner, $space, 'grocery_list', $name, ['metadata' => ['recipeIds' => $recipes]]);
            $l->created_at = $this->at(-$createdDaysAgo, 9);
            $l->save();

            return $l;
        };
        $add = function (Item $l, User $by, string $title, string $cat, ?string $qty, bool $inCart = false, ?string $supplyId = null) {
            $this->item($by, null, 'grocery_item', $title, [
                'space_id' => $l->space_id, 'category' => $cat,
                'metadata' => ['listId' => (string) $l->id, 'quantity' => $qty, 'inCart' => $inCart, 'linkedSupplyId' => $supplyId],
            ]);
        };

        $main = $list($u, $grocery, 'Lista săptămânală', 30, $recipeIds);
        foreach ([
            ['Roșii', 'Vegetables', '1 kg', true], ['Castraveți', 'Vegetables', '4 buc'], ['Ceapă', 'Vegetables', '1 kg'],
            ['Usturoi', 'Vegetables', '2 căpățâni', true], ['Morcovi', 'Vegetables', '1 kg'], ['Broccoli', 'Vegetables', '2 buc'],
            ['Mere', 'Fruits', '2 kg', true], ['Banane', 'Fruits', '1 kg'], ['Lămâi', 'Fruits', '3 buc'], ['Portocale', 'Fruits', '2 kg'],
            ['Piept de pui', 'Protein', '1 kg', true], ['Ouă', 'Protein', '10 buc'], ['Carne tocată', 'Protein', '500 g'],
            ['Orez', 'Grains / Starches', '1 kg'], ['Spaghete', 'Grains / Starches', '2 pachete', true], ['Ulei de măsline', 'Healthy Fats', '1 sticlă'],
            ['Lapte', 'Dairy', '2 l'], ['Iaurt grecesc', 'Dairy', '4 buc', true], ['Brânză telemea', 'Dairy', '400 g'], ['Unt', 'Dairy', '1 buc'],
            ['Pâine integrală', 'Bakery', '1 buc'], ['Detergent vase', 'Household', '1 buc'], ['Saci menajeri', 'Household', '1 rolă'],
        ] as $r) {
            $add($main, $u, $r[0], $r[1], $r[2], $r[3] ?? false);
        }
        // Added from the Casă low-supply suggestion (linked to the supply).
        $add($main, $u, 'Hârtie igienică', 'Household', '8 role', false, $this->homePaperSupplyId);

        // Shared with Ana (list_members) -- she adds items too.
        $party = $list($u, $grocery, 'Petrecere sâmbătă', 6);
        $party->members()->attach($ana->id);
        foreach ([['Chipsuri', 'Other', '3 pungi'], ['Suc de portocale', 'Other', '2 l', true], ['Pizza congelată', 'Other', '3 buc'], ['Pahare de unică folosință', 'Household', '1 set'], ['Bere', 'Other', '12 doze']] as $r) {
            $add($party, $u, $r[0], $r[1], $r[2], $r[3] ?? false);
        }
        foreach ([['Brânză de burduf', 'Dairy', '300 g'], ['Struguri', 'Fruits', '1 kg'], ['Covrigi', 'Bakery', '2 pungi']] as $r) {
            $add($party, $ana, $r[0], $r[1], $r[2]);
        }

        $diy = $list($u, $grocery, 'Bricolaj Dedeman', 2);
        foreach ([['Șuruburi lemn 4x40', 'Bricolaj', '1 cutie'], ['Silicon sanitar', 'Bricolaj', '1 tub'], ['Bandă izolieră', 'Bricolaj', '2 buc'], ['Dibluri 6 mm', 'Bricolaj', '20 buc']] as $r) {
            $add($diy, $u, $r[0], $r[1], $r[2]);
        }

        // Ana's own list in her own space.
        $anaList = $list($ana, $anaGrocery, 'Piață', 3);
        foreach ([['Ardei kapia', 'Vegetables', '1 kg'], ['Cartofi noi', 'Vegetables', '2 kg'], ['Smântână', 'Dairy', '1 buc']] as $r) {
            $add($anaList, $ana, $r[0], $r[1], $r[2]);
        }

        // Finished shopping trips (grocery_trip) -- roughly weekly, a year back.
        $titles = ['Lista săptămânală', 'Lista săptămânală', 'Lista săptămânală', 'Piața de sâmbătă'];
        $k = 0;
        for ($off = -360; $off <= 0; $off += mt_rand(6, 9)) {
            $name = $titles[$k++ % count($titles)];
            $this->item($u, $grocery, 'grocery_trip', 'Cumpărături -- ' . $name, [
                'amount' => $this->rnd(220, 480, 0) + 0.5 * mt_rand(0, 1), 'category' => 'Grocery',
                'due_at' => $this->at($off, 18, 30), 'metadata' => ['listId' => (string) $main->id],
            ]);
        }
        // Today's trip + a treat.
        $this->item($u, $grocery, 'grocery_trip', 'Cumpărături -- Lista săptămânală', ['amount' => 312.4, 'category' => 'Grocery', 'due_at' => $this->at(0, 9, 15), 'metadata' => ['listId' => (string) $main->id]]);
        $this->item($u, $grocery, 'grocery_trip', 'Cumpărături -- Delicatese', ['amount' => 185, 'category' => 'Grocery', 'due_at' => $this->at(-4, 19), 'metadata' => ['listId' => (string) $party->id]]);

        return [$main, $party, $diy];
    }

    // ---- Cheltuieli ----------------------------------------------------

    private function seedExpenses(User $u, Space $exp, Space $car, Space $home): void
    {
        $pool = [
            ['Farmacie', 40, 160], ['Restaurant', 120, 340], ['Frizer', 60, 80], ['Cinema', 50, 90],
            ['Haine', 150, 420], ['Cărți', 45, 130], ['Cadou', 80, 250], ['Taxi Bolt', 18, 55], ['Cafenea', 15, 40],
        ];
        for ($m = 11; $m >= 0; $m--) {
            $start = $this->now->copy()->startOfMonth()->subMonthsNoOverflow($m);
            // Gym every month on the 2nd.
            $gym = $start->copy()->addDay();
            if ($gym->lte($this->now)) {
                $this->item($u, $exp, 'expense_item', 'Abonament sală World Class', ['amount' => 189, 'due_at' => $this->at($this->offsetOf($gym), 0)]);
            }
            $count = mt_rand(3, 6);
            for ($i = 0; $i < $count; $i++) {
                $date = $start->copy()->addDays(mt_rand(0, $start->daysInMonth - 1));
                if ($date->gt($this->now)) {
                    continue;
                }
                [$title, $min, $max] = $pool[mt_rand(0, count($pool) - 1)];
                $this->item($u, $exp, 'expense_item', $title, ['amount' => $this->rnd($min, $max, 0), 'due_at' => $this->at($this->offsetOf($date), 0)]);
            }
        }
        $this->item($u, $exp, 'expense_item', 'Medic stomatolog', ['amount' => 350, 'notes' => 'Plombă + detartraj', 'due_at' => $this->at(-47, 0)]);
        $this->item($u, $exp, 'expense_item', 'Cafea și croissant', ['amount' => 24, 'due_at' => $this->at(0, 0)]);
        // Treats.
        $this->item($u, $exp, 'expense_item', 'Bilet concert Coldplay', ['amount' => 420, 'notes' => null, 'due_at' => $this->at(-38, 0)]);
        $this->item($u, $exp, 'expense_item', 'Cină aniversare', ['amount' => 280, 'due_at' => $this->at(-70, 0)]);
        $this->item($u, $exp, 'expense_item', 'Căști wireless', ['amount' => 399, 'due_at' => $this->at(-95, 0)]);

        // Credits: one per linked space + one finished.
        $this->credit($u, $exp, 'Credit auto Golf', 610, 15, $this->now->copy()->addMonthsNoOverflow(30)->day(15)->format('Y-m-d'), $car);
        $this->credit($u, $exp, 'Credit renovare apartament', 350, 5, $this->now->copy()->addMonthsNoOverflow(17)->day(5)->format('Y-m-d'), $home);
        $this->credit($u, $exp, 'Rate telefon', 210, 20, $this->now->copy()->subMonthsNoOverflow(2)->day(20)->format('Y-m-d'), null, true);
    }

    // ---- Calendar (custom_event, no space) ------------------------------

    private function seedCalendar(User $u): void
    {
        $ev = fn (string $title, int $off, int $h, int $m, ?float $amount = null, ?string $rec = null, bool $gf = false, ?string $notes = null, string $status = 'pending')
            => $this->item($u, null, 'custom_event', $title, ['due_at' => $this->at($off, $h, $m), 'amount' => $amount, 'recurrence' => $rec, 'notes' => $notes, 'status' => $status]);

        $ev('Programare dentist', 0, 15, 30);
        $ev('Trimite actele la contabil', -3, 10, 0);
        $ev('Ședința asociației de proprietari', 4, 19, 0);
        $ev('Ziua mamei', 12, 18, 0, 250, 'yearly', false, 'Cadou: parfum');
        $ev('Nunta Andreei și a lui Vlad', 40, 16, 0, 1500, null, false, 'Dar + cazare');
        $ev('Cadou aniversare Ana', -20, 12, 0, 320, null, false, null, 'completed');
        $ev('Antrenament fotbal', -59, 20, 0, null, 'weekly');
        $ev('Abonament Spotify', -95, 9, 0, 26, 'monthly', true);
        $ev('Revizie anuală la medicul de familie', 75, 9, 30, null, 'yearly');
        $ev('Weekend la munte -- avans cazare', 22, 12, 0, 600);
    }

    // ---- Ana (shared car + her own data) --------------------------------

    private function seedAna(User $ana, Space $car): void
    {
        $p = new CarProfile(['make' => 'Renault', 'model' => 'Clio V', 'color' => 'Roșu', 'year' => 2021, 'purchase_price' => 68000, 'tank_capacity' => 42]);
        $p->space_id = $car->id;
        $p->save();
        $odo = 41200;
        foreach ([-50, -32, -15] as $i => $off) {
            $odo += 520;
            $this->item($ana, $car, 'car_fuel', 'OMV', ['amount' => 215 + $i * 7, 'due_at' => $this->at($off, 0), 'metadata' => ['liters' => 29.4, 'odometer' => $odo, 'level_before' => 25, 'level_after' => 95, 'station' => 'OMV']]);
        }
        $this->item($ana, $car, 'car_document', 'ITP', ['amount' => 160, 'due_at' => $this->at(-715, 10), 'metadata' => ['documentType' => 'ITP', 'issuer' => 'RAR', 'issueDate' => $this->dmy(-715), 'expiryDate' => $this->dmy(15), 'notes' => null, 'renewedFromId' => null]]);
        $this->item($ana, $car, 'car_maintenance', 'Oil Change', ['amount' => 390, 'due_at' => $this->at(-90, 0), 'metadata' => ['description' => 'Schimb ulei + filtru', 'odometer' => 40100, 'provider' => 'Dacia Service', 'nextServiceOdometer' => 55100, 'nextServiceDate' => $this->dmy(275), 'underWarranty' => false, 'renewedFromId' => null]]);
    }

    private function seedRecipe(User $u): void
    {
        $r = Recipe::create([
            'user_id' => $u->id, 'title' => 'Ciorbă de perișoare', 'image_key' => 'restaurant-outline', 'time_minutes' => 75, 'difficulty' => 'Medium',
            'tags' => ['lunch', 'dinner', 'romanian'],
            'steps' => ['Amestecă carnea tocată cu orezul, ceapa și condimentele; formează perișoare.', 'Fierbe legumele tăiate mărunt 20 de minute.', 'Adaugă perișoarele și fierbe încă 25 de minute.', 'Acrește cu borș, potrivește de sare și presară leuștean.'],
        ]);
        foreach ([['Carne tocată', '500 g'], ['Orez', '50 g'], ['Ceapă', '2 buc'], ['Morcovi', '2 buc'], ['Ardei gras', '1 buc'], ['Borș', '1 l'], ['Leuștean', '1 legătură']] as $i => [$name, $qty]) {
            $r->ingredients()->create(['name' => $name, 'quantity' => $qty, 'sort_order' => $i]);
        }
    }

    // ---- Buget -----------------------------------------------------------

    private function seedBudget(User $u): void
    {
        // Buget simplu: 10.000 lei income, 1.500 put aside (the old default
        // split's 15% short-term jar) -> 8.500 De cheltuit.
        $u->monthly_income = 10000;
        $u->monthly_set_aside = 1500;
        $u->budget_plan_set_at = $this->now->copy()->subMonthsNoOverflow(4)->startOfMonth()->addDays(2)->setTimezone('UTC');
        $u->save();

        // The one Economii goal (savePlan creates it at target 0); given a
        // real target. last_applied_month = last month, so the controller's
        // rollover starts with next month instead of re-adding history.
        SavingsGoal::create([
            'user_id' => $u->id,
            'target_amount' => 15000,
            'current_amount' => 6240,
            'target_date' => $this->now->copy()->addMonthsNoOverflow(8)->toDateString(),
            'last_applied_month' => $this->now->copy()->subMonthNoOverflow()->startOfMonth()->toDateString(),
        ]);
    }

    /** 12 completed months of archive, computed by the controller itself.
     * archiveCompletedMonths only bootstraps ONE month when nothing is
     * archived, so a placeholder 13 months back makes it walk the whole
     * year; the placeholder is removed afterwards. */
    private function backfillArchive(User $u): void
    {
        $lastMonth = $this->now->copy()->subMonthNoOverflow();
        $placeholderMonth = $this->now->copy()->startOfMonth()->subMonthsNoOverflow(13)->toDateString();
        DB::table('budget_archives')->insert(['user_id' => $u->id, 'month' => $placeholderMonth, 'category' => '__demo_seed', 'spent' => 0, 'created_at' => now(), 'updated_at' => now()]);
        try {
            $controller = app(BudgetController::class);
            $method = new \ReflectionMethod($controller, 'archiveCompletedMonths');
            $method->setAccessible(true);
            $method->invoke($controller, $u, $lastMonth);
        } finally {
            DB::table('budget_archives')->where('user_id', $u->id)->where('category', '__demo_seed')->delete();
        }
    }
}
