# Backlog

Small, non-urgent tasks to pick up later. Not ordered by priority unless
noted — just a running list so ideas don't get lost mid-session. Add new
ones under "Open", move finished ones to "Done" with the date.

## Found along the way (not yet fixed)

Things noticed while working on something else — not the task at hand,
not worth derailing it for, but real enough to not just forget. Add an
entry the moment something like this turns up (even mid-task); pick
one up like any other "Open" item once nothing more pressing is ahead
of it. Mark it `[from: <task>]` so there's a trail back to how it was
found.

### Every other save handler in [id].tsx has the same silent-failure bug just fixed for Home Tasks

**Where:** [frontend/app/(tabs)/[id].tsx](<frontend/app/(tabs)/[id].tsx>) —
every `handle*Save` function (10 of them: `handleFuelSave`,
`handleMaintenanceSave`, `handleDocumentSave`, `handleExpenseSave` for
Car; `handleHomeDocumentSave`, `handleHomeExpenseSave`,
`handleHomeMaintenanceSave`, `handleHomeRecurringSave`,
`handleHomeSupplySave` for Home; `handleExpenseEntrySave` for the
Expenses space) follows the exact same pattern `handleHomeTaskSave`
just got fixed for: optimistically apply the edit to local state, then
on a failed `api.updateItem`/`api.createItem` call, the `catch` block
only reverts a brand-NEW entry (removes it) — an EXISTING entry being
edited/resolved has no revert at all (`isExisting ? current.X : ...`,
where the `isExisting` branch is a no-op, keeping the never-actually-
saved optimistic value).

**What:** Confirmed as the real root cause of a user-reported bug: a
plain, non-recurring Home Task checked off via its checkbox looked
resolved immediately, but reappeared as unresolved in Restanțe later —
the PUT to the backend silently failed (this session hit real
Cloudflare tunnel flakiness more than once), the catch block's no-op
revert left the UI showing "resolved" anyway, and the illusion held
until the next full data reload pulled the server's still-unresolved
truth back in. Only a toast (`notifyAction("Nu am putut salva...")`)
ever signaled anything was wrong, easy to miss on a phone mid-tap.

`handleHomeTaskSave` now snapshots the entry BEFORE the optimistic
update and reverts to that exact snapshot on failure, instead of a
no-op. The other 9 handlers still have the old, silent-failure
behavior — same fix shape, just not applied yet (deliberately scoped
to the one that had a concrete, confirmed bug report rather than
sweeping all 10 unreviewed in the same pass).

**Found:** `[from: fixing the Home Tasks Restanțe "still unresolved"
bug report, 2026-09-26]`.

### Backend buckets Calendar days by UTC, with no user-timezone concept anywhere

**Where:** `backend/app/Http/Controllers/Api/CalendarController.php`
(`$key = Carbon::parse($item->due_at)->toDateString()`, both
occurrences) — `Carbon::toDateString()` reads the app's configured
timezone, which is `UTC` everywhere (`config/app.php`). Nothing in
this app — no column on `users`, no request header, no stored
preference — captures a user's actual timezone at all.

**What:** Task #5 fixed the frontend's own `ymd()` (it compared a
UTC-derived string against a locally-built grid key, a self-inflicted
mismatch) — but that only makes the frontend internally consistent
with itself. The backend still buckets an item due near midnight into
whatever day it falls on in UTC, not the day it actually falls on for
the user viewing it. A real fix needs a design decision first: where
does the user's timezone come from (device-reported at login/each
request? a stored profile setting?), then thread it into
`Carbon::parse($item->due_at)->setTimezone($userTz)->toDateString()`
in both places in `CalendarController`.

**Found:** `[from: Task #5 frontend fixes — investigating the ymd()
bug led here, 2026-09]`.

### Dead `search.tsx` stub left in the route tree instead of fully removed

**Where:** `frontend/app/(tabs)/search.tsx` (a `@deprecated` stub that
just `return null`s) plus the `<Tabs.Screen name="search" options={{
href: null }} />` line in `frontend/app/(tabs)/_layout.tsx` that hides
it. Comment says file deletion was denied in this environment at the
time.

**What:** Harmless at runtime today — `href: null` keeps it out of the
tab bar and nothing links to `/search` — but it's a hygiene smell: a
future contributor (or an agent doing a route audit) has to rediscover
"this is intentionally dead" from a comment instead of the route
simply not existing. Worth a real deletion pass once the environment
restriction that originally blocked it is gone (`git rm
frontend/app/(tabs)/search.tsx` + drop the `<Tabs.Screen name="search">`
line). Flagging for hygiene only, not a UX finding — no user ever sees
this screen.

**Found:** `[from: design-lead Phase 1 nav audit, 2026-09-22]`.

### Home tab and Spaces tab both surface "your spaces," with different jobs the tab bar doesn't explain

**Where:** `frontend/app/(tabs)/home.tsx` renders a widget-grid
dashboard that includes `spaceCards` (one glance-card per Car/Home/
Grocery/Expenses space, built from `api.listSpaces()` at lines ~63-73)
alongside budget/today/overdue widgets. `frontend/app/(tabs)/spaces.tsx`
is a separate grid of the same 4 spaces, but as the actual
create/rename/delete/manage surface (`EditSpaceModal`,
`CarProfileForm`, `HomeProfileForm`, the `TEMPLATES` picker for
creating a new one).

**What:** Both tabs show "your spaces" as tappable cards; the
difference (Home = glanceable status snapshot + shortcut, Spaces =
management/creation) is real but is not evident from the tab bar
labels or icons alone (`home-outline` vs `grid-outline`) to a
first-time, non-technical user. Nielsen's "match between system and
the real world" / recognition-over-recall suggests the icon+label pair
should telegraph the *distinct* job, not just a generic "home" vs
"grid of things." This reads as a product/value question (should
Spaces' management-only actions move into Home, or should Home stop
listing spaces at all and just deep-link into Spaces?) more than a
pure visual-polish one — flagging for the user to decide the intended
division of labor before a spec gets written.

**Found:** `[from: design-lead Phase 1 nav audit, 2026-09-22]`.

### Quick Add's plain "+"-fallback identity on the shared FAB is effectively unreachable code today

**Where:** `frontend/app/(tabs)/_layout.tsx`'s `onFabPress` branches on
`config` (from `useSpaceCategoryFab()`) to decide between opening the
per-space category fan and falling back to `QuickAddSheet`. But
`hideFab` (line 64-65) hides the FAB on every tab except an `[id]`
space-detail page, and per `frontend/CLAUDE.md`'s file map, "all 4
dashboards always register" a category fan via
`useRegisterSpaceCategories` the moment their page is focused — so in
normal use, everywhere the FAB is visible, `config` is already
non-null, and the plain quick-add identity never actually shows. The
only window it could appear is a brief frame between an `[id]` page
mounting and its `useFocusEffect` registration committing.

**What:** Confirms this design review's Q3/Q4 (dual FAB identity,
hamburger-vs-add icon confusion) describes a code path that isn't
exercised in the current app, not a live user-facing risk — see main
report for the full reasoning. Logging so this doesn't get
re-discovered as "the FAB is confusing" without the context that the
fallback path is dead in practice. If `QuickAddSheet` is intentionally
being kept for a future space type that won't register a fan,
consider a visible marker in code beyond the CLAUDE.md note.

**Found:** `[from: design-lead Phase 1 nav audit, 2026-09-22]`.

### `DashboardControllerTest` expects a `payments` bucket that `DashboardController` doesn't return

**Where:** `backend/tests/Feature/DashboardControllerTest.php` (both
`test_dashboard_returns_correct_categories` and
`test_dashboard_returns_empty_arrays_when_no_items`) vs.
`backend/app/Http/Controllers/Api/DashboardController.php::index()`'s
actual response, which only ever has `today`/`upcoming`/`overdue`/
`monthlyExpenses` — no `payments` key at all.

**What:** The test also creates its item with `'type' => 'expense'`,
which isn't a real type in this app's `items.type` vocabulary (real
expense-shaped types are `expense_item`, `car_expense`,
`home_expense`, ... — see `Item::SPENDING_TYPES`); it falls into none
of `ACTIONABLE_TYPES`/`RECURRING_ACTIONABLE_TYPES`, so it's silently
dropped from every bucket. Either the test predates a Dashboard
refactor that intentionally dropped a separate "payments" grouping
(and the test should be deleted/rewritten to match the real 3+1-bucket
shape), or a "payments" bucket was meant to ship and never did — needs
a product call, not a blind test edit. Until decided, these 2 tests
fail (`test_dashboard_unauthorized_without_authentication` passes
fine, unaffected).

**Found:** `[from: Task #7 — fixing the SQLite-breaking migration
syntax got the suite running again, which surfaced these as
pre-existing failures unrelated to that fix, 2026-09-22]`.

### `GET /api/user` returns 500 instead of a clean 401 when unauthenticated

**Where:** Sanctum/Auth middleware config — the `web` guard's
`redirectTo` references a `login` named route that doesn't exist in
this API-only app, so an unauthenticated request throws
`RouteNotFoundException` instead of a normal 401 JSON response.

**Found:** `[from: Task #1 security hardening — qa-lead's independent
verification, 2026-09]`. Confirmed pre-existing, unrelated to that
task's actual diff.

### `league/commonmark` has a high-severity DoS advisory (PKSA-zyf5-hrxv-hrd7)

**Where:** `backend/composer.lock` — transitive dependency (not in
`composer.json` directly; pulled in by something else, not by
Sentry). Affected: `>=1.5.0,<2.10.0`. No CVE assigned yet, advisory
only (GHSA-8rr7-cvq3-gmfh) — a denial-of-service via distinctly-named
attributes in the Attributes extension.

**What:** Check what actually requires it (`composer why
league/commonmark`) and whether bumping to `^2.10` is a clean, low-risk
`composer update league/commonmark` or pulls in breaking changes from
whatever depends on it.

**Found:** `[from: Task #3 observability — composer require
sentry/sentry-laravel surfaced it via composer audit, 2026-09]`. Not
introduced by Sentry; pre-existing.

### Stale `frontend/dist/` web export still bakes in the old "frontend" app identity

**Where:** `frontend/dist/_expo/static/js/web/entry-<hash>.js` — a leftover
static web export (from `npx expo export`, presumably run before the
Task #4 rename) whose embedded Expo Constants manifest is still
`{"name":"frontend","slug":"frontend","scheme":"frontend",...}`, baked
in as a JSON string literal inside the bundled JS. `frontend/dist/` is
gitignored and untracked (`frontend/.gitignore` has `dist/`), so it's
not in the diff and doesn't affect the live Metro dev server (port
443) — only a stale local build artifact.

**What:** Harmless as long as nothing actually serves from this old
`dist/` folder. Re-running `npx expo export` (web) would regenerate it
with the correct "orgOS"/"orgos" identity. Worth deleting the stale
folder or re-exporting before it's ever used for a real web deploy, so
no one accidentally ships/serves the old-branded build.

**Found:** `[from: qa-lead verification of Task #4, 2026-09]`.

### `expo`/`expo-constants` slightly behind Expo SDK 54's expected patch versions

**Where:** `frontend/package.json` — Metro prints "should be updated for
best compatibility": `expo@54.0.36` (expected `~54.0.37`),
`expo-constants@18.0.13` (expected `~18.0.14`). Patch-level only, not a
major gap like the Sentry SDK mismatch this session already fixed.

**What:** `npx expo install --fix` (or install the two exact expected
versions) once there's a moment to verify nothing regresses — low risk
given it's a patch bump, but still worth its own quick verification
pass rather than folding into an unrelated task.

**Found:** `[from: Task #3 observability — noticed in Metro's startup
output after installing @sentry/react-native, 2026-09]`. Pre-existing,
unrelated to Sentry.

### `backend/CLAUDE.md` says login/register have no throttle middleware — that's stale

**Where:** `backend/CLAUDE.md`'s `AuthController.php` bullet ("**Login/register
have no throttle middleware** (known issue, not yet fixed)."). In reality
`backend/routes/api.php` already wraps both in `Route::middleware('throttle:auth')`
(`RateLimiter::for('auth')` in `AppServiceProvider.php`, 5/min by IP) — added
by the "Backend security hardening: rate limiting, fix retype IDOR, remove
public adminer.php" commit, well before this session. Confirmed live: 5
rapid `/register` calls during qa-lead testing on `feat/settings-change-email`
tripped a real 429.

**What:** Just needs the stale bullet in `backend/CLAUDE.md` deleted/updated
so it stops sending future sessions looking for a gap that was already
closed.

**Found:** `[from: qa-lead verification of Task #9 subtask 4 (change email),
2026-09-22 — hit the throttle mid-test while registering QA accounts]`.

### CarDocumentForm's delete-while-archived branch is marked "TEMP (testing only)" in shipped code

**Where:** `frontend/components/spaces/car/forms/CarDocumentForm.tsx`, around
the `isEditing && onDelete && (!readOnly || entry?.archived)` condition and
its preceding comment ("TEMP (testing only): archived documents are
otherwise fully locked, but deletion is allowed here too for now so
wrongly-archived test entries can be cleaned up").

**What:** The comment states this is a temporary allowance to clean up test
data, not intended permanent behavior — but it's live in the component
every user hits when opening an archived document. Needs a decision:
promote to intentional/documented behavior, or remove the escape hatch now
that it's presumably served its testing purpose.

**Found:** `[from: design-lead Phase 2 Car space audit, 2026-09-22]`.

### "Finalizează cumpărăturile" sheet is Romanian-only inside an otherwise English Grocery UI

**Where:** `frontend/components/spaces/grocery/GroceryFinishShoppingSheet.tsx`
(every string) and the CTA that opens it in `GroceryDashboard.tsx` (~line
1098). Every other Grocery string in the same screens (GroceryItemRow,
GroceryProductModal, SpaceMembersModal, GroceryRecipesPage) is English.

**What:** A non-Romanian-speaking user hits a language switch mid-flow with
no toggle, right at the moment of logging a real purchase/expense. Either
translate this component to match the rest of the screen, or treat it as
the highest-priority single spot for Task #9 subtask 5's eventual i18n
pass, since it's the one place English/Romanian currently mix inside one
flow.

**Found:** `[from: design-lead Phase 2 Grocery space audit, 2026-09-22]`.

### SpaceMembersModal's two "remove person" options are equally weighted despite very different reversibility

**Where:** `frontend/components/spaces/grocery/SpaceMembersModal.tsx`, lines
261-291 — "Remove person, keep products" (filled black button) and "Remove
person and their products" (bordered button) are stacked ~8px apart, same
size, both in `colors.error` red text.

**What:** The copy is clear on a careful read, but the visual similarity
makes a fast, non-technical mis-tap plausible — and "and their products"
is an irreversible bulk delete. Consider de-emphasizing the destructive
option or adding a lightweight secondary confirmation for that path.

**Found:** `[from: design-lead Phase 2 Grocery space audit, 2026-09-22]`.

### A few Grocery icon-only tap targets sit right at/under the 44×44pt minimum

**Where:** `frontend/components/spaces/grocery/GroceryItemRow.tsx` — trash
icon (17px, `hitSlop={10}`, ~37-38pt effective) and edit icon (18px, same
hitSlop). `GroceryRecipesPage.tsx` — recipe-card selection checkbox (22×22,
`hitSlop={8}`, ~38pt). `GroceryDashboard.tsx` — the "+"-only invite avatar
circle (40×40, no hitSlop).

**What:** All below Apple HIG's 44×44pt / Material's 48×48dp guidance.
Bump hitSlop on the first three to 12-14 and add `hitSlop={6}` to the
invite-avatar Pressable. Low-risk, single-file changes each.

**Found:** `[from: design-lead Phase 2 Grocery space audit, 2026-09-22]`.

### Home space mixes English and Romanian UI copy inconsistently, including a tile label vs. its own destination screen's title

**Where:** `frontend/components/spaces/home/HomeDashboard.tsx`
(`categoryTiles` labels, Romanian: "Cheltuieli", "Mentenanță", "Recurente",
"Provizii", "Task-uri") vs. `frontend/components/spaces/home/homeCategoryConfig.ts`
(`HOME_CATEGORIES[].label`, English — used as `HomeCategoryPage`'s title,
e.g. tapping "Cheltuieli" opens a page titled "Expenses"). Also
`HomeTaskForm.tsx` (English field labels, Romanian switch copy) and
`HomeTaskResolveSheet.tsx`/`HomeSupplyRestockSheet.tsx` (fully Romanian)
vs. `HomeCategoryPage.tsx`/`HomeSupplyForm.tsx` (fully English).

**What:** No single consistent language across Home's screens — reads as
partially finished localization, disorienting when a Romanian-labeled tile
opens an English-titled destination. Same underlying issue as the Grocery
and Expenses language-mixing entries below — all three point at Task #9
subtask 5 (RO/EN localization) as the real fix, not three separate patches.

**Found:** `[from: design-lead Phase 2 Home space audit, 2026-09-22]`.

### Expenses space mixes English and Romanian copy in the same flow

**Where:** `frontend/components/spaces/expenses/ExpensesAddBar.tsx`
(English placeholders "What did you buy?"/"Price" vs. Romanian "Adaugă
detalii (dată, notă)"/"Astăzi") and `ExpenseEditModal.tsx` (Romanian header
"Editează cheltuiala" and buttons "Salvează"/"Șterge" wrapping the same
English placeholders).

**What:** Same pattern as Grocery's and Home's language-mixing entries
above — a non-technical user gets language-switched mid-task. Since the
space's other chrome is already Romanian, the simplest patch is making the
two English placeholders match ("What did you buy?" → "Ce ai cumpărat?",
"Price" → "Preț") — but see the note above: three Spaces independently
show this same gap, which argues for doing Task #9 subtask 5 properly
rather than patching each Space's strings separately.

**Found:** `[from: design-lead Phase 2 Expenses space audit, 2026-09-22]`.

### Expenses space has 3 duplicated, inconsistent date-formatting functions

**Where:** `ExpensesAddBar.tsx`'s `formatShortDate` (ro-RO, no year),
`ExpenseEditModal.tsx`'s separately-defined `formatShortDate` (ro-RO, with
year), and `ExpensesListSection.tsx`'s `formatDate` (en-US, no year) — three
different functions formatting the same `ExpenseEntry.date`.

**What:** The same date reads differently depending on which screen shows
it (e.g. "Astăzi" vs "22 sept. 2026" vs "22 Sep"). Should be one shared
helper (e.g. `lib/spaces/expenses/formatExpenseDate.ts`), one locale
(ro-RO, matching the rest of the space), one year rule.

**Found:** `[from: design-lead Phase 2 Expenses space audit, 2026-09-22]`.

### `getThisMonthExpensesTotal()` is dead code — and a more useful stat than the one actually shown

**Where:** `frontend/lib/spaces/expenses/calculations/dashboard.calculations.ts`'s
`getThisMonthExpensesTotal` — defined, exported, never imported anywhere.
`frontend/components/spaces/expenses/ExpensesStats.tsx` instead shows a
bare "Items" entry-count card next to "All time".

**What:** "Items: 14 entries" is low-signal filler; "This Month: X RON"
(using the already-written, unused function) would be materially more
actionable for a spending space. Product call on whether to make the
swap, but the calculation already exists — implementation is nearly free.

**Found:** `[from: design-lead Phase 2 Expenses space audit, 2026-09-22]`.

### `frontend/CLAUDE.md`'s Expenses file map is missing `ExpensesDetailPage.tsx`

**Where:** `frontend/CLAUDE.md`'s "Per-Space file map" → Expenses
subsection lists `ExpensesDashboard/Header/AddBar/Stats/ListSection/
EditModal/DatePickerSheet` but omits `ExpensesDetailPage.tsx`, which is
live (rendered by `ExpensesDashboard.tsx`, opened via the "All time" stat
card) — the trend-chart + month-filter breakdown screen.

**What:** Minor doc-hygiene gap; a future session reading the map would
miss this screen entirely. One-line addition to the file map.

**Found:** `[from: design-lead Phase 2 Expenses space audit, 2026-09-22]`.

### Home tab's "De făcut" widget colors the same row with two unrelated color scales

**Where:** `frontend/app/(tabs)/home.tsx` lines 250-256 (`todoBySpace`
render) — the Ionicons space icon uses `SPACE_IDENTITY_COLORS[card.kind]`
(brand identity color) while the adjacent count `Text` uses
`severityColor(g.severity, colors)` (urgency color), with no visual
distinction between the two systems and no legend.

**What:** A non-technical user has no way to tell that the icon's color
means "which space" while the number's color means "how urgent" — they
read as one color language. Either neutralize the icon color or add a
one-time explainer.

**Found:** `[from: design-lead Phase 3 Home tab audit, 2026-09-22]`.

### Home tab's "RECURENTE APROPIATE" bills don't deep-link to their own date on Calendar

**Where:** `frontend/app/(tabs)/home.tsx` line 299, inside the
`nextBills.map(...)` Pressable — `onPress={() => router.push("/calendar")}`
with no `?date=` param, unlike `TodoCarouselSheet.openTarget`'s
same-purpose deep-link a few lines away in the same file's ecosystem.

**What:** Tapping a specific upcoming bill lands on Calendar's default
(today) view instead of jumping to that bill's actual due date, forcing
manual re-navigation. Cheap fix: pass the same `?date=` param already
used elsewhere in this file.

**Found:** `[from: design-lead Phase 3 Home tab audit, 2026-09-22]`.

### Home tab's sign-out icon fires with no confirmation

**Where:** `frontend/app/(tabs)/home.tsx` lines 173-181 —
`onPress={signOut}` directly, no `confirmAction` gate, unlike this app's
convention for other consequential actions.

**What:** One accidental tap on the first screen the user sees on every
open logs them out with no recovery step. Spec-able: reuse `confirmAction`
here, same as elsewhere in the app.

**Found:** `[from: design-lead Phase 3 Home tab audit, 2026-09-22]`.

### Calendar's density coloring conflates item count with urgency, reusing the app's own "critical" red for harmless busy days

**Where:** `frontend/lib/statusColors.ts` (`DENSITY_TIERS`, consumed via
`densityColor()` in `frontend/app/(tabs)/calendar.tsx` month-grid cells).

**What:** Day-cell fill is a 4-tier heat scale (yellow/orange/purple/red)
keyed only to `dayItems.length`, unrelated to whether anything on that day
is actually overdue or critical. The same file's `severityColor`/
`budgetSeverity` use red to mean "critical" elsewhere in the app (e.g.
Budget), so a day cell can turn red purely because 4 harmless grocery
items are due, misleading a user scanning for what actually needs
attention.

**Found:** `[from: design-lead Phase 3 Calendar audit, 2026-09-22]`.

### Calendar's per-space dots (the only "which Space is this" cue on the month grid) are 4×4px and capped at 4

**Where:** `frontend/app/(tabs)/calendar.tsx`, the
`dayGroups.slice(0, 4).map(...)` dot row under each grid cell, fed by
`groupBySpace()`.

**What:** These dots are the sole at-a-glance signal distinguishing which
Space(s) a day's items belong to (only shown when `dayGroups.length > 1`).
At 4px they're not realistically distinguishable while scanning a month,
and a day touching 5+ spaces silently drops the rest. Undermines the
whole point of merging 4 Spaces into one calendar — users can't tell
what's on a day without tapping in.

**Found:** `[from: design-lead Phase 3 Calendar audit, 2026-09-22]`.

### Calendar's "CHELTUIELI RECURENTE" (Recurring Expenses) section includes non-expense recurring items

**Where:** `frontend/app/(tabs)/calendar.tsx` (~line 601, the
`recurringUpcoming` list) fed by `backend/app/Models/Item.php`'s
`RECURRING_ACTIONABLE_TYPES` (`home_task`, `home_recurring`,
`car_document`, `custom_event`, `home_maintenance`) — none guaranteed to
carry an `amount`.

**What:** The section title promises spend info, but a recurring
`home_task` with no amount (e.g. a chore reminder) lists under it
identically to an actual recurring bill. A non-technical user scanning
this for "what recurring costs are coming" gets chores mixed in with
money. Needs a product call: rename the section (e.g. "Recurring items")
or filter it to amount-bearing entries only.

**Found:** `[from: design-lead Phase 3 Calendar audit, 2026-09-22]`.

### Calendar's toggle pills and frequency buttons are under the 44/48pt minimum touch target

**Where:** `frontend/app/(tabs)/calendar.tsx` — "Implică o cumpărare" /
"Recurent" pills (`height: 34`, ~line 426/444) and the weekly/monthly/
yearly frequency buttons (`paddingVertical: 8`, no explicit height, ~line
482).

**What:** Below Apple HIG's 44×44pt and Material Design 3's 48×48dp
minimum interactive target guidance. Small but real friction for less
precise taps.

**Found:** `[from: design-lead Phase 3 Calendar audit, 2026-09-22]`.

### Calendar has no "Today" quick-jump, only prev/next month chevrons

**Where:** `frontend/app/(tabs)/calendar.tsx`, the month-nav row
(`cal-prev-month`/`cal-next-month` Pressables, ~line 271-291).

**What:** Paging several months away (e.g. to check a future car document
renewal) and returning to the present requires repeated chevron taps with
no shortcut back to today. Every mainstream calendar app offers a one-tap
"Today" control; its absence here is a real efficiency-of-use gap.

**Found:** `[from: design-lead Phase 3 Calendar audit, 2026-09-22]`.

### Budget's Savings Goal auto-update depends invisibly on per-space budget limits being set

**Where:** `frontend/app/(tabs)/budget.tsx` (Savings Goal card, lines
~216-263) + `backend/app/Http/Controllers/Api/BudgetController.php`'s
`applyMonthlySavings`.

**What:** The savings goal's month-end auto-add only sources from spaces
that have a `BudgetCategory` limit set (via `BudgetSpaceDetailPage`). A
user who sets a savings target without ever opening a space's budget
detail page gets a goal that never updates, with no on-screen indication
why. Consider surfacing "based on N spaces with a budget set" in the
card, or a hint once a month passes with zero movement and zero limits
set.

**Found:** `[from: design-lead Phase 3 Budget audit, 2026-09-22]`.

### Budget ring color reuses the same warning hue for two different facts (ratio-tier vs. pace)

**Where:** `frontend/app/(tabs)/budget.tsx`, `paceDelta()`/`tone` logic
(lines ~71-76, ~402-403) vs. `lib/statusColors.ts`'s `budgetSeverity`.

**What:** A ring can turn `colors.warning` orange either because
spend/limit ratio crossed 80%, or because spend is pacing ahead of the
elapsed-month fraction even under 80% — same color, different meaning,
distinguishable only by reading the small caption underneath. Consider a
visually distinct treatment (e.g. different hue or an icon-only badge)
for the pace signal vs. the ratio-severity signal.

**Found:** `[from: design-lead Phase 3 Budget audit, 2026-09-22]`.

### Budget's per-space limit entry has two competing UIs (3 presets + manual field) for one number

**Where:** `frontend/components/dashboard/BudgetSpaceDetailPage.tsx`,
`BUDGET_PRESETS` + manual `TextInput`/save (lines ~30-34, ~349-472).

**What:** Setting a monthly limit offers 3 percentage-over-3-month-average
presets (Conservator/Echilibrat/Flexibil, Romanian-only labels) plus a
fully separate manual amount input with its own save button — two
parallel paths to the same single field, and the preset math ("bază" =
3-month average) isn't explained beyond a caption. Product question worth
the owner's input: does this earn its complexity for a non-technical
user, or would manual-entry-plus-one-suggestion serve the same need with
less to parse?

**Found:** `[from: design-lead Phase 3 Budget audit, 2026-09-22]`.

### Budget's monthly archive (ISTORIC LUNAR) is 3 taps deep and only lazily backfilled

**Where:** `frontend/components/dashboard/BudgetOverviewPage.tsx`
(ISTORIC LUNAR section, lines ~167-245), reached via Budget tab → "Buget
total" entry row; backed by `BudgetController::archiveCompletedMonths`,
which only runs as a side effect of `index()` (no scheduled job).

**What:** Not a bug, but worth a product check: is monthly spend history
over multiple past months something the target user actually revisits, or
is this filler modeled on finance-app conventions? If kept, consider
surfacing it higher — it's currently nested past the composition ring and
ranked list, inside a page that's itself one tap off the main Budget
screen.

**Found:** `[from: design-lead Phase 3 Budget audit, 2026-09-22]`.

### Home Maintenance has no archive/undo for a resolved non-recurring entry, which is the real reason its new "Resolved" action needed a confirm dialog

**Where:** `frontend/components/spaces/home/homeCategoryConfig.ts`'s
"maintenance" category (`entries` filters out `completed` rows with no
other view that ever shows them again) vs. Tasks in the same Home space,
which has a dedicated `HomeTaskArchivePage.tsx` plus an undo (tapping a
done row's checkbox again flips `completed` back, see
`HomeDashboard.tsx`'s `handleCheckboxPress`). `HomeDashboard.tsx`'s
`onResolve` wiring (~line 543) has to show a `confirmAction` dialog before
every non-recurring Maintenance resolve specifically because that action
is otherwise silent and permanent — there's nowhere to see or undo it
afterward.

**What:** This is the underlying gap a confirm-dialog patched over instead
of fixing. Recommended direction: give Maintenance the same lightweight
archive + undo pattern Tasks already has (reuse `HomeTaskArchivePage`'s
shape rather than inventing a new one). Once resolved entries are visible
and reversible somewhere, the confirm-dialog friction on the (likely more
common) recurring-resolve path can come back out, matching Tasks' own
no-confirm precedent. This is a functional change (new view + toggle,
not a visual tweak) and needs the user's separate sign-off before
frontend-lead builds it — see the design review's full report for the
accompanying visual/interaction spec (row layout, recurring badge) that
doesn't depend on this.

**Found:** `[from: design-lead review of Home Maintenance's new
"Resolved" action, 2026-09-22]`.

### HomeCategoryPage's row-level "resolve" checkbox doesn't close/refresh the edit form if that same row is open for editing

**Where:** `frontend/components/spaces/home/HomeCategorySection.tsx`'s
`onRowResolve` checkbox (rendered at each row's left edge, only for
Maintenance) is wired straight to `resolveCategoryEntry` via
`HomeCategoryPage.tsx`'s `onRowResolve={onResolve ? (id) =>
onResolve(String(id)) : undefined}` (~line 428) -- a second, independent
path into the same `onResolve` prop the form's own "Rezolvă" button
uses. The form's own path (`resolve()`, ~line 142) calls `closeForm()`
afterward; the row checkbox's path does not touch `formExpanded`/
`editingId`/`values` at all.

**What:** If a user opens a Maintenance entry for editing (form
expanded, `editingId` = that row's id) and then taps that SAME row's
own inline resolve checkbox in the list below (still visible/tappable
underneath the open form, since `HomeCategorySection` renders
unconditionally regardless of `formExpanded`), the entry gets resolved
but the form stays open referencing a now-stale `editingId`. If the
resolve was non-recurring, the entry drops out of
`category.entries(homeData)` (filtered by `!completed`) entirely --
tapping Save on the still-open stale form would then find no
`existing` match and silently create a brand-new duplicate entry
instead of erroring or updating the (now-hidden) original. This isn't
introduced by commit c90019f (the collapsed-by-default form) -- the
same two independent paths into `onResolve` existed before that diff,
just with the form always visible instead of conditionally expanded --
but c90019f's review surfaced it while tracing every `onResolve`
call site.

**Found:** `[from: qa-lead review of c90019f (Home category form
collapse), 2026-09-26]`.

### The shared "+" FAB's fan/Quick-Add rendering is now fully dead code

**Where:** `frontend/app/(tabs)/_layout.tsx` -- the FAB `Pressable` itself
is unreachable now (`hideFab` includes `"[id]"` unconditionally, see the
comment right above it), which means everything downstream of tapping it
is dead too: the category-fan `Animated.View`s (~lines 170-345), the
backdrop, `fanOpen` state, `onFabPress`/`onPickCategory`, and
`openQuickAdd`/`<QuickAddSheet>` at the bottom of the file. Also dead:
every Space's own `useRegisterSpaceCategories(...)` call now just feeds
a `config` object nothing reads anymore (Car's `handleCarAction`-wired
categories, Home's `fabCategories`, Grocery's `fabCategories`,
Expenses' single "add" category) -- each still runs, harmlessly, but
none of it can ever surface in the UI.

**What:** All 4 Spaces grew their own always-visible entry points
(Car's QUICK ACTIONS row, Home's category grid + Tasks'/Supplies' own
add rows, Grocery's Recipes button next to Invite, Expenses'
always-on `ExpensesAddBar`), so the FAB was turned off everywhere
rather than case-by-case. Worth an actual removal pass once nothing
else is competing for attention: strip the fan/backdrop/animation code
and `QuickAddSheet` wiring from `_layout.tsx`, and each Space's now-
pointless `useRegisterSpaceCategories` call plus whatever
`SpaceCategory[]`/`onSelect` plumbing only existed to feed it (e.g.
Car's `carCategories`/`handleCarAction`'s FAB-only branch, if nothing
else calls it directly).

**Found:** `[from: removing the FAB from all 4 Spaces, 2026-09-22]`.

## Open

### 0. Real app icon (currently still Expo's default template icon)

**Where:** `frontend/assets/images/icon.png`,
`android-icon-foreground.png`/`-background.png`/`-monochrome.png`,
`splash-icon.png`, `favicon.png` — all still the unmodified Expo
bootstrap defaults. `app.json`'s `name`/`slug`/`scheme` were already
fixed to "orgOS"/"orgos" (Task #4); the icon is the one piece of that
task deliberately deferred.

**What:** Needs an actual PNG asset — no image-generation/conversion
tooling (ImageMagick, Inkscape, Node `sharp`, etc.) is available in
this environment, so this can't be produced without either a file from
the user or an external tool/generator. Once a source image exists,
wiring it into `app.json` and generating the Android
adaptive-icon variants is straightforward.

**Found:** `[from: Task #4 app identity, 2026-09]`. Deliberately
deferred, not forgotten.

### 1. Draggable period counter in Car → Expenses

**Where:** [frontend/components/spaces/car/CarExpensesPage.tsx](frontend/components/spaces/car/CarExpensesPage.tsx) —
the "Custom period" picker, `customMonths` state + `adjustCustomMonths()`
(around line 151), rendered as a "Last N weeks/months" stepper with `-`/`+`
buttons (`expense-period-custom-minus`/`expense-period-custom-plus`,
clamped 1-12).

**What:** Right now the count only changes via the `-`/`+` buttons. Add a
horizontal drag/swipe gesture directly on the counter (or the number
itself) so dragging left/right scrubs the value up/down, the same way a
number picker or slider feels — without removing the buttons, which
should keep working for a precise single-step change.

**Notes:**
- Still respect the existing 1-12 clamp and the weeks/months unit toggle
  next to it.
- `react-native-gesture-handler` (~2.28) and `react-native-reanimated`
  (~4.1) are already project dependencies — use their pan gesture
  instead of pulling in anything new or reaching for `PanResponder`.
- Keep the drag sensitivity forgiving (e.g. ~15-20px of horizontal
  movement per step) so it doesn't feel twitchy.

### 2. Smart monthly spending estimate on "Your Lists" (Grocery)

**Where:** [frontend/components/spaces/grocery/GroceryListsPage.tsx](frontend/components/spaces/grocery/GroceryListsPage.tsx)
(the "Your Lists" folder view) — [frontend/lib/spaces/grocery/grocery.types.ts](frontend/lib/spaces/grocery/grocery.types.ts)'s
`GroceryItem` type, which currently has no price/cost field at all.

**What:** A smart estimate of how much a user's grocery lists would
actually cost per month, to help answer "does this cover what I need for
the month, and roughly what will it cost" — surfaced somewhere on the
Your Lists page (e.g. an estimated monthly total, or per-list estimated
cost, next to the existing bought/total progress).

**Notes — needs a design decision before implementation:**
- `GroceryItem` has no price field yet. Two options: (a) let the user
  optionally enter a price per product (manual, always accurate for what
  they actually paid, but adds a step to Add Product), or (b) estimate
  from a reference price table keyed by ingredient (doesn't exist yet —
  would piggyback conceptually on `ingredient_references`, the same
  global dictionary Add Product already uses for auto-categorization).
- Whichever source is chosen, be honest about partial data: don't
  silently treat unpriced products as free or as average-cost guesses —
  show something like "X of Y products have a price" alongside any
  total, so the estimate doesn't quietly mislead.
- "Covers the month's need" implies some notion of what a household
  actually needs (portion sizes, household size, consumption rate) —
  that's a much bigger feature than just summing prices. First pass
  should probably just total what's on the lists rather than trying to
  model "need" from scratch; revisit scope with the user before building
  the fuller version.

### 3. Home Supplies restocks have no price, so they never count as spend

**Where:** [frontend/lib/spaces/home/home.types.ts](frontend/lib/spaces/home/home.types.ts)'s
`HomeSupplyEntry`/`SupplyRestockEvent` (no price/cost field at all,
only quantity/unit) —
[frontend/components/spaces/home/HomeSupplyRestockSheet.tsx](frontend/components/spaces/home/HomeSupplyRestockSheet.tsx)'s
"Restocked" flow only ever asks for quantity —
[frontend/lib/spaces/home/calculations/spend.calculations.ts](frontend/lib/spaces/home/calculations/spend.calculations.ts)'s
`getHomeSpendRecords` (the source both HomeDashboard's "This month" card
and HomeSpendPage read from) has no 4th branch for Supplies as a result.

**What:** User noticed a bought item (e.g. toilet paper) never shows up
in Home's spend total, and asked whether an optional price field should
be added to the restock flow. Deliberately NOT built yet — the user's
own words: "nu știu cum o să fie dacă adăugăm preț pentru ca partea de
restock este conectată și cu lista de cumpărături și încă nu am un
model în cap cum să îl facem exact să funcționeze" (restock is also
wired into Grocery's shopping list, and there's no clear model yet for
how a price would fit both flows without them fighting each other).
Needs a design decision first: where would the price actually get
entered (Home's own restock sheet? Grocery's "Finish Shopping" flow,
which already posts a lump-sum expense elsewhere — see backlog #2
above? both, and if so how do they not double-count the same
purchase?) before touching the data model.

**Found:** `[from: Home feedback follow-up, 2026-09-26]`.

## Bigger ideas (need a design pass before scoping into tasks)

### A. Learned restock patterns per product (Grocery)

The user's own idea, worth building toward: after a product has been
bought a few times, learn that user's personal restock cycle for it
(e.g. "milk roughly every 6 days") and use that to suggest — eventually
maybe auto-add — it back onto a list right when they're likely running
out. Longer term, the same purchase history could surface diet
observations (eating a lot of one food group, barely any of another).

**Why it's not a single task:** it needs a data foundation that doesn't
exist yet, a detection algorithm, and a UI surface — each is its own
piece of work, and the later phases depend on the earlier ones actually
working well in practice.

**Phase 1 — data foundation:**
- `GroceryItem` ([frontend/lib/spaces/grocery/grocery.types.ts](frontend/lib/spaces/grocery/grocery.types.ts))
  has `addedDate` but no timestamp for *when it was checked off as
  bought* — `inCart` is just a boolean. Add a `boughtAt` timestamp, set
  when `inCart` flips to true (and cleared if unchecked), both in the
  type and in the metadata round-trip
  ([frontend/lib/spaces/grocery/groceryItems.ts](frontend/lib/spaces/grocery/groceryItems.ts)).
- Need a reliable way to treat repeated purchases as "the same product"
  across different lists/weeks — match on normalized name (case
  -insensitive, ideally via `ingredient_references` aliases so "scallion"
  and "green onion" count as the same thing), not on item id (every
  occurrence is its own new row today).

**Phase 2 — pattern detection + suggestion (not auto-add yet):**
- For a given user, group their own `boughtAt` history by normalized
  product name, sort chronologically, compute the gaps between
  consecutive purchases.
- Two data points give one interval — treat that as a rough first guess
  only. Wait for a third occurrence (two consistent-ish intervals)
  before treating a pattern as trustworthy enough to act on; a single
  gap can just be a one-off (a party, a gift, stocking up before a
  trip).
- Surface it as a suggestion the user acts on ("Milk — usually every ~6
  days, last bought 5 days ago — add to your list?"), not a silent
  auto-add. Wrong predictions erode trust fast; a dismissible suggestion
  doesn't.

**Phase 3 — auto-add (only once Phase 2's predictions prove reliable):**
- Once real usage shows the intervals are actually decent predictors,
  consider adding the product automatically instead of just suggesting
  it — probably still with a clear "added automatically, based on your
  usual pattern" marker on the item, and an easy undo.

**Phase 4 — diet observations:**
- Builds on the same purchase history: category-level trends over time
  (e.g. "mostly grains and protein, very little in Vegetables lately").
  Purely an insights layer on top of Phase 1's data — no new tracking
  needed, just aggregation and a place to show it.

### B. Multi-language support (i18n)

Right now every visible string in the app is a hardcoded English literal
written directly in JSX — there's no translation infrastructure at all
(no library, no translation files, no language switcher, no locale
detection). Raised because the user writes to Claude in Romanian while
the app itself is English-only; not urgent, but worth doing properly
instead of piecemeal once it's picked up.

**Why it's not a single task:** it's a cross-cutting refactor that
touches literally every screen already built, not a feature added on
top of the app — the later the app grows before this happens, the more
there is to redo.

**What it actually takes:**
- Pick a library — `react-i18next` + `expo-localization` is the usual
  Expo pairing (locale detection, `t()` calls, JSON translation files
  per language).
- Go through every existing component and replace each hardcoded string
  ("Add Product", "Category", "Clear cart", ...) with a translation key.
  This is the bulk of the work — dozens of files, hundreds of strings,
  and it only gets bigger the longer it's deferred.
- Write the actual translations (Romanian, at minimum) and get them
  checked by a native speaker for tone, not just correctness.
- Handle locale-aware plurals and formatting, not just word-for-word
  translation — Romanian has three plural forms (1 produs / 2 produse /
  20 de produse) where English only has two, dates/numbers format
  differently, etc. A naive `t("count")` string won't cover this; the
  chosen library's pluralization rules need to actually be used.
- A way to pick the language — auto-detect from the device locale as a
  sensible default, with a manual override somewhere in settings.

**Suggestion for whenever this gets picked up:** wire the i18n library
in from day one of picking this up (empty translation files, `t()`
calls returning English) rather than doing a "big bang" find-and-replace
across the whole app in one sitting — lets new features get written
translation-ready going forward while the backlog of existing strings
gets migrated incrementally.

## Done

### `RecurringWarningRow`'s `tier` field typed `never` (2026-09-26)

Fixed as a side effect of unifying Home Tasks' urgency coloring: `HomeTaskRow.tier` used to be its own unrelated `"critical" | "medium"` set; it's now the same `RecurringWarningTier` (`"yellow" | "orangeDays" | "orangeToday" | "red"`) Restanțe already used, via a shared `classifyTaskUrgencyTier()`. The intersection in `RecurringWarningRow` no longer collapses to `never` — confirmed via a full `npx tsc --noEmit` run, zero errors left in `dashboard.calculations.ts`/`HomeRecurringWarningsPage.tsx`.

### Home's Maintenance "Recurring" toggle had no way to set a due date (2026-09-26)

Also stale by the time it was re-checked — Home Maintenance's "Resolved" action work (built earlier this same session) already fixed this as a side effect: `homeCategoryConfig.ts`'s maintenance `buildEntry` now seeds `nextDueDate` via `addRecurrenceInterval(date, frequency, interval)` the moment "Recurent" is toggled on (or preserves it across later unrelated edits via the `wasAlreadyRecurring` check), instead of leaving it permanently `undefined`. Confirmed by reading the current `buildEntry` — removed from "Found along the way" rather than left describing a bug that no longer exists.
