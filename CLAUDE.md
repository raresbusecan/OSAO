# orgOS — root map

Personal life-organization app. React Native/Expo frontend (`frontend/`,
served on port 443) talks to a Laravel API backend (`backend/`, port
8000). Both are usually exposed to a phone via Cloudflare quick
tunnels — the tunnel URLs change every restart, so if the app can't
reach the backend, check `frontend/.env`'s `EXPO_PUBLIC_BACKEND_URL`
against whatever the current tunnel actually prints.

For the detailed map of each half, read:
- **`frontend/CLAUDE.md`** — screens, per-Space file map, shared
  frontend systems, conventions.
- **`backend/CLAUDE.md`** — controllers, the `items` table's type
  system, routes.

Read those before searching blind — they exist specifically to save a
round of `grep`/`Glob` exploration.

## The core model, in one paragraph

Four "Spaces" — **Car, Home, Grocery, Expenses** — are the whole
product. There is no dedicated table per Space; almost everything is
one polymorphic `items` row with a `type` string column (`car_fuel`,
`home_task`, `grocery_list`, `expense_item`, `custom_event`, ...).
`spaces` has its own `type` column (`car`/`home`/`grocery`/`expenses`)
set once at creation — the frontend's `detectSpaceType()` reads that
first, with older/legacy fallbacks after it. Calendar and Budget are
**not** their own data — they're two more views over the same `items`
table (Calendar via due_at + a recurrence projector; Budget via
`Item::SPENDING_TYPES`/`RECURRING_TYPE_SPACE`). Changing what counts
as "spend" or "actionable" means editing the constants in
`backend/app/Models/Item.php`, not a per-Space file.

## Status (verify before trusting anything stale)

**`PLAN.md`, `frontend.md`, and `backendDB.md` at the repo root are
historical planning documents and are known to be OUT OF DATE** — e.g.
`PLAN.md` still describes Home as a bare generic shell and Expenses as
unpersisted mock data; both are now fully built, persisted Spaces with
their own dedicated pages/forms. Don't take either doc's "current
status" table at face value — check the actual code (or
`frontend/CLAUDE.md`'s file map) instead. `BACKLOG.md` (small,
non-urgent ideas) is still fine to skim.

All 4 Spaces (Car, Home, Grocery, Expenses) are fully built and
persisted via the generic Items API. Theme is the flat "hairline"
style (fill→border, see `frontend/CLAUDE.md`) applied across every
screen. A full functional + dead-code audit was run 2026-09 — see the
"Audit orgOS" artifact from that session, or re-derive: most findings
haven't been fixed yet (e.g. `nextTaskOccurrence`'s month-rollover
bug, `calendar.tsx`'s UTC/local date mismatch, the IDOR on
`ItemController::update`).

## Dev environment

- Backend: `cd backend && php artisan serve --host=0.0.0.0 --port=8000`
- Frontend: `cd frontend && npx expo start --port 443 --clear`
- Tunnels: `cloudflared tunnel --url http://127.0.0.1:8000` (backend) and
  `...:443` (frontend) — each run prints a fresh `*.trycloudflare.com`
  URL; the backend one goes in `frontend/.env`.
- Verify the frontend bundle compiles without opening a browser:
  `curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:443/node_modules/expo-router/entry.bundle?platform=web&dev=true&hot=false&lazy=true&transform.routerRoot=app&transform.reactCompiler=true"` — expect `200`.
- DB is MySQL (`backend/.env`: `DB_CONNECTION=mysql`, `DB_DATABASE=lifeos`).
  Inspect it directly with `php artisan tinker --execute="..."` rather
  than guessing from seeders — `DatabaseSeeder.php` and `backendDB.md`
  both predate a lot of the real schema.

## Release workflow (`main` = live, no staging server yet)

There's no separate staging environment — `main` is what actually runs
on the user's phone day to day. New work happens on a branch; nothing
merges to `main` without `qa-lead` having verified it first, gated by
`release-lead`. If this ever grows into EAS Update channels or real
app-store releases, that's a deliberate future upgrade, not the
default — don't assume it exists.

## Found something unrelated to your task?

Log it in `BACKLOG.md`'s "Found along the way" section instead of
silently fixing it (scope creep) or silently ignoring it (lost work).
Tag it `[from: <task/context>]` so there's a trail. Only fix it inline
if it's a one-line, obviously-safe change directly touching a file
you're already editing for the actual task — anything bigger goes in
the backlog for its own pass.

## Conventions worth knowing before you touch code

- **IDs are always strings on the frontend.** Every `entry.id` in
  `lib/spaces/*/*.ts` mapping functions is `String(item.id)`. Compare
  as strings; a `.find(e => e.id === someNumber)` silently fails.
- **Never use `Alert.alert`/`window.confirm` for anything.** They're
  effective no-ops on web in this app's setup. Use `confirmAction`/
  `notifyAction` from `frontend/lib/confirm.ts` (backed by
  `lib/confirmHost.tsx`'s own in-app modal) everywhere, always.
- **Dead code exists — check before extending a file.** A component
  with zero real (non-comment) importers is dead in this codebase more
  often than you'd expect (leftover Expo template files, superseded
  rewrites never deleted). Verify with
  `grep -rn "^import.*\bName\b|from.*Name['\"]" --include="*.tsx" .`
  before assuming a file is live. See `frontend/CLAUDE.md` for the
  known list.
