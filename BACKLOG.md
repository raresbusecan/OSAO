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

### `HomeTaskArchivePage.tsx` / `HomeMaintenanceArchivePage.tsx` orphaned by the unified archive

**Where:** `frontend/components/spaces/home/HomeTaskArchivePage.tsx` and
`HomeMaintenanceArchivePage.tsx`. Both fully superseded by the new
`HomeArchivePage.tsx` (see "Done" below) — zero real importers left,
confirmed by grep. Same file-deletion restriction as `search.tsx`'s
own entry above; worth a real deletion pass whenever that's lifted.

Also: `frontend/CLAUDE.md`'s file map still lists `HomeTaskArchivePage.tsx`
as part of Home's live file map — one-line doc drift, worth fixing in
the same pass as the deletion (or sooner, it's trivial).

**Found:** `[from: qa-lead review of feat/home-unified-archive, 2026-09-28]`.

### An optional date field can't be cleared once set (Home's "date"/"nextDueDate"/"expiryDate" fields)

**Where:** `homeCategoryConfig.ts`'s `buildEntry` for Maintenance's
`date`, Recurring's `nextDueDate`, and (newly, since this pattern is
now user-reachable) Documents' `expiryDate` — all three use the same
`values.field || existing?.field` fallback shape.

**What:** `HomeDatePickerSheet.tsx` has a "Fără dată" ("No date")
button that calls `onSelect(undefined)`, which `HomeCategoryPage.tsx`
turns into `values[field.key] = ""`. Since `""` is falsy, the
`values.field || existing?.field` fallback in `buildEntry` silently
falls back to the OLD value instead of clearing it — tapping "No date"
on a field that already has a value is a silent no-op. Pre-existing in
Maintenance/Recurring already, but only became practically reachable
(and worth fixing) once Documents' `expiryDate` — the first genuinely
optional date field a user would plausibly want to clear later, e.g. a
document that no longer needs expiry tracking — shipped. Workaround
today: delete and recreate the entry. Fix would need `buildEntry` to
distinguish "field key present in `values` but empty" (explicit clear)
from "field key absent" (untouched, keep existing) — e.g. checking
`field.key in values` instead of truthiness — across all three
call sites, not just Documents.

**Found:** `[from: qa-lead review of feat/home-due-date-urgency-tiers, 2026-09-28]`.

### Home's per-resolve spend history isn't visible to the backend's own cross-space aggregates

**Where:** `backend/app/Http/Controllers/Api/DashboardController.php`'s
`monthlyExpenses` query and `BudgetController`'s Home-category total —
both sum `Item::amount`/`due_at` directly off each row for
`Item::SPENDING_TYPES` (`home_task`, `home_maintenance`, ...).

**What:** Home's own "This month" spend (`HomeSpendPage`/the stat
card, via `getHomeSpendRecords`) now sums every `spendHistory` event
when a Task/Maintenance/Recurring entry has been resolved more than
once this month (see the Done entry below). The backend's own
cross-space Dashboard card and Budget's Home total have no visibility
into `spendHistory` at all — they still read the item's single live
`amount`/`due_at` column, so an entry resolved 3× this month still
only contributes its LATEST resolve's amount there, not the sum. After
this fix, Home's own stat card and the app-wide Dashboard/Budget
"Home" total can now disagree for any entry resolved more than once in
the same month. Needs a backend change (reading `metadata.spend_history`
similarly, or a real spend-log table) to close — out of scope for a
frontend-only diff.

**Found:** `[from: qa-lead review of feat/home-spend-history, 2026-09-28]`.

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

### Maintenance's `buildEntry` silently drops `completedAt` if a resolved entry is ever edited again

**Where:** `frontend/components/spaces/home/homeCategoryConfig.ts`'s
"maintenance" category `buildEntry` (~line 285-297) constructs its
return object field-by-field instead of spreading `existing` — it
carries `completed: existing?.completed ?? false` forward but has no
`completedAt` field at all. `maintenanceEntryToItemBody`
(`frontend/lib/spaces/home/homeItems.ts`) always sends
`completed_at: entry.completedAt ?? null` on every save, and the
backend's `ItemController::update` treats an explicit `null` as
"clear it" (confirmed live: omitting the key entirely leaves the
column untouched, but sending it as `null` overwrites it) — so any
save that runs a completed entry through `buildEntry` would silently
wipe `completed_at` back to `null` while leaving `completed`/`status`
still `"done"`.

**What:** Currently unreachable, not a live bug — a completed
Maintenance entry is filtered out of both `entries` and `rows`
(`!entry.completed`), so nothing in today's UI (the category page's
edit-on-row-tap, or the deep-link from Home tab's "De făcut" widget,
which only surfaces recurring actionable items) can call `buildEntry`
with an already-completed entry as `existing`. Flagging because the
new `HomeMaintenanceArchivePage` (commit 0ec6933) is exactly the kind
of surface a future "tap to undo/edit" feature would naturally get
added to (Tasks' own archive already has undo) — whoever adds that
should spread `...existing` in `buildEntry` (or explicitly carry
`completedAt` like `completed` already is) rather than rediscovering
this by watching an archived entry's date silently disappear.

**Found:** `[from: qa-lead review of 0ec6933 (Home Maintenance
archive), 2026-09-28]`.

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

### `DashboardControllerTest` expected a `payments` bucket that never shipped (2026-09-27)

The test predated `Item::ACTIONABLE_TYPES`/`SPENDING_TYPES` — every item it created used `type='task'` (the factory default) or `'expense'`, neither a real type, so every test item was silently excluded from every bucket regardless of the `payments` question. Confirmed via grep that the frontend has never read `data.payments` — not a feature that shipped and regressed, just a test nobody updated. Rewrote both tests with real types (`home_task` for actionable items, `home_expense`/`car_fuel` for spend), dropped the payments assertions, and added a new test actually covering `monthlyExpenses` (previously untested). Full suite is 13/13 green with zero pre-existing failures for the first time this session.

### All 11 save handlers in [id].tsx had the same silent-failure-on-edit bug (2026-09-26)

`handleHomeTaskSave` was fixed first (root cause of a real user-reported bug: a resolved Task reappeared as unresolved in Restanțe after a silently-failed save). The other 10 (`handleFuelSave`, `handleMaintenanceSave`, `handleDocumentSave`, `handleExpenseSave` for Car; `handleHomeDocumentSave`, `handleHomeExpenseSave`, `handleHomeMaintenanceSave`, `handleHomeRecurringSave`, `handleHomeSupplySave` for Home; `handleExpenseEntrySave` for the Expenses space) had the identical bug and are now fixed the same way — each snapshots the entry before its optimistic update and reverts to that exact snapshot on a failed save, instead of a no-op that kept showing the never-actually-persisted edit. qa-lead verified all 10 individually (diffed each against main, confirmed the "new entry" failure path and every function's other logic, e.g. Car's renewal-flow branches, were untouched) plus a live end-to-end test against 3 of them (Car/Home/Expenses) with real forced `422` failures.

### `GET /api/user` (and any protected route) crashed 500 instead of 401 (2026-09-26)

Root cause: the default `Authenticate` middleware tries `route('login')` for any unauthenticated request whose Accept header doesn't explicitly say "application/json" — this app has no web login route at all (API-only), so that threw `RouteNotFoundException`, a raw 500 with a leaked stack trace, instead of a clean 401. Fixed with `$middleware->redirectGuestsTo(null)` in `bootstrap/app.php`, disabling the redirect entirely. Verified live: no-Accept-header request now returns a clean 401, a valid bearer token still returns 200 as before, and the backend test suite shows no new failures (same 2 already-known `DashboardControllerTest` ones).

### Calendar bucketed days by UTC, with no user-timezone concept anywhere (2026-09-27)

Design decision (user's own call): collect the timezone automatically from the device, then persist it — not a stateless per-request header alone, not a manual Settings field. `frontend/lib/api.ts` now sends `X-Timezone` (from `Intl.DateTimeFormat().resolvedOptions().timeZone`) on every request; a new `SyncUserTimezone` middleware persists it onto a new `users.timezone` column whenever it's present, valid, and different from what's stored; `CalendarController` reads `$user->timezone ?? 'UTC'` for both the month's start/end boundaries and both day-grouping `toDateString()` calls. A user who's never sent it falls back to the exact old UTC behavior, confirmed unchanged.

Found and fixed a real Laravel/Carbon gotcha while verifying this live: the query builder serializes a Carbon straight to its own wall-clock string for a raw SQL parameter (e.g. `whereBetween`) — it does NOT auto-convert to UTC the way an in-PHP Carbon comparison does. Needed an explicit `->setTimezone('UTC')` copy of the month bounds for that one query, separate from the `$userTz`-tagged Carbons used everywhere else in the method (those are instant-based comparisons, unaffected by the tag). qa-lead independently reproduced the gotcha at the PDO-binding level and re-verified the fix with a different timezone/item/user (Asia/Tokyo) than the implementation session's own test.

### `league/commonmark` high-severity DoS advisory (2026-09-26)

Bumped 2.9.1 → 2.10.3 via `composer update league/commonmark --with-all-dependencies` — Laravel's own `^2.8.1` requirement is satisfied by 2.10.x, so this was a same-major, in-range patch, not a breaking change. `composer audit` now reports zero advisories. Backend test suite re-run after the bump: only the 2 already-known, pre-existing `DashboardControllerTest` failures remain (the "payments" bucket issue, logged separately above) — nothing new broke.

### The shared "+" FAB's fan/Quick-Add code removed (2026-09-27)

Stripped the fully-dead FAB `Pressable`/category-fan `Animated.View`s/backdrop/`QuickAddSheet` wiring from `app/(tabs)/_layout.tsx` (403 lines → ~65, just the `Tabs` navigator now), plus the now-pointless `useRegisterSpaceCategories(...)` call from each of the 4 Space dashboards — keeping whatever each one was ALSO feeding to a still-live piece of UI (Car's `carCategories`/`handleCarAction`, still used by `CarQuickActions`; Home's `selectCategory`, still used by the category tile grid; Grocery's `canCreateList`). Confirmed via grep across the whole frontend that nothing else imports the removed hooks/component, and qa-lead independently verified each dashboard's "kept vs. removed" split by reading the current file state (not just the diff) plus a `tsc`/bundle-serve check.

`lib/spaceCategoryFab.tsx` and `components/quick_add/quickAdd.tsx` are now fully orphaned (zero real importers) but couldn't be deleted -- file deletion is denied in this environment, same constraint `search.tsx`'s own entry already documents. `frontend/CLAUDE.md`'s file map updated to match (was still describing the FAB/fan as live).

### `getThisMonthExpensesTotal()` was dead code, and now backs a more useful stat (2026-09-27)

Per explicit user decision (option A of the 2 the original entry offered): `ExpensesStats.tsx`'s second card swapped from a bare "Items: N entries" count to "This Month: X RON", wired to the already-written `getThisMonthExpensesTotal`. While investigating this, found a separate, adjacent dead-code chain (`lib/dashboard/monthlyExpenses.ts` and `DashboardController`'s own `monthlyExpenses` field, both unused by the frontend) -- logged as its own new "Found along the way" entry above rather than touched here, since it needs an actual decision (wire it into `home.tsx`, or drop both) not a blind removal.

### `DashboardController`'s `monthlyExpenses` field wired into a new Home tab widget (2026-09-28)

Per explicit user decision ("construiește" -- build it, not drop it): Home tab gained a new full-width "CHELTUIT LUNA ACEASTA" card reading `dashboard.monthlyExpenses` for the first time, right after the existing "BUGET TOTAL" card -- deliberately a different, more complete number (every `SPENDING_TYPES` item this month, not just categories with a budget limit set, which is all BUGET TOTAL's own `budget.limits`-sourced total covers). qa-lead live-tested all 4 spaces (not just Home, which is all the implementation session itself tested) end-to-end against the real backend and confirmed every `spaceName`/`icon` pair resolves a real `SPACE_IDENTITY_COLORS` entry and a real Ionicons glyph, with zero new `tsc` errors.

`frontend/lib/dashboard/monthlyExpenses.ts` (the OLD, separate, never-imported client-side calculation this replaces the need for) is still genuinely orphaned -- confirmed via grep, zero importers, still self-marked `@deprecated` -- but can't be deleted, same file-deletion restriction as `search.tsx`'s own entry below.

### Home Maintenance resolved entries now have an archive, closing the gap the confirm dialog was papering over (2026-09-28)

Mirrored Home Tasks' own already-shipped archive pattern instead of inventing something new: `HomeMaintenanceEntry` gained `completedAt` (mapped to/from the `items` table's existing, generic `completed_at` column -- no backend changes needed, Tasks already uses it), a new `getHomeMaintenanceArchive()` mirrors `getHomeTaskArchive()`'s exact shape, a new `HomeMaintenanceArchivePage.tsx` mirrors `HomeTaskArchivePage.tsx`'s exact layout, and `HomeCategoryPage.tsx` (shared by Documents/Expenses/Maintenance/Recurring) gained an optional `onArchivePress` header pill shown only for Maintenance. qa-lead independently live-tested the `completedAt` round-trip (including confirming an unrelated later field edit doesn't clear it) and traced the `spentThisMonth`/recurring-exclusion logic by hand.

The confirm-before-resolve dialog was deliberately left untouched everywhere -- the user had already explicitly overridden the original entry's suggestion to drop it for the recurring case, in an earlier session.

**New dormant risk found during review, not fixed:** Maintenance's `buildEntry` (in `homeCategoryConfig.ts`, untouched by this change) never carries `completedAt` forward on a save, unlike `completed` which it does preserve -- and `maintenanceEntryToItemBody` always sends `completed_at` explicitly (never omits the key), so if a future edit path ever runs an already-resolved entry back through `buildEntry`, it would silently null out `completed_at` on the server. Currently unreachable (`entries`/`rows` both filter out completed entries, so there's no live UI path back into `buildEntry` for one) -- worth remembering if/when undo or direct-editing of archived entries gets added.

### Home's two separate archive entry points unified into one space-level page (2026-09-28)

Per explicit user request for cross-space consistency ("Ideea e de consecvența / Pentru ca mai am zona de arhivare/istoric și în alte space-uri"): the just-shipped Tasks archive pill and Maintenance archive pill (both buried inside their own category screens) are replaced by one always-visible "Archive" pill on Home's main dashboard, mirroring Car's own already-shipped "Docs / Archive / History" pill row pattern. New `HomeArchivePage.tsx` combines `getHomeTaskArchive()` and `getHomeMaintenanceArchive()` (both pre-existing, unmodified) into one list with a `kind` discriminator, 3 filter tabs (Toate/Tasks/Mentenanță), and one combined "spent this month" total. `HomeTasksPage.tsx` and `HomeCategoryPage.tsx` both lost their own `onArchivePress` prop/pill entirely. qa-lead independently round-tripped real resolved Task + Maintenance entries against the live backend to confirm the underlying data shape, traced the merge/sort/sum logic by hand against both source functions, and confirmed via grep that no half-migrated prop or dead import was left behind.

`HomeTaskArchivePage.tsx`/`HomeMaintenanceArchivePage.tsx` are now orphaned (logged above, same undeletable-file constraint as `search.tsx`).

**Follow-up (same day, 2 small fixes per user feedback):** the pill was renamed "Archive" → "History" throughout (button + page title + icons) -- a time-based record of resolved entries reads more accurately as "History" than "Archive," which in Car's own vocabulary specifically means documents superseded by a renewal. It was also moved twice: first from after `HomeStats` to directly under `HomeHeader` (matching Car's own pill-row placement relative to its name/subtitle), then from a left-aligned sibling in `HomeDashboard.tsx` into `HomeHeader.tsx` itself (a new optional `onHistoryPress` prop), landing it centered directly under the space title/subtitle inside the header's own centered container -- exactly where Car's pill row sits.

### Home Documents/Maintenance rows colored by days-until-due, matching Car's own document urgency system (2026-09-28)

Per explicit user request ("un sistem asemănător cu cel din Car... cadran în funcție de zile"): Documents (`expiryDate`) and Maintenance (`nextDueDate`, recurring only) rows in the shared category list now color their subtitle red/orange/yellow the closer the date gets, mirroring Car's own `CarDocsPage` `statusColor`/`statusLabel` treatment. Documents got a new dedicated 3-band tier (`classifyDocumentUrgencyTier`: 45/30/15 days, the same thresholds Car's own document tiers use) since a document's alert window is much wider than a task's; Maintenance instead reuses the exact tier already computed for it in the Restanțe warnings widget (`classifyTaskUrgencyTier`, via a new `severityFromRecurringTier` mapping) rather than a second independent urgency definition, so a maintenance row and its Restanțe entry can never disagree (qa-lead confirmed this is structurally guaranteed, not just empirically matched -- both call sites run the identical function on the identical field). qa-lead live-tested all 3 severity bands plus boundary days (exactly 15/45/46 days, expired) against the real backend with zero off-by-one errors.

qa-lead's first pass on this found the Documents half was correct but practically dead: the Documents form had no field to ever set `expiryDate` at all. Fixed in the same branch by adding a standard optional `type: "date"` field (Car's own `CarDocumentForm` precedent), reusing `HomeCategoryPage.tsx`'s existing date-field renderer/`HomeDatePickerSheet` with zero new UI code. qa-lead's second pass live-confirmed the full round-trip (create with/without an expiry, edit pre-fill, preserve-on-save) and found one pre-existing, low-severity, out-of-scope defect (logged above under "Found along the way": an optional date field can't be cleared back to blank via the "No date" button) rather than blocking on it.

### Recurring rows colored by days-until-due too, after a real user-reported stale-overdue-bill bug (2026-09-28)

User report: a real "Internet" Recurring entry looked resolved in its own category list but showed "Overdue by 10 days" on the Home tab's NEXT widget. Root-caused live: its `due_at` in the database was genuinely still 10 days stale (`updated_at` unchanged since 2026-09-18) -- its "Rezolvă" action had silently failed to persist on 2026-09-18, predating this session's own silent-failure-on-save fix (see "All 11 save handlers..." above), so the optimistic UI at the time never reverted and the user reasonably believed it had worked. Live-tested the real update endpoint just now and confirmed it works correctly today, then corrected the actual entry (advanced its `due_at` to the next monthly cycle, exactly what tapping Rezolvă produces) directly via the API on the user's behalf.

The deeper, fixable gap: Recurring rows were the one category deliberately left out of the same-day urgency-tier coloring work above (Documents/Maintenance only) -- so a genuinely overdue bill's row looked identical to a fine one, silently hiding exactly this class of failure. Closed by extending the identical pattern (reusing `classifyTaskUrgencyTier`/`severityFromRecurringTier`, the same tier Restanțe already computes for the same entry) to Recurring's own `rows()`. qa-lead confirmed the Restanțe-agreement guarantee is structural (both call sites run the identical function on the identical field, not a coincidental match) and live-tested all 3 severity bands via the real backend.

### A recurring entry resolved multiple times in one month only counted once in "this month" spend (2026-09-28)

Real user report: resolving a recurring Task or Maintenance visit more than once in the same month never incremented "this month" spend, and Recurring bills didn't count toward it at all. Root cause: `HomeTaskEntry`/`HomeMaintenanceEntry`/`HomeRecurringEntry` each only ever stored a single mutable `price`/`amount` + `date`, overwritten on every resolve -- `getHomeSpendRecords` read that one snapshot, so N resolves in a month still summed to just the latest one. Recurring bills were excluded from spend entirely by a prior, separate, deliberate scope decision.

Fixed per explicit user decision ("începe cu toate 3 itemele... să inclus și recurent în spend") by adding a `spendHistory: {date, amount}[]` array to all 3 entities (stored in `metadata`, same pattern Supplies' `restockHistory` already uses -- no backend migration). `getHomeSpendRecords` now produces one record per `spendHistory` event when an entry has any, falling back to the old single-snapshot record for a legacy entry that hasn't resolved since this shipped (nothing already showing a total silently drops to zero). Maintenance's resolve action never asked for a fresh price on a repeat visit at all -- new `HomeMaintenanceResolveSheet` closes that gap, prompting for it (pre-filled with the last known price) only for a recurring entry's resolve. Recurring bills now log their own fixed `amount` as a paid-this-cycle event on resolve, deliberately kept separate from Budget's own pre-existing monthly-equivalent recurring math (a forecast, not a transaction log -- both are correct, for different questions).

Found and fixed 3 silent-wipe risks while wiring this up: `HomeTaskForm.tsx` and `homeCategoryConfig.ts`'s Maintenance/Recurring `buildEntry` functions none carried `spendHistory` forward on an unrelated edit (price, title, notes) -- would have silently erased accumulated history, same bug class as this session's earlier "All 11 save handlers..." fix. qa-lead live-tested all 3 entities resolved multiple times against the real backend (Task 3×, Maintenance 2×, Recurring 2×, all summing correctly), the legacy-fallback path (a real pre-existing item with no `spendHistory` key at all), and specifically re-tested the silent-wipe fix by editing an already-resolved-twice entry's price through the normal form and confirming both prior events survived.

**New gap found during review, not fixed (needs backend work, out of scope for a frontend diff):** logged separately above under "Found along the way" -- Home's own spend total now correctly sums every resolve, but the backend's cross-space Dashboard card and Budget's Home total still read each item's single live `amount`/`due_at` column, with no visibility into `spendHistory` at all. The two totals can now disagree for an entry resolved more than once in a month.

### Home cards/inputs given a real surface fill instead of floating transparent on the page (2026-09-29)

Per user follow-up on the design-reference work ("nu mă gândesc doar la text... format cardurilor, background, culoare, forma butoanelor"): grepped the actual component code (not impressions) against 4 real reference apps' card specs (`frontend/DESIGN.md`) and found the biggest concrete gap wasn't typography -- most "cards" in the app were `backgroundColor: "transparent"` (or no `backgroundColor` at all), the exact same color as the page behind them, told apart only by a 1px hairline border. Every reference app gives a card its own fill distinct from the page, hairline border on top of that, not instead of it.

Fixed for the Home space (15 files) as a pure visual change, no functional logic touched: every card/list-container/summary-banner/form-input that was transparent-on-page now uses `colors.surfaceSecondary` -- a token that already existed in `theme.tsx` for exactly this, just wasn't used. Deliberately left alone: icon-only ghost buttons (back/close, circular pill, no content) and pill-shaped nav/tab controls (History pill, segmented-tab wrapper, "Fără dată" button) -- legitimate outline-only patterns in every reference app too. qa-lead confirmed the diff is 100% `backgroundColor`-only (no prop/handler/JSX/layout changes), confirmed the "leave alone" list was followed correctly with zero missed real cards, and confirmed `colors.surfaceSecondary` is a real pre-existing token in both light/dark palettes.

First slice only (Home space) -- Car/Grocery/Expenses have the identical pattern and are a separate follow-up pass once this one's confirmed to look right. qa-lead also reconfirmed (not a new finding, already logged above) that `HomeTaskArchivePage.tsx`/`HomeMaintenanceArchivePage.tsx` have the same transparent-card pattern but are correctly out of scope -- both are the orphaned, unreachable files superseded by `HomeArchivePage.tsx`.

### Swipe-to-resolve/swipe-to-delete piloted on Home Tasks (2026-09-29)

Per explicit user request: swipe right reveals a green resolve action, swipe left reveals a red delete action, on Home's Tasks list -- the iOS Mail/Reminders convention. `react-native-gesture-handler`/`reanimated` were already dependencies (no new package), and `app/_layout.tsx` already wraps the app in `GestureHandlerRootView`, so no new native setup either. Deliberately a shortcut on top of the existing checkbox/trash icons, not a replacement -- both stay fully visible and functional, and the swipe fires the identical `onToggle`/`onDelete` callbacks a tap on them already does (qa-lead traced the full chain: same `confirmAction` destructive dialog on delete, same `HomeTaskResolveSheet` price prompt on a purchase task's resolve -- no parallel/shadow action path). `DoneRow` (already-resolved tasks) deliberately left unwrapped -- it has no delete action to swipe to.

qa-lead flagged (not a defect, just worth knowing): the classic `Swipeable` component used here is marked `@deprecated` in favor of gesture-handler's newer Reanimated-based `Swipeable` -- still fully functional and correctly used (its own distinct ref-based `.close()` API), just the library's legacy path, not what new code is steered toward. Also noted classic `Swipeable` has historically rougher behavior on web (mouse-drag reset, trackpad gestures) -- irrelevant to phone/Expo Go testing now, worth knowing if this pattern needs to work on a future web build.

Pilot scope only (Home Tasks) -- other spaces' resolve/delete lists (Car, Grocery, Expenses, Home's other categories) are a separate follow-up once the user confirms the gesture feels right on their phone.

### Swipe actions: auto-fire threshold, extraction, and rollout to Home's other categories (2026-09-29)

Follow-up to the Home Tasks pilot above, same day. Per explicit user request: a swipe past a distance threshold now auto-fires the resolve/delete action on release (no extra tap needed) -- the "commit swipe" convention Mail/Gmail use, layered on top of the pilot's existing tap-the-revealed-button behavior rather than replacing it. Threshold started at 40% of screen width, lowered to 25% per direct user feedback ("Prea mult 40% / Fă-l 25").

Extracted the swipe-row logic out of `HomeTasksPage.tsx` into a shared `frontend/components/spaces/SwipeRow.tsx` (matching the existing `components/spaces/EditSpaceModal.tsx` precedent for a cross-space component), then rolled it out to Home's other 4 categories (Documents, Expenses, Maintenance, Recurring) via their one shared row renderer, `HomeCategorySection.tsx` -- one change covered all 4 at once. `onResolve` is optional on the shared component: Documents/Expenses (no `resolveEntry` in `homeCategoryConfig.ts`) get delete-only swipe, Maintenance/Recurring get both directions. qa-lead traced the full chain for Maintenance specifically and confirmed a recurring entry's swipe-resolve still opens `HomeMaintenanceResolveSheet` (the price prompt), not a bypass.

**Two real bugs found and fixed during qa, both caught by independent source-level tracing of `react-native-gesture-handler`'s `Swipeable`, not just live testing (which isn't possible for a touch gesture from this environment):**
1. The action panel's `flex: 1` width (needed so the color filled the revealed strip) confused the library's own `leftWidth`/`rightWidth` measurement -- it measured off a layout marker positioned after the flex-expanded content, inflating to nearly the row's full width instead of the intended trigger distance. Symptom: releasing past the threshold made the row's open-snap animation fly open much further than the actual drag before immediately snapping shut. Fixed by using a FIXED width equal to the trigger distance instead of `flex: 1` -- same "fills the revealed strip" look (already exactly as wide as any reveal up to the trigger), without the measurement side effect.
2. That fix's own follow-up qa pass found a second, related defect: with `overshootLeft`/`overshootRight` still enabled (needed by the very first commit in this arc, back when the panel was a small fixed 80px), nothing clamped the drag past the new (larger) fixed-width panel either -- an ordinary swipe could outrun it, showing a gap of the row's own background. Fixed by disabling overshoot now that the panel's width IS the trigger distance -- `Swipeable` clamps the drag flat at exactly that point. A 4th, skeptical qa pass independently re-derived from source that this clamp only affects the *rendered* position, not the raw gesture value `handleRelease`'s threshold check reads from -- confirming the auto-fire is still fully reachable, not accidentally broken by the same fix that closed the gap.

Next: Home Supplies, Grocery's shopping-list items, then Car -- per the user's own stated priority order, not yet started.
