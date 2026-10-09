# backend map

See `../CLAUDE.md` first. Laravel API, Sanctum auth. Almost everything
is one polymorphic `items` table — read `app/Models/Item.php`'s own
doc comments before touching anything budget/dashboard/calendar
related, they're extensive and current.

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
  24h, single use); `POST /email/verify` {email, token} (public,
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
  (never links); no email -> 422 `email_missing`; else create (random
  password, has_password=false, verified iff the provider says so,
  `user` role). Proving an address later (reset-password, verify-email,
  confirm-email success) deletes the user's `email_verified=false`
  links (`SocialAuthService::dropUnverifiedLinks`). A first-sign-in race
  (unique violation) retries the lookup once instead of 500ing.
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
- `ItemController.php` — the workhorse. `index`/`store`/`show`/
  `update`/`destroy` (apiResource) + `myGrocery` (cross-space grocery
  lists visible to the user) + item-level `members`. `update` already
  explicitly rejects any type change that crosses the grocery/non-
  grocery boundary (checked BEFORE the pre-update-type ownership
  check even runs) — confirmed live during the 2026-09-29 QA sweep
  across 3 different retype attempts; this file used to document that
  as a known, unfixed IDOR, but it no longer reproduces. `index`
  without `space_id` filters by `user_id` only, unlike `show`/`update`/
  `destroy` (space-accessible) — a shared space's other-member items
  don't show up in the generic list (still a real, open inconsistency,
  unrelated to the two fixed items above). `type` is now whitelisted
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
  Filters strictly by `user_id` — unlike `CalendarController`'s
  `Item::scopeVisibleTo` (owner OR space member), so a co-member's item
  in a shared space never appears here (known inconsistency).
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
  scoped (same gap as Dashboard). **Buget din venit (2026-10):** the
  user's fixed monthly net income split into 5 jars (`needs` = the
  Necesități envelope for the per-space limits, `guilt_free`, `third` =
  Credit/Investiții, `short_term` = Economii, `long_term`).
  `PUT /budget/plan` saves it (sum ≠ 100 → 422; first save stamps
  `budget_plan_set_at` and creates a target-0 SavingsGoal);
  `PUT /budget/limits` bulk-saves limits in one transaction;
  `GET /budget/guilt-free` = jar vs spent (3 past months + current) +
  this month's flagged records. `GET /budget` adds `plan`, `necessities`,
  `guiltFree`, `credit`, `suggested` (envelope split by
  max(avg3, recurring), recurring as floors -- `suggestSplit`).
  Every per-space figure (spent, limits, avg, biggest, archive, savings)
  excludes `guilt_free` items; Dashboard's month total does not.
  Archive gets `GuiltFree`/`Credit` rows per month (month totals stay
  over the space rows). `applyMonthlySavings` uses the new formula
  (Σ(limit − spent) + (guilt-free jar − flagged spent) + short-term jar)
  for months on/after `budget_plan_set_at`, the old one before. Known perf: ~30+ separate queries per
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
- `SPENDING_TYPE_SPACE` / `RECURRING_TYPE_SPACE` — which Space label/
  icon a type rolls up under, for Budget/Dashboard grouped totals.
- `items.guilt_free` (bool, "Bani fără vină"): only allowed on
  `Item::guiltFreeTypes()` = SPENDING_TYPES ∪ keys(RECURRING_TYPE_SPACE)
  (ItemController 422s otherwise). A flagged record leaves its space's
  budget and counts against the guilt-free jar. `EventSpend::occurrences/
  totals` take a `?bool $guiltFree` filter (null = all).
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

## Schema notes

MySQL (`DB_DATABASE=lifeos`). `users` has `monthly_income`
DECIMAL(12,2), `budget_split` JSON, `budget_plan_set_at` (all null = no
plan) and `items` has `guilt_free` (migrations `2026_10_08_*`).
`social_accounts` (`2026_10_08_000005`, `email_verified` in `_000006`) and
`users.has_password` (`_000007`, default true) back social login.
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
