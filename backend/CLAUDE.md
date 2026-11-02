# backend map

See `../CLAUDE.md` first. Laravel API, Sanctum auth. Almost everything
is one polymorphic `items` table — read `app/Models/Item.php`'s own
doc comments before touching anything budget/dashboard/calendar
related, they're extensive and current.

## Language (2026-10-15)

`config app.locale` = **ro** (`APP_LOCALE=ro`), fallback en. Every API
request runs `App\Http\Middleware\SetLocale` (prepended to the api group in
`bootstrap/app.php`): `Accept-Language` ro|en (the app sends it, frontend
lib/i18n), anything else -> ro. Validation messages: `lang/ro/validation.php`
(full Romanian set + readable `attributes`: amount -> "sumă", due_at ->
"dată") and `lang/en/validation.php` (published defaults). Controller
messages are still hard-coded Romanian strings -- wrap them in `__()` with
lang/en entries when translating. Notifications/emails render in `ro`
explicitly. Test: `tests/Feature/LocaleTest.php` (Symfony's test request
defaults to `en-us`: send an empty Accept-Language for "no preference").

## Controllers (`app/Http/Controllers/Api/`)

- `AuthController.php` — register/login/logout/user. `/register` and
  `/login` are both wrapped in a `throttle:auth` middleware group
  (5/min/IP, defined in `AppServiceProvider::boot()`) — confirmed live
  during the 2026-09-29 full-app QA sweep (hit a real 429 after 5 rapid
  attempts). Was previously mis-documented here as missing.
  **Auth emails (2026-10-08):** every email link is an HTTPS link to
  this backend's `GET /open/{screen}?token=..&email=..` (`routes/web.php`
  → `OpenAppController`, view `open-app.blade.php`; screen allow-list
  `reset-password|verify-email|confirm-email`, throttle `open-link`),
  a Romanian page that redirects to `{APP_DEEP_LINK_BASE}/{screen}?..`
  (Expo Go: `exp://<frontend tunnel>/--`; own build: `orgos://`). Both
  URLs are built by `app/Support/AppLink.php` from `config('app.url')`
  / `config('app.deep_link_base')` -- never `url()` (request host is
  127.0.0.1 behind the tunnel). `dev.ps1` rewrites `APP_URL`,
  `FRONTEND_URL`, `APP_DEEP_LINK_BASE` in `backend/.env` on every run.
  Registration verification: `register` emails `VerifyEmailNotification`
  (token sha256-hashed in `email_verification_tokens`, one per user,
  24h, single use); `POST /email/verify` {email, token, password, password_confirmation} (public,
  `password-reset` throttle) and `POST /email/verification-notification`
  (auth, `verification-notification` limiter 1/min + 6/h, Romanian 429
  with `retry_after`). Unverified users are NOT blocked; `/user` returns
  `email_verified_at`. Confirming an email change also sets it. Notifications
  render in `ro` (`lang/ro.json` translates the mail layout's strings).
  **Mail:** `MAIL_MAILER=log` (emails land in `storage/logs/laravel.log`)
  until Brevo SMTP credentials exist -- the exact keys are commented in
  `.env.example` (`smtp-relay.brevo.com:587`, SMTP login + SMTP key,
  verified sender as `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME=orgOS`).
  Sending is synchronous and every send catches mail failures:
  `register` still succeeds, resend and `PUT /profile/email` return a
  Romanian 503 (the email change drops its pending row), and
  `forgot-password` logs, drops the broker's token row and still returns
  its generic 200 (a 503 would reveal the account exists). `/open/*` is
  stateless (no session/cookie middleware).
  **First-use tours (2026-10-08):** `PUT /user/tours/{key}` (`markTour`;
  key in `TOUR_KEYS`, else 404; body `{status: done|skipped, version:
  1..100}`; merges `users.tours[key] = {status, v, at}`, answers `{tours}`)
  and `DELETE /user/tours` (`resetTours`, column -> null, answers
  `{tours: {}}`). `/user`, login and register return `tours` (null = none
  seen). Tests: `tests/Feature/UserToursTest.php`.
  **Social login (2026-10-08, QA-hardened):** `Api/SocialAuthController.php`
  + `SocialWebController.php` (web) + `app/Services/SocialAuth/`
  (`SocialAuthService` = linking rules/state/nonces/exchange codes,
  `AppleIdentityVerifier` = RS256 against Apple's JWKS, cached 24h,
  refetched once on an unknown `kid`, which is then negative-cached 5 min;
  JWT leeway 5s; `SocialAuthException` = `{message (ro), error (code)}`).
  Table `social_accounts` (user_id cascade, provider, provider_user_id,
  email, `email_verified` = did the provider vouch for the email;
  unique(provider, provider_user_id)). `users.has_password` (default
  true; false = random password the user never knew).
  Endpoints: `GET /api/auth/providers` -> `{apple: true, google, facebook}`
  (bool = client id+secret in `.env`). `POST /api/auth/apple/nonce` ->
  `{nonce}` (48 chars, 10 min, single use; own `apple-nonce` limiter
  20/min/IP, NOT the login bucket). `POST /api/auth/apple`
  {identity_token, nonce, full_name?: {given, family}}: nonce consumed
  first (success or failure), token's `nonce` claim must equal the raw
  nonce or its hex sha256; aud in `APPLE_CLIENT_IDS`.
  **`APPLE_CLIENT_IDS` defaults to `host.exp.Exponent` (Expo Go) -- that
  audience is shared by EVERY app running in Expo Go, so any Expo Go app
  can mint tokens with our aud. Remove it (set `APPLE_CLIENT_IDS` to the
  own bundle id only) as soon as the own build exists.** The nonce
  limits the damage meanwhile (a token must carry a nonce we issued).
  Google/Facebook: `GET /auth/{google|facebook}/redirect?app_redirect=
  <deep link>` (must start at a boundary under `APP_DEEP_LINK_BASE` or
  `orgos://`, else 400 -- no open redirect; state = random 64 in the
  cache, 10 min, single use; stateless like `/open`) -> provider ->
  `GET /auth/{p}/callback` -> 302 `{app_redirect}?code=<64, 2 min,
  single use, sha256-keyed in cache>` or `?error=<code>` -> `POST
  /api/auth/exchange` {code}. apple + exchange share the `auth` limiter
  with login/register. Success = login shape + `created`.
  Linking: known (provider, id) -> that user. Else a VERIFIED provider
  email (Apple email_verified, Google email_verified; Facebook is NEVER
  verified) matching a user -> link; if that account was itself never
  verified, `evictUnprovenOwner` burns its password (has_password=false),
  tokens, `email_change_requests`, `password_reset_tokens`,
  verification tokens and unverified links (pre-account-takeover guard).
  Unverified email matching a user -> 409 `email_unverified_exists`
  (never links; when that account has no password, the message adds
  "sau folosește „Ai uitat parola?”" and the response carries `hint:
  "no_password"` -- JSON body, or `&hint=no_password` on the web flow's
  deep link); no email -> 422 `email_missing`; else create (random
  password, has_password=false, verified iff the provider says so,
  `user` role, link `created_account=true`). Address proof (2026-10-19 audit fixes): verify-email requires a new
  password + confirmation, revokes every old session and pending reset/email
  change, and consumes its token under a transaction/row lock. Verification,
  password recovery and email change drop ALL unverified social links, including
  creator links; mailbox ownership does not prove that provider identity.
  Verified provider links remain. First-sign-in race: a
  unique violation retries once, a concurrency error (MySQL 1213
  deadlock / lock wait) up to 3 attempts, instead of 500ing.
  All access-token issuance uses `Support/AuthSession`: the resolved credential
  snapshot must still match the locked user row, and token creation stays in
  that transaction. Social exchange codes bind the same snapshot; mailbox
  proof/password/email changes invalidate pending codes. Exchange locks the
  user before consuming its code and holds the lock through token creation.
  Tests: `tests/Feature/SocialExchangeRevocationTest.php`.
  `POST /profile/password/set` {password, password_confirmation} (auth)
  only when has_password=false (else 409 `password_already_set`);
  resetPassword/updatePassword also set has_password=true;
  updatePassword/requestEmailChange still require current_password.
  `User::toAuthPayload()` adds `providers: [...]` to /user, login,
  register, set-password and social responses (`has_password` is a
  column, always serialized). Provider redirect URI to register:
  `{APP_URL}/auth/{provider}/callback`. Tests:
  `tests/Feature/SocialLoginTest.php` (local RSA key via phpseclib +
  `Http::fake` JWKS, Socialite mocked). Live testing: run a spare
  `php -S` from `public/` with `CACHE_STORE=file` so the phone's
  IP-keyed limiters (DB cache, everyone is 127.0.0.1) aren't burned.
- `SpaceController.php` — CRUD on `spaces`, car-profile/home-profile
  sub-updates, space membership (`members`/`addMember`/`removeMember`).
  **Colour (2026-10-09):** `store`/`update` take `color` = one of
  `Space::PALETTE_KEYS` (the frontend's SPACE_PALETTE keys, keep in sync)
  or null (= the kind's default); anything else -> Romanian 422
  (`Space::COLOR_MESSAGE`). Older rows may still hold a hex, which the
  frontend ignores. Every `with('space:...')` in Dashboard/Calendar/Budget
  loads `id,name,icon,type,color` so rows outside the space can show its
  colour. Tests: `tests/Feature/SpaceColorTest.php`.
  `destroy` cascade-deletes the space's own items too (as of the
  2026-09-29 QA-sweep fix) — `items.space_id` is `cascadeOnDelete`,
  matching `car_profiles`/`home_profiles`/`space_members`.
  `store` takes an optional `credit` {title, amount, day_of_month,
  end_date} (car/home only, 2026-10-08, "În rate"): one transaction
  creates the space, the user's first OWNED `type='expenses'` space in
  grid order (legacy untyped spaces are never picked) or a new "Default"
  (receipt-outline, #14B8A6), and the `expense_credit` with
  `linked_space_id` = the new space, validated by
  `App\Support\ItemBudgetRules` (the same rules as POST /items). A bad
  credit rolls everything back: 422 with `errors["credit.<field>"]`.
  Response adds `credit`, `expenses_space`, `expenses_space_created`.
  `store` also takes `profile` (car/home; same body as the profile
  endpoints) and creates it in the SAME transaction -- the Car/Home
  create forms send one request, so a bad profile leaves nothing behind
  (422 `errors["profile.<field>"]`, response adds `profile`). The PUT
  `car-profile`/`home-profile` endpoints (edits) and `store` share
  `App\Support\SpaceProfileRules` (rules + Romanian messages).
  Tests: `tests/Feature/SpaceCreditTest.php`.
  **Odometer (2026-10-09):** `PUT /spaces/{id}/car-profile/odometer`
  {odometer} (`updateCarOdometer`; owner OR member via `accessibleBy`;
  404 = not accessible / not a car; 422 = no car profile yet). Whole km,
  1..`CarProfile::ODOMETER_MAX` (2.000.000), and >=
  `CarProfile::loggedOdometer($spaceId)` = highest `metadata.odometer` on
  the space's `car_fuel`/`car_maintenance`/`car_expense` items (all
  members', archived included, rounded up) -- Romanian 422 naming that
  minimum. Stamps `odometer_updated_at` only when the value changes.
  Answers `{message, profile, logged_odometer}`. The full car-profile PUT
  never touches these two columns. Every server-side "current odometer"
  (Dashboard `carServiceDue` + `carSummaries`, Calendar
  `carServicesBetween`) = max(logged, manual) via
  `CarProfile::withManualOdometers`. Tests: `tests/Feature/CarOdometerTest.php`.
- `ItemController.php` — the workhorse. `index`/`store`/`show`/
  `update`/`destroy` (apiResource) + `myGrocery` (cross-space grocery
  lists visible to the user) + item-level `members`. `update` already
  explicitly rejects any type change that crosses the grocery/non-
  grocery boundary (checked BEFORE the pre-update-type ownership
  check even runs) — confirmed live during the 2026-09-29 QA sweep
  across 3 different retype attempts; this file used to document that
  as a known, unfixed IDOR, but it no longer reproduces. `index` preserves the personal/space query boundary but filters Grocery
  rows by list-level permission on both paths, with batched parent/member loads.
  Products require a real accessible parent; moves normalize the destination
  space, and Grocery list/product retyping is rejected. List deletion removes
  only its products in the same transaction, retaining grocery_trip history. `type` is now whitelisted
  against `Item::VALID_TYPES` (added 2026-09-29) — a value outside the
  known set is rejected with a 422, not silently accepted. `amount`
  now has a server-side `min:0` floor (added 2026-09-29) on both
  `store`/`update`. A partial `metadata` object on `update` is now
  merged over the item's existing metadata instead of overwriting the
  whole column (added 2026-09-29).
- `DashboardController.php` — also `layout`/`saveLayout`
  (`GET/PUT /dashboard/layout`, `users.dashboard_layout` JSON: the
  Acasă card arrangement, null = default; `array`-cast on User since
  2026-10-08 -- assign/read arrays, never json_encode/decode by hand) and the extra Acasă data:
  `toBuyLists` (with first items), `lowSupplies`, `cars` summaries.
  "De făcut" (overdue/today/upcoming),
  scoped by `Item::ACTIONABLE_TYPES`/`RECURRING_ACTIONABLE_TYPES`.
  Deadlines use `Item::visibleTo`, matching Calendar for shared spaces
  (2026-10-19). Personal spend totals remain scoped to the creator.
- `CalendarController.php` — month grid data + recurring projection
  (delegates to `app/Services/RecurrenceProjector.php`). Uses
  `Item::visibleTo($user)`, the more permissive scope. Feeds the
  Calendar heatmap, so every dated deadline a Space shows must be here:
  ACTIONABLE_TYPES by due_at, plus deadlines kept in metadata -- car
  documents (`effectiveDueAt`), one-off maintenance (`maintenanceNextDue`),
  Casă documents (`expiryDate`), car services by date
  (`carServicesBetween`, same superseded/"Repair" rules as Dashboard).
  Recurring maintenance is projected from `metadata.nextDueDate`
  (`projectionAnchor`), like `currentDue`. Km-only services and supplies
  have no date and stay out.
- `BudgetController.php` — per-category spend/limits, savings goal,
  monthly archive/rollover. Reads `Item::SPENDING_TYPES`/
  `SPENDING_TYPE_SPACE`/`RECURRING_TYPE_SPACE`. Also `user_id`-only
  scoped (same gap as Dashboard). **Buget simplu (2026-11-02, replaced
  the 5 jars + per-space limits):** Venit (`users.monthly_income`) →
  Pui deoparte (`users.monthly_set_aside`) → De cheltuit = income −
  set aside. `PUT /budget/plan` takes `{monthly_income, set_aside}`
  (set_aside > income → 422; an old client's `split` falls back to
  income × short_term %; first save stamps `budget_plan_set_at`).
  `GET /budget` returns `plan {monthly_income, set_aside, spendable}`,
  `necessities.envelope` (= spendable), `credit {rates, count, items}`,
  `spending`, `recurring`, `planned`, `recurringBills`, `savingsGoal`,
  `pace` (daily spend per label for Ritmul lunii). `/budget/limits*`
  and `/budget/guilt-free` are gone; `budget_split`, `budget_categories`
  rows and `items.guilt_free` stay in the DB but are read by nothing.
  Every spend sum counts ALL records (no guilt-free filter). Archive
  gets a `Spendable` row per month (on/after the plan start) -- its
  header totals come from it. `applyMonthlySavings` (lazy, per closed
  month on/after `budget_plan_set_at`): Economii += income − (everything
  spent + credit rates), i.e. set aside + what was left of De cheltuit;
  credit rates CAN lower Economii (user decision 2026-11-02). Before the
  `monthly_set_aside` migration runs: set_aside reads 0, savePlan 503s,
  archiving waits. `PUT /budget/savings-goal` also takes an optional `name`
  (max 80, blank = null, `savings_goals.name`, migration
  `2026_11_02_000002`; dropped silently until it runs) and `target_date`;
  the per day/week/month math is frontend-only (`lib/budget/goal.ts`). Known perf: ~30+ separate queries per
  request (not classic N+1, but scales linearly-ish with label count ×
  months) — fine for now, revisit if it gets slow.
- `RecipeController.php`, `IngredientReferenceController.php` —
  Grocery's recipe-matching data.
- `QuickAddController.php` — natural-language parse endpoint. Note:
  the frontend's own Quick Add sheet that would call this is
  unreachable UI (see `frontend/CLAUDE.md`), so this endpoint currently
  has no live caller.

## `app/Models/Item.php` — the type system (read the file, this is a summary)

`type` is a free string column. The constants that give it meaning:
- `ACTIONABLE_TYPES` = `home_task`, `home_recurring`, `car_document`,
  `custom_event` — what Dashboard's "De făcut" surfaces.
- `RECURRING_ACTIONABLE_TYPES` = above + `home_maintenance` (only
  queried where `recurrence` is set — a one-off maintenance visit
  isn't actionable, a recurring one is).
- `SPENDING_TYPES` = everything with a real `amount`: `car_fuel`,
  `car_maintenance`, `car_document`, `car_expense`, `home_expense`,
  `home_maintenance`, `home_task` (only once resolved as a purchase),
  `grocery_trip`, `expense_item`, `custom_event` (only if its "implică
  o cumpărare" toggle was on -- and never as a plain due_at sum:
  `app/Services/EventSpend.php` counts it PLANNED until its day, spent
  from then on, every occurrence of a repeating one in its own month;
  Budget/Dashboard exclude it from their SQL and add EventSpend. Budget
  returns `planned` per label, `GET /calendar/purchases` feeds the
  Cheltuieli space's "din Calendar" rows). `home_recurring` is deliberately
  excluded — it's summed separately via `RECURRING_TYPE_SPACE` as a
  flat monthly-equivalent, not a due_at-dated transaction.
  **`home_task` + `home_maintenance` are never summed by due_at either**
  (2026-10-15): `app/Services/HomeSpend.php` counts them per
  `metadata.spendHistory` event on the day it was paid (task = purchases
  only; no history -> completed_at/due_at snapshot), mirroring the
  frontend's `getHomeSpendRecords`. Every SQL spend sum excludes
  `HomeSpend::TYPES` and adds `HomeSpend::total/payments` (Dashboard
  `monthlyExpenses`, Budget's monthly sums, biggest, space detail). Dashboard's `monthlyExpenses` also returns `billsPaid` (bill
  spendHistory events this month) and `billsDue` (unpaid occurrences from
  each bill's stored due_at to month end) -- outside `total`, read only by
  Simplu's Acasă. Test: `tests/Feature/HomeSpendTest.php`.
- `SPENDING_TYPE_SPACE` / `RECURRING_TYPE_SPACE` — which Space label/
  icon a type rolls up under, for Budget/Dashboard grouped totals.
- `items.guilt_free` (bool, the old "Bani fără vină"): IGNORED since
  2026-11-02 (Buget simplu) -- ItemBudgetRules drops it on write (still
  `sometimes|boolean`, so old clients get no 422), no sum filters on it.
  The column and old values stay.
- `Item::CREDIT_TYPE` = `expense_credit` — a loan, one row per credit in
  the Expenses space: `amount` = monthly rate, `recurrence` forced
  `monthly`, `due_at` server-computed (next due day, user's zone),
  `metadata {day_of_month 1-31, end_date YYYY-MM-DD, linked_space_id
  car/home|null}` (validated in `App\Support\ItemBudgetRules::errors`,
  called by `ItemController::budgetFieldErrors` and `SpaceController::store`).
  Deliberately in NONE of the type constants above (never spending,
  never actionable). Read via `Item::activeCredits($month)` (open +
  end_date ≥ start of month) and `creditDueIn/creditNextDue/
  creditRemainingRates`. Calendar shows it on each due day and
  Dashboard's `today` on its day only, both with `reminder: true`
  (no resolve, never overdue).
- Grocery adds two more types outside this file's constants:
  `grocery_list`, `grocery_item` — handled directly in
  `ItemController`, not through the Item model constants above.

`RecurrenceProjector.php` (`app/Services/`): `currentDue()` is THE "when
is this due" rule Dashboard/Calendar/Budget all share -- a held type
(`home_recurring`, `home_task`) stays on its stored `due_at` until Casă
resolves it (so an unpaid bill is restant everywhere), a recurring
`home_maintenance` uses `metadata.nextDueDate`, anything else projects to
the next occurrence. All stepping happens in the user's timezone (a UTC
step drifted a day across DST) and results come back in the app zone,
because callers assign them to the datetime-cast `due_at`.
`occurrencesBetween` has separate fast-forward/enumeration caps (the old
shared-counter truncation bug is fixed). A monthly item with
`metadata.day_of_month` (credits) re-clamps to min(day, daysInMonth) on
every step (31 → 28 Feb → 31 Mar); items without it still drift 31 → 28
→ 28 (see BACKLOG "Budget-from-income backend side findings").

**Statuses:** "still open" filters use `Item::CLOSED_STATUSES`
(`completed`, `done`, `archived`) -- `completed` is canonical, `done` is
what Casă wrote before 2026-10. Dashboard also returns one-off
`home_maintenance` with a `metadata.nextDueDate` (`Item::maintenanceNextDue`),
car services due by km/date (`DashboardController::carServiceDue`, km
overdue items carry `overdue_km`), and `toBuy` (grocery items not in the
cart, per space).

## Routes (`routes/api.php`)

Public: `POST /register`, `POST /login`, `POST /forgot-password`,
`/reset-password`, `/confirm-email`, `/email/verify`, `GET
/auth/providers`, `POST /auth/apple/nonce`, `POST /auth/apple`, `POST
/auth/exchange`, and the web
routes `GET /open/{screen}`, `GET /auth/{google|facebook}/redirect|callback`. Everything else behind
`auth:sanctum`: `/user`, `/user/tours*`, `/dashboard`, `/calendar`, `/budget*`, `/spaces*`
(+ car-profile/home-profile/members sub-routes), `/grocery/mine`,
`apiResource('items', ...)` + `/items/{id}/members*`,
`apiResource('recipes', ...)`, `/ingredient-references`, `/quick-add`.

## Demo seed (`database/seeders/DemoSeeder.php`)

**Create-only realistic preview:** `RealisticDemoSeeder` reuses these fixtures
with NEW accounts `realist@orgos.test` and `realist.ana@orgos.test`. Supply a
unique password (minimum 12 chars) in the process environment variable
`ORGOS_DEMO_PASSWORD`, then run `php artisan db:seed --class=RealisticDemoSeeder`.
It refuses if either account already exists; it never calls the legacy reset
path. Creation and the 12-month budget archive share one transaction.
Do not put the generated password in source control. Tests:
`tests/Feature/RealisticDemoSeederTest.php` (preservation, API views, collision,
repeat run and password handling). It is not part of the default seed.

`php artisan db:seed --class=DemoSeeder` (NOT in DatabaseSeeder's default run). It logs in as
`demo@orgos.test` / `demo1234` ("Demo"), and creates `demo2@orgos.test` / `demo1234` ("Ana") for the sharing features.

**Idempotent.** It first deletes ONLY those two users and everything they own:
- their spaces, plus those spaces' items, profiles and members;
- their own items, `list_members`, budget limits, archive, savings goal and recipes;
- their tokens, social links, verification/reset/email-change rows, sessions and roles.

Then it recreates them. Every date is relative to now in Europe/Bucharest, so a re-run months later is still meaningful. Amounts are fixed by `mt_srand`, so the same numbers come out on every run.

**What it creates:**
- **Spaces:** Volkswagen Golf (car), Apartament Cluj (home, `indigo`), Cumpărături, Cheltuieli (`sky`), Casa părinților (2nd home, inherited, `pink`). Ana's Renault Clio is shared to Demo via `space_members`, and Ana is a member of the apartment.
- **Mașină:** 12 months of fill-ups with odometer + tank levels (consumption works), a manual odometer, and an oil change overdue by km. A revizie is due in 5 days by date. Also a multi-service visit, a warranty job (0 lei), a renewed battery (old one archived), RCA expiring in 6 days (old one archived), an expired open ITP, valid Rovinietă/CASCO, car expenses, and a "fără vină" record.
- **Casă:** tasks of every kind:
  - one-off with and without a date;
  - overdue, today;
  - daily/weekly/monthly recurring;
  - purchase tasks, open and resolved, plus resolved ones in the archive.

  Also bills (paid this month / restant / upcoming / weekly / yearly / a fără-vină Netflix), recurring and one-off maintenance (one restant, two completed), documents (expiring in 5 days, valid, expired), and supplies (3 estimated low, 3 ok, 1 with a single restock).
- **Cumpărături:** 3 lists. "Lista săptămânală" has 24 items, 6 in the cart, and one linked to the Casă toilet-paper supply via `linkedSupplyId`. "Petrecere sâmbătă" is shared with Ana via `list_members`, and Ana added items to it. There is also a DIY list, plus Ana's own list. About 50 trips over a year, and one personal recipe.
- **Cheltuieli:** a year of `expense_item`s, fără-vină ones, and credits: car (day 15), home (day 5), and one that ended 2 months ago.
- **Calendar:** `custom_event`s: one-off today/overdue/upcoming, weekly/monthly/yearly, with and without a purchase, one done.
- **Buget:**
  - Income 10.000 with the default 55/5/10/15/15 split.
  - Limits Car 1400 / Home 2200 (over this month) / Grocery 1900 / Expenses 0.
  - Economii goal 6.240 / 15.000.
  - 12 archived months: `archiveCompletedMonths` is called by reflection with a temporary placeholder row 13 months back, because the controller only bootstraps ONE month on its own.
- **Acasă / tours:** `dashboard_layout` holds all 10 card kinds. `tours` stays null, so the first-use tours still show.

## Schema notes

MySQL (`DB_DATABASE=lifeos`). `users` has `monthly_income`
DECIMAL(12,2), `monthly_set_aside` DECIMAL(12,2) (`2026_11_02_000001`,
backfilled = income × old short_term %), `budget_plan_set_at` (income
null = no plan); `budget_split` JSON and `items.guilt_free`
(`2026_10_08_*`) are legacy, unread.
`social_accounts` (`2026_10_08_000005`, `email_verified` in `_000006`,
`created_account` in `2026_10_09_000001`, backfilled = link created within
5s of its user) and
`users.has_password` (`_000007`, default true) back social login.
`car_profiles.odometer` (unsigned int, null = never typed) +
`odometer_updated_at` (`2026_10_09_000002`): the km set on the Mașină top card.
`users.tours` JSON (migration `2026_10_08_000004`, cast `array`): first-use
tours seen; the migration marked `home` done (v1) for every then-existing
user, so only accounts created after it get the Acasă tour automatically.
`users.email_verified_at` only exists since `2026_10_08_000003` (it was a
model cast with no column before); that migration marked every
then-existing user verified.
`spaces.type` is a real column (added
2026-09, migration `2026_09_20_201444_add_type_to_spaces_table.php`) —
set once at creation, never editable via update; `detectSpaceType()`
on the frontend reads it first. `items` has indexes on
`(user_id,type)`, `(user_id,status)`, `(user_id,due_at)`,
`(space_id,type)` — none on `recurrence`, despite it being scanned by
Dashboard/Calendar/Budget (known perf gap). `backendDB.md` at the repo
root is an early design-notes doc (UUID vs bigint musing, an RBAC
schema that only partially matches what's actually implemented) — 
don't treat it as current schema documentation, check migrations or
query the DB directly instead.
