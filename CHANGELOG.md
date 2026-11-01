# Changelog

What landed on `main` (= what runs on the phone day to day), newest first.
One entry per merge, written when `main` moves. Details live in the
commits; open follow-ups live in `BACKLOG.md`.

## 2026-11-02 — Resolving from Acasă shows only the form, over Acasă

Fast-forward of `main` from `45849c6` to `feat/resolve-over-dashboard` (6
commits, `bb78bab`..`999ce83`). QA: qa-lead, three passes — CONDITIONAL PASS
(load-failure dead end), PASS on `418ddf8` with one non-blocking defect, then
PASS on the one-line fix `999ce83` for the whole branch (tsc clean, frontend
tests 132/132); gated by release-lead. A stuck-Acasă bug found by on-device
tracing was fixed; the user confirmed it works on the iPhone.

**Changes**
- Resolve from Acasă/De făcut: `todoHref(item, "resolve")`
  (`lib/navigation/recordAction.tsx`) adds `&overlay=1`.
- `app/record-action.tsx` is a transparentModal with no animation
  (`app/_layout.tsx`). It mounts the Space page invisibly so only its
  Sheets/dialogs show, and dims the origin while it waits. It always ends one
  of these ways: leave after the form closes; leave with a notice if the load
  fails or takes more than 10 s; or reveal the page in place with an
  "Înapoi" pill. Leaving waits until no Sheet or dialog is open, then 50 ms.
  The load-failure notice runs on a plain timer so the screen's unmount
  doesn't cancel it.
- `lib/dialogCoordinator.ts` and `components/ui/Sheet.tsx` report open
  dialogs/Sheets; `TodoCarouselSheet.tsx` resumes 200 ms after a blur.
- `app/(tabs)/[id].tsx` loads once on first focus and fetches items in
  parallel with the space.
- `lib/dashboard/spaceDue.ts`, `frontend/CLAUDE.md` updated; new test
  `frontend/tests/resolve-overlay.test.cjs`, three existing tests adjusted.
- `BACKLOG.md`: new section on performance and store-build fluidity
  (`36260e6`, docs only).

**Still needs a phone check** — an offline resolve shows the notice; where
the "Înapoi" pill sits on a revealed page; taps on Acasă are ignored for about
1.5 s after a form that closes without calling cancel.

## 2026-11-02 — "Bani fără vină" only where spending can be guilt-free

Fast-forward of `main` from `4a2401d` to `feat/guilt-free-where-it-fits` (4
commits, `7323814`..`8587d0b`). QA: qa-lead, three passes, final PASS on
`8587d0b` for the whole branch (tsc clean, frontend tests 129/129, iOS bundle
200); gated by release-lead. Scope decided by the user.

**Changes**
- `GuiltFreeToggle` (`components/dashboard/GuiltFree.tsx`) takes a new
  `onlyIfSet` prop: the toggle shows only for a record that is already
  flagged, so the flag can still be undone. Once shown in a form it stays for
  the rest of that edit (latched, so a flag that loads after the first render
  still counts).
- Kept as before on general/car expenses, purchases, finished shopping and
  Calendar purchases.
- `onlyIfSet` on car fuel, services and documents (`CarFuelForm.tsx`,
  `CarMaintenanceForm.tsx`, `CarDocumentForm.tsx`) and on Casă bills and
  maintenance (`homeCategoryConfig.ts` `GUILT_FREE_IF_SET`, passed through
  by `HomeCategoryPage.tsx`).
- Help text (`lib/help.ts`) lists where the toggle shows and says it can be
  unticked on an already flagged record; `frontend/CLAUDE.md` updated.
- New test `frontend/tests/guilt-free-toggle.test.cjs`.

**Still needs a phone check** — switching the flag off and back on in an
`onlyIfSet` form, and a small fold/unfold edge in `CarFuelForm`.

## 2026-11-01 — Profile button and one fixed header on every tab

Fast-forward of `main` from `973012b` to `feat/profile-button-tabs` (5 commits,
`1c1927c`..`c700b95`). QA: qa-lead, three passes — PASS on `37a25b9` (tsc
clean, frontend tests 126/126, iOS bundle 200), then PASS on the 2-line nit
fix `c700b95` (tsc clean, 126/126); gated by release-lead. Checked by the user
on the phone.

**Changes**
- New `components/navigation/ProfileButton.tsx`, shown last in the header of
  every main tab.
- New `components/navigation/TabHeader.tsx`: `TabScreen` (safe area,
  background, header fixed above the scroll) and `TabHeader` (date line,
  title + info, the tab's own actions, profile button). Tabs pass only their
  buttons, so the header sits in the same place on every tab. Used by Acasă,
  Spații, Calendar, Buget (root page only) and the Simplu Acasă and Calendar
  screens (`home.tsx`, `spaces.tsx`, `calendar.tsx`, `budget.tsx`,
  `SimpleHome.tsx`, `SimpleCalendar.tsx`).
- Calendar titles drop the year; a different year shows as "Anul 2027" in the
  small line. The grid's accessibility label still includes the year.
- Spații loading spinner keeps its 12px gap under the fixed header.
- Tour copy (`lib/tours.ts`) and `frontend/CLAUDE.md` updated.

**Still needs a phone check** — Calendar at the "Maxim" text size on
360–375dp phones (some long months get cut off), the first card's shadow edge
on the Simplu screens, and the screen reader reading the new calendar label.

## 2026-11-01 — Calendar: next 3 months as mini calendars

Fast-forward of `main` from `be8bee6` to `feat/month-minicalendar` (2 commits,
`5c58598`..`0c60093`). QA: qa-lead, two passes, final on `0c60093` — tsc
clean, frontend tests 126/126, iOS bundle 200; gated by release-lead. Design
picked by the user from a mockup and checked on the phone.

**Changes**
- Calendar's "Următoarele 3 luni" cards are mini calendars instead of the
  animated liquid bubbles: one cell per day in the big grid's heat shade,
  empty days drawn as outlines, today ringed, the month's status word under
  the grid (`app/(tabs)/calendar.tsx`).
- Help and tour copy updated to match (`lib/help.ts`, `lib/tours.ts`);
  `frontend/CLAUDE.md` and `BACKLOG.md` updated.

**Still needs a phone check** — level-1 days in the dark themes (Grafit,
Miez de noapte), and the status text at the largest text size.

## 2026-11-01 — Backlog batch 1

Fast-forward of `main` from `1268195` to `fix/backlog-batch-1` (5 commits,
`74138c0`..`9b7969c`). QA: qa-lead, two passes, final on `9b7969c` — tsc
clean, frontend tests 126/126, iOS bundle 200, 0 require cycles (main had 2);
gated by release-lead.

**Fixes**
- Dev request/setToken logs no longer print any part of the auth token
  (`lib/api.ts`).
- Car documents: days-until uses calendar-day math (fixes a DST off-by-one);
  the documents page hides superseded/archived docs and uses the same colours
  as the dashboard (`dashboard.calculations.ts`, `CarDocsPage.tsx`).
- Month pager ignores a second tap during the slide-out (`MonthSwipe.tsx`).
- Grocery quantities accept Romanian numbers via `parseLocaleNumber`
  (`GroceryDashboard.tsx`, `SimpleGrocerySpace.tsx`).
- Pills are visible inside Sheets (`primitives.tsx`).
- Car expense form: inline error when there is no title or category; the
  category is used as the title when the title is empty (`CarExpenseForm.tsx`).

**Internal**
- `REFRESH_EVENT` is imported from `lib/refresh` everywhere; Car's `RecentRow`
  moved to `CarRecentRow.tsx` — both require cycles are gone.
- Test harness defines `__DEV__`; test mock fixes.

**Still needs a phone check** — in-sheet pills in all four themes, and how a
double tap on the month pager feels.

## 2026-11-01 — Expo SDK 58, themes and appearance

Fast-forward of `main` from `7f9c257` to `feat/themes` (44 commits:
`codex/expo-sdk-58` + the appearance work). QA: qa-lead on both branches
(feat/themes re-verified after fixes; SDK 58: frontend tests 126/126,
backend 136/136); gated by release-lead. Accepted by the user under the
dead-code policy: `2a804f4` (type-only fixes in unused Expo template files).

**Platform**
- Expo SDK 58 (React Native 0.88, React 19).
- The IBM Plex font and global text settings apply on phones again — the
  global Text patch had been a silent no-op since the SDK 58 upgrade.

**Appearance (Settings)**
- Temă: Grafit, Hârtie (default), Miez de noapte, Nisip. The app no longer
  follows the phone's light/dark setting.
- Aspect: card style (Bombat, Transparență, Liquid), corner roundness,
  density, background (Simplu / Gradient / Pete + intensity), text size,
  button shape and style, built-in and saved styles.
- Culori: background palette (După Spațiu, Ocean, Apus, Pădure, Lavandă,
  Nisip).

**Fixes from the 2026-10-30 first-user sweep**
- Romanian number input ("1.250,50", "124.580"), event clock times, monthly
  Casă bills no longer lose a day, car-document renewal date, Romanian
  network errors, a typed expense is kept when saving fails, tour overlay
  crash on web, Home card reorder overlap, car alerts open in renewal mode,
  social login providers recheck.

**Backend / data**
- Demo seeders refuse the live `lifeos` database; the demo accounts that
  were in it were deleted.

**Still needs a phone check** — see BACKLOG.md, "qa-lead pass on
codex/expo-sdk-58 + feat/themes (2026-11-01)".
