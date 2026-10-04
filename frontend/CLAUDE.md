@AGENTS.md

# frontend map

See `../CLAUDE.md` first for the cross-cutting model. This file is the
frontend-only file map — use it to jump straight to the right file
instead of grepping the whole tree. For visual/design-polish work
specifically, read `DESIGN.md` first — a calibration reference against
real modern apps, and what orgOS's current theme already gets right
vs. the one concrete gap (type weight) worth fixing -- NOTE: superseded
by the 2026-10 redesign, see "Theme" at the bottom of this file.

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
  `CarQuickActions.tsx` is its live quick-action row.
- `CarDocsPage.tsx`, `CarArchivePage.tsx`, `CarHistoryPage.tsx`,
  `CarExpensesPage.tsx`, `CarProfileForm.tsx`.
- `forms/CarFuelForm.tsx`, `CarMaintenanceForm.tsx`,
  `CarDocumentForm.tsx`, `CarExpenseForm.tsx`.
- `utils/carEntries.ts`, `lib/spaces/car/carItems.ts` (Item ⇄ entry
  mapping), `lib/spaces/car/calculations/`.
- Dead in this tree: `CarHeader.tsx`, `CarStats.tsx`,
  `CarNextSection.tsx`, `CarRecentSection.tsx`, `CarDetails.tsx`,
  `CarCurrentListPage.tsx`, `index.ts` (barrel),
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
  `HomeArchivePage.tsx`, `HomeRecurringWarningsPage.tsx`,
  `HomeRestanteCard.tsx` (main-page Restanțe summary, opens the
  warnings page),
  `HomeSuppliesPage.tsx`, `HomeSupplyRestockSheet.tsx`,
  `HomeCategorySection.tsx`, `HomeHeader.tsx`, `HomeStats.tsx`,
  `HomeNextSection.tsx`, `HomeProfileForm.tsx`.
- `forms/HomeTaskForm.tsx`, `HomeSupplyForm.tsx`.
- `lib/spaces/home/homeItems.ts`, `lib/spaces/home/calculations/`.
- Dead: `index.ts` (barrel — re-exports mostly-live components, delete
  only the barrel); `HomeTaskArchivePage.tsx` and
  `HomeMaintenanceArchivePage.tsx` (superseded by `HomeArchivePage.tsx`,
  zero importers, still pre-redesign styling).

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

## Theme (2026-10 redesign -- dark-first, layered)

Replaces the old flat "hairline" style (fill->border). `DESIGN.md` is the
superseded calibration doc for that old style -- don't apply its "no
fills" rules. Approved mockup: the "orgOS redesign" canvas artifact
(Acasă, Mașină, Cumpărături, Spații, Casă, Cheltuieli, Calendar, Buget,
sub-pages, sheets, dialogs, login, settings). Rules:

- **Three surface layers**: `colors.surface` (page) -> `surfaceSecondary`
  (cards, list groups) -> `surfaceTertiary` (inputs, chips, icon wells,
  pressed rows). Cards are FILLED; no outlines as the only depth cue.
- **Color comes from the Space**: `SPACE_IDENTITY_COLORS` for fills
  (bars, filled buttons, dots), `spaceTextColor(kind, isDark)` for text
  and stroke icons, `SPACE_ON_FILL` for ink on a filled identity color,
  `SPACE_BUTTON_FILL` for a filled button with a text label. No single
  app-wide accent; outside a Space the primary button is `onSurface`.
- **Semantic**: `success`/`error` = finance green/red, `warning` = "Azi",
  `caution` = a step earlier. Light-theme values are the deeper shades
  that pass 4.5:1 -- don't lighten them.
- **Type**: IBM Plex Sans only (lib/globalFont.*.ts maps fontWeight to
  the right file automatically). Weights 400/500/600 only -- anything
  heavier renders as 600. Use `typography` tokens (hero/display/
  largeTitle/title/subtitle/body/label/caption/chip/micro).
- **Romanian only, sentence case** -- no ALL-CAPS labels, no English UI
  strings. Plurals through `roCount()` (lib/format.ts: "5 zile",
  "20 de zile"); money `lei()`, dates `roDate()` ("1 octombrie").
- **Touch targets >= 44px** (rows 56+, buttons 52, circle buttons 44).
- **Layout tokens**: `spacing.gutter` (page side padding, 20),
  `spacing.section` (gap between sections, 20), `radius.card` (groups/
  tiles 16), `radius.control` (inputs/buttons 14), `radius.lg` (hero
  cards 20), `radius.inner` (segment inside a track).
- **Motion** (lib/motion.ts, RN `Animated` only -- reanimated worklets
  don't run in this Expo Go): press squeeze via `PressableScale` with
  `motion.scale.control/tile/card`; rows INSIDE a grouped card don't
  scale, they highlight (`scaleTo={1} pressedStyle={{ backgroundColor:
  colors.surfaceTertiary }}`). Number count-up (`countUpOnMount`) only
  on Home's month total. Everything respects `useReducedMotion()`.
- **Building blocks** -- use these instead of hand-rolling:
  `components/ui/primitives.tsx` (TopBar, CircleButton, Identity,
  PageTitle, SectionHeader, Card, Group + Row with inset separators,
  IconWell, Chip, Pill, Segmented, Button, Field, FieldButton,
  EmptyState), `components/ui/Sheet.tsx` (the one bottom sheet:
  spring in, drag handle to dismiss), `PressableScale`,
  `AnimatedNumber`. Confirmations always go through `confirmAction`
  (now ConfirmHost on native too -- no system Alert anywhere).
