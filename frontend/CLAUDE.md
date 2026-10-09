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
- **Auth-email screens** (2026-10): `app/(auth)/forgot-password.tsx`,
  `app/(auth)/reset-password.tsx`, `app/verify-email.tsx` (registration
  confirmation, confirms automatically on open), `app/confirm-email.tsx`
  (email change). Emails link to the backend's `{APP_URL}/open/<screen>`
  page, which redirects to `exp://<frontend-tunnel>/--/<screen>?token&email`
  (Expo Go) or `orgos://<screen>?...` (own build; `app.json` scheme). The
  `(auth)` group is invisible in the URL, so `/reset-password` = the
  (auth) file. AuthGuard treats reset-password, forgot-password,
  verify-email and confirm-email as PUBLIC: they open logged in or out (a
  logged-in user can still reset; a reset of the logged-in account ends
  the local session, since the backend revokes every token). Read
  `?email=` through `linkEmail()` (AuthShell.tsx) -- Expo Router turns
  "+" into a space. Unverified users (`user.email_verified_at === null`)
  are NOT blocked: `components/auth/VerifyEmailBanner.tsx` shows a
  dismissible (per app session) reminder on Acasă and Settings, with
  "Retrimite emailul" + cooldown (`useResendVerification`, also used by
  verify-email's error state). Register shows NO dialog (removed
  2026-10-08 -- the banner is the one reminder). API: `api.verifyEmail` / `api.resendVerification`;
  errors carry `status` + parsed `body` (`ApiError`), and
  `apiErrorMessage(e, fallback, field?)` picks `errors.<field>[0]` ->
  server message -> fallback. `useAuth().refreshUser()` re-reads /user.
- **Social login** (2026-10-08, Apple / Google / Facebook):
  `lib/socialAuth.ts` (all logic: `useSocialProviders`, `signInWithApple`,
  `signInWithWebProvider`, `exchangeSocialCode`, Romanian
  `socialErrorMessage`, `PROVIDER_LABEL`) + `components/auth/SocialLogin.tsx`
  (the "sau" divider + buttons, between the submit button and AuthSwitch on
  BOTH login and register -- the server links/creates, there's no separate
  "sign up with"). Renders nothing when no provider is available. Apple =
  Apple's own `AppleAuthenticationButton` (Apple's rules: black in light,
  white in dark, only `buttonStyle`/`cornerRadius` can change), iOS only and
  only if `isAvailableAsync()`; native sheet -> `POST /auth/apple`
  {identity_token, full_name?} (Apple sends the name ONLY on the first
  authorization). Google/Facebook = `Button variant="secondary"` + Ionicons
  logo, shown only when `GET /auth/providers` says configured; flow =
  `WebBrowser.openAuthSessionAsync({BACKEND}/auth/<p>/redirect?app_redirect=
  <Linking.createURL("auth-callback")>)` -> `?code=` -> `POST /auth/exchange`.
  `app/auth-callback.tsx` (PUBLIC in AuthGuard) handles the same deep link
  when the OS opens it directly; both paths share one in-flight exchange per
  code (codes are single use). Cancel is always silent. The session goes in
  via `useAuth().signInWithToken(user, token)` (api.authApple/authExchange do
  NOT store the token themselves, unlike api.login). `user.providers`
  (["apple", ...]) -> read-only "Conectat cu ..." rows in Settings > Cont.
  `app.json` has `ios.usesAppleSignIn` for a future own build (Expo Go
  doesn't need it).
  Security (QA, 2026-10-08): Apple first gets a one-time nonce
  (`POST /auth/apple/nonce`), passes it RAW to `signInAsync({nonce})` and
  back in `POST /auth/apple` -- no nonce = the Apple sheet never opens.
  Login-CSRF: auth-callback exchanges a code silently only if this app
  session started a Google/Facebook flow in the last 10 min
  (`consumePendingWebFlow`) or the code is already in flight; otherwise a
  signed-in user is asked ("Te conectezi cu alt cont?") and the old token
  is revoked before switching. `user.has_password === false` (social-only)
  -> Settings shows "Setează o parolă" (`SetPasswordModal`,
  `POST /profile/password/set`), and Email asks for a password first.
- `app/(tabs)/home.tsx` — the Home **tab** (Acasă), a user-arranged list
  of cards: `lib/dashboard/layout.ts` (types, catalog, palette, default,
  templates), `components/home/HomeWidgets.tsx` (every card, wide and
  compact), `components/home/LayoutSheets.tsx` (catalog, card settings,
  templates). Edit mode: the pencil, or a long press on an empty spot
  (the page itself is a Pressable; cards are inner responders). Layout
  saved per user: `GET/PUT /dashboard/layout`. Not to be confused with
  the Home **Space**. Cards with nothing to show are hidden in normal
  view (a new account sees only "Cheltuit"): the one rule per card type
  is `lib/dashboard/widgetVisibility.ts` (`visibleWidgets`, applied
  before `toRows` so no gaps, never saved). Edit mode shows every card
  with its own empty state. Changed what a card reads? Update its rule.
  A brand-new account (no space, no plan, 0 spent/planned) gets the
  EMPTY spend card (`EmptySpendCard` in HomeWidgets: legend of the 4
  space colors + "Creează primul spațiu"), and when every other card is
  hidden only by the empty rule (`onlyEmptyDataHidesOthers`) one hint line
  under the cards.
- `app/(tabs)/spaces.tsx` — the Spaces grid (create/rename/delete). Edit
  mode = the pencil or a long press on an EMPTY spot (cards are inner
  responders; a long press on a card does nothing): a ONE-column
  DraggableFlatList (☰ handle drags, edit, delete), order saved on
  "Gata". Never put that library on a numColumns grid -- it measures
  rows as one column and cards jump mid-drag. Creating: `TemplateList`
  (same file) = a 2x2 grid of "create" cards, shown in the empty state
  and in the header "+" Sheet. Each card: translucent identity tint
  (12% dark / 8% light), 1.5px DASHED identity border (= "not created
  yet", never confuse with a real space tile, which is opaque
  surfaceSecondary + IconWell + status line), icon/name/hint, and a
  filled `SPACE_BUTTON_FILL` "Creează" pill (ink `SPACE_ON_FILL`) at the
  bottom. The whole card is ONE PressableScale (`template-quick-<kind>`);
  the pill is visual only -- don't nest a pressable in it.
- `app/(tabs)/budget.tsx` — Budget tab, backed by `components/dashboard/
  BudgetOverviewPage.tsx` / `BudgetSpaceDetailPage.tsx`.
  **Buget din venit** (2026-10): `lib/budget/plan.ts` (jars, labels, colors,
  `jarAmounts`, `parseAmount`, and the shared plan cache `useBudgetPlan()` /
  `primeBudgetPlan()` / `refreshBudgetPlan()` that every form reads).
  No plan = onboarding card + today's UI. With a plan: hero on the
  Necesități envelope -> `IncomeSplitCard.tsx` (5 jars; Credit/Investiții
  3 states) -> "Necesități pe spații" (+ % of envelope, footer
  Împărțit/Nealocat, "Reîmparte" = `ResplitSheet.tsx`, PUT /budget/limits)
  -> Plăți recurente. Sheets: `IncomeSheet.tsx`, `SplitSheet.tsx`
  (−/+ steppers, Save only at 100). Pages: `GuiltFreePage.tsx`,
  `BudgetCreditPage.tsx`. `GuiltFree.tsx` = `GuiltFreeToggle` (edit forms
  only, hidden until a plan exists) + `GuiltFreeChip`. The Economii goal
  is the "Termen scurt" row (standalone card only without a plan).
- `app/(tabs)/calendar.tsx` — the whole Calendar screen, one file (2026-10
  redesign, mockup "orgOS Calendar redesign"): `HeatStrip` ("Următoarele 3
  luni", one 6px cell per day, one tap target per week; bright outline =
  the selected day, faint = today, like the grid), the month grid
  (always 6 rows; tiles filled by `heatLevel`/`heatColor` from
  `lib/statusColors.ts` = a plain count, one shade per thing, 8 shades,
  8+ = darkest, today/future only; lime dot =
  custom event, red dot = past day still unresolved; swipe via
  PanGestureHandler on the grid card + chevrons + "Azi" pill), "De rezolvat"
  = STRICTLY the Space records on the selected day (events of the day as
  lime chips), "Evenimente" = custom events only, next 3 months, each once,
  and `NewEventSheet` (Data + Ora, DatePickerSheet nested). Data: a cache of
  `/calendar?month=` for today's month + 2 and the displayed month ± 1.
  Everything is relative to `today`, re-read on focus / app foreground /
  midnight (the tab stays mounted for days) -- never hardcode a month.
  Supports `?date=YYYY-MM-DD` deep-link.
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
  `home_recurring`/`home_maintenance`. Main view (2026-10 redesign,
  design-lead spec v2): `HomeOverview.tsx` (`HomeOverviewCard` = the two
  sums only, `HomeDueSection` "De rezolvat" = Mașină's `Segmented` tab row
  exactly: Sarcini (default) / Facturi / Mentenanță with a small red/amber
  count (Segmented's optional `badge`), grouped Restante / Azi /
  Următoarele 7 zile like Car's EntryGroup, only the tab's 5 most urgent,
  then "Toate sarcinile (N)" unfolds every open record of the kind in place
  (`getHomeKindRows`; + "Mai târziu" / "Fără dată" groups). No Categorii section:
  Documente / Provizii are pills under Istoric (`HomeHeader`, red count =
  expired / running low), Cheltuieli open from the top card) +
  `components/spaces/SpaceQuickActions.tsx` (shared with Car). Data:
  `getHomeDueList` / `monthlyBillsTotal` / `supplyStatus` in
  `dashboard.calculations.ts`. Every Casă record: tap = read-only preview,
  long press = actions (+ haptic, `lib/haptics.ts`), one sheet for all
  screens -- `HomeRecordSheet.tsx` fed by `homeRecordPreview.ts`; actions
  routed through HomeDashboard's `recordResolve`/`recordEdit`/
  `recordDelete`. Sarcini reorders only in "Ordonează" mode (☰ handles).
  No longer rendered (dead, not deleted): `HomeStats.tsx`,
  `HomeRestanteCard.tsx`, `HomeNextSection.tsx`, and
  `HomeRecurringWarningsPage.tsx` (its branch stays in HomeDashboard but
  nothing opens it any more).
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
- Credits (`expense_credit`, never an expense -- filtered out of entries/
  totals): `ExpensesCreditsSection.tsx` + `CreditSheet.tsx`,
  `TitleChipRow.tsx` (Row with a chip after the title), helpers in
  `lib/spaces/expenses/credits.ts` (mirror backend creditDueIn/NextDue/
  RemainingRates). The credit fields themselves (Nume, Rata lunară, Ziua
  plății + Ultima rată pickers, "Mai sunt N rate" caption,
  `creditDraftError`) are `CreditFields.tsx` -- shared by CreditSheet and
  `components/spaces/SpaceCreditToggle.tsx`, the "În rate" toggle on the
  Car/Home CREATE forms (`CarProfileForm`, `HomeProfileForm` when
  "Cumpărată"; never in edit mode). Create mode of both forms is ONE
  `api.createSpace` call carrying `profile` (+ `credit`) -- never a
  separate saveCarProfile/saveHomeProfile after it (that left orphan
  spaces on failure); edit mode still uses updateSpace + save*Profile.
  The credit goes in that same call; the server files it in the first Cheltuieli space or
  a new "Default" (then `afterSpaceCreditSaved` says so and refreshes the
  /budget cache). `components/spaces/LinkedCreditsLine.tsx` under Car's
  top card and `HomeOverviewCard`. Credit reminders (reminder:true) in
  Calendar / Acasă De făcut / TodoCarouselSheet render via
  `components/dashboard/CreditReminderRow.tsx`: no swipe, never overdue.
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
  `components/themed-text.tsx`, `components/themed-view.tsx`,
  `hooks/use-theme-color.ts` (only those dead files import it).

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
  EmptyState, ToggleRow, Disclosure for "Mai multe detalii"),
  `components/ui/Sheet.tsx` (the one bottom sheet: spring in, drag handle
  to dismiss; Group/Row/Segmented inside it step up a layer via
  `SurfaceLevelContext`), `components/ui/DatePickerSheet.tsx` (the one
  date picker, Monday-first, range past/future/any) + `DateField.tsx`
  (picked "ZZ.LL.AAAA" for Car forms), `PressableScale`,
  `AnimatedNumber`. Cross-screen rules live in one place each:
  `daysFromToday()` (lib/format.ts) for every day difference/grouping,
  `lib/dashboard/spaceDue.ts` for a Space tile's status ("8 restante" /
  "1 azi"), `components/dashboard/RecurringBillRow.tsx` for every
  "Plăți recurente" row (`RecurringGroups` splits a list into "Facturi"
  -- counted up front as "de plătit" -- and "Mentenanță recurentă" --
  reaches Cheltuit only when done; `recurringKind()` decides). "Cheltuit" = recorded spend only; recurring
  bills show apart as "+ X lei plăți recurente de plătit". Rule: a bar or
  number that includes money NOT spent yet must say so right there --
  a space's budget bar is always `components/dashboard/BudgetSplitBar.tsx`
  (solid = spent, hatched = money counted but not spent yet: unpaid bills
  + Calendar purchases still ahead (`planned` from /budget, EventSpend on
  the server), a vertical line at the budget when the bar runs past it;
  amount "0 + 725 / 140 lei") + `BudgetUpcomingNote` under it (pass
  `planned` so it says which). A Calendar event with "Implică o cumpărare"
  is "planificat" until its day, then "Cheltuit"; the Cheltuieli space
  lists them read-only ("din Calendar", `api.calendarPurchases`).
- **"ⓘ" explanations** -- every "how does this work" text lives in
  `lib/help.ts` (one topic per card / page / form / kind of record), NOT
  as grey paragraphs under the UI. Show it with `info="topic.key"` on
  `SectionHeader`, `Identity`, `PageTitle` or `Sheet`, or a standalone
  `<InfoButton topic=... />` (`circle` = 44px header button). Opens in
  `components/ui/HelpHost.tsx` (mounted at the root, only while open --
  so it lands on top of an open form on web too). New screen or form?
  Add its topic. Changed a rule a topic describes (thresholds, what
  counts as spend)? Update the text.
- **First-use tours** ("ghiduri", 2026-10-08, design-lead mockup "Acasă cu
  ghid"): `lib/tours.ts` holds every tour's copy + steps (like help.ts) and
  the runtime (`startTour`, `requestTour`, `isTourActive`,
  `ONE_AUTO_TOUR_PER_SESSION`). `components/ui/TourHost.tsx` (root, next to
  HelpHost/ConfirmHost) = one Modal: dimmed scrim with a rounded hole + white
  ring around the real element, floating card bottom/top, RN Animated only;
  a step whose target isn't registered / measurable / leaves no room shows
  its illustration instead. A screen marks targets with
  `useTourTarget(id)` (spread on a View; `components/ui/tourTargets.ts`),
  registers its ScrollView with `useTourScroll(key, ref)`, and calls
  `useAutoTour(key, {ready, ctx})` (lib/useAutoTour.ts: waits for no
  ConfirmHost dialog -- `isDialogOpen()` --, no help sheet -- `isHelpOpen()`
  --, no other tour). Seen state = `user.tours` (server `users.tours`,
  `api.markTour`/`api.resetTours`). Replay: a help topic with `tour:` gets
  "Arată ghidul ..." in HelpHost; Settings > "Revezi ghidurile". Only the
  Acasă tour exists (targets `home.header`, `home.edit`, `home.card.spend`,
  `tab.<route>` in MainTabBar); the other 7 keys are listed "În curând".
  New tour = a TourDef in TOURS + targets + useAutoTour on that screen.
  TEMP: Acasă's `SHOW_TOUR_TEST_BUTTON` pill (see BACKLOG).
- **Swipe** (`components/spaces/SwipeRow.tsx`): right = rezolvă, left =
  șterge, everywhere it makes sense. On a document right = reînnoiește:
  `lib/dashboard/documentRenewal.ts` asks "cu datele vechi / modifică" and
  computes the new VALIDITY from the old issue/expiry dates (never from
  when it was entered); a car document becomes a new record (old one
  archived by the usual rule), a Casă document moves its dates in place.
  Documents always display validity ("12.09.2025 – 10.10.2026",
  "Expiră pe 10 oct."), never the entry date. Logs (expenses, fuel,
  services, history) only swipe left.
  Outside a Space use `components/dashboard/SwipeItemRow.tsx` +
  `lib/dashboard/itemActions.ts`: swipe-right never leaves the screen --
  a dialog (`chooseAction`, ConfirmHost's "choice" kind) offers "Rezolvă
  cu datele salvate" (resolved in place with the saved amount/provider/
  interval: a bill advances and logs its spend, a maintenance visit logs
  its cost, a car service is re-logged today at the current odometer) or
  "Modifică informațiile" (opens the record's resolve step in its Space,
  `?action=resolve`). Paid early -> "de azi sau păstrez programul?".
  Deletes always confirm. Confirmations always go through `confirmAction`
  (now ConfirmHost on native too -- no system Alert anywhere).
