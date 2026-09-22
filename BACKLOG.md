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

### `RecurringWarningRow`'s `tier` field is typed `never` — a naming collision between two unrelated "tier" concepts

**Where:** `frontend/lib/spaces/home/calculations/dashboard.calculations.ts`
— `HomeTaskRow` (line 188) already declares its own
`tier?: "critical" | "medium"`. `RecurringWarningRow` (line 155) is
defined as `HomeTaskRow & { tier: RecurringWarningTier; daysRemaining:
number }`, where `RecurringWarningTier = "yellow" | "orangeDays" |
"orangeToday" | "red"` (line 153) — a completely different value set.
Intersecting the two `tier` types has zero overlap, so TypeScript
collapses the property to `never`, which cascades into `error TS2339`
("Property 'X' does not exist on type 'never'") everywhere a
`RecurringWarningRow` is read: `dashboard.calculations.ts` itself
(lines 175, 178, 182) and `components/spaces/home/
HomeRecurringWarningsPage.tsx` (lines 30, 31, 80, 83, 84, 110, 112).

**What:** `npx tsc --noEmit` was run for the first time in recent
memory (as part of qa-lead's SDK-bump verification, not previously
gated by any script/CI) and surfaced this — it's a pre-existing type
bug, not something the Expo 54→57 bump introduced or touched (this
source file is untouched in that diff). Whether TypeScript 5.9 (the
version before this bump) already flagged the same error wasn't
verified. Fix is a rename: `RecurringWarningTier` needs its own field
name (e.g. `warningTier`) instead of reusing `tier`, updated at both
the type definition and its ~9 read sites.

**Found:** `[from: qa-lead verification of Task #6, 2026-09]`.

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

### Home's Maintenance "Recurring" toggle has no way to ever set a due date (functional defect, not just UX)

**Where:** `frontend/components/spaces/home/homeCategoryConfig.ts` (the
"maintenance" category's `fields`/`buildEntry` — no `nextDueDate` field
exists; `buildEntry` only ever preserves `existing?.nextDueDate`) and
`frontend/lib/spaces/home/calculations/dashboard.calculations.ts`'s
`getUpcomingHomeItems` (filters Maintenance strictly on `nextDueDate`).

**What:** A brand-new Maintenance entry's `nextDueDate` is permanently
`undefined` — there's no UI field to set it — so no user-created
Maintenance entry can ever surface in the dashboard's "Mentenanță" badge
or NEXT section, defeating the point of a due-date-tracked maintenance
log. Needs a `nextDueDate` field added to the form, or the recurrence to
actually project one (worth checking why this doesn't already use the
same `RecurrenceProjector` machinery `home_recurring`/`home_maintenance`
use server-side, per `homeItems.ts`'s comments).

**Found:** `[from: design-lead Phase 2 Home space audit, 2026-09-22]`.

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

_(none yet)_
