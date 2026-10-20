# Backlog

Small, non-urgent tasks to pick up later. Not ordered by priority unless
noted — just a running list so ideas don't get lost mid-session. Add new
ones under "Open", move finished ones to "Done" with the date.

## Future features (user-requested, parked)

### Per-record "resolved on" history list (parked 2026-10-10)

**Status: parked by the user, needs discussion per record type.** Idea: every record that isn't a stored document (Car fuel/service/expenses, Casă tasks/maintenance/recurring/supplies, Cumpărături, Cheltuieli, credits...) gets a button somewhere on the record that shows the list of dates it was resolved/done. What "resolved" means, and where the button goes, differs per type (a one-off task has one date; recurring bills/maintenance have many; fuel is already one row per fill-up) -- decide type by type before building. Casă already keeps a per-resolve `spendHistory` for tasks (see "Home's per-resolve spend history" below), which is the natural data source there. `[from: user, backlog review 2026-10-10]`

### Car service form: replace the "Altceva" field with an "add another service" pop-up (parked 2026-10-10)

**Status: parked by the user, needs a careful design pass.** `CarMaintenanceForm.tsx`'s "Altceva" free-text field (next to its Add button) isn't intuitive. User wants, at the END of the classic service form, a new button that opens a small pop-up OVER the existing form to add the extra item. Related: the form's optional fields still aren't behind `Disclosure` ("Still open from this pass"). `[from: user, backlog review 2026-10-10]`

### User decisions from the 2026-10-10 backlog review

Kept as they are for now (no change wanted yet): Provizii card on Acasă showing "Ok · nimic pe terminate" for a home without supplies (a whole-app update is coming); "Pornește ghidul" TEMP test buttons + ONE_AUTO_TOUR_PER_SESSION=false (still testing); confirm dialogs instead of Undo toasts (dialog is fine); Acasă car card skipping a manual-only-odometer car (fine as a small preview). Parked, discuss later: Mașină "Urmează" row anatomy vs Casă; Casă supplies without price; Buget monthly archive discoverability; tap = preview / long press = actions in the remaining spaces; tours for Casă/Cumpărături/Cheltuieli (need polishing); telling apart 2 spaces of the same kind (undecided); new ideas (Cumpărături monthly estimate, per-product restock rhythm, real app icon). `[from: user, backlog review 2026-10-10]`

### DONE, awaiting qa-lead (built 2026-10-08, uncommitted on feat/redesign): credit toggle when creating a Car / Home space

Built: `SpaceCreditToggle.tsx` ("În rate" ToggleRow + shared `expenses/CreditFields.tsx`, which CreditSheet now uses too) on the CREATE forms of `CarProfileForm` / `HomeProfileForm` (Casă: only when "Cumpărată"). `POST /spaces` takes an optional `credit` {title, amount, day_of_month, end_date}; one DB transaction creates the space, reuses the first typed Cheltuieli space or creates "Default", and the linked `expense_credit` through `App\Support\ItemBudgetRules` (extracted from ItemController, same rules). Tests: `tests/Feature/SpaceCreditTest.php`. Not built (out of scope): adding a credit from the Edit form of an existing car/home -- a "Adaugă un credit" shortcut there that opens CreditSheet pre-linked would be the natural follow-up.


User request: when creating a Mașină or Casă space, a toggle "În rate" (on credit). If on, the creation form expands with the credit fields (same as CreditSheet: name, monthly rate, payment day, last instalment date) and on save a normal `expense_credit` is created in the Cheltuieli space, linked (`metadata.linked_space_id`) to the new car/home. If the user has NO Cheltuieli (expenses) space, one is created automatically named **"Default"** (type expenses) holding the credit. Same for Casă. Consistent with the earlier decision: credits live in Cheltuieli, the space only shows the read-only LinkedCreditsLine. `[from: user request 2026-10-08]`

### Telling apart several spaces of the same kind (2 homes / 2 cars) (parked 2026-10-08)

**Status: parked, undecided** -- user wants a distinguishing "label" that appears ONLY when 2+ spaces of the same kind exist (a single home keeps today's look), but hasn't decided what it is, how it looks, or what it's derived from (name? a short tag/variant the user picks? auto "Casa 1/2"?). User asked for design-lead to propose.

**Today:** all spaces of a kind share one identity colour + icon; rows from Calendar / Acasă / recurring bills carry `space {id,name}` from the API, but it's not verified the name is shown everywhere. **Buget groups by KIND label** (`Item::SPENDING_TYPE_SPACE` → "Car"/"Home"; `budget_categories.category`), so two homes share ONE budget and one share of Necesități -- the budget-from-income suggestion/limits are per kind, not per space.

**For design-lead:** audit every place a record from a space surfaces (Acasă widgets + De făcut, Calendar, Buget rows/detail/overview, recurring bills, credits chip, LinkedCreditsLine, Cheltuieli, archive) and propose the label (what it is, where it's defined -- likely space create/edit -- and how it renders). Also propose budget granularity with 2+ same-kind spaces: separate limit per space vs one per kind with per-space breakdown (per-space would need `budget_categories` keyed by space_id + BudgetController grouping change).

**Done already (2026-10-08):** CreditSheet lets you pick the exact car/home by name (pills), and credit chips show the space's own name. `[from: user question 2026-10-08, budget-from-income testing]`

### Import card payments from bank notifications + "De confirmat" inbox (parked 2026-10-08)

**Status: parked by the user** -- first finish and verify Budget-from-income (lots of data to check for correctness). Notification route chosen; open-banking/PSD2 API route explicitly rejected for now (too complex to start).

**Goal:** stop typing card payments by hand -- catch the bank app's payment notification ("Ai plătit 45,90 lei la Lidl"), extract amount/merchant/date, and bring it into orgOS for one-tap confirmation.

**Capture, per platform:**
- **Android (main route):** a `NotificationListenerService` reads other apps' notifications after the user grants "Acces la notificări" once. Needs native code → does NOT run in Expo Go; requires a custom dev build / APK (EAS or local `expo prebuild`). That's the "deliberate future upgrade" CLAUDE.md mentions -- decide it consciously. Candidate lib: a RN notification-listener module (verify maintenance + Expo config-plugin support before picking). Filter by bank package names; one small parser per bank (BT, ING, Revolut, ... -- whichever the user uses), since every bank words its notification differently. Keep raw text for debugging parsers.
- **iPhone:** reading other apps' notifications is impossible on iOS. Fallback: Shortcuts "Transaction" (Wallet/Apple Pay) automation → "Get contents of URL" POST to the backend with the user's token. Works with Expo Go as-is, but only catches Apple Pay payments (not physical card/online).

**Never auto-create spending -- always a confirmation step ("De confirmat"):**
- Captured payments land in a pending inbox (new item type or table, e.g. `pending_transaction`: amount, currency, merchant, occurred_at, source bank, raw text, status pending/confirmed/dismissed). Pending ones count NOWHERE (not Buget, not Dashboard) until confirmed.
- Per row: pick the space (Mașină/Casă/Cumpărături/Cheltuieli), optional "Bani fără vină", confirm → becomes the normal spending item of that space; or dismiss.
- **Merchant memory:** after "Lidl → Cumpărături" once, pre-select it next time (later: one-tap / batch confirm).
- **Correctness guards (why confirmation is mandatory):** duplicates (a grocery trip already entered by hand + the same payment from the notification -- suggest "pare deja introdusă" by amount ± date match), refunds/reversals, transfers between own accounts, pre-authorizations (fuel pumps, hotels) that settle at a different amount, foreign currency, credit rates (expense_credit already counts in the 10% jar -- don't double count).
- Entry point: a badge on Acasă / Buget ("3 plăți de confirmat").

**Before starting:** ask which phone (Android/iPhone) and which bank(s); design-lead mockup for the inbox; decide the dev-build switch if Android. `[from: user request 2026-10-08, budget-from-income session]`

## Prioritized queue -- redesign + seeded-account verification (2026-10-04)

**Status: all 23 tasks worked through on `feat/redesign` (P1 -> P2 -> P3),
NOT committed yet, NOT verified by qa-lead.** P2 decisions were applied
as design-lead proposed (user delegated them). Next: qa-lead, then
release-lead.

Done: P1-1 `done`/`completed` (backend `Item::CLOSED_STATUSES`, Casă now
writes `completed`, reads both) · P1-2 Dashboard day buckets in the user's
timezone · P1-3 "De făcut" ✓ only for plain one-off tasks/reminders, the
rest open their Space's own resolve step, "Anulează" after ticking ·
P1-4 car document expiry at 23:59 local · P1-5 `lei()`/`roNumber()`
coerce string decimals · P1-6 one `daysFromToday()` for headers, chips,
tiles · P2-1 "Cheltuit" = recorded; recurring shown as "+ X lei plăți
recurente de plătit" (Acasă, Buget, overview, space detail; budget
comparison still on the total) · P2-2 unpaid recurring bill stays
restant everywhere (`RecurrenceProjector::currentDue`) · P2-3 tiles show
"8 restante"/"1 azi", Casă card "Scadențe", hero "Restante" (tappable),
server counts one-off maintenance with a next date like Casă does ·
P2-4 shared `RecurringBillRow`, only items with an amount, Calendar
lists the visible month + unpaid ones with a total · P2-5 car services
due by km/date in "De făcut" and the BMW tile, deep-link opens the
renewal form · P2-6 Grocery tile "21 de cumpărat" (`toBuy`) · P2-7
"Sarcini" · P2-8 Casă tiles Sarcini-first + "Adaugă" chooser, "Fără cost"
on maintenance resolve, Rețete grid shown immediately · P3-1..P3-8 as
listed · P3-9 `Disclosure` primitive (5 forms), unified period pills,
resolve-sheet copy, interval field with unit suffix.

Found and fixed during the pass: (N1) Casă category rows started with
", în 1 zi" when the description was empty (`joinParts`); (N4) both date
pickers started weeks on Sunday -- one shared Monday-first
`DatePickerSheet` now; (N5) Casă's picker only paged forward, so a past
expense couldn't be dated; (N6) recurrence projection stepped in UTC and
drifted a day across the 25 Oct DST change; plus the known
`occurrencesBetween` shared-iteration-cap truncation.

### Still open from this pass

- Undo toasts instead of confirm dialogs app-wide (P3-9e): only "De făcut"
  has inline undo. Needs a global toast host and real restore-after-delete
  -- worth a device test first.
- ~~Car: `CarHistoryPage` still uses the period-sheet trigger (only the Car
  Cheltuieli page got the inline pills); Car presets have no "Luna asta"
  (`CarExpensePeriod` has no calendar-month kind).~~ Reversed 2026-10-10 by user decision: Car Istoric's sheet trigger is now the shared `PeriodPicker` used by every history page.
- `CarMaintenanceForm`'s optional fields aren't behind `Disclosure` yet
  (multi-service form, needs its own pass).
- Device checks: `DatePickerSheet` opened from inside a form Sheet is a
  nested Modal (fine on web/Android, verify on iOS); Casă "Adaugă" chooser
  -> form transition.
- Swipe left/right was added everywhere it makes sense (Acasă, "De făcut",
  Calendar, Buget, Casă Scadențe, Cheltuieli, Cumpărături -- right = în coș,
  Mașină logs + "Urmează" services) but **can't be exercised on web**: a
  mouse drag in the browser pane registers as a tap. Needs a phone pass:
  each list's swipe-right/left, the early-payment question, and that a
  swipe doesn't also fire the row's tap. Deliberately not swipeable:
  documents (both spaces), Car "Cheltuieli" and Buget per-space records
  (reports over other spaces' logs), Casă spend/archive pages. Documents
  were added later (swipe right = renewal pop-up, left = delete).
- Customizable Acasă (2026-10-04): built per the "orgOS Acasă personalizabil"
  canvas. Phone checks: long press on an empty spot opens edit mode (and a
  long press on a card does NOT), dragging cards by the ☰ handle
  (now `components/ui/ReorderList.tsx`, shared with Spații, 2026-10-12 --
  rapid repeated drags must not overlap / leave gaps). Ideas left for later: a
  "Nu expiră" option for documents, per-card refresh of Buget numbers.
- Seed data titles are misleading ("[SEED] Completed today" is pending,
  "[SEED] Due today" is 4+ days old) -- data, not app.

## Found along the way (not yet fixed)

### Deduplicate error notices from contextual record mutations

Some `[id].tsx` persistence handlers (fuel/expense/supply) notify and then
rethrow; `useRecordMutation` also notifies after catching that rejection.
The dialog queue preserves both, so an API failure can show two notices.
Choose one reporting layer while retaining rollback and the editable form.
`[from: Internet confirmation-spinner fix, independent QA 2026-10-20]`

### Contextual action return follow-up (2026-10-20)

- Verify the native Sheet handoff on both Android and iPhone: De făcut open and scrolled → document/service action → save/cancel/back → same source Sheet and offset, without a blocked modal. Also test Android Back during a pending save: completion must refresh the source without navigating again. Unit/callback tests and compilation cannot prove UIKit presentation timing. `[from: contextual action return QA]`
- Existing source fetches may finish out of order when focus and `lifeos.refresh` overlap. Follow up with controlled response ordering and per-screen request generations if reproduced; no general data-fetch refactor in this navigation fix. `[from: contextual action return QA]`
- `components/simple/EditRecordSheet.tsx` still deletes grocery products individually before deleting their list, although the backend now cascades atomically. Align this remaining editor path with the single list-delete request in its own fix. `[from: contextual action return inspection]`

### Audit fixes follow-up (2026-10-19)

Core functional/security corrections are on `codex/audit-fixes`, not merged to main. Per-fix targeted tests, backend regression and smoke passed. Remaining: native phone/emulator QA; legacy React Hooks lint findings (174 errors / 28 warnings after this pass); Budget query consolidation (62–72 queries in the synthetic audit dataset). `[from: mobile audit remediation]`

Independent QA found and prompted fixes for pending social exchange codes and stale credential snapshots surviving mailbox proof, plus a delayed native SecureStore deletion overwriting a newer login. Targeted regression tests now cover these paths. Physical Android/iPhone testing and separate-connection MySQL concurrency testing remain; SQLite cannot verify row-lock contention. Release scope must account for the 23 pre-existing redesign commits between `main` and this branch. `[from: independent audit-fix QA, 2026-10-19]`

Grocery concurrency follow-up: child create/move authorizes its parent before saving without locking that list; list deletion bulk-deletes children inside its transaction. Concurrent requests could therefore leave a product referencing a deleted list (`metadata.listId` has no FK). The pre-existing race is inferred from lock order, not reproduced on MySQL; verify with separate connections and serialize parent checks/writes with deletion. Current tests prove serial authorization and rollback. `[from: independent audit-fix QA, 2026-10-19]`



### Bugs spotted while building Simplu mode (2026-10-12) [from: orgOS Simplu mode build]

1. **Car service resolved from Acasă/Calendar/De făcut loses or miscalculates the next service date.** `lib/dashboard/itemActions.ts:212` `logCarServiceAgain` computes the day interval as `nextServiceDate - item.due_at`, but `DashboardController::carServiceDue` (~:321/336) has already replaced `due_at` with the next-service date (or yesterday when overdue by km), so the interval is 0 or wrong. Simplu's Mașină hero avoids it by using the raw item from `api.getItem`.
2. `components/spaces/car/CarDocsPage.tsx:68` filters only `!archived`, not `isDocumentSuperseded`: a renewed, not-yet-expired document is listed next to its replacement until auto-archive runs.
3. `lib/spaces/car/calculations/dashboard.calculations.ts:192` `getDocumentStatus` counts days with ms `Math.ceil` instead of `daysFromToday`, so it can be off by one near midnight (breaks lib/format.ts's one day-difference rule).
4. `components/spaces/car/forms/CarExpenseForm.tsx:103`: with no category and no title it sends `title: ""` → 422 from `ItemController`.
5. `components/spaces/home/homeCategoryConfig.ts:193` `today()` uses `toISOString().slice(0,10)` (UTC): between 00:00 and 03:00 RO time, home expenses/documents/bills get yesterday's date. Simplu quick-add inherits it via `buildEntry`.
6. `components/ui/primitives.tsx:371`: an unselected `Pill` uses `surfaceSecondary`, the same as the Sheet background, so the type/category pills in car forms have no visible fill inside a sheet.
7. Import cycle: `components/simple/QuickAddSheet.tsx` imports `REFRESH_EVENT` from `app/(tabs)/_layout.tsx`, which imports it back. It works, but move `REFRESH_EVENT` into a small lib file.
8. Car profile has no plate/registration field (`CarVehicle.registration_number` is typed but never filled), and car document types are stored raw ("Rovinieta", "Tax") with no Romanian display map in the full app.
9. Simplu vs full Acasă spend totals differ when an income plan exists: Simplu shows raw `monthlyExpenses.total`, full Acasă shows necessities only (`needsSpend`, home.tsx ~146-155). Decide which one Simplu should show.

### Complet never moves a paid bill into "Cheltuit" (2026-10-15) [from: Simplu month-total card]

User expectation (2026-10-15): a recurring bill is "de plătit" until it's marked paid, then it's spent. Simplu's Acasă now does exactly that (`monthlyExpenses.billsPaid` added to the total, `billsDue` shown as "+ X lei facturi de plătit"). Complet doesn't: Acasă's "Cheltuit" never includes a paid bill and its "+ X plăți recurente de plătit" = the monthly equivalent of EVERY active bill, paid or not; Buget folds that same flat figure into each month's `spent` (`recurringMonthlyForLabel`) and the archive. So after upgrading, the Simplu total and the Complet one differ by the bills. Fix = switch Complet to billsPaid/billsDue too (Acasă card + Buget + archive/savings formula) -- a deliberate Buget-wide change, needs its own pass.

### Error dialogs opened on top of an open Sheet -- likely app freeze on iOS (2026-10-15) [from: car document 422 investigation]

The user's RCA saves from Simplu "Adaugă" all got a 422 ("Data emiterii este obligatorie." -- fixed: the server now accepts a document without an issue date, `tests/Feature/DocumentDatesTest.php`), and the app froze instead of showing it. QuickAddSheet called `notifyAction` (ConfirmHost = a second, root-level Modal) while its own Sheet Modal was open; the user tapped Salvează 6 times (6 POSTs in backend.log). QuickAddSheet now shows the error inline. NOT yet confirmed on a device that stacked Modals were the freeze. `EditRecordSheet.tsx` fixed 2026-10-15 (the user couldn't delete records: its "Șterge" confirm was such a dialog; now the footer itself asks "Ștergi definitiv ...?", save errors inline). Still in `NewEventSheet.tsx` (1 call): show it inline too, or make ConfirmHost render inside the top Sheet. Also: `backend/tests/Feature/TmpCarDocReplayTest.php` is a skipped placeholder to delete (agent can't delete files).

### Complet's Mașină "Documente" page colors expiry coarser than its own dashboard (2026-10-15) [from: Simplu Mașină document colors]

`components/spaces/car/CarDocsPage.tsx` `statusColor` = expired red / ANY expiring_soon (0-45 days) orange / valid green, while CarDashboard's "Urmează" and now Simplu's Mașină use the 3 bands (45-31 yellow, 30-16 orange, ≤15 red) via `urgencyTierColor` (lib/statusColors.ts). Same RCA can read orange on Documente and red on the dashboard. Fix: use `getDocumentUrgencyTier` + `urgencyTierColor` there too.

### A new car record can still log fewer km than the car has -- Complet + server (2026-10-15) [from: Simplu odometer floor]

Simplu's "Adaugă" now refuses a new fuel / service / car expense whose km is below the car's current one (`odometerBelowCurrent` in `components/simple/quickAdd/kinds.ts`, floor = GET /spaces `odometer`). Complet's forms don't: `CarMaintenanceForm` and `CarExpenseForm` have no check, `CarFuelForm` only compares to the latest FUEL entry. The server accepts anything (only `PUT car-profile/odometer` checks `loggedOdometer`). Found live: item 2085 (Oil Change, 100 km on a 250 km car, user 104). Decide the backdating rule first (an old receipt entered late can rightly be lower -- maybe "not below the highest reading dated on/before this record's date") and enforce it on `ItemController` store/update so both modes agree.

### Simplu's "one space per kind" is client-side only (2026-10-15) [from: Simplu space limit]

User decision: in Simplu you can create only one space of each kind. Enforced in `lib/simpleLimits.ts` (SimpleHome's create entry + spaces.tsx when `isSimple`). The mode is a local test switch, so the server can't enforce it yet. When a server plan/entitlement drives the mode (lib/appMode.tsx `entitlement`), `SpaceController::store` must reject a second space of a kind for free-plan users (Romanian 422), or an old client / direct API call can bypass it. Existing duplicates (made in Complet before downgrading) stay visible -- decide then whether a downgrade should hide/lock extras.

### Purchase tasks resolved outside Casă record no price (2026-10-15) [from: Simplu month-total card]

`lib/dashboard/itemActions.ts` `resolveWithSaved` for a `home_task` with `isPurchase` and no saved amount just completes it -- no `spendHistory`, so nothing counts. Hit from Acasă "Urmează" / "De făcut" circles and the Calendar day rows (both modes). Simplu's Casă hero now opens `HomeTaskResolveSheet` for the price; the summary screens should do the same (or `savedSummary` should offer "Introdu prețul").

### Casă Sarcini "Ordonează" still uses react-native-draggable-flatlist -- same rapid-drag overlap/gap risk as Acasă had (2026-10-12) [from: Acasă "Aranjează" rapid-reorder overlap fix]

`components/spaces/home/HomeTasksPage.tsx` (~:160) reorders with `NestableDraggableFlatList`. Acasă and Spații moved to the project-owned `components/ui/ReorderList.tsx` because of three defects in draggable-flatlist 4.0.3's own source: (1) `CellRendererComponent` holds each cell's last translate (`heldTanslate`) until that cell's NEXT onLayout -- a cell whose layout doesn't change (drop back in place, or a neighbor still mid-spring) keeps a stale offset; (2) cell offsets come only from async onLayout/measureLayout, so a drag started right after a drop reads the previous order's positions; (3) `DraggableFlatList` resets its drag state via `InteractionManager.runAfterInteractions(reset)` when data changes, which can land in the middle of the next drag. Rows there are fixed-height, so it shows less, but quick repeated drags can still misplace rows. Fix: port it to ReorderList -- it's inside an outer page scroll (Nestable), so ReorderList needs an "embedded, no own ScrollView" mode (auto-scroll via the parent's ref) first. After that, `react-native-draggable-flatlist` has no importer left and can be uninstalled.

### Calendar month cards: the current month's "resolved" ring is hidden -- /calendar has no resolved items (2026-10-12) [from: Calendar 3-month bubble cards + capacity model]

The approved "Bule cu inel" card shows, on the current month, an outer ring = resolved effort / total effort. `CalendarController::index` only returns OPEN items (`whereNotIn('status', CLOSED_STATUSES)`), and a paid recurring bill's `due_at` moves past the paid date, so `RecurrenceProjector::occurrencesBetween` stops projecting the paid occurrence. Result: the frontend can't know what was resolved this month, and the current month's fill also UNDER-counts (resolved items are missing from "the whole month"). `calendar.tsx` passes `resolvedShare: null` (ring hidden; the ring itself is built and wired in `MonthBubbleCard`). Fix: have `/calendar` return, per month, the items closed in it (`completed_at` in the month, by type) and the paid recurring occurrences (a `resolved: true` flag, or a separate `resolved` list with type + day), then compute `resolvedShare` in `monthLoads`.

### ~~Budget/Acasă date a resolved Casă purchase task by its DUE date, Casă by when it was paid (2026-10-10)~~ FIXED 2026-10-15 (uncommitted on feat/redesign, awaiting qa-lead)

Fixed server-side: `app/Services/HomeSpend.php` sums `home_task` (purchases only) and `home_maintenance` per `spendHistory` event (fallback: completed_at / due_at snapshot), used by Dashboard's `monthlyExpenses` and every Budget sum/list. Test: `tests/Feature/HomeSpendTest.php`. Original note:

`Item::SPENDING_TYPES`' comment says a `home_task`'s `due_at` "is repointed to the resolution date" when it's resolved as a purchase, but `HomeDashboard.tsx` `resolveTask` (~398) never does that. A one-off task keeps its original `dueDate`, and a recurring one ADVANCES it to the next occurrence. Casă's own spend (`getThisMonthHomeExpenses`) is keyed off `completedAt`/`spendHistory`, while Budget/Dashboard sum `amount` by `due_at`. The result:
- A purchase task due last month but paid today counts in last month's budget.
- A purchase task with NO due date never counts in Budget at all (`due_at` null).
- A recurring purchase task's latest price lands in the NEXT occurrence's month.

Fix on either side: set `dueDate` to the resolution date for a priced one-off, or have the backend sum `home_task` by `completed_at`/`spendHistory`. The demo seed sidesteps this by giving its resolved purchase tasks `due_at` = the resolution date. `[from: backend-lead DemoSeeder 2026-10-10]`

### Month pager / period picker leftovers (2026-10-10)

(1) Two chevron taps during the ~140ms month slide can apply twice (Calendar re-applies the same month; DatePickerSheet can skip a month) -- `MonthSwipe.tsx` `slide` needs an in-flight guard. (2) `CarPeriodSheet.tsx` now only holds `CAR_PERIOD_PRESETS` -- rename/fold into `carPeriods.ts`. (3) ExpensesDetailPage total card and HomeSpendPage still use their own label functions ("Luna aceasta" vs PeriodPicker's "Luna asta"). (4) Android only, unchecked: RNGH gestures inside a `<Modal>` (Sheet) may need a GestureHandlerRootView inside the Modal (same exposure as the existing Sheet handle). (5) Casă Mentenanță "Data" and Facturi "Următoarea plată" can no longer be cleared at all ("Fără dată" removed -- they live in `due_at`, which reads back as created_at when null, and a bill needs a next date); undated bills/maintenance would need a data-model change. `[from: frontend-lead calendars/period pass 2026-10-10]`

### Casă: saving a form whose record vanished silently creates a duplicate (2026-10-10)

`HomeDashboard.tsx` (~856 and ~970) `onSubmit` looks up `existing` by `editingId`; if the record is gone (deleted/archived elsewhere, or a refresh while the form is open), `buildEntry(values, undefined)` quietly creates a NEW record. Should refuse/notify instead. Root of the old "row resolve checkbox vs open form" worry (that exact path is no longer reachable -- the form is a modal Sheet covering the list; a guard was added in `HomeCategoryPage.tsx` anyway). `[from: frontend-lead backlog sweep 2026-10-10]`

### BudgetSplitBar ignores a 0 limit (2026-10-10)

`BudgetSplitBar.tsx:93` (`overByUpcoming`) and `:42` (`budgetAt`) require `limit > 0`, so with a 0 limit plus unpaid bills there's no "bills push you over" note and no budget line. Minor; same whether 0 came from Reîmparte or the space page. `[from: frontend-lead 0-limit fix 2026-10-10]`

Things noticed while working on something else — not the task at hand,
not worth derailing it for, but real enough to not just forget. Add an
entry the moment something like this turns up (even mid-task); pick
one up like any other "Open" item once nothing more pressing is ahead
of it. Mark it `[from: <task>]` so there's a trail back to how it was
found.

### Old `spaces.color` hexes are left in the DB (2026-10-09)

Before the space colour picker, the create forms wrote fixed hexes into `spaces.color` (`#111111` car, `#374151` home, `#4B5563` grocery, `#14B8A6` for the server-made "Default" Cheltuieli, `#22c55e` on an old "Work" space). The frontend now ignores anything that isn't a `SPACE_PALETTE` key, so these spaces show their kind's default colour, which is correct. The values are still in the column, though, and any client that sends `space.color` back unchanged would hit the new 422. None does today: EditSpaceModal and the Car/Home forms send the picker's key or null. A one-line data migration (`UPDATE spaces SET color = NULL WHERE color NOT IN (<PALETTE_KEYS>)`) would clean this up. Left out of the feature on purpose, because it rewrites user data. `[from: space colour picker, 2026-10-09]`

### Acasă's car card skips a car that has only a manual odometer (2026-10-09)

`DashboardController::carSummaries` builds one row per car from that car's `car_fuel`/`car_maintenance`/`car_expense`/`car_document` items only, so a car with no logged entries never gets a row, even after the user sets its km on the Mașină top card (`car_profiles.odometer`). A car WITH entries already uses max(logged, manual). The fix is to also seed rows from the user's `car_profiles` with a non-null odometer. Small, but it changes what the Acasă car card shows for brand-new cars, so check the card's visibility rule (`lib/dashboard/widgetVisibility.ts`) at the same time. Also: the dashboard/calendar "current odometer" queries filter by `user_id` (Dashboard) and `visibleTo` (Calendar), but the new `CarProfile::loggedOdometer` (the "can't go lower" minimum) reads every member's entries in the space. In a shared car those can differ: the minimum can come from a co-member's entry that the owner's Acasă doesn't count. `[from: car odometer update, 2026-10-09]`

### `composer audit` reports 2 advisories in already-installed packages (2026-10-08)

`laravel/framework` 13.x below 13.30 is affected by CVE-2026-102279, an XSS in the debug page information. `league/flysystem` up to 3.35.2 is affected by CVE-2026-102601, control characters in `WhitespacePathNormalizer`. Neither package was touched by the social login work; `composer require` flagged both. The debug-page XSS only matters with `APP_DEBUG=true` exposed publicly, but the dev backend IS exposed publicly through the tunnel with `APP_DEBUG=true`. The fix is a deliberate `composer update laravel/framework league/flysystem` plus a full test run. `[from: social login backend, 2026-10-08]`

### FIXED 2026-10-08 (uncommitted, awaiting qa-lead): Social-only accounts can't change password or email from Settings (2026-10-08)

**Fix (QA #6):** `/user.has_password`; when false Settings shows "Setează o parolă" (new + confirm, `POST /profile/password/set`, then `updateUser({has_password:true})`), and the Email row first asks for a password (confirmAction -> same sheet). Open: what email change means for an Apple relay address.

Original report:


A user created through Apple/Google/Facebook has no usable password, but Settings > Parolă (`PUT /profile/password`) and Settings > Email (`PUT /profile/email`) both require `current_password`, so those two sheets are dead ends for them. Workaround today: "Ai uitat parola?" on Login sets a first password (spec-approved path). Proper fix needs a backend flag (e.g. `user.has_password`) so Settings can show "Setează o parolă" without the current-password field, and decide what email change means for an Apple relay address. Also: Settings > Parolă/Email copy doesn't mention any of this. `[from: social login frontend, 2026-10-08]`

### FIXED 2026-10-08 (uncommitted, awaiting qa-lead): Car/Home create is two requests -- a failed profile save leaves a space (and now its credit) behind (2026-10-08)

**Fix:** `POST /spaces` takes `profile` (same body/rules as the profile endpoints, now shared via `App\Support\SpaceProfileRules` with Romanian messages) and creates space + profile + "Default" + credit in one transaction; a bad profile or credit returns 422 (`errors["profile.*"|"credit.*"]`) and nothing is created. Both forms' create mode send ONE request, edit mode unchanged (PUT profile endpoints still used), and a ref guards double-tap on save. Tests in `tests/Feature/SpaceCreditTest.php`.

Original report:

`CarProfileForm` / `HomeProfileForm` create mode call `api.createSpace` and THEN `saveCarProfile` / `saveHomeProfile`. If the second call fails (validation, network), the space already exists without a profile and the form shows "Nu am putut salva" but stays open; tapping save again creates a SECOND space. Pre-existing, but with "În rate" the retry also duplicates the `expense_credit` (and its Calendar/Acasă reminders). Fix idea: send the profile in the same `POST /spaces` transaction (SpaceController already takes `credit` there), or remember the created space id in the form and only retry the profile. `[from: credit toggle on car/home create]`

### Numbers past a DECIMAL column's range return a raw 500 (SQLSTATE) instead of a Romanian 422 (2026-10-08)

`App\Support\SpaceProfileRules` (same rules the profile endpoints had before) has no upper bound on `tank_capacity` (`decimal(6,2)`, max 9999.99) or `purchase_price` (`decimal(12,2)`), and `ItemBudgetRules` / ItemController none on `amount` (`decimal(12,2)`). Seen live: `POST /spaces` with `profile.tank_capacity: 100000` or `credit.amount: 1000000000000` -> HTTP 500, body `"SQLSTATE[22003]: Numeric value out of range ..."` (+ stack trace, APP_DEBUG), which the Car form shows verbatim in "Nu am putut salva". The transaction rolls back correctly (0 rows left), so it's a message/validation gap, not data loss; PUT car-profile and POST /items have the same gap. Fix: `max:9999.99` / `max:9999999999.99` with Romanian messages. Related: `$request->validate()` 422s with 2+ errors (PUT car-profile/home-profile) get Laravel's English suffix, e.g. "Scrie marca mașinii. (and 5 more errors)" -- see the English-validation-messages entries. `[from: qa-lead verification of În rate / one-request space create, 2026-10-08]`

### ~~Tab bar: tapping "Spații" while inside a Space does nothing (2026-10-08)~~ FIXED 2026-10-10 (uncommitted on feat/redesign, awaiting qa-lead)

**Fix:** `MainTabBar.tsx` onPress now navigates when `!focused || (inSpace && route.name === "spaces")` -- exactly the fix idea below. Shipped together with the return trail (`lib/navigation/returnTrail.ts`, `ReturnTrailHint.tsx`, `TabSwipeEdges.tsx`; see frontend/CLAUDE.md "Tab navigation"). Needs a phone check. `[from: tab bar + return trail task]`

`components/navigation/MainTabBar.tsx`: inside a Space (`segments[1] === "[id]"`) `activeIndex` is forced onto "spaces" so the pill stays lit, which also makes that cell `focused` -- and `onPress` only navigates when `!focused`. No `tabPress` listener exists anywhere else, so from e.g. a Mașină space, tapping "Spații" in the bar emits the event and stays put; the grid is reachable only via the screen's own back. Expected (and the stock tab bar's behavior): go to the Spații grid. Fix idea: `if ((!focused || (inSpace && route.name === "spaces")) && !event.defaultPrevented) navigation.navigate(route.name)`. Static trace only, not tried on a phone; the file was never committed, so whether this predates the TabCell extraction can't be told from git. `[from: qa-lead verification of first-use tour, 2026-10-08]`

### First-use tour: two TEMP testing switches to undo after phone testing (2026-10-08)

`lib/tours.ts` `SHOW_TOUR_TEST_BUTTON = true` (one shared flag since 2026-10-09; was a local const in home.tsx) renders a "Pornește ghidul" pill that starts the screen's tour on demand: Acasă under the header (testID `home-tour-test`) Calendar under the month title (testID `calendar-tour-test`, `app/(tabs)/calendar.tsx`) Buget under its title (testID `budget-tour-test`, `app/(tabs)/budget.tsx`, added 2026-10-09) and Mașină in the car dashboard's TopBar, left of the pencil (testID `car-tour-test`, `components/spaces/car/CarDashboard.tsx`, added 2026-10-09) -- set false and delete all four pills once the user has tried the tours. `lib/tours.ts` `ONE_AUTO_TOUR_PER_SESSION = false` -- flip to true when more screens get tours, so a new user isn't hit by several auto tours in one session (design-lead's spec wants the limit). Calendar now has the 2nd auto tour (2026-10-09), Buget the 3rd and Mașină (`space_car`, first open of any car space) the 4th (both 2026-10-09), so with the flag still false a brand-new user gets Acasă's, Calendar's, Buget's and Mașină's on their first visit to each. `[from: first-use tour build]`

### `hooks/` holds two more dead Expo-template files (2026-10-08)

`hooks/use-theme-color.ts` and `hooks/use-color-scheme.ts` (+ `.web.ts`) are imported only by already-dead template leftovers (`parallax-scroll-view.tsx`, `themed-text.tsx`, `themed-view.tsx`, `components/ui/collapsible.tsx`). Not on `frontend/CLAUDE.md`'s dead list yet; `use-theme-color.ts` is also 2 of the 8 pre-existing `npx tsc --noEmit` errors (the other 6 are in `haptic-tab.tsx`, `parallax-scroll-view.tsx`, `icon-symbol.tsx` -- all dead). Deleting the dead set would make `tsc` clean. `[from: first-use tour build]`

### Acasă "Provizii" card can't tell "no supplies" from "none low" (2026-10-08)

`lib/dashboard/widgetVisibility.ts` hides empty Acasă cards, but `/dashboard` only returns `lowSupplies` (count of LOW `home_supply` rows per space) -- there's no "this Casă tracks N supplies" number. So the Provizii card stays visible for any Casă space, showing "Ok · nimic pe terminate" even when that Casă has zero supplies. Fix: add a per-space `supplies` count to `DashboardController` (next to `lowSuppliesBySpace`) and make the `supplies` rule `count > 0`. `[from: acasa-hide-empty]`

### Email-change confirmation links never expire (2026-10-08)

`AuthController::confirmEmailChange` checks expiry with `now()->diffInMinutes($pending->created_at) > 60`, but Carbon 3 (installed: 3.13.2) returns a SIGNED diff -- "now vs a past time" is negative (tinker: `now()->diffInMinutes(now()->subMinutes(90))` = `-90.01`), so the check is never true. Confirmed live: a pending change backdated 5h still confirmed with 200 "Emailul a fost actualizat." -- while the email itself says "Acest link expiră în 60 de minute". Pre-existing since the initial commit (not part of the auth-email diff). Fix: `$pending->created_at` older than `now()->subMinutes(60)` (same shape as `verifyEmail`'s check), plus a test. Worth grepping other `diffIn*(` uses for the same sign assumption. `[from: qa-lead verification of auth-emails 2026-10-08]`

### More leftover QA/test accounts than the one listed below (2026-10-08)

Besides id 88, the `lifeos` dev DB still has ~20 other obvious test accounts from earlier sessions (ids 5-8, 16, 24-34, 38-41, 89: `qa-*`, `qalead*`, `diagtest*`, `bugtest_*`, factory-style `antonina40@example.com`/`hreynolds@example.net`). All predate the auth-email work and are now marked verified by its backfill migration. Real accounts appear to be ids 1-4 -- confirm with the user before deleting anything. `[from: qa-lead verification of auth-emails 2026-10-08]`

### confirm-email.tsx updates the local email of ANY logged-in account (2026-10-08)

**[FIXED 2026-10-08 -- now `refreshUser()`]** `app/confirm-email.tsx` calls `updateUser({ email: res.email })` whenever a user is logged in on the device that opens the link -- even when the link belongs to a DIFFERENT account (now more reachable: email links open the app itself via `/open/confirm-email`). The logged-in user's Settings then shows the other account's new email until the next `/user` reload. Can't compare by email (the session holds the OLD address); fix = have `POST /confirm-email` return the user id and only patch when it matches `user.id`, or just `refreshUser()` (providers/auth.tsx) instead of patching. `[from: auth-email frontend 2026-10-08]`

### Other English 4xx messages still reach Romanian screens (2026-10-08)

`lib/api.ts` now maps Laravel's default "Too Many Attempts." to Romanian, but Laravel validation messages are still English wherever the backend doesn't set its own (e.g. register's "The email has already been taken.", forgot-password's "The email field must be a valid email address.", login's "The provided credentials are incorrect." -- the last one is papered over in login.tsx's `loginError`). Proper fix is a `lang/ro/validation.php` + `APP_LOCALE=ro` on the backend, not per-screen string matching. `[from: auth-email frontend 2026-10-08]`

### Budget: a 0 limit can be saved from "Reîmparte" but not from the space's own page (2026-10-08)

`ResplitSheet` saves an explicit 0 per space (and 0 now counts as a set limit everywhere: "Depășit", red amount, "Șterge bugetul"), but `BudgetSpaceDetailPage`'s single amount field still requires > 0 (`saveManualAmount`'s `!(amount > 0)` guard + `typedOk`), so you can't type 0 there to set or keep a 0 limit. Decide whether 0 is a valid limit on that page too. Related: Acasă's "Buget pe spații" card (`HomeWidgets.tsx` BudgetCard) still compares the sum of limits, not the necessities envelope, when a plan exists -- check it against the Buget tab's "Necesități pe spații" footer. `[from: budget-from-income QA fixes 2026-10-08]`

### Leftover QA test account in the dev DB (2026-10-08)

User id 88 (`qa-reorder-a-1790748327@example.com`, 9 items) is still in the `lifeos` dev DB -- looks like a test account from an earlier QA pass that was never cleaned up. Harmless, but it shows up in any "users by item count" inspection next to the real accounts. Delete it (items/spaces/limits/tokens first) once someone confirms it is not in use. `[from: qa-lead verification of budget-from-income 2026-10-08]`

### Budget-from-income redesign: deferred pieces (2026-10-07)

Spec + mockup "orgOS Buget din venit" (https://claude.ai/artifact/1w4h13z2dXQVSFcPDgkJdy) awaiting implementation. User decisions 2026-10-07: income = fixed monthly net; fără vină = per-expense flag; savings jars = targets; credits live in a "Credite" section of the Cheltuieli space (name, monthly rate, due day, end date, optional space label) -- not in Car/Home; they count against the 10% jar (tracked when a credit is active, "Investiții" otherwise), never in Necesități; stored as new item type `expense_credit` (design rev 2); rates over 10% = warning only, never reduce Economii; credits in Calendar AND Acasă "De făcut" on their day as reminders only (no paid/restant state); Economii goal auto-created (target 0) on first plan save; fără vină leftover/overspend rolls into Economii; the 15% short-term jar is ADDED to Economii automatically each month (overrides design-lead's "manual" recommendation); first income save with existing budgets asks keep vs re-split. Still deferred: (2) fără vină marking from Cheltuieli's quick-add bar (`ExpensesAddBar`) — edit-only for now; (4) archive has no income/split snapshot per month — past months' % can't be reconstructed if income changes; (5) once shipped, close "per-space limit entry has two competing UIs" and "Savings Goal auto-update depends invisibly on per-space limits" (both resolved by the redesign). `[from: design-lead budget-from-income redesign 2026-10-07]`

### Budget-from-income frontend side findings (2026-10-08) [from: budget-from-income frontend]

(1) Renewing a flagged car document by swipe ("cu datele vechi", `handleDocumentRenewSwipe`) creates the new record UNflagged -- it copies price/notes but not `guiltFree`; the renew form also starts unflagged. (2) Car's own "Luna asta" total and `lib/spaces/car/calculations/expenses.calculations.ts` totals are computed on the phone and still INCLUDE fără vină records, while Buget's per-space spend (server) excludes them -- decide whether in-space totals should match. (Cheltuieli deliberately keeps them in its own month total -- mockup.) (3) Car/Home mappers now always send `guilt_free`; any future path that builds an entry from scratch for an existing record would silently clear the flag (none found today). (4) `homeCategoryConfig.ts` rows pass the English word "Due" to `dueSubtitle(remaining, "Due")` -- check whether it ever renders. (5) `lib/api.ts`'s 429 message is still English ("Too many attempts...") against the Romanian-only rule. (6) `components/ui/DatePickerSheet.tsx`'s future range stops at 24 months, so CreditSheet uses its own month/year picker for "Ultima rată"; widen the shared picker if it should be reused. (7) Saving a fără vină expense from Cheltuieli (`[id].tsx` `handleExpenseEntrySave`) doesn't call `refreshBudgetPlan()`; harmless today (Buget reloads on focus) but the cached plan in `lib/budget/plan.ts` can be up to 60s stale. (8) The fără vină chip isn't shown yet on CarDocsPage/CarArchivePage, Home tasks (`HomeTasksPage`), `HomeSpendPage`; no Grocery list reads trips back. (9) First-income dialog labels are short ("Păstrez bugetele actuale" / "Reîmpart cei 55% pe spații") with the amounts moved into the message: ConfirmHost's choice buttons are single-line and truncate the spec's longer label.

### Budget-from-income backend side findings (2026-10-08)

(1) **[FIXED inline]** `BudgetController::archiveCompletedMonths` parsed the last archived month in UTC while comparing it against the user's-zone start of last month, so for any UTC+ user (Bucharest) the just-completed month was skipped and only archived a month later (seen live: Sep 2026 missing from the archive on 8 Oct). Now parsed in the user's zone. (2) **[FIXED 2026-10-08 -- cursor now re-parsed in the user's zone; verified 1 Oct 00:30 Bucharest fill-up counts in October]** `applyMonthlySavings` has the same UTC-cursor shape (`last_applied_month` is a `date` cast, so the cursor is 1st 00:00 UTC) -- it happens to apply the right months because it increments before summing, but each past month's spend window is then computed in UTC, not the user's zone (an item at 00:30 Bucharest on the 1st counts in the previous month there). (3) `RecurrenceProjector`'s monthly stepping still drifts for every type WITHOUT `metadata.day_of_month`: a `home_recurring`/`custom_event` due on the 31st goes 31 Jan -> 28 Feb -> 28 Mar forever (`addMonthsNoOverflow` keeps the clamped day). The new clamp only applies when `day_of_month` is set (credits); extending it to "anchor = the original due_at's day" is a behavior change for existing bills that should be checked against Casă's own frontend projection first. Yearly stepping uses `addYears` (overflow) -- a 29 Feb item lands on 1 Mar. (4) Credits have no start date, so `Item::scopeActiveCredits` counts a credit in every month up to its `end_date`, including months before it was entered -- harmless in normal use (the archive only writes the just-completed month) but a backfilled/test archive shows rates in months the credit didn't exist yet. `[from: budget-from-income backend]`

### Auth emails: synchronous mail sends can 500 two endpoints (2026-10-08)

**[FIXED 2026-10-08: forgot-password + email change now try/catch → log + Romanian 503; email change deletes its pending row on failure. Note: forgot-password's 503 only happens when the account exists, a minor enumeration leak while SMTP is down. 429 English copy still open.]** Mail is sent inside the request (no queue worker in dev). `register` and `POST /email/verification-notification` catch transport failures (account still created / Romanian 503), but `POST /forgot-password` (`Password::sendResetLink`) and `PUT /profile/email` (`requestEmailChange`, after it has already stored the pending row) don't -- once `MAIL_MAILER=smtp`, a Brevo outage/bad key/daily-quota hit turns them into a raw 500. Options: try/catch + log + Romanian 503 (forgot-password must keep its don't-reveal-the-account wording), or queue the notifications (`ShouldQueue` + a worker in `dev.ps1`). Also: the shared `password-reset` throttle group (now also `/email/verify`) answers 429 with Laravel's English "Too Many Attempts." (related to `lib/api.ts`'s own English 429 copy, item (5) under budget-from-income frontend findings). `[from: auth-emails backend 2026-10-08]`

### Google sign-in works via ngrok free domain; ngrok "Visit Site" interstitial (2026-10-09)

Google login now shows and works in Expo Go through the fixed ngrok domain (dev.ps1 DEV_NGROK_DOMAIN). ngrok's free-domain browser warning appears in the in-app browser before the Google redirect (and can on the callback) -- unavoidable for browser navigations on free ngrok (API calls skip it via the `ngrok-skip-browser-warning` header). Removed only by a paid ngrok plan or an own domain + Cloudflare named tunnel (~10 USD/yr) -- plan that together with the dedicated-Gmail move. `[from: user test 2026-10-09]`

### PARKED (user decision 2026-10-09): all social login (Apple, Google, Facebook) until there's budget

User: social login (incl. the NEW-1 Facebook/Google fix and the Apple own-build) waits until money is available; meanwhile only free work. Code stays in place, buttons hidden. Note for later: Google/Facebook themselves are free (only need a fixed URL, e.g. free ngrok static domain + credentials); Apple needs the 99 USD/yr developer account. `[from: user 2026-10-09]`

### Apple sign-in does NOT work in Expo Go (confirmed on the user's iPhone 2026-10-09)

Expo Go (SDK 57) doesn't ship the native expo-apple-authentication module: `isAvailableAsync()` → false and `AppleAuthenticationButton` renders "Unimplemented component: <ViewManagerAdapter_ExpoAppleAuthentication>". The button stays hidden (frontend gate is correct). Backend + app code are done and QA'd; Apple needs an own development build (EAS/`expo prebuild`) signed with an Apple Developer account (99 USD/yr), then add the bundle id to APPLE_CLIENT_IDS and REMOVE `host.exp.Exponent`. Same build decision unblocks the bank-notification feature (Android) and `orgos://` links. `[from: Apple sign-in device test 2026-10-09]`

### Social login: fix BEFORE enabling Google/Facebook credentials (2026-10-08)

**2026-10-09 backend-lead: NEW-1 and NEW-3 FIXED, awaiting qa-lead** (uncommitted on feat/redesign). NEW-1: new `social_accounts.created_account` (migration `2026_10_09_000001`, applied to dev MySQL); `SocialAuthService::settleLinksAfterAddressProven($user, $address)` replaces `dropUnverifiedLinks` in verifyEmail/resetPassword/confirmEmailChange: the unverified link that created the account with exactly the proven address is promoted to verified, every other unverified link is still deleted; the eviction path still drops all. 409 `email_unverified_exists` on a no-password account now says "... Intră cu emailul și parola sau folosește „Ai uitat parola?”." + `hint: no_password` (JSON) / `&hint=no_password` (web-flow deep link). NEW-3: resolveUser retries up to 3x on concurrency errors (own loop, since `DB::transaction($cb, 3)` doesn't retry when nested). NEW-2: unchanged by design, documented in backend/CLAUDE.md -- note the NEW-1 fix widens it slightly: someone who created an account via an unverified Facebook email for someone else's address keeps that Facebook link if the real owner later verifies or resets (before: dropped). Tests: SocialLoginTest +5 (verify / reset keep Facebook, unrelated link dropped, eviction still drops the creator link, no-password hint, deadlock retry); full suite 74/74. **Frontend follow-up (DONE 2026-10-09 -- socialErrorMessage takes the hint; web flow + auth-callback pass it):** `frontend/lib/socialAuth.ts` `socialErrorMessage` ignores `hint`, so the Google/Facebook web flow still shows the old "Intră cu emailul și parola" copy -- read `hint=no_password` from the callback params and append the „Ai uitat parola?” pointer. `[from: backend-lead social-login NEW-1/NEW-3 fix 2026-10-09]`

Original QA finding: (NEW-1, MEDIUM) a Facebook / unverified-Google user who verifies their email or resets the password LOSES that sign-in forever: `dropUnverifiedLinks()` in verifyEmail/resetPassword/confirmEmailChange deletes the link, next sign-in 409 "Intră cu emailul și parola" though has_password=false. Fix idea: when the link was created with the account and its email equals the address just proven, mark it verified instead of deleting; at least point the 409 copy to "Ai uitat parola?" when the account has no password. (NEW-2, LOW) verify-email doesn't revoke the registrant's tokens/password, so a victim who clicks "confirm" on an attacker-created account and later links Apple inherits an account the attacker still controls (standard email-verification limitation). (NEW-3, LOW) first-sign-in race on MySQL can deadlock (1213) instead of unique violation → use `DB::transaction($cb, 3)`. Notes: `pendingWebFlowAt` not cleared on cancel/error (10-min trust window); set-password needs no re-auth (stolen token can lock in); stale has_password after a 409 on set-password; apple-nonce limiter effectively global behind the tunnel (same as TrustProxies item). `[from: qa-lead social login re-verify 2026-10-08]`

### Spații create-templates design review side findings (2026-10-08)

Mockup "Spații create-space templates": https://claude.ai/artifact/VadARnBuD5N2GM7QR9aH8b . (a) Dashed "add" affordances use `borderStrong` (~1.4:1 on the light page): home.tsx "Adaugă card", Pill `dashed` (primitives.tsx), TourHost ghost rows -- the new Spații create tiles use `colors.control` (~2.8–3.5:1); consider moving them all for consistency. (b) The "Spațiu nou" sheet could show which spaces of each kind already exist ("Ai deja: BMW") to prevent accidental duplicates -- new on-screen info, needs sign-off; relates to "Telling apart several spaces of the same kind". (c) Spații first-use tour not built yet -- empty variant: "Alege ce creezi" (grid), ⓘ; with spaces: status line on the first card, "+", pencil/long-press. Flip `ONE_AUTO_TOUR_PER_SESSION` before shipping a 2nd auto tour. (d) Empty Spații: header "+" duplicates the on-page create grid -- hide it at 0 spaces? (behaviour change, open). `[from: Spații create-templates design review]`

### First-use tour design side findings (2026-10-08)

(a) **[FIXED 2026-10-08 -- the income card now shows with no spaces]** **No path to set income on an account with no spaces.** `budget.tsx` renders "Adaugă venitul" only when `spaceKinds.length > 0`, so Buget can't be the first step for a new account (the Acasă empty state sends people to Spații instead). Decide whether income should be settable before the first space exists. (b) **Two email reminders on first login:** register's `notifyAction` "Verifică emailul" + `VerifyEmailBanner` say the same thing on the same first screen -- consider dropping the dialog (functional change, needs sign-off). (c) **Spend card repeats the amount when there's no budget:** in `HomeWidgets.tsx` SpendRingCard the ring centre shows `lei(total)` and the column beside it shows the same total -- show the centre empty or an icon. (d) **`dashboard_layout` reaches the app as a raw JSON string** (not in `User::casts()`, `/user` returns text; `GET /dashboard/layout` decodes separately) -- cast it (and the planned `tours` column) as arrays. `[from: design-lead first-use tour 2026-10-08]`

### Auth-email leftovers from QA (2026-10-08)

(a) A failed resend/forgot/email-change send replaces the previous token BEFORE the mail fails, so the link from the earlier, delivered email stops working ("nu este valid"). Fix: keep the old token until the new mail actually went out (or restore it in the catch). (b) `register.tsx` always says "Ți-am trimis un link de confirmare" even when the backend swallowed a mail failure -- register response doesn't say whether mail went out. (c) Hitting the 6/h resend limit gives `retry_after` up to 3600 → button reads "Retrimite în 3412 s"; format as minutes. (d) No TrustProxies: behind the tunnel every client is 127.0.0.1, so IP-keyed limiters (`auth` 5/min, `password-reset` 10/min incl. `/email/verify`, `open-link` 30/min) are effectively global. Fixed already: forgot-password no longer reveals accounts while SMTP is down and drops its token row on failure; email-change links now expire after 60 min (Carbon 3 signed diff); `/open/*` stateless. `[from: qa-lead auth-email 2026-10-08]`

### Generic Laravel validation messages are English (2026-10-08)

`APP_LOCALE=en` and no Romanian lang file, so since item 422s now carry `message` (2026-10-08), generic rule failures reach the Romanian UI as e.g. "The amount field must be at least 0." / "The selected type is invalid." (previously "Request failed (422)", also English). Custom credit/fără vină messages are Romanian. Fix: Romanian `lang/ro/validation.php` + `APP_LOCALE=ro`, own pass. Related to "Backend validation/auth messages are still English (2026-10-04)". `[from: qa-lead budget re-verify 2026-10-08]`

### Budget-from-income QA low findings (2026-10-08)

(a) Credits have no start date: `activeCredits` only checks end_date, so a backfilled archive counts a credit in months before it existed, and a credit created after its pay day counts in this month's `credit.rates` though `next_due` is next month. (b) `suggestSplit` can return a negative amount when recurring floors sit within ~10 lei of the envelope (rounding) -- ResplitSheet saves it as 0, cosmetic. (c) `PUT /items/{credit} {type:"expense_item"}` retypes a credit into an expense (no UI path). (d) With no past-month history the suggestion puts the whole envelope on the space with recurring bills (spec-correct, may surprise). `[from: qa-lead budget-from-income 2026-10-08]`

### Tap = preview everywhere, long press = actions + haptic everywhere (2026-10-05) -- user decision, Casă done first

The user decided: in EVERY space, a single tap on any record opens a read-only preview (not its create/edit form), and every long press gives a light haptic. Built for Casă only so far (`components/spaces/home/HomeRecordSheet.tsx` + `homeRecordPreview.ts`, `lib/haptics.ts` `longPressFeedback()`). Still to do: (1) Mașină -- fuel/service/document/expense rows still open the edit form on tap (`CarDashboard.tsx` `openEntryForEdit`, CarDocsPage, CarHistoryPage, CarExpensesPage); (2) Cumpărături -- product rows (long press = edit today), lists; (3) Cheltuieli -- expense rows; (4) Calendar / Buget / Acasă rows that open a record; (5) haptic on every existing long press: Spații edit mode (empty-spot long press), Acasă edit mode, Grocery product long press, any drag handle start. Likely a shared `RecordSheet` generalized from the Casă one. `[from: Casă dashboard redesign v2, user 2026-10-05]`

### Calendar redesign side findings (2026-10-05)

From the design-lead's Calendar review (mockup "orgOS Calendar redesign"): (1) [DONE 2026-10-05 for dated ones -- `CalendarController` now adds Casă documents by expiry and car services by `nextServiceDate`; km-only services have no day and stay out by design] `/calendar` omits car services due by km/date and Casă documents -- `DashboardController::carServiceDue`/`homeDocumentsDue` live only in `/dashboard`, so a calendar heatmap undercounts and a non-today day panel misses them; backend: add both to `CalendarController` `days`. (2) Scope mismatch now visible on one screen: `/dashboard` filters by `user_id`, `/calendar` uses `visibleTo` -- a shared-space item can be heated on the grid but absent from a "today" list built from `/dashboard`. (3) `densityColor`/`DENSITY_TIERS` in `lib/statusColors.ts` are dead (no importers); `frontend/CLAUDE.md` still describes Calendar as "density-colored… agenda accordion… recurring-bills list". (4) Calendar rows deep-link on tap instead of a preview -- part of "Tap = preview everywhere" above. (5) Older Calendar entries in this file ("density coloring conflates count with urgency", per-space dots, "CHELTUIELI RECURENTE includes non-expense items", "no Today quick-jump") close once the redesign ships. `[from: design-lead Calendar redesign 2026-10-05]` (6) [DONE 2026-10-05 -- `CalendarController::projectionAnchor`] Recurring `home_maintenance` lands on different days in Calendar than in Casă: `CalendarController` projects it with `RecurrenceProjector::occurrencesBetween` anchored on `due_at`, while Casă / `currentDue` use `metadata.nextDueDate` -- seeded account: "Overdue, recurring" (monthly) is restant since 27 Sep (local) in Casă but heated 28 Oct, 28 Nov... in Calendar (now 27 Oct, 27 Nov...); the weekly one already matched. Anchor the projection on `nextDueDate` when set. (7) Confirmed on the seeded account for (1): 4 Casă documents expire inside the 3-month window and none heat the strip. (8) Swipe-right "Rezolvă cu datele salvate" on a car service from Acasă / Calendar loses its next DATE: `logCarServiceAgain` (lib/dashboard/itemActions.ts) computes the day interval as `nextServiceDate - item.due_at`, but both `/dashboard` and `/calendar` overwrite `due_at` with the next-service date (or yesterday for km-overdue), so the interval is ~0 and the new record gets `nextServiceDate: null`. Fix: send the visit's own date alongside (e.g. `service_date`) and use it there. `[from: heatmap data audit 2026-10-05]`

### Casă redesign v2 leftovers from design-lead (2026-10-05)

From the design-lead review of the Casă dashboard (mockup "Casă dashboard redesign"): (1) Mașină's "Urmează" rows should use the same row anatomy (timing in the subtitle, amount on the right) so the spaces match; (2) second designer's idea: put the to-do section above the quick-add buttons in both spaces and give it one name -- needs one shared time window first (Car docs 45 days vs Casă 7 days); (3) a "De plătit acum" figure in the top card -- needs a definition that doesn't clash with Buget's "de plătit"; (4) the quick-add buttons use singular nouns next to plural category names ("Sarcină" vs "Sarcini") with nothing saying "add" -- shared with Mașină (`SpaceQuickActions`), consider a "+" mark or "Adaugă"; (5) `roCount` adds "de" from 20 up, which reads oddly with adjectives ("20 de deschise"); (6) the Sarcini page chip still says "Restant 12 zile" while the dashboard says "Restantă de 12 zile" -- align; (7) with type tabs, the same five nouns appear three times (add buttons, pills, Categorii) -- a later simplification: a "Toate facturile ›" link at the bottom of each tab could replace Categorii; (8) `Sheet`'s close `CircleButton` uses `surfaceSecondary`, the same as the sheet, so only the X shows, not its round button. `[from: design-lead Casă dashboard review 2026-10-04/05]`

### Redesign follow-ups needing a decision or a device (2026-10-04)

From design-lead's verification of the redesign (phase 0-1), not done because they change behavior or need a real phone: (C) ~~pin Grocery's quick-add bar above the tab bar with keyboard avoidance -- on a 20-item list it's off-screen today (departs from the mockup)~~ obsolete 2026-10-10: the bar now sits at the TOP of the list (`GroceryDashboard.tsx`), never pushed down; (D) `Haptics.selectionAsync()` on ticking a grocery item (expo-haptics is installed, works in Expo Go) -- a new feedback channel; (E) Home tab's space tiles say "La zi" when there are no to-dos/spend -- per-type figures (km, restanțe, "de luat") need backend summary fields. Device checks: the native font shim (lib/globalFont.native.ts) -- Plex actually applied, nested `<Text>` inheriting its parent's weight; the tab bar keeping "Spații" lit inside a Space. Done in the same pass (no decision needed): sign-out moved from Home's header into Settings behind a confirmation (matches the approved Settings mockup), Grocery "Golește" relabelled "Debifează tot". `[from: design verify of feat/redesign phase 0-1]`

### Backend validation/auth messages are still English (2026-10-04)

`config/app.php` locale is `en` and there's no `lang/ro`, so every Laravel validation message the frontend surfaces as-is (`e.message`) reads in English -- e.g. "The provided credentials are incorrect.", "The email has already been taken.", reset-token errors. The redesigned login maps just the credentials one to Romanian client-side (`app/(auth)/login.tsx` `loginError`); the real fix is a `ro` locale (or Romanian strings in the controllers) on the backend. `[from: redesign of auth screens, feat/redesign]`

### Device checks still owed for the Home Restanțe/swipe-back branch (2026-10-04)

Not confirmable from source, need real touch input: (1) `SwipeBackView`'s 32px edge strip is an absolute overlay -- the leftmost ~8px of rows underneath can't be tapped, and a drag starting at the very edge of Grocery's list-card scroller (`GroceryDashboard.tsx` ~:984) or Car's category tabs (`CarDashboard.tsx` ~:1031) becomes swipe-back instead of a scroll; (2) drag-to-dismiss on the 4 new sheets (task form, category form, expense edit, restock); (3) iOS: `HomeCategoryPage`'s `HomeDatePickerSheet` is a *sibling* Modal of the open form sheet (HomeTaskForm/ExpenseEditModal nest theirs) -- a second sibling Modal can fail to appear on iOS. Also pre-existing: unused `StyleSheet` import in `HomeSuppliesPage.tsx:2`. `[from: qa-lead verification of feat/home-restante-urgency]`

### `spaces.created_at` has only 1-second precision, so `->latest()`'s tie order is undefined for same-second rows

**Where:** `spaces` migration (`created_at`/`updated_at` are a plain
Laravel `timestamp()` column, not `timestamp(3)`/`timestamp(6)`), read
by `SpaceController::index()`'s `->latest()` (the fallback order for
any space with `sort_order` still NULL, i.e. never manually reordered).
Confirmed live: querying `spaces` directly showed 3 real rows (ids
61/62/63) sharing the exact same `created_at` value
(`2026-09-28 16:32:22`) down to the second. When two or more spaces
are created within the same second, MySQL's ORDER BY tie-break among
equal `created_at` values isn't guaranteed newest-first (or any
particular order) — so the "everything else falls back to newest-first"
default a user would expect can visibly misorder same-second creates.
Pre-existing behavior (the `->latest()` call isn't new, `sort_order`
just got appended before it), not a regression from the drag-reorder
work, and doesn't affect manually-ordered spaces at all (those sort by
the new integer `sort_order` column, unaffected by timestamp
precision). Low real-world impact — creating two spaces in the same
UI action within the same second is rare — but a one-line fix
(`timestamp(3)` or an explicit `->orderBy('id', 'desc')` tiebreaker)
would close it if it's ever worth doing. [from: drag-reorder-spaces qa]

### Stray leftover test user in the live `lifeos` DB, not from this session

**Where:** `users` table, id 38, `qa-home-widget-test@example.com` (no
password known, presumably from an earlier QA/dev session). Found while
verifying a Home-space QA sweep's own two throwaway users
(`qa-home-sweep-*`/`qa-home-attacker-*`) had been fully cleaned up —
this third one predates the sweep and wasn't created by it, so it was
left alone rather than deleted without knowing whose test data it is.

**What:** Someone should confirm it's disposable (matches the
`qa-home-*` naming pattern used for throwaway test accounts) and either
delete it or document why it's meant to stick around. Low priority,
just DB hygiene — not a functional bug.

**Found:** `[from: Home space full-coverage QA/seeding sweep, 2026-09-29]`.

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

### ~~Home's per-resolve spend history isn't visible to the backend's own cross-space aggregates~~ FIXED 2026-10-15 (HomeSpend, see the entry above; bills still summed as a flat monthly commitment in Complet -- see "Complet never moves a paid bill into Cheltuit")

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

### Full-app QA sweep (2026-09-29): remaining confirmed findings, not yet fixed

Being worked one at a time per the user's own explicit request ("le reparăm câte unu") -- each gets its own branch/qa-lead pass and moves to "Done" individually as it ships. Listed together here just as the master tracking entry; don't duplicate-log these individually as they're picked up, just move this section's relevant bullet.

- **`APP_DEBUG=true` leaks full stack traces (with server file paths) on every error response** -- and since `main` is literally what's live on the phone via the Cloudflare tunnel (no staging), this is plausibly reachable from outside right now, not just in a safe local dev context. This is a deliberate config/deployment decision (dev convenience vs. disclosure), not a code bug -- needs the user's own call, not an autonomous fix. Still open, awaiting that decision.
- **PLAUSIBLE, not fully reproduced (needs a second look, not a confirmed bug):** a user who is only a *member of one shared Grocery list* (not a member of its space) might be able to retype one of that list's own `grocery_item` rows into a new `grocery_list` inside the list-owner's space -- the boundary guard blocks grocery↔non-grocery crossing but doesn't re-validate `grocery_item → grocery_list` within the grocery side. Low severity (can't move the item to a different space, only spawn an extra list row somewhere the user already has legitimate list access).
- **PLAUSIBLE, untested:** a shared-list member finishing a shopping trip on an item linked to a Home supply living in a space they don't belong to -- `logSupplyRestock`'s write goes through the plain space-level `canAccessItem` check, which a list-member-only user wouldn't satisfy; the frontend only `console.error`s a failure here rather than surfacing it, so this could silently fail. Not reproduced, worth a follow-up look.

**Found:** `[from: full-app QA sweep, 2026-09-29 — Car/Home/Grocery/Expenses+Calendar/Budget+HomeTab+Spaces+Auth agents]`.

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

### ~~Home tab's sign-out icon fires with no confirmation~~ ALREADY FIXED (confirmed 2026-10-10: sign-out lives only in Settings, behind confirmAction "Ieși din cont?")

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

**STATUS 2026-10-15 -- infrastructure in, translation not started.**
Romanian audit done first (1.528 on-screen strings checked, all Romanian;
fixed: api.ts fallback, Buget pages showing stored English titles via
`todoTitle`, 22 English/no-diacritics server messages, server locale ro with
`lang/ro/validation.php`). Built: `frontend/lib/i18n` (i18next, ro/en JSON,
CLDR plurals, Settings > Limbă sheet, Accept-Language on every request) and
the backend's SetLocale middleware. Next, in order: (1) move Simplu screens
to `t()` keys + write en.json; (2) make lib/format.ts dates/numbers follow
the language; (3) Complet screens; (4) help.ts + tours.ts; (5) wrap
controller messages in `__()` + lang/en; (6) emails per user language (needs
the choice saved on the account -- `users.locale`, today it's per device);
(7) flip `FOLLOW_DEVICE_LANGUAGE`. The original note below predates all
this (it says the app is English -- it has been Romanian since 2026-10).


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

### `backend/CLAUDE.md`'s "login/register have no throttle" note is stale (2026-09-29) [from: Expenses+Calendar QA sweep]

While registering a throwaway QA user, `/api/register` returned a real 429 ("Too Many Attempts") after a handful of requests. `routes/api.php` wraps both `/register` and `/login` in `Route::middleware('throttle:auth')`, and `AppServiceProvider::boot()` defines that limiter as `Limit::perMinute(5)->by($request->ip())` -- a real, working IP-keyed lockout, not the "no throttle middleware (known issue, not yet fixed)" `backend/CLAUDE.md` currently describes. Didn't touch the doc (out of scope for this task) -- just flagging that whoever picks up that "known issue" next should re-verify it's still true before doing any work, since it looks fixed already.

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

### Full-app QA sweep (2026-09-29): 5 parallel agents, every space + Calendar/Budget/Home tab/Spaces/Auth

Per explicit user request ("vreau pe toata aplicatia, toate sectiunile, toate functionalitatile") -- 5 agents in parallel, each seeding real data via the live API (happy path + negative/edge cases + plausible extra user behavior) and hand-verifying computed values, covering: Car, Home, Grocery, Expenses+Calendar, Budget+Home-tab+Spaces+Auth. Full findings list (fixed and not-yet-fixed) tracked below and in "Found along the way"; this entry covers the sweep itself and the 2 fixes shipped same-day. Rest of the confirmed findings (space-delete orphaning, `type` whitelist, partial-metadata-PUT overwrite, `APP_DEBUG` production exposure) are being worked one at a time per the user's own request -- see their own "Found along the way" entries below, updated to "Done" as each ships.

### Calendar custom-event creation landed on the wrong day/month for non-UTC users (2026-09-29)

Found by the sweep above (Expenses+Calendar agent), HIGH severity, real and reproducible: `calendar.tsx`'s `saveCustomEvent` built `due_at` as a naive `"YYYY-MM-DDTHH:mm:00"` string (no offset); Laravel's `datetime` cast parsed it in `config('app.timezone')` (UTC), never the user's own stored timezone -- a 23:00 Bucharest (UTC+3) event silently landed 3 hours later, sometimes crossing into the next day AND next month. A different, write-side bug from the earlier-fixed read-side `$startUtc`/`$endUtc` `CalendarController` issue -- qa-lead confirmed that fix is still correct and unaffected.

Fixed by building a real `Date` via the multi-arg constructor (interprets its numbers as the device's own local time) + `.toISOString()`, matching the pattern `ExpenseDatePickerSheet`/`ExpensesAddBar` already used correctly. qa-lead live-reproduced the exact original bug scenario against the real backend, confirmed it's fixed, confirmed the no-timezone-header fallback and recurring-event projection are both unaffected.

**New, out-of-scope observation qa-lead flagged, not fixed:** a Bucharest-anchored recurring event's displayed local time drifts by an hour across a DST transition (stored UTC instant stays pinned, so the same wall-clock pick reads as 23:00 before DST and 22:00 after) -- does NOT cause a day-bucket shift (`CalendarController` re-converts fresh each time), just a display-time drift worth knowing about if it ever comes up.

### No server-side floor on `Item.amount` -- negative values silently corrupted spend totals (2026-09-29)

Found independently by 3 of the sweep's 5 agents (Car, Home, Expenses), all reproducing the identical gap: `ItemController`'s `amount` validator was `nullable|numeric` with no `min:0`, for every item type app-wide. A negative amount posted directly to the API (bypassing every form's own client-side check) was silently accepted and flowed straight into every "this month spend" sum -- Home and Expenses' own agents each demonstrated an exact RON-for-RON match between an injected negative amount and the resulting gap in the computed total.

Verified first that no feature anywhere has a legitimate negative-amount concept (no refund/credit, grepped both halves of the app) before adding `min:0` to both `store()` and `update()`. qa-lead live-confirmed: negative rejected (422) on 2 item types across create and update, `0` still accepted (inclusive floor), normal positive amounts and `null`/omitted amounts both completely unaffected, full backend suite still 13/13, and confirmed no other validation path double-validates or conflicts (`BudgetGoal.current_amount` is a different, legitimately-unbounded field on a different model, untouched).

### Deleting a space now cascades to its items instead of orphaning them (2026-09-29)

Found by the sweep's Grocery agent, Medium-High severity: `items.space_id` used `nullOnDelete` while `car_profiles`/`home_profiles`/`space_members` all already correctly `cascadeOnDelete` -- items was the one inconsistent relation. A deleted space's items survived forever with `space_id=null`: invisible in every screen (each space's own load query filters by `space_id`), but still summed into Budget's per-type totals (`monthlySumForLabel` has no space-existence check) with no UI path to ever see or remove them again -- live-confirmed a deleted Grocery space's `grocery_trip` spend kept counting in Budget unchanged after the space was gone. Also closed a rarer compounding bug the same agent found: a shared list member removed with items kept (`user_id` nulled), whose list's space is later deleted, used to leave a genuinely unreachable row (`user_id` AND `space_id` both null) -- cascade delete now removes it outright instead of leaving a second, deeper orphan.

Pure schema fix (new migration only, dropped and re-added `items_space_id_foreign` with `cascadeOnDelete()`) -- `SpaceController::destroy`'s existing `$space->delete()` already triggers a real hard DELETE (neither model uses soft-deletes), so the new FK constraint alone makes deleting a space cascade correctly with zero application code changes.

The qa-lead dispatched to verify this hit a session rate limit mid-run (not a code defect) before it could report back. Given this touches real data-loss-shaped behavior, verified directly instead: confirmed the FK's `DELETE_RULE` is genuinely `CASCADE` via `information_schema`, live-tested creating a space+item then deleting the space and confirmed the item is genuinely gone (not just orphaned), and specifically verified the scoping risk that matters most for a cascade fix -- created two separate spaces with their own items each, deleted one, and confirmed the other space and every one of its items were completely untouched. Full backend test suite stayed 13/13 throughout.

### Server-side whitelist added for `Item.type` (2026-09-29)

Found by the sweep's Car agent: `ItemController` validated `type` as `required|string|max:30` only -- a typo'd/invalid type was silently accepted and became a permanently invisible orphan row (every space's own load query filters strictly on its own known type constants). Inventoried every real type across all 4 spaces' own `*Items.ts` files plus Calendar's `custom_event` (15 total), cross-checked against every type string in `Item.php`'s own `SPENDING_TYPES`/`SPENDING_TYPE_SPACE`/`ACTIONABLE_TYPES`/`RECURRING_TYPE_SPACE` constants, added as a new `Item::VALID_TYPES` constant wired into both `store()`/`update()` via `Rule::in()`.

qa-lead independently re-derived the same 15-type inventory from scratch (not trusting the implementation's own list), live-tested all 15 types individually including `grocery_item` with a real `listId` (the implementation's own quick check had left this one ambiguous), confirmed a bogus type is rejected on both create AND update (with no partial mutation on the rejected update), confirmed `Rule::in()` correctly coexists with the field's other rules (required/string/max:30) rather than short-circuiting them, and re-ran the full test suite independently (13/13).

**Investigated and ruled out, not a new defect:** the already-dead `QuickAddSheet`/`quickAdd.tsx` (orphaned since the FAB removal, zero real importers -- see the `search.tsx`-style orphaned-file entries above) and the test-only `ItemFactory`'s default both use non-whitelisted legacy type strings (`task`/`expense`/`reminder`/`event`/`note`) -- confirmed neither is reachable through any live HTTP path, so the whitelist doesn't break anything that still works. qa-lead also checked `BACKLOG.md`'s Open/Bigger-ideas sections for any near-term planned feature that would need a new type string added to the whitelist -- found none; the only mention is a speculative comment in `Item.php` itself about a hypothetical future `car_recurring`/`grocery_recurring`/`expense_recurring`, not a committed plan.

### `PUT /api/items/{id}` now merges a partial `metadata` object instead of overwriting the column (2026-09-29)

Found by the sweep's Car agent, low severity today (not hit by any real current caller -- every `*EntryToItemBody` mapper always sends the full metadata object), but a live landmine for any future partial-update call. Fixed by merging the incoming metadata over the item's existing metadata before `update()`'s mass-update, instead of replacing it wholesale -- can't regress the app's own real usage pattern, since merging "everything" over "everything" produces the identical result a full replace already did.

qa-lead live-verified all 4 relevant behaviors: a partial update now correctly preserves untouched sibling keys; a full-object update (the app's real pattern) is bit-for-bit unchanged from before; `metadata: null` still fully clears the column (the `is_array()` guard correctly treats an explicit null as "skip the merge, let the plain overwrite null it out" rather than merging null into the existing array); and omitting `metadata` from the request body entirely still leaves it untouched. Full backend test suite stayed 13/13.

**Minor, non-blocking observation from qa-lead, not fixed:** the merge uses `array_merge`, which renumbers integer keys rather than overwriting by position -- if metadata is ever list-shaped (a bare JSON array, not an object) instead of the keyed-object shape every current usage uses, this could produce surprising duplication. `array_replace` would be the safer choice if/when list-shaped metadata is ever added; not applicable to anything that exists today.

### CLAUDE.md doc corrections from the full-app QA sweep (2026-09-29)

Fixed the 2 stale claims logged above: `backend/CLAUDE.md`'s "login/register have no throttle middleware" (false -- `throttle:auth`, 5/min/IP, is live on both routes) and root `CLAUDE.md`'s "known IDOR on `ItemController::update`" (already fixed -- the current code explicitly rejects any grocery/non-grocery type-boundary crossing). Also documented all 4 of today's other `ItemController`/`SpaceController` fixes (type whitelist, `amount` floor, `metadata` merge, space-delete cascade) inline in `backend/CLAUDE.md`'s own "known issues" text, so it stops describing gaps that no longer exist. Doc-only, no code risk, no qa-lead pass needed.

### Budget's month bucketing wasn't timezone-aware, disagreeing with Calendar on the same data (2026-09-29)

Found not by the 5-agent sweep, but by directly testing the CONNECTION between two sections per the user's own follow-up question ("ai verificat fiecare conexiune dintre secțiuni?") -- Budget and Calendar both read the same `items.due_at`, but `BudgetController` used raw `Carbon::now()` (server/UTC) plus `whereYear()`/`whereMonth()` directly on the stored (UTC) column, with zero timezone conversion -- unlike `CalendarController`, which already converts month boundaries to the user's own timezone (`$startUtc`/`$endUtc`, an earlier session fix). Live-reproduced: a purchase picked as "October 1st, 00:30" Bucharest-local showed correctly as October on Calendar, but Budget silently counted it toward September's total instead -- confirmed with real numbers (349 vs. the correct 250).

Fixed the same way Calendar already does it: `$now` in both `index()` and `spaceDetail()` now carries the user's stored timezone, and a new `monthWindowUtc()` helper converts a month's boundaries to UTC for a `whereBetween` query instead of the timezone-blind `whereYear`/`whereMonth` -- applied to `monthlySumForLabel` (the one function every month-scoped sum in the controller goes through) and the two "biggest line item" queries. qa-lead independently reproduced the original bug and confirmed the fix on 3 separate surfaces (`index()`'s main total, `spaceDetail()`'s per-space trend, `biggest`'s line-item pick), confirmed the no-timezone-header fallback is unaffected, confirmed `applyMonthlySavings`/`archiveCompletedMonths` (which ride on the now-corrected `$now`/`$lastMonth`) still produce sane values with no errors, and re-ran the full test suite (13/13).

**New, real sibling bug found by qa-lead, not fixed (same class, different controller):** `DashboardController.php` (the Home tab's cross-space "Monthly Expenses" widget) has the exact same timezone-blind `now()` + `whereYear`/`whereMonth` pattern this fix just eliminated from Budget -- its own comment even calls out that it's meant to use "the same 'spent this month' rule as BudgetController's per-category totals," confirming it's a direct, never-updated sibling. A purchase logged just after local midnight on the 1st would still misattribute to the wrong month on the Home tab specifically. Logged here rather than fixed inline (separate controller, out of this fix's own scope) -- good next candidate given the pattern is now proven and ready to reapply.

### Dashboard's Monthly Expenses and overdue/today/upcoming were also timezone-blind (2026-09-29)

Fixed the sibling bug found above: `DashboardController`'s `$now = now()` (server/UTC) fed BOTH the Monthly Expenses `whereYear`/`whereMonth` query AND the overdue/today/upcoming classification (`isToday()`, the 7-day window) from one shared variable. Tagged it once with the user's own stored timezone (`now($user->timezone ?? 'UTC')`, same as Budget/Calendar) and converted the Monthly Expenses query to a UTC-boundary `whereBetween`, same pattern as Budget's own `monthWindowUtc()`. Fixing both halves from the one shared root cause wasn't scope creep -- the identical timezone-blindness was already present in both, only the spend-total half had been specifically flagged.

qa-lead independently reproduced the boundary scenario and confirmed Dashboard's `monthlyExpenses.total` now agrees exactly with Budget's own total for identical data (both 150, was 210 before), confirmed the today/overdue/upcoming classification is genuinely correct (3 seeded items, each landing in the right bucket) including a 23:30-local near-midnight stress case, confirmed the no-timezone-header fallback is unaffected, and re-ran the full test suite (13/13).

### Calendar's recurring-list `$now` tag and QuickAdd's date parsing, the last 2 timezone-blind spots in this arc (2026-09-29)

The 2 remaining `Carbon::now()` instances found by the DashboardController qa-lead's own sweep (commit 61919db): `CalendarController`'s recurring "next due" list builder's `$now` retagged from server/UTC to `Carbon::now($userTz)`, and `QuickAddController::parse()`'s "today"/"tomorrow"/weekday/"on &lt;month day&gt;" phrases all switched from an untagged `Carbon::now()`/`Carbon::parse()` to the user's own stored timezone.

qa-lead verified both, live against the real backend with a throwaway user (Asia/Tokyo, chosen so its local calendar day currently differs from server UTC's):
- **Calendar's fix is confirmed cosmetic, not a functional bug fix** — read `RecurrenceProjector::nextOccurrence()`'s source first: the while-loop's `$cursor->lt($now)` and the `addMonthsNoOverflow`/`subMonthsNoOverflow` stepping are purely instant-based (a Carbon comparison/arithmetic op doesn't care what timezone its operands are *tagged* with, only the underlying instant), and `$cursor` itself is `Carbon::parse($item->due_at)` — never retagged with `$userTz` at all. Live-confirmed by fetching the same recurring item's calendar `recurring` entry 3 times with `X-Timezone` set to `Asia/Tokyo`, `UTC`, and `Pacific/Kiritimati` (UTC+14, the most extreme real zone) — byte-identical `due_at`/`created_at` output all 3 times. Genuinely a consistency-only fix, matching the PR's own claim.
- **QuickAdd's fix is a real, confirmed bug fix** — "today" for the Tokyo-timezone test user correctly returned the next UTC calendar day (`2026-09-30T02:17:...+09:00`, at a moment UTC was still `2026-09-29T17:17`), i.e. the user's own local "today," not the server's. "tomorrow" correctly stepped one further local day. Both weekday-name (`friday` → next Friday in Tokyo-local terms) and `on <month day>` (`Oct 15` → this year, correct `+09:00` offset, not silently `+00:00`) branches also confirmed correctly timezone-aware. The no-header/never-set-timezone fallback was re-checked with a second fresh user and still resolves "today" against server UTC exactly as before, for both `/api/calendar` and `/api/quick-add`.
- Full backend suite stayed 13/13 throughout; all test items/users created during this verification were deleted afterward.

**Independently re-confirmed, not fixed (already documented in `frontend/CLAUDE.md`):** `POST /api/quick-add` has zero live caller today — grepped the whole frontend for `QuickAddSheet`/`quickAdd`/`quick-add`; the only real usages are `quickAdd.tsx` calling its own `api.quickAdd()`, and `lib/api.ts` defining that function. Nothing outside that one orphaned file imports `QuickAddSheet`. So this fix is currently inert but correctly in place for whenever/if that sheet is ever revived.

**Minor, unrelated quirk noticed in passing, not fixed:** `QuickAddController::parse()`'s weekday-name regex only captures the day name itself (`/\b(monday|...|sunday)\b/i`), not a leading "on " — so `"meeting on friday"` strips just `"friday"` from the working title, leaving a dangling `"meeting on"` as the title instead of `"meeting"`. Pre-existing, unrelated to timezones (would reproduce identically in UTC), cosmetic only. `[from: qa-lead verification of fix/calendar-quickadd-timezone-consistency]`

**If this really is the last of the arc:** all `Carbon::now()`/date-resolution call sites across `CalendarController`, `BudgetController`, `DashboardController`, and `QuickAddController` are now timezone-consistent (either genuinely fixed or confirmed cosmetic). No further untagged `Carbon::now()` spot was found during this pass — but qa-lead did not re-run a fresh repo-wide grep for `Carbon::now()`/`now()` outside these 4 controllers, so a sibling in some other controller (e.g. a notification/reminder job, if one exists) can't be ruled out from this pass alone.

### A Space's dashboard didn't reset to its main view when you navigated back into it (2026-09-29)

Real user report, prompted by asking about mobile UX research: "dacă sunt intr-o secțiune dintr-un space și apăs pe Spaces și apoi din nou pe space-ul respectiv, nu mă duce în main page ci mă duce unde am rămas." Root cause: `app/(tabs)/[id].tsx` (the one route every Space renders through) never unmounts between visits to the same space, so nothing ever reset each Dashboard's own internal "which sub-view am I showing" state (`activeCategory`, `tasksPageVisible`, ...).

Investigation found a second, more severe, previously-unreported variant: `GroceryDashboard` already had `key={space.id}` (added earlier so switching between two DIFFERENT Grocery spaces didn't briefly show stale data), but that alone does nothing for re-entering the IDENTICAL space (space.id doesn't change then) -- exactly the reported bug. `CarDashboard`/`HomeDashboard`/`ExpensesDashboard` had NO remount protection at all, meaning even switching between two DIFFERENT spaces of the same kind could leave a stale sub-view showing -- a worse variant of the same root cause nobody had reported yet.

Fixed with one mechanism for all 4: a `visitId` counter bumped inside the existing "reload on focus" `useFocusEffect` (already firing on every genuine navigate-away-and-back), folded into each Dashboard's own `key` prop alongside `space.id` -- a key change forces a full remount, resetting every internal `useState` to default. qa-lead verified via full source tracing (no browser-automation tool available in this environment) that `useFocusEffect`'s underlying `navigation.addListener('focus'/'blur')` mechanism only fires on real tab/route transitions, never on in-screen interaction (confirmed a form open inside a Dashboard can't accidentally trigger a reset mid-edit), confirmed the existing different-space loading-spinner reset path is unaffected and doesn't double-remount visibly, confirmed no cascade/infinite-loop risk, and confirmed a normal same-focus-session data reload (e.g. after saving an entry) does NOT bump `visitId` and so doesn't reset an open sub-view. Full tsc/bundle checks clean.

### Left-edge swipe-back gesture, piloted on Home Tasks (2026-09-29)

Step 1 of the user's explicit 4-step mobile-UX roadmap (swipe-back everywhere -> minimum touch targets -> long-press on cards -> consistency), prompted by the earlier "search must-have mobile gestures" request. New shared `frontend/components/spaces/SwipeBackView.tsx`: wraps a page's content in a `Gesture.Pan()` restricted to a 24px left-edge hot-zone (`hitSlop({left:0, width:24})`), so only a swipe starting at the very edge activates it; past 30% of screen width or a fast flick (`velocityX > 800`) it animates off-screen then calls the page's existing `onBack` (never a second/parallel nav path -- always the same callback the visible back-button chevron already uses). Piloted on `HomeTasksPage.tsx` only, matching `SwipeRow`'s own pilot-then-roll-out precedent.

qa-lead source-traced (not just read) `react-native-gesture-handler`'s web handler (`checkHitSlop()` in `GestureHandler.ts`) and confirmed hitSlop genuinely gates gesture activation at the BEGAN-state level, not just a looser touch-capture concept -- the actual runtime path this app uses being react-native-web. Confirmed no realistic conflict with `SwipeRow`'s row-level `Swipeable` (classic-API, different gesture system) on this page. Confirmed `runOnJS(onBack)` firing only after the `withTiming` completion's `finished` flag can't double-fire or crash on interruption/unmount (onBack -> `setTasksPageVisible(false)` is idempotent; React 19 no-ops a late setState on an unmounted component). Confirmed `onBack` wiring in `HomeDashboard.tsx` is the correct toggle, not stale. tsc/bundle both clean.

**Real design note from qa-lead, not a bug in what shipped:** the reason this pilot has zero row-swipe conflict is that `HomeTasksPage`'s `ScrollView` padding (`spacing.xl`) and `SwipeBackView`'s `EDGE_WIDTH` both happen to be 24px -- a coincidence, not an enforced relationship. Before rolling `SwipeBackView` out to other pages (the roadmap's next sub-step), check each page's own horizontal padding first; a page with less/no padding around its swipeable rows could let a touch near the edge ambiguously start both gestures. `[from: qa-lead verification of feat/swipe-back-navigation]`

**Noticed in passing by qa-lead, not fixed:** `[id].tsx`'s `load()` has several leftover debug `console.log`s (space id/type/slug/kind/name/icon) that fire on every load -- pre-existing, unrelated to this fix.

### Swipe-back rolled out to every remaining sub-page (2026-09-29)

Second half of the roadmap's step 1: the same `SwipeBackView` wrap applied to the 14 other pages that have their own `onBack` -- Home's Supplies/Spend/Archive/Recurring-warnings/CategoryPage, all 5 of Car's sub-pages (Expenses, History, Docs, Archive, Current list), Expenses' own detail page, and Grocery's Recipes/Shopping-list/Smart-list pages. `GroceryListsPage.tsx` deliberately skipped -- it's `@deprecated`/orphaned (unreachable, superseded by `GroceryDashboard`'s own tab row), same reasoning that already excluded `HomeTaskArchivePage.tsx`/`HomeMaintenanceArchivePage.tsx` from the earlier card-background pass.

qa-lead verified all 14 diffs individually: every `onBack` passed to `SwipeBackView` is the exact same prop the page's own visible back button already calls, no unbalanced JSX (also empirically proven by a clean tsc/bundle compile), and -- the one real risk for this batch -- none of the 3 Fragment-shaped pages (`GroceryRecipesPage`, `GrocerySmartListPage`, `HomeCategoryPage`, each a ScrollView plus a trailing Modal/sheet sibling) accidentally pulled their modal inside the new gesture wrapper. Also re-confirmed the HomeTasksPage pilot's "EDGE_WIDTH happens to equal spacing.xl (both 24px)" non-conflict coincidence still holds for `HomeCategoryPage.tsx` specifically, the one newly-wrapped page that also renders `SwipeRow`-swipeable rows (via `HomeCategorySection`). Spot-checked `onBack` semantics on 3 pages with less obvious wiring (`CarCurrentListPage`, `GrocerySmartListPage` -- whose `handleAddToList` also calls `onBack()` directly and unrelatedly on success, confirmed no interference with the gesture's own `onBack` call -- and `HomeCategoryPage`, reused across 5 different category configs).

**Worth knowing for future editors, not a bug:** `GroceryShoppingListPage.tsx`'s `GroceryProductModal` ended up nested inside `<SwipeBackView>` rather than as a sibling (it was already nested inside the plain `<View>` this diff swapped 1:1). qa-lead traced this isn't actually a problem -- RN's `Modal` (and every sheet/modal component in this app that's built on it) renders via a detached portal (`react-native-web`'s `ModalPortal.js` on web; native `Modal` similarly escapes its JSX parent), so it never visually rides `SwipeBackView`'s `translateX` transform regardless of where it's nested in the tree. `[from: qa-lead verification of feat/swipe-back-rollout]`

### Minimum touch targets (44x44pt) fixed app-wide via hitSlop (2026-09-30)

Step 2 of the user's mobile-UX roadmap. A read-only audit agent found 43 interactive controls under the 44pt bar across 22 files (mostly small icon-only buttons, category-tab pills, and chip grids that already existed at their current visual size). Fixed every one by adding or increasing `hitSlop` rather than resizing anything visually -- keeps the existing compact "hairline flat" design untouched while making each control legally/practically tappable. Dead/orphaned files (`HomeTaskArchivePage.tsx`, `HomeMaintenanceArchivePage.tsx`, `GroceryListsPage.tsx`, `GroceryHeader.tsx`) were excluded, same precedent as prior passes.

**Caught and fixed a self-inflicted bug via a 2-round qa-lead cycle:** the first implementation used uniform or asymmetric hitSlop on a handful of sites without checking each one's real gap to its nearest tappable neighbor. qa-lead's first pass found 4 genuine overlaps this created: `CarDashboard.tsx`'s Docs/Archive/History pill and `HomeArchivePage.tsx`'s History tabs are separated only by a 1px hairline divider (effectively zero real gap), so a `{left:4,right:4}` hitSlop reached ~3-3.5px into the neighboring pill's own box; `CarCurrentListPage.tsx`/`CarHistoryPage.tsx`'s category-tab rows and `CarExpensesPage.tsx`/`CarHistoryPage.tsx`'s weeks/months toggle used a uniform `hitSlop={6}` against only an 8px row `gap`, encroaching ~2px into each neighbor (the weeks/months toggle was also separately still 2px short of 44pt). Root cause: every one of these controls only ever had a HEIGHT deficiency (width was already fine), so the fix was switching to vertical-only `{top, bottom}` hitSlop objects, dropping the horizontal component to zero rather than trying to tune it down to fit each gap. A second qa-lead pass independently recomputed all 8 sites (both the zero-horizontal-encroachment claim and that vertical clearance still reaches >=44px) and confirmed the fix, plus spot-checked the highest-risk-looking sites among the other ~35 fixes (found none of the same pattern).

qa-lead's second pass flagged one broader "final sweep" item as not fully exhaustive -- a background sub-agent it dispatched to systematically re-check the other ~35 sites for the same gap-vs-hitSlop overlap pattern didn't report back before it had to hand back its own results; qa-lead's own manual spot-checks of the highest-risk candidates among those 35 found nothing, and I independently checked the one remaining site with a notably large hitSlop value (`HomeHeader.tsx`'s History pill, `hitSlop={10}`) and confirmed it sits alone with no nearby sibling Pressable.

**Update:** that deferred sweep agent did eventually report back (after this entry was first written) and found 3 more real overlaps missed by both prior rounds -- see "Row-delete trash icon..." entry below, now also fixed and merged. With that fix in, the sweep is complete and every one of the 43 original sites (plus these 3 pre-existing-hitSlop ones the original 44pt audit correctly skipped since they already cleared the bar on paper) has been checked for adjacency overlap, not just size. `[from: qa-lead verification of feat/min-touch-targets, rounds 1-2]`

### Row-delete trash icon hitSlop overlapped its own row's tap area (2026-09-30)

Found by the deferred background sweep from the entry above, after it finally reported back. `HomeCategorySection.tsx` and both `HomeTasksPage.tsx` row variants (`TaskRowCard`, `UpcomingRow`) had a PRE-EXISTING uniform `hitSlop={14}` on the row-delete trash icon (already there before the touch-target pass, which is why the 44pt audit correctly left it alone -- 16px icon + 14+14 already clears 44) -- but at 14px it reached 2px past the row's `gap: spacing.md` (12px, confirmed against `lib/theme.tsx`'s real token) into the neighboring `flex:1` row-open Pressable immediately to its left. Since the delete icon is always the rightmost element with nothing to its right, fixed asymmetrically: kept top/bottom/right at 14 (no neighbor there), tightened left to 8 (4px clear of the 12px gap). qa-lead independently confirmed the gap value against the shared `spacing` token (not assumed), confirmed all 3 sites are structurally identical (last child of a row, `flex:1` sibling to the left), and confirmed vertical touch-target size (44px) is unaffected -- an asymmetric hitSlop is fine per Apple/Google's own guidance, which measures total reachable area, not a required symmetric box. tsc/bundle both clean.

### Drag-to-reorder Space cards on the Spaces tab (2026-09-30)

First of 3 explicit user-requested drag-reorder pieces -- Space cards now, list items/tasks within a space next, the dashboard's own layout after that. User's own framing: "Orice element din aplicație... să poată să fie draggable și mutat oriunde în secțiunea sa."

Backend: new nullable `spaces.sort_order` column; `SpaceController::index()` orders manually-positioned spaces first (by `sort_order`), everything never reordered falls back to the pre-existing `->latest()` behavior; new `PATCH /api/spaces/reorder` takes the full ordered id list and assigns sequential positions, silently dropping any id the requesting user can't actually access (`Space::accessibleBy`) rather than erroring the whole call. Deliberately a global column, not per-user -- `space_members` only tracks invited members (the owner has no row there), so there's no existing per-user-preference table this could hang off of without inventing one from scratch.

Frontend: new dependency `react-native-draggable-flatlist` (peer deps already satisfied by the existing gesture-handler/reanimated versions). The Spaces tab's card grid (previously a ScrollView + flexWrap `View` + `.map()`) is now a `DraggableFlatList` in 2-column grid mode -- long-press a card (the library's own `onLongPress={drag}` pattern) to pick it up, `ScaleDecorator` gives it a lift animation, dropping calls the new endpoint with an optimistic update that reverts on failure (same snapshot-then-revert shape as every other save flow in this app). The "+ Add Space" tile moved to `ListHeaderComponent` -- always first, never itself draggable, at the cost of no longer being interleaved into the same row as the first real card.

qa-lead live-verified the endpoint against real throwaway users/spaces (not just tinker): normal reorder applies correctly, a foreign/inaccessible id mixed into the order array is dropped without corrupting the rest of the sequence or consuming a position, a never-reordered space correctly sorts after every manually-ordered one, a non-member's reorder attempt on someone else's spaces is a true silent no-op (not a 403/500, not a partial mutation), and the `PATCH .../reorder` route doesn't collide with `PUT /spaces/{id}` (confirmed empirically, not just by inspection). Frontend wiring (data/keyExtractor/renderItem/onDragEnd, `disabled={isActive}` guarding against a stray post-drag navigation, both icon buttons' `event.stopPropagation()`) all read correctly against a full file read. tsc/bundle/backend-suite all clean.

**Known limitation, explicitly not asserted as verified:** real on-device long-press-and-drag touch feel can't be checked headlessly in this environment -- the `onLongPress={drag}`/`ScaleDecorator`/`disabled={isActive}` wiring matches the library's own documented pattern exactly, so it's PLAUSIBLE, not CONFIRMED. Worth a real-device pass whenever the user tries it.

**Separately found and logged (not this feature's bug):** `spaces.created_at`'s 1-second precision makes the pre-existing `->latest()` fallback order undefined for same-second creates -- see the entry above this one. `[from: qa-lead verification of feat/drag-reorder-spaces]`

### Drag-to-reorder list items, piloted on Home Tasks' ALL section (2026-09-30)

Second of 3 user-requested drag-reorder pieces. Backend is generic and reusable by every space's every list, built once: new nullable `items.sort_order`, new `PATCH /api/items/reorder` reusing `ItemController`'s own existing `canAccessItem()` per-item gate (already correctly handles grocery's list-membership case, not just the plain space-level rule) rather than inventing a separate check, silently dropping any id that fails it. Registered BEFORE `Route::apiResource('items', ...)` -- that macro's own `PATCH /items/{item}` would otherwise swallow "reorder" as the `{item}` parameter, since Laravel matches route registration order, not specificity (this exact class of bug was caught by writing the route correctly the first time, informed by the Space-reorder precedent, but qa-lead still independently re-verified it empirically rather than trusting the reasoning).

Frontend pilot: Home Tasks' ALL section is now a `NestableDraggableFlatList` inside a `NestableScrollContainer` (the library's own answer to "one draggable list embedded in an otherwise-static scrollable page" -- this page also has a header, Restanțe, DUE SOON and RECENT around the ALL list). Long-pressing a row (`onLongPress={drag}` on the same Pressable that already opens it for edit, `disabled={isActive}` guarding against a stray edit-open right after drop -- same pattern as the Spaces-tab cards) picks it up; dropping threads through a new `onReorder` prop across 3 levels (`HomeTasksPage` -> `HomeDashboard` -> `app/(tabs)/[id].tsx`, which owns `homeData` and does the actual optimistic-update-with-revert, matching every other save handler there). `getHomeTasksView`'s `upcoming` sort now splits manually-ordered rows (shown first, by `sortOrder`) from everything never dragged (falls back to the pre-existing due-date sort, shown after) -- same "manual order first, old fallback after" split `SpaceController::index()` already uses server-side for Spaces.

qa-lead live-verified the backend against real throwaway users, including the trickier grocery path specifically (a `grocery_item`'s reorder correctly deferred through `canAccessList`'s list-membership check, confirmed both a member succeeding and, after removal, the same member silently failing), confirmed the route-collision fix empirically (PATCH hits `reorder()`, PUT falls through to `update()` and 404s), and confirmed the full frontend prop-threading and optimistic-revert pattern by direct code read.

**Found and fixed via qa-lead, not shipped as a known gap:** the first pass flagged a genuinely new gesture combination -- `UpcomingRow` nests `onLongPress={drag}` (drag-reorder) inside `SwipeRow`'s `Swipeable` (resolve/delete swipe), and `Swipeable` had no activation-distance tuning at all, defaulting to react-native-gesture-handler's own 10px threshold -- well inside normal hand jitter over a ~500ms long-press hold, meaning jitter could let `Swipeable` steal and silently cancel a pending drag. Fixed by widening `SwipeRow`'s `dragOffsetFromLeftEdge`/`dragOffsetFromRightEdge` to 20px (shared component, so every current and future `SwipeRow`-wrapped row gets this, not just this pilot). A second qa-lead pass independently re-derived the prop's real effect from the installed `react-native-gesture-handler` source (not just trusted the reasoning), confirmed it meaningfully narrows the jitter-vs-long-press race without perceptibly affecting the existing swipe UX (`TRIGGER_DISTANCE` is ~100px, so a 10px-to-20px deadzone change is negligible against that), and confirmed today's real-world blast radius is Home-only (`SwipeRow` is currently used on exactly 3 call sites, all in Home -- `HomeTasksPage.tsx`'s 2 and `HomeCategorySection.tsx`'s 1 -- despite its own doc comment describing it as already "shared across every Space," which is aspirational/future-facing, not yet true).

**Known limitation, honestly not overclaimed:** the widened threshold is a well-reasoned, source-verified narrowing of the jitter-vs-long-press race, not an on-device-proven fix -- both qa-lead passes were explicit that only real touch input on a real device can fully settle whether this combination (long-press-to-drag nested inside a swipeable row) is reliable in practice. Worth a deliberate on-device smoke test (several repeated long-presses) before rolling this same nested pattern out to any other list. `[from: qa-lead verification of feat/drag-reorder-home-tasks, both rounds]`

### Home Restanțe card, per-tile urgency dots, swipe-back rework (2026-10-04)

Uncommitted work left on `main` from the 2026-09-30 evening session, moved onto `feat/home-restante-urgency` for verification before landing. New `HomeRestanteCard` on Home's main page (4 zile / 2 zile / Azi / Restant columns, zero tiers hidden, whole card hidden when nothing is due), opening the warnings page; per-tile urgency tier dots on Task-uri / Mentenanță / Recurente sharing `recurringWarningTierColor`; DUE SOON window widened to 10 days. `SwipeBackView` rewritten on classic `PanGestureHandler` + RN `Animated` (the reanimated worklet version didn't fire in Expo Go), edge strip widened to 32px, and rolled out to the Car/Expenses/Grocery dashboards. Spaces grid uses a fixed-pixel card width (percent widths collapsed inside `DraggableFlatList`). Expenses' `initialExpensesData` no longer seeds fake entries. Larger rewrites in `HomeTaskForm`, `ExpenseEditModal`, `HomeSupplyRestockSheet`, `HomeCategoryPage`, `HomeRecurringWarningsPage`. Adds the `@expo/ngrok` devDependency.

qa-lead's first pass found that swiping right on a recurring Maintenance row in NEXT did nothing: `HomeDashboard`'s main page set state for `HomeMaintenanceResolveSheet` but never rendered it. It also found white count text on the caution-yellow tier dot (~1.4:1 contrast) and stale doc references. All three were fixed in a follow-up commit: the sheet is now rendered on the main page, the Restanțe card clears sub-views before opening the warnings page, and dot text picks black or white by contrast. qa-lead's second pass re-traced everything with no new defects. tsc showed only the 4 known template-file errors, and the bundle returned 200.

**Still owed:** device-only checks (swipe-back edge strip, drag-to-dismiss on the 4 new sheets, the iOS sibling-Modal date picker in `HomeCategoryPage`). These are logged in "Found along the way" above and weren't treated as blockers. `[from: qa-lead verification of feat/home-restante-urgency, both rounds]`
