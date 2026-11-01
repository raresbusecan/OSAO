# Changelog

What landed on `main` (= what runs on the phone day to day), newest first.
One entry per merge, written when `main` moves. Details live in the
commits; open follow-ups live in `BACKLOG.md`.

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
