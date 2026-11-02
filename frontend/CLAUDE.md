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

- **Resolve over the origin screen** (2026-11-01/02, user decision): `todoHref(item, "resolve")` adds `&overlay=1` to a record-action href (view intents never). app/_layout.tsx presents it as a `transparentModal` with `animation: "none"`. `app/record-action.tsx` mounts the Space page INVISIBLY (opacity 0; its dashboards own every resolve flow) so only its Sheets/dialogs (own native windows) show; while waiting the origin dims with `SHEET_BACKDROP` (no spinner). Signals: `visibleSheetCount()`/`subscribeSheets()` + `isDialogOpen()` (lib/dialogCoordinator.ts) and `recordAction.loaded(ok)` from [id].tsx's first load. Ends ALWAYS one of: form/dialog shown then closed -> leave (complete/cancel, or 1.5 s after the last one closes); load failed or >10 s -> leave + "Nu am putut deschide" notice; nothing shown 1.5 s after load (record gone) -> the same tree revealed in place with an "Înapoi" pill. Leaving waits until no Sheet/dialog is open (no cap) + 50 ms: two native windows dismissing at once made iOS drop one, an invisible window then swallowed all touches. Same root cause in TodoCarouselSheet: it resumes 200 ms after a blur. Tests: tests/resolve-overlay.test.cjs, contextual-actions.
- **Actions opened from another screen** (2026-10-20): records in all four Spaces
  use `lib/navigation/recordActionRoute.ts` via `todoHref` to open
  `app/record-action.tsx` on the root Stack. It hosts the existing Space
  forms under `RecordActionContext`; successful persistence returns to the
  still-mounted origin, cancellation does the same, and failures stay editable
  (a direct resolve offers retry/back). Plain Space browsing keeps its normal
  route. Refresh is emitted even if the user left while a save was pending;
  delayed responses never navigate. Returning to an originating Space marks
  `returnTrail` before removal to suppress its normal focus remount. The
  origin lookup unwraps Expo 57's generated `__root` navigator. De făcut hides
  its Sheet while blurred and resumes it with its saved scroll offset.
  `lib/refresh.ts` owns `REFRESH_EVENT` -- import it from there, never from the tabs layout (that made require cycles).
  All 15 Space item types resolve to their owning section/record, including
  raw `space_id` payloads and Home payment occurrences (`item_id`). Bills in
  Acasă compact/wide and Buget, credit reminders, both Calendar modes and
  Budget detail/guilt-free rows share `todoHref`; Calendar is reserved for
  personal events. Grocery links select the actual list/product; trips show
  their saved purchase details. `useRecordMutation` guards the additional
  forms against overlapping writes and preserves them on failure. Budget
  subpages refresh on focus and refresh events without resetting their month.
  Tests: `tests/contextual-actions.test.cjs`, `tests/record-destinations.test.cjs`. Native Sheet handoff still needs
  phone verification on both Android and iOS.
- `app/(auth)/login.tsx`, `register.tsx` — auth screens, gated by
  `AuthGuard` in `app/_layout.tsx` (redirects based on `providers/auth.tsx`'s
  `user`).
- **Auth-email screens** (2026-10): `app/(auth)/forgot-password.tsx`,
  `app/(auth)/reset-password.tsx`, `app/verify-email.tsx` (registration
  confirmation, asks for the owner-chosen password; old sessions are revoked), `app/confirm-email.tsx`
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
  Edit mode's reorder is `components/ui/ReorderList.tsx` (+ `ReorderHandle`
  on the ☰), NOT react-native-draggable-flatlist (2026-10-12: rapid drags
  left cards overlapping / gaps -- see the file's header for why).
  **Hold menu** (2026-11-02, variant A): the normal page is a `HoldGroup`
  (`components/ui/Hold.tsx`). Hold a card = its menu (Setările cardului,
  Fă-l lat/compact, Aranjează tot Acasă, Ascunde), saved AT ONCE
  (`saveLayoutNow`, put back on error); its settings sheet opened from
  there saves at once too (removing asks first). Hold + drag = move the
  card in place -> `arranging` (the same page ordered from `draft`,
  Renunță / Gata header); hidden cards keep their slots (`reorderSubset`).
  Hold an empty spot = full edit mode, as before.
  A brand-new account (no space, no plan, 0 spent/planned) gets the
  EMPTY spend card (`EmptySpendCard` in HomeWidgets: legend of the 4
  space colors + "Creează primul spațiu"), and when every other card is
  hidden only by the empty rule (`onlyEmptyDataHidesOthers`) one hint line
  under the cards.
- **Tab header** (2026-11-01, user decision: nothing may move when switching tabs): every main tab root -- Acasă, Spații, Calendar, Buget, Simplu Acasă + Calendar -- renders inside `TabScreen` (`components/navigation/TabHeader.tsx`: safe area + ScreenBackground + the header FIXED above the scroll, never inside it -- tabs stay mounted and keep their scroll offset, so a header in the scroll sat at a different height per tab). A screen only passes `header={<TabHeader title info actions />}`: small grey line (today's date, or `label`: edit modes, "Anul 2027" on Calendar in another year), title (shrinks, never wraps) + ⓘ, the tab's `actions`, then `ProfileButton` (initial + email badge -> /settings) always LAST (`profile={false}` in edit modes, which use the same TabHeader). `header` undefined = none (Buget's sub-pages). Never hand-build a tab header, put it in a ScrollView, or change its padding on one screen; the scroll content under it starts with `paddingTop: spacing.md` (keeps the first card's shadow). Calendar's tour step "months" now targets the 3 month cards only (the header is outside the scroll).
- `app/(tabs)/spaces.tsx` — the Spaces grid (create/rename/delete). Hold
  a card = its menu (Editează / Aranjează spațiile / Șterge); hold + drag
  = move it IN the grid (`arranging`, Renunță / Gata saves draftOrder) --
  user request 2026-11-02, replacing "hold a card = edit mode". Edit
  mode = the pencil, a hold on an EMPTY spot, or "Aranjează spațiile"
  (edit-mode rows are tappable to edit that space): a ONE-column
  `ReorderList` (☰ handle drags, edit, delete), order saved on
  "Gata". One column only -- it stacks rows by height. Creating: `TemplateList`
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
  only, hidden until a plan exists; only where spending can be guilt-free --
  general expenses, purchases, shopping, Calendar purchases. Fuel, services,
  documents and Casă bills/maintenance pass `onlyIfSet`: shown only to undo
  an existing flag, user decision 2026-11-02) + `GuiltFreeChip`. The Economii goal
  is the "Termen scurt" row (standalone card only without a plan).
  First-use tour "budget" (4 steps, copy adapts to TourCtx hasPlan /
  hasSpaces / hasBudgets / hasCredit): `budget.top` = the onboarding card
  without a plan, the hero (a View around its PressableScale) with one;
  `budget.split` = the onboarding bar + legend, or IncomeSplitCard's
  "Venit net lunar" + 5-part bar block (the hook lives IN
  IncomeSplitCard); `budget.spaces` = the FIRST space row (or the empty
  state) -- the whole section is too tall to leave room for the card;
  `budget.recurring` = the "Plăți recurente" header. useAutoTour ready =
  loaded, no space detail / overview / fără vină / credit page, no income /
  split / resplit / goal sheet open.
- `app/(tabs)/calendar.tsx` — the whole Calendar screen, one file (2026-10
  redesign, mockup "orgOS Calendar redesign"): "Următoarele 3 luni" =
  three `MonthMiniCard`s (2026-11-01, user pick from mockup "Calendar · 3
  luni variante"; replaced the "Bule cu inel" bubbles): today's month + 2,
  each the month in small -- one cell per day, Monday first, in the big
  grid's heat shade (same `heatLevel(dayShare)`, past days blank, today
  ringed) -- plus the month's status word under it (Liniștită/Plină/Prea
  plină, "≈" on future months, red when over); no animation; tap = jump
  the grid), the month grid
  (always 6 rows; tiles filled by `heatLevel`/`heatColor` from
  `lib/statusColors.ts` = the day's effort / its MAX capacity, 8 shades,
  full = darkest, today/future only. The capacity model -- workday 2/4,
  weekend + RO legal holidays 4/8, effort per item type, business-hours
  x1.5 -- is ONE file: `lib/calendar/capacity.ts`; lime dot =
  custom event, red dot = past day still unresolved; swipe via
  the shared `MonthSwipeView` on the grid card + chevrons + "Azi" pill), "De rezolvat"
  = STRICTLY the Space records on the selected day (events of the day as
  lime chips), "Evenimente" = custom events only, next 3 months, each once,
  and `NewEventSheet` (Data + Ora, DatePickerSheet nested). Data: a cache of
  `/calendar?month=` for today's month + 2 and the displayed month ± 1.
  Everything is relative to `today`, re-read on focus / app foreground /
  midnight (the tab stays mounted for days) -- never hardcode a month.
  Supports `?date=YYYY-MM-DD` deep-link. First-use tour "calendar" (4
  steps): targets `calendar.nav` (the 3 month cards; the title + arrows are
  in the fixed TabHeader, outside the scroll), `calendar.grid` (a View around the PanGestureHandler -- don't put
  the ref on the gesture child), `calendar.day` ("De rezolvat" block),
  `calendar.events` (the Evenimente header row with "+ Eveniment");
  useAutoTour ready = month loaded, no NewEventSheet / event sheet open.
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

### Tab navigation (tab bar, edge swipes, return trail)

- `components/navigation/MainTabBar.tsx` -- custom bar (4 visible tabs:
  home, spaces, calendar, budget; Simplu mode swaps in SimpleTabBar, see
  "orgOS Simplu mode" below). Inside a Space (`segments[1] === "[id]"`)
  the Spații cell is lit/`focused`, but a tap on it still navigates to the
  Spații list (fixed 2026-10-10). Publishes its height to the trail store.
- `components/navigation/TabSwipeEdges.tsx` -- 24px edge strips on the 4
  tab roots (hidden inside a Space; SwipeBackView owns that left edge).
  Left edge drag right = previous tab, right edge drag left = next tab.
- Tabs are `lazy:false`, so Buget's sub-page state (overview/space
  detail/credit/guilt-free) survives a tab switch. EXCEPTION: `[id].tsx`
  bumps `visitId` on every focus, remounting the Space dashboard (sub-pages
  reset on a normal re-visit) -- except when arriving via the return trail
  (`markTrailReturn`/`consumeTrailReturn`), which keeps the sub-page. Don't
  add a reset-on-blur elsewhere -- the return trail relies on this.
- **Return trail** (`lib/navigation/returnTrail.ts`, 2026-10-10): a tab-bar
  TAP away from a DEEP tab records `{originTab, originHref, landingTab,
  leftAt}` for 60 s (wall clock). Deep = inside a Space for Spații, or a
  screen that calls `useTabDepth(tab, deep)` (only budget.tsx so far;
  Acasă/Calendar have only modal sheets, which block the bar anyway). A
  Space screen counts as Spații for both origin and landing. The trail
  applies only on its landing tab's root. **Direction rule:** origin to
  the RIGHT of the current tab in the bar -> the drag-left swipe from the
  right edge goes to `originHref`; origin to the LEFT -> the drag-right
  swipe from the left edge does. The other edge stays normal. Used =
  cleared; reaching the origin tab by any route clears it; a new deep tap
  overwrites it; a tap from a root tab leaves it alone.
  `components/navigation/ReturnTrailHint.tsx` (mounted in `_layout.tsx`)
  shows a tappable "Înapoi la Buget" pill above the bar on the returning
  edge's side, fading out at expiry (RN Animated, reduced-motion aware).

### orgOS Simplu mode (2026-10-12, test toggle -- future free tier)

- **Mode switch**: `lib/appMode.tsx` -- `AppModeProvider` (in `app/_layout.tsx`)
  + `useAppMode()` -> `{ mode: "simple" | "full", isSimple, setMode, source }`.
  Order: a future server `entitlement` prop (plan) > the local test switch
  (SecureStore / web localStorage key `orgos_app_mode`, read synchronously --
  no flash) > default `"full"`. Toggle = Settings > Aplicație > "Mod Simplu
  (test)" (`ToggleRow`, hidden once a plan drives the mode). Off = the full
  app, untouched: every Simplu screen is a branch at the top of its route
  (`home.tsx` -> `SimpleHome`, `calendar.tsx` -> `SimpleCalendar`, `[id].tsx`
  -> `SimpleSpaceScreen` unless the URL has `?itemId=` -- a record deep link
  ("Modifică informațiile" from a resolve dialog) still opens the FULL
  dashboard, where that record's resolve/renew step lives).
- **Navigation**: `MainTabBar` delegates to `components/navigation/
  SimpleTabBar.tsx` (Acasă · + · Calendar; Acasă stays lit inside a space;
  no return trail -- `ReturnTrailHint` isn't mounted in simple mode).
  `TabSwipeEdges` cycles only home <-> calendar. Spații / Buget routes still
  exist, just no button.
- **App-wide sheets**: `lib/simpleSheets.ts` (module store) --
  `openUpgradeSheet()` (host `components/simple/UpgradeSheet.tsx`, root
  layout), `openQuickAdd(spaceId?)` (host `QuickAddHost` in
  `components/simple/QuickAddSheet.tsx`, tabs layout, simple mode only),
  and `setSpaceAccent` / `clearSpaceAccent` (the Simplu space screen
  publishes its fill/ink on focus: the "+" takes the space colour and
  quick-add preselects it). Quick-add saves emit REFRESH_EVENT.
- **Teasers**: `components/simple/Teaser.tsx` -- `TeaserCard` (dashed) and
  `TeaserRow` ("Complet" pill), both open the upgrade sheet. Rule: at most
  ONE per screen, next to data the user has; no locks, no launch pop-ups.
- **Upgrade sheet** (TEST): headline counts items whose `created_at` is in
  this month (`api.listItems()`), 4 perks, plan cards with "Preț în
  curând", CTA "Vezi în Complet" = `setMode("full")`.
- **Acasă** (2026-10-13, mockup "Acasă A · Spațiile sus"): `SimpleHome` =
  the spend card FIRST (user decision 2026-10-15), then
  `home/SpacesGrid.tsx` (2 columns: a filled tile per space with its
  due status, a dashed "Adaugă" tile per KIND still missing -- the only way
  to create another space in this mode; a second space of a kind the user
  already has still needs the full Spații tab), then `UpcomingCard`.
  `StartPicker` only before the first space. Spend card ("Cheltuit în
  {lună}", `SpendCard` in SimpleHome.tsx) = `monthlyExpenses.total` +
  `billsPaid` (a paid Casă bill is spent in Simplu, unlike Complet -- see
  BACKLOG), split by kind; `billsDue` as "+ X lei facturi de plătit".
  Shopping finished with a price (`grocery_trip`) and Casă purchases count
  through the same records Complet reads -- no migration on upgrade. Casă's
  hero "Am rezolvat" on a purchase task opens `HomeTaskResolveSheet` for
  the price (same saved shape as Complet's `resolveTask`).
- **No Complet teasers for now** (2026-10-13, user decision): `SHOW_TEASERS`
  in `components/simple/Teaser.tsx` is `false`, so `TeaserCard`/`TeaserRow`
  render nothing on every Simplu screen (the calls are still in place; flip
  the flag to bring them back, and the upgrade sheet with them).
- **Cumpărături in Simplu** (2026-10-13): `SimpleGrocerySpace` shows ONE
  list at a time (the "În magazin" mode was tried and removed, user
  decision). A header pill carries the selected list's NAME and, with
  several lists, opens a `Sheet` to switch (default = the newest list);
  under it the full app's `GroceryQuickAddBar` (type a name, it's on that
  list, the field stays open; no list yet -> a list "Cumpărături" is
  created on the first product) and the list's products (to buy first, in
  the cart after; tap = cart, swipe left = delete, long press = editor;
  "Am terminat cumpărăturile" = the finish sheet). `SimplePage` has a
  `footer` prop (pinned above the tab bar) -- currently unused. In Adaugă,
  a grocery space offers ONLY "Listă nouă" (user decision 2026-10-15;
  `KINDS_BY_SPACE.grocery`, the grocery_item/grocery_trip code is kept
  unused): name field (NO autoFocus -- user decision 2026-10-15, the
  keyboard opens only on a tap) + "Idei" name chips (taken names hidden) + "Ai deja
  listele ..." line, button "Creează lista", sheet titled "Listă nouă" when
  opened from the space. After a save it opens the space (from Acasă), and
  SimpleGrocerySpace selects a list that appears on reload (`knownListIds`).
  QuickAddSheet passes `visible={shown}`: the Sheet slides up only with its
  first content complete -- mounting it while data still streamed in made
  it open "in sections" (height jumps mid-spring, user report 2026-10-15),
  and waiting for the fetch made it slow. So `lib/quickAddCache.ts` keeps
  the spaces + each grocery space's lists prefetched (QuickAddHost: mount,
  REFRESH_EVENT, after each close; SimpleHome after a space is created):
  `bootFromCache` draws the first frame instantly, the sheet revalidates
  silently. No cache yet -> waits for its own load (0.8 s fallback).
- **Editing a record in Simplu** (2026-10-13): every record row opens
  `components/simple/EditRecordSheet.tsx` (host `EditRecordHost` in the tabs
  layout; `openEditRecord(itemId)` in `lib/simpleSheets.ts`): one generic
  sheet driven by `RECORD_SPECS` (per item type: which of title / sumă / dată
  / oră / notă / a few metadata extras), Salvează = a PARTIAL `PUT /items/{id}`
  with the saved `metadata` merged (advanced fields untouched), Șterge with
  a confirm. Wired on: space screens (hero, Documente, Urmează, "Luna asta"/
  "Ultimele cheltuieli" rows; Cumpărături = long-press a product, pencil on a
  list's title), Calendar day rows + own events, Acasă "Urmează" rows (the
  circle still resolves). `canEditRecord(type)` = whether a type has a spec;
  new record type in Simplu = add a spec. Credit reminders aren't editable.
- **"+" from Acasă = 2 steps** (user decision 2026-10-15): QuickAddSheet's
  `picking` step shows `SpacePickGrid` -- the spaces as a 2-column grid of
  squares (aspectRatio 1) filled with each space's `fill`/`ink`; a tap opens
  that space's form, titled "Adaugă la <name>" with a ‹ (`Sheet`'s new
  `onBack` prop) back to the grid. Skipped when locked (opened inside a
  space) or with one space.
- **Deleting a grocery list in Simplu** (2026-10-15): "Șterge lista" under
  the list (own-space lists only; page-level confirm) and the list editor's
  Șterge both delete the list's PRODUCTS too, then the list -- the server's
  destroy only removes the row asked for (Complet's handleDeleteList does
  the same client-side).
- **One space per kind in Simplu** (user decision 2026-10-15):
  `lib/simpleLimits.ts` (`canCreateSpaceInSimple` / `guardSimpleSpaceCreate`)
  checked by SimpleHome's `startCreate` and spaces.tsx's
  `createFromTemplate` when `isSimple`. Existing duplicates stay usable.
  Client-side only until a server plan exists (BACKLOG).
- **History in Simplu** (user decision 2026-10-15): 3 months, NO
  filters -- Mașină and Cheltuieli. Shared in SimpleSpaceParts:
  `useHistoryMonth()` (offset 0..-2, `inMonth`, `title` "Octombrie",
  `emptyText`) + `HistoryMonthBadge` (total + ‹ ›, SimpleCard `badge`),
  `SIMPLE_HISTORY_MONTHS = 3`; "Vezi încă N" (N = hidden rows) folds back on a month change
  (`useShowAll`'s resetKey). Mașină: 3 rows, total = that month's rows
  (same sources as getThisMonthExpenses). Cheltuieli: 5 rows, spent only
  (own expenses + Calendar purchases whose day came); the card's total
  shows only for a past month (the hero has this month's). Older history /
  filters / archive = Complet. Casă / Cumpărături: current month only.
- **Oil change in Adaugă** (user decision 2026-10-15): "Următorul schimb
  la" sits right under Kilometraj (not in Detalii), prefilled with
  Kilometraj + `OIL_CHANGE_KM_INTERVAL` (10.000, kinds.ts) until the user
  types in it (`nextKmTouched`); empty = only the 12-month date reminder.
  Reminder window = dashboard.calculations' MAINT_TIER_* (2.000 km).
  The Mașină header subtitle shows it after the km ("250 km · ulei în
  9.750 km", `oil` in SimpleCarSpace): latest non-superseded Oil Change +
  getMaintenanceUrgency -- grey outside the window, then urgencyTierColor
  (2.000 yellow / 1.000 orange / 500 red / overdue "depășit"); the date
  half takes over only when it decides urgency (≤45 days: "în 20 de zile",
  "azi"), else no-km cars read "ulei în 11 luni" in grey.
- **Mașină header pencil** (2026-10-15): `SimplePage` `onEdit` -> the
  same `CarProfileForm` (edit) with the `odometer` prop = an extra
  "Kilometraj" field (prefilled with the current km, floor = the highest
  logged reading via CarOdometerSheet's `odometerError`; saved through
  `updateCarOdometer` only when changed). Name = Marcă + Model, as always.
- **Forms in Simplu** (2026-10-13): no space-colour picker anywhere
  (`CarProfileForm`, `HomeProfileForm`, `EditSpaceModal` check `isSimple`;
  a saved colour is kept, a new space gets the kind default). Mașină asks
  only Marcă, Model, An, rezervor (no culoare / preț / "În rate"); Casă only
  Județ + Localitate (ownership stays "bought", no price / credit).
- **Calendar** (2026-10-13, mockup "Calendar A · Lună + ziua aleasă"):
  `SimpleCalendar` = month grid (6 rows, dots in the space's colour / lime
  event, one red dot on a past day still unresolved; `MonthSwipeView`,
  chevrons, "Azi") -> the selected day's rows (check circle =
  `resolveFromSummary`) -> "Restante". No weekly agenda any more. The
  selected-day header has "Eveniment": `components/simple/NewEventSheet.tsx`
  (title, Data + Ora, notă; a `custom_event`, dated on the selected day --
  purchase / repeat stay in Complet's sheet).
- **Screens**: `components/simple/SimpleHome.tsx`, `SimpleCalendar.tsx`,
  `QuickAddSheet.tsx`, `space/SimpleSpaceScreen.tsx` (+ per-kind files in
  `space/`). Tours never auto-start in simple mode (`lib/useAutoTour.ts`);
  no tour targets / TEMP tour buttons on Simplu screens.

## Per-Space file map

Each Space's dashboard owns a set of mutually-exclusive local-state
"sub-views" (form visible / list page visible / etc.) — not real
stacked `<Modal>`s, just early-return branches. `closeAllForms()` /
`closeAllSubViews()` clears them all before opening a new one.

**Car** (`components/spaces/car/`) — the reference-quality Space.
- `CarDashboard.tsx` — orchestrator: stats, RECENT/ALL, category tabs,
  `openEntryForEdit(type, id)` (the shared deep-link/edit entry point).
  `CarQuickActions.tsx` is its live quick-action row.
  First-use tour "space_car" (4 steps, one key for every car space, fires
  on the first open of ANY of them): targets live in CarDashboard (hooks at
  the top -- `renderPage()` is not a component): `car.top` = hero card +
  LinkedCreditsLine wrapper, `car.actions` = a View around
  CarQuickActions, `car.next` = the "Urmează" block (only registered when
  something is due; ctx `hasUpcoming` false -> the step shows its
  `carNext` illustration), `car.pages` = the Documente/Arhivă/Istoric pill
  row. ctx `hasCredit` = a credit linked to THIS space. useAutoTour ready =
  no entry form, no sub-page, no profile edit form (`tourBlocked` prop from
  [id].tsx = its `editModalVisible`). Settings replays it on the user's
  FIRST car space (`spaceKind` in TOUR_LIST; none -> "După primul spațiu").
  **Odometer** (2026-10-09): the km on the top card = `getCurrentOdometer`
  = max(`carData.vehicle.mileage`, `getLoggedOdometer` = highest
  `odometer` on fuel/maintenance/expense entries); `vehicle.mileage` =
  `car_profiles.odometer` (CarProfile `odometer`/`odometerUpdatedAt`, set in
  [id].tsx on load and by `onOdometerSaved`). Tap / long-press the km (or
  its pencil) -> `CarOdometerSheet.tsx` ("Actualizează kilometrajul", whole
  km, `odometerError`: > 0, <= 2.000.000, >= logged max) ->
  `api.updateCarOdometer`. Caption under the km (`getOdometerUpdatedAt`) =
  newer of the manual update and the latest entry with a reading. Help
  topic `car.odometer`.
- **Service km window** (2026-11-02, user decision: Acasă uses the space's thresholds): `lib/spaces/car/maintenanceTiers.ts` holds 2.000 / 1.000 / 500 km (`kmUrgencyTier`), used by the Mașină screen, Acasă's Mașină card ("Schimb ulei în 200 km", tier colour) and "De făcut". The backend mirrors 2.000 as `DashboardController::SERVICE_KM_WINDOW`: a service inside it comes back in `upcoming`, dated tomorrow, with `km_left`; past its km, as before, `overdue_km` dated yesterday. Every row reads it via `serviceKmStatus()` (lib/dashboard/spaceDue.ts) -> label + tier (`urgencyTierColor`). Km-only rows stay out of Acasă's Calendar card (no real day). A date within 7 days still wins over the km window.
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
- `lib/confirm.ts` + `lib/confirmHost.tsx` + `lib/dialogCoordinator.ts` —
  shared confirm/notify/choice dialogs. Requests queue instead of replacing
  pending promises. The root hosts page dialogs in a Modal; each visible
  `Sheet` registers an inline host inside its own native Modal (nested Sheets
  win by depth), avoiding iOS sibling-Modal presentation failures. Removing
  a form cancels its queued confirmations; notices can move back to the root.
  Android Back dismisses the dialog first. `isDialogOpen`/`subscribeDialog`
  still gate tours. Tests: `tests/dialog-layers.test.cjs`, including Internet
  resolve/early-payment confirmation with success/cancel/API failure.
- `lib/spaceCategoryFab.tsx` — dead (orphaned, not deleted -- see
  `app/(tabs)/_layout.tsx` above). Used to be the shared "+" FAB's
  category-fan registration (`useRegisterSpaceCategories`); the
  `SpaceCategory` type it also exports is still live, reused by
  `CarDashboard.tsx`/`CarQuickActions.tsx` for an unrelated purpose
  (describing that row's own action buttons) -- only the hook is dead.
- `lib/spaces/spaceProfile.ts` — `detectSpaceType()` (checks
  `space.type` first, then legacy fallbacks), `profileFromSpace`, and the
  space colours (see "Space colours" under Theme): `SPACE_PALETTE`,
  `KIND_DEFAULT_COLOR`, `spaceColors()`, plus the KIND-level
  `SPACE_IDENTITY_COLORS` / `spaceTextColor` / `SPACE_BUTTON_FILL` /
  `SPACE_ON_FILL` (Car blue / Home purple / Grocery amber / Expenses teal,
  derived from the palette's kind defaults).
- `lib/spaces/spaceTheme.tsx` — `SpaceThemeProvider` (mounted by
  `[id].tsx` around each space, and by CarProfileForm/HomeProfileForm
  with the colour being picked) + `useSpaceColors(kind)`.
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

- **Themes** (2026-11-01): `THEMES` in lib/theme.tsx (Grafit, Hârtie,
  Miez de noapte, Nisip); a new theme = one entry with its `ThemeColors`
  and `isDark`. Settings > Temă (`ThemeSheet` in app/settings.tsx) picks
  one; default `DEFAULT_THEME` = Hârtie. The app does NOT follow the
  phone's light/dark setting (no "Automat", removed on purpose). Stored
  per device under `orgos_theme`, read synchronously. Code must read `colors.*`/`isDark`
  from `useTheme()`, never `useColorScheme()` or hard-coded surface hexes.
- **Appearance is user-set -- never hard-code a visual value.** Settings >
  Aspect (`AppearanceSheet`) holds every look option. `layout`
  {roundness 0..1, density compact/normal/airy} scales the `radius` and
  `spacing` that `useTheme()` returns (`scaledRadius`/`scaledSpacing`), so
  a literal `borderRadius: 12` or `padding: 16` silently ignores the
  user's choice: use the tokens. Every literal that equalled a token was
  converted 2026-11-01 (110 in 43 live files); what's left on purpose:
  circles (borderRadius = half the size), off-scale values (10, 14, 18...
  as padding), TourHost (spotlights use measured pixels) and the tab
  bars' item spacing. A new option = a token in lib/theme.tsx + one
  control in AppearanceSheet, never a per-screen change.
- **Rest of Aspect** (2026-11-01), all in `layout`:
  * `background` plain/gradient/blobs + `backgroundStrength`, drawn by
    `components/ui/ScreenBackground.tsx` (SVG, tinted by the current
    space via `useSpaceTint()`; SpaceThemeProvider takes `kind` for that).
    It's the first child of every screen root and of `SwipeBackView`
    (= every sub-page). A new screen root adds `<ScreenBackground />`;
    nothing above it may paint `colors.surface` or it hides the colour.
    Blob opacity is capped so onSurfaceTertiary stays readable on it.
  * `palette` (Settings > Culori, `ColorsSheet`): BACKGROUND_PALETTES in
    lib/theme.tsx -- După Spațiu (default: the space's colour leads),
    Ocean, Apus, Pădure, Lavandă, Nisip; three colours per light/dark.
    It colours ONLY the background; UI accents stay per Space. Picking a
    palette while Fundal = Simplu switches Fundal to Pete. A new palette
    = one entry there.
  * `textSize` scales every Plex <Text>/<TextInput> through
    lib/globalFont.native.ts (TextScaleContext); icon fonts and nested
    spans without their own size are skipped. Web doesn't scale. Fixed
    heights around text clip at "Maxim" -- prefer minHeight.
    That patch was a silent NO-OP from Expo SDK 58 until 2026-11-01 (no
    Plex font, no scaling on phones): Text.js's `default` became a
    non-configurable getter. It now redefines react-native's index
    getters instead (app code reads `_reactNative.Text` live).
  * Water/wave touch effect: REMOVED on purpose (user, 2026-11-01) --
    first app-wide (made the app feel heavy), then also from the Liquid
    bar ("nu-l mai vreau deloc"). Don't bring it back. Dead, not deleted
    (deletion is denied here): `components/ui/WaterRipples.tsx`,
    `WaterSurface.tsx`, `WaterSurface.native.tsx`, `waterShader.ts`;
    `@shopify/react-native-skia` was installed only for them. What it was: a per-pixel Skia runtime shader
    (components/ui/waterShader.ts, drawn by WaterSurface.native.tsx;
    web renders nothing): impact crater that rebounds + damped radial
    ring wave with dispersion and a wobbled front, summed over up to 12
    drops, lit from the surface normal (lit side, shadow side, glint).
    Driven by a rAF clock only while a drop lives (no reanimated).
    Earlier SVG ring versions all read as "a radius growing / a radar"
    (user, 2026-11-01). Tune it offline: the scratchpad contact-sheet
    script compiles WATER_SKSL with node_modules/canvaskit-wasm and
    renders it over the real page colours. Observes touches only, never blocks: it sees them
    through onStartShouldSetResponderCapture/onMoveShouldSetResponderCapture
    (always returning false) -- bubbling onTouchStart alone never fired
    on the user's iPhone; both are kept, deduped.
  * `buttonShape`/`buttonStyle` restyle the shared `Button` (96 uses);
    ~25 hand-made button-like Pressables don't follow them yet.
- **Styles** (lib/appearancePresets.ts): built-in presets (Clasic,
  Sticlă, Compact, Confort, Minimal) set cardStyle + layout in one tap,
  never the theme; up to 5 user-saved ones per device
  (`orgos_appearance_presets`). A new Layout field needs no preset edits
  (`look()` fills defaults), but say so in a preset if it matters there.
- **Card style** (2026-11-01): `cardStyle` {bulge, opacity, liquid} from
  `useTheme()`, set by Settings > Aspect's sliders (`AppearanceSheet`),
  stored as `orgos_card_style`. `useTheme().card` = the ready style (fill
  + boxShadow, no border, so layout never shifts): a card container on
  the page writes `style={{ ...card, borderRadius: ... }}`, never
  `backgroundColor: colors.surfaceSecondary`. `Card`, page-level `Group`
  and 45 hand-built cards use it. A `Row` inside a page `Group` is
  transparent (the group paints) -- EXCEPT under `SwipeRow`, which wraps
  its row in `OpaqueRows` so the green/red panels underneath don't show
  through (bug seen on Acasă's "De făcut", 2026-11-01). Anything else
  that slides over a hidden layer needs `OpaqueRows` too. Still opaque on purpose: rows that
  paint their own fill because they swipe (HomeCategorySection, Budget,
  CarDashboard, Grocery item rows...), sheets, tab bars, pills, inputs.
- **Three surface layers**: `colors.surface` (page) -> `surfaceSecondary`
  (cards, list groups) -> `surfaceTertiary` (inputs, chips, icon wells,
  pressed rows). Cards are FILLED; no outlines as the only depth cue.
- **Color comes from the Space**: `{color}` for fills (bars, filled
  dots, IconWell, Field/Sheet tone), `{tint}` for text and stroke icons,
  `{ink}` for ink on a filled identity color, `{fill}` for a filled button
  with a text label. No single app-wide accent; outside a Space the
  primary button is `onSurface`.
- **Space colours** (2026-10-09): the user picks one per space from
  `SPACE_PALETTE` (spaceProfile.ts: 9 swatches -- blue, indigo, purple,
  fuchsia, pink, amber, teal, sky, slate; each with base / text dark+light
  / fill / ink, contrast table in the file; red, orange, yellow, green and
  lime are left out on purpose = error / warning / caution / success /
  Calendar events). `spaces.color` stores the KEY (server validates against
  `Space::PALETTE_KEYS`, keep both lists in sync); null = the kind's
  default (`KIND_DEFAULT_COLOR`; forms send null when the pick equals it);
  legacy hexes in old rows are ignored. Picker =
  `components/spaces/SpaceColorPicker.tsx` (in CarProfileForm,
  HomeProfileForm, EditSpaceModal -- create and edit). Resolution:
  * ONE particular space -> `spaceColors(space, isDark)` (any object with
    `color` + `type`/`kind`; the API's embedded `item.space` carries
    `color`), or inside a space screen `useSpaceColors(kind)` (reads the
    SpaceThemeProvider [id].tsx mounts -- no prop drilling, Modals keep
    context). Used by: every live file under components/spaces/*, the
    Spații grid cards, Acasă's "De făcut" rows + Mașină/Listă/Provizii/
    Cheltuieli cards + the catalog icons (LayoutSheets), Calendar's "De
    rezolvat" rows, RecurringBillRow, CreditReminderRow, TodoCarouselSheet's
    stripe, linked-space chips/pills (ExpensesCreditsSection, CreditSheet,
    BudgetCreditPage).
  * The KIND -> the kind-level constants above. Kept on purpose for: Buget
    (per-kind rows/bars/ring/overview, ResplitSheet, GuiltFreePage,
    BudgetSpaceDetailPage, the credit IconWell), Acasă's spend-by-kind
    bar/ring + its "not yet paid" legend and the Buget card, the
    EmptySpendCard legend, the Spații "create" template tiles, the tour
    illustrations (TourHost), the login marks (AuthShell).
  New code about one space never indexes `SPACE_IDENTITY_COLORS[kind]`.
- **Semantic**: `success`/`error` = finance green/red, `warning` = "Azi",
  `caution` = a step earlier. Light-theme values are the deeper shades
  that pass 4.5:1 -- don't lighten them.
- **Type**: IBM Plex Sans only (lib/globalFont.*.ts maps fontWeight to
  the right file automatically). Weights 400/500/600 only -- anything
  heavier renders as 600. Use `typography` tokens (hero/display/
  largeTitle/title/subtitle/body/label/caption/chip/micro).
- **Romanian first, sentence case** -- no ALL-CAPS labels. Plurals through
  `roCount()` (lib/format.ts: "5 zile", "20 de zile"); money `lei()`, dates
  `roDate()` ("1 octombrie").
- **Languages (2026-10-15, infrastructure only)**: `lib/i18n/index.ts`
  (i18next + react-i18next + expo-localization + `intl-pluralrules`
  polyfill), strings in `lib/i18n/locales/ro.json` (source + fallback) and
  `en.json`, same key tree. `useLanguage()` -> `{ t, language, setLanguage }`;
  `currentLanguage()` for non-React code. Plurals = CLDR suffixes (ro
  `_one/_few/_other` = "1 zi / 2 zile / 20 de zile", en `_one/_other`):
  `t("common.days", { count })`. Choice per device (Settings > Limbă ->
  `LanguageSheet`, SecureStore/localStorage `orgos_language`, read
  synchronously, imported first in app/_layout.tsx). lib/api.ts sends it as
  `Accept-Language`; the backend's SetLocale answers in it. NOT done yet:
  only the Limbă row/sheet read `t()` -- every other screen still has its
  Romanian text inline (move area by area: Simplu, Complet, help.ts,
  tours.ts, emails); `FOLLOW_DEVICE_LANGUAGE = false` until en.json covers
  the app; lib/format.ts dates/numbers are still ro-RO for every language.
  New text in a screen already moved to `t()` must go through the locale
  files.
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
  PageTitle (dead since TabHeader, 2026-11-01), SectionHeader, Card, Group + Row with inset separators,
  IconWell, Chip, Pill, Segmented, Button, Field, FieldButton,
  EmptyState, ToggleRow, Disclosure for "Mai multe detalii"),
  `components/ui/Sheet.tsx` (the one bottom sheet: spring in, drag handle
  to dismiss; Group/Row/Segmented inside it step up a layer via
  `SurfaceLevelContext`), `components/ui/DatePickerSheet.tsx` (the one
  date picker, Monday-first, range past/future/any; month grid swipes) +
  `DateField.tsx` (picked "ZZ.LL.AAAA" for Car forms),
  `components/ui/Hold.tsx` + `HoldMenuHost.tsx` + `lib/holdMenu.ts` /
  `holdGeometry.ts` (THE hold gesture, reuse it anywhere: `useHoldGroup`
  + `<HoldGroup>` around a screen's items, `<HoldItem id actions>` per
  item. Hold ~0.4 s lifts it; release = a menu of its `actions` under it
  over the dimmed app (drawn once at the root, NOT a Modal -- actions open
  Sheets right away, see the iOS two-Modal bug); drag = it moves, any
  layout (list, grid, paired cards: positions are measured), new order to
  `onReorder` on drop. ONE PanGestureHandler on the group, never per item
  (items move in the hierarchy mid-drag). An item with no actions that
  can't move ignores holds. Acasă + Spații use it; rows inside Spaces
  still have their own long-press quick actions, see BACKLOG),
  `components/ui/ReorderList.tsx` (drag-to-reorder list: `ReorderList` +
  `ReorderHandle`, classic PanGestureHandler + RN Animated, slots from row
  heights, fresh offsets on each commit; Acasă + Spații edit modes -- Casă
  Sarcini still uses NestableDraggableFlatList, see BACKLOG),
  `components/ui/MonthSwipe.tsx` (`useMonthPager` + `MonthSwipeView`:
  horizontal swipe = next/prev month on EVERY month grid -- classic RNGH +
  RN Animated, no reanimated worklets), `components/ui/PeriodPicker.tsx`
  + `lib/period.ts` (the ONE history-period selector -- Mașină Istoric's
  calendar pill + "Perioadă" sheet; used by Car Istoric/Cheltuieli, Casă
  Cheltuieli, Cheltuieli Toate -- user decision 2026-10-10), `PressableScale`,
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
  `SectionHeader`, `Identity`, `TabHeader` or `Sheet`, or a standalone
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
  "Arată ghidul ..." in HelpHost; Settings > "Revezi ghidurile" (goes to
  the tour's `href` in TOUR_LIST, then requestTour). Tours that exist:
  Acasă (targets `home.header`, `home.edit`, `home.card.spend`,
  `tab.<route>` in MainTabBar), Calendar, Buget and Mașină (see their
  entries above); the other 4 keys are listed "În curând". A Space tour
  has `spaceKind` instead of `href` in TOUR_LIST: Settings lists the
  spaces and opens `/<first space of that kind>`. New tour = a TourDef in TOURS +
  `href` in TOUR_LIST + targets + useAutoTour on that screen (+ `tour:` on
  its page help topic). TourCtx fields are all optional: each screen
  fills what its own steps read. A `placement: "top"` step that has to
  scroll puts its target at the BOTTOM of the screen (card above it);
  "bottom" puts it at the top. TEMP: `SHOW_TOUR_TEST_BUTTON` (exported
  from lib/tours.ts) = the "Pornește ghidul" pills on Acasă, Calendar,
  Buget and Mașină (TopBar, left of the pencil) (see BACKLOG).
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
