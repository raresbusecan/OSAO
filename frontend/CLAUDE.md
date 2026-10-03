@AGENTS.md

# frontend map

See `../CLAUDE.md` first for the cross-cutting model. This file is the
frontend-only file map — use it to jump straight to the right file
instead of grepping the whole tree. For visual/design-polish work
specifically, read `DESIGN.md` first — a calibration reference against
real modern apps, and what orgOS's current theme already gets right
vs. the one concrete gap (type weight) worth fixing.

## Routing (Expo Router, file = route)

- `app/(auth)/login.tsx`, `register.tsx` — auth screens, gated by
  `AuthGuard` in `app/_layout.tsx` (redirects based on `providers/auth.tsx`'s
  `user`).
- `app/(tabs)/home.tsx` — the Home **tab** (dashboard: budget glance,
  "De făcut" widget, per-Space cards, recurring-soon list). Not to be
  confused with the Home **Space**.
- `app/(tabs)/spaces.tsx` — the Spaces grid (create/rename/delete).
- `app/(tabs)/budget.tsx` — Budget tab, backed by `components/dashboard/
  BudgetOverviewPage.tsx` / `BudgetSpaceDetailPage.tsx`.
- `app/(tabs)/calendar.tsx` — the whole Calendar screen, one file: month
  grid (density-colored by day), agenda accordion, custom-event form,
  recurring-bills list. Supports `?date=YYYY-MM-DD` deep-link (jumps to
  that day on mount).
- `app/(tabs)/[id].tsx` — **the one route every Space actually renders
  through.** Loads the Space + its items, runs `detectSpaceType()`, and
  mounts `CarDashboard` / `HomeDashboard` / `GroceryDashboard` /
  `ExpensesDashboard` accordingly. Also the landing point for
  `TodoCarouselSheet`'s "Deschide" deep-links (`?itemId=&itemType=`,
  read here and passed down as `initialOpenEntry`/`initialOpenItem`).
- `app/(tabs)/search.tsx` — dead (`@deprecated` stub, unreachable).
- `app/(tabs)/_layout.tsx` — just the tab bar now. Used to also host a
  global "+" FAB (fanning out into a Space's categories via
  `lib/spaceCategoryFab.tsx`, or falling back to a Quick Add sheet) —
  removed once every Space grew its own always-visible entry points
  that made the fan redundant. `lib/spaceCategoryFab.tsx` and
  `components/quick_add/quickAdd.tsx` are now dead (orphaned, not
  deleted — file deletion is denied in this environment, same as
  search.tsx above).

## Per-Space file map

Each Space's dashboard owns a set of mutually-exclusive local-state
"sub-views" (form visible / list page visible / etc.) — not real
stacked `<Modal>`s, just early-return branches. `closeAllForms()` /
`closeAllSubViews()` clears them all before opening a new one.

**Car** (`components/spaces/car/`) — the reference-quality Space.
- `CarDashboard.tsx` — orchestrator: stats, RECENT/ALL, category tabs,
  `openEntryForEdit(type, id)` (the shared deep-link/edit entry point).
- `CarDocsPage.tsx`, `CarArchivePage.tsx`, `CarHistoryPage.tsx`,
  `CarExpensesPage.tsx`, `CarProfileForm.tsx`.
- `forms/CarFuelForm.tsx`, `CarMaintenanceForm.tsx`,
  `CarDocumentForm.tsx`, `CarExpenseForm.tsx`.
- `utils/carEntries.ts`, `lib/spaces/car/carItems.ts` (Item ⇄ entry
  mapping), `lib/spaces/car/calculations/`.
- Dead in this tree: `CarHeader.tsx`, `CarStats.tsx`,
  `CarNextSection.tsx`, `CarRecentSection.tsx`, `CarDetails.tsx`,
  `CarCurrentListPage.tsx`, `CarQuickActions.tsx`, `index.ts` (barrel),
  the whole `documents/expenses/fuel/maintenance/mileage/overview/`
  stub subfolders (all `return null`). Also: two files are both named
  `car.mock.ts` — `lib/spaces/car/car.mock.ts` is dead,
  `components/spaces/car/car.mock.ts` is live. Don't delete the wrong one.

**Home** (`components/spaces/home/`) — 4 categories: expenses,
maintenance, recurring, supplies, plus a dedicated Tasks flow.
Documents category exists in config but is intentionally unused (no
file storage yet).
- `HomeDashboard.tsx` — orchestrator, same pattern as CarDashboard;
  owns `initialOpenItem` deep-link handling for `home_task`/
  `home_recurring`/`home_maintenance`.
- `HomeCategoryPage.tsx` + `homeCategoryConfig.ts` — one generic
  form+list page, configured per category (expenses/maintenance/
  recurring/supplies-adjacent). `initialEditId` prop pre-opens a row
  for edit (used by the deep-link).
- `HomeTasksPage.tsx`, `HomeTaskResolveSheet.tsx`,
  `HomeTaskArchivePage.tsx`, `HomeRecurringWarningsPage.tsx`,
  `HomeRestanteCard.tsx` (main-page Restanțe summary, opens the
  warnings page),
  `HomeSuppliesPage.tsx`, `HomeSupplyRestockSheet.tsx`,
  `HomeCategorySection.tsx`, `HomeHeader.tsx`, `HomeStats.tsx`,
  `HomeNextSection.tsx`, `HomeProfileForm.tsx`.
- `forms/HomeTaskForm.tsx`, `HomeSupplyForm.tsx`.
- `lib/spaces/home/homeItems.ts`, `lib/spaces/home/calculations/`.
- Dead: `index.ts` (barrel — re-exports mostly-live components, delete
  only the barrel).

**Grocery** (`components/spaces/grocery/`) — lists, smart list,
recipes, sharing.
- `GroceryDashboard.tsx` — orchestrator (large file).
- `GroceryQuickAddBar.tsx`, `GroceryItemRow.tsx` (shared by 3+ call
  sites), `GroceryNewListModal.tsx`, `GroceryProductModal.tsx`,
  `GroceryFinishShoppingSheet.tsx`, `GrocerySuggestionModal.tsx`,
  `GroceryRecipesPage.tsx`, `GroceryRecipeDetailModal.tsx`,
  `SpaceMembersModal.tsx`.
- `lib/spaces/grocery/groceryItems.ts` (Item ⇄ entry mapping, same role
  as Car/Home/Expenses' own `*Items.ts`), `grocery.calculations.ts`,
  `grocery.smartList.ts`, `ingredientLookup.ts`, `recipeMatching.ts`.
- Dead: `GroceryAddBar.tsx`, `GroceryHeader.tsx`,
  `GroceryListSection.tsx`, `GroceryListsPage.tsx`,
  `GroceryShoppingListPage.tsx`, `GrocerySmartListPage.tsx`,
  `GroceryStats.tsx`, component-level `grocery.mock.ts` (the live one
  is `lib/spaces/grocery/grocery.mock.ts` — same-name trap, opposite of
  Car's), `grocery.data.types.ts`, `grocery.ui.types.ts`, `index.ts`.

**Expenses** (`components/spaces/expenses/`) — the simplest Space:
name + price + date + notes, no sub-categories.
- `ExpensesDashboard.tsx`, `ExpensesHeader.tsx`, `ExpensesAddBar.tsx`,
  `ExpensesStats.tsx`, `ExpensesListSection.tsx`, `ExpenseEditModal.tsx`,
  `ExpenseDatePickerSheet.tsx` (rewritten 2026-09 to drop FlatList
  paging entirely — a non-zero `initialScrollIndex` was never reliable
  on react-native-web; it now renders one month directly off plain
  `index` state).
- `lib/spaces/expenses/expensesItems.ts`.
- Dead: `ExpenseCategoryPickerSheet.tsx`, `index.ts`,
  `lib/spaces/expenses/expenses.mock.ts` (its fake entries used to seed
  `components/spaces/expenses/expenses.mock.ts`'s `initialExpensesData`,
  which is now an empty list -- entries come only from the API).

## Shared frontend systems

- `lib/theme.tsx` — theme tokens (`colors`, `spacing`, `radius`,
  `typography`) via `useTheme()`.
- `lib/api.ts` — the one HTTP client every `api.*` call goes through.
  No request timeout/abort anywhere (known issue).
- `lib/confirm.ts` + `lib/confirmHost.tsx` — global confirm/notify
  modal (`confirmAction`, `notifyAction`). Single shared `request`
  state — two calls fired back-to-back will drop/hang the first one
  (known issue, not yet fixed).
- `lib/spaceCategoryFab.tsx` — dead (orphaned, not deleted -- see
  `app/(tabs)/_layout.tsx` above). Used to be the shared "+" FAB's
  category-fan registration (`useRegisterSpaceCategories`); the
  `SpaceCategory` type it also exports is still live, reused by
  `CarDashboard.tsx`/`CarQuickActions.tsx` for an unrelated purpose
  (describing that row's own action buttons) -- only the hook is dead.
- `lib/spaces/spaceProfile.ts` — `detectSpaceType()` (checks
  `space.type` first, then legacy fallbacks), `SPACE_IDENTITY_COLORS`
  (Car blue / Home purple / Grocery orange / Expenses teal —
  deliberately preserved through every theme pass), `profileFromSpace`.
- `lib/statusColors.ts` — `severityColor`/`severityTint`/
  `budgetSeverity`/`densityColor`, the one source of truth for
  critical/warning/safe tiers. (`app/(tabs)/home.tsx` hand-rolls its
  own copy of the budget thresholds in two places instead of calling
  these — known inconsistency, not yet fixed.)
- `components/spaces/EditSpaceModal.tsx` — shared create/rename modal
  (Grocery/Expenses have no dedicated profile form, unlike Car/Home).
- `components/dashboard/TodoCarouselSheet.tsx` — opened from Home tab's
  "De făcut" widget; its "Deschide" button deep-links into the specific
  sub-view where each to-do type actually resolves (see `[id].tsx`
  above), not just the Space's dashboard root.
- Dead in `components/dashboard/`: `BudgetGlanceCard.tsx`,
  `MonthlyExpensesCard.tsx`. Dead in `components/navigation/`:
  `SpaceCategoryMenu.tsx`. Dead in `lib/dashboard/`:
  `monthlyExpenses.ts` (self-marked `@deprecated`). Dead Expo-template
  leftovers, never touched: `components/hello-wave.tsx`,
  `haptic-tab.tsx`, `external-link.tsx`, `parallax-scroll-view.tsx`,
  `components/ui/collapsible.tsx`, `components/ui/icon-symbol*.tsx`,
  `components/themed-text.tsx`, `components/themed-view.tsx`.

## Theme ("Theme E" / hairline)

Applied screen-by-screen across the whole app in 2026-09. The pattern,
if extending or adding a new screen:
- Card/container fill (`colors.surfaceSecondary` + `radius.lg`/`md`) →
  `backgroundColor: "transparent", borderWidth: 1, borderColor:
  colors.border` + `radius.sm`.
- Toggle/selected chips: keep the fill only while active; unselected
  state gets the same fill→border treatment, border color becomes
  `condition ? colors.onSurface : colors.border`.
- Primary filled CTA buttons (black/white inverse) stay filled — only
  reduce their radius to `radius.sm`.
- Small icon-avatar circles (32–42px, paired with a title) are the one
  deliberate exception — left filled, never converted.
- Modal/bottom-sheet top-corner radius (`borderTopLeftRadius`/
  `borderTopRightRadius: radius.lg`) is also a deliberate exception,
  everywhere.
- Identity colors (`SPACE_IDENTITY_COLORS`) and severity/alert colors
  (`lib/statusColors.ts`) are never touched by this pass.
- All delete-action buttons/icons use `colors.error`, consistently,
  everywhere (audited and applied 2026-09).
