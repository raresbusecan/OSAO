# Changelog

What landed on `main` (= what runs on the phone day to day), newest first.
One entry per merge, written when `main` moves. Details live in the
commits; open follow-ups live in `BACKLOG.md`.

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
