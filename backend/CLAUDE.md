# backend map

See `../CLAUDE.md` first. Laravel API, Sanctum auth. Almost everything
is one polymorphic `items` table — read `app/Models/Item.php`'s own
doc comments before touching anything budget/dashboard/calendar
related, they're extensive and current.

## Controllers (`app/Http/Controllers/Api/`)

- `AuthController.php` — register/login/logout/user. **Login/register
  have no throttle middleware** (known issue, not yet fixed).
- `SpaceController.php` — CRUD on `spaces`, car-profile/home-profile
  sub-updates, space membership (`members`/`addMember`/`removeMember`).
- `ItemController.php` — the workhorse. `index`/`store`/`show`/
  `update`/`destroy` (apiResource) + `myGrocery` (cross-space grocery
  lists visible to the user) + item-level `members`. **Known issues:**
  `update`'s grocery-list ownership check reads the item's *pre-update*
  type, not the incoming one — lets a space member retype someone
  else's item into `grocery_list`/`grocery_item`, bypassing `store()`'s
  owner-only creation rule (IDOR, not yet fixed). `index` without
  `space_id` filters by `user_id` only, unlike `show`/`update`/
  `destroy` (space-accessible) — a shared space's other-member items
  don't show up in the generic list. `type` is validated as
  `required|string|max:30` only, no enum — nothing stops a value
  outside `Item::ACTIONABLE_TYPES`/`SPENDING_TYPES` or colliding with a
  reserved type string.
- `DashboardController.php` — "De făcut" (overdue/today/upcoming),
  scoped by `Item::ACTIONABLE_TYPES`/`RECURRING_ACTIONABLE_TYPES`.
  Filters strictly by `user_id` — unlike `CalendarController`'s
  `Item::scopeVisibleTo` (owner OR space member), so a co-member's item
  in a shared space never appears here (known inconsistency).
- `CalendarController.php` — month grid data + recurring projection
  (delegates to `app/Services/RecurrenceProjector.php`). Uses
  `Item::visibleTo($user)`, the more permissive scope.
- `BudgetController.php` — per-category spend/limits, savings goal,
  monthly archive/rollover. Reads `Item::SPENDING_TYPES`/
  `SPENDING_TYPE_SPACE`/`RECURRING_TYPE_SPACE`. Also `user_id`-only
  scoped (same gap as Dashboard). Known perf: ~30+ separate queries per
  request (not classic N+1, but scales linearly-ish with label count ×
  months) — fine for now, revisit if it gets slow.
- `RecipeController.php`, `IngredientReferenceController.php` —
  Grocery's recipe-matching data.
- `QuickAddController.php` — natural-language parse endpoint. Note:
  the frontend's own Quick Add sheet that would call this is
  unreachable UI (see `frontend/CLAUDE.md`), so this endpoint currently
  has no live caller.

## `app/Models/Item.php` — the type system (read the file, this is a summary)

`type` is a free string column. The constants that give it meaning:
- `ACTIONABLE_TYPES` = `home_task`, `home_recurring`, `car_document`,
  `custom_event` — what Dashboard's "De făcut" surfaces.
- `RECURRING_ACTIONABLE_TYPES` = above + `home_maintenance` (only
  queried where `recurrence` is set — a one-off maintenance visit
  isn't actionable, a recurring one is).
- `SPENDING_TYPES` = everything with a real `amount`: `car_fuel`,
  `car_maintenance`, `car_document`, `car_expense`, `home_expense`,
  `home_maintenance`, `home_task` (only once resolved as a purchase),
  `grocery_trip`, `expense_item`, `custom_event` (only if its "implică
  o cumpărare" toggle was on). `home_recurring` is deliberately
  excluded — it's summed separately via `RECURRING_TYPE_SPACE` as a
  flat monthly-equivalent, not a due_at-dated transaction.
- `SPENDING_TYPE_SPACE` / `RECURRING_TYPE_SPACE` — which Space label/
  icon a type rolls up under, for Budget/Dashboard grouped totals.
- Grocery adds two more types outside this file's constants:
  `grocery_list`, `grocery_item` — handled directly in
  `ItemController`, not through the Item model constants above.

`RecurrenceProjector.php` (`app/Services/`): `occurrencesBetween`'s
fast-forward loop and its enumeration loop share one iteration counter
(cap 600) — a very old recurring item can burn most of the budget just
fast-forwarding to the present, truncating the requested month's real
enumeration (known bug, not yet fixed).

## Routes (`routes/api.php`)

Public: `POST /register`, `POST /login`. Everything else behind
`auth:sanctum`: `/dashboard`, `/calendar`, `/budget*`, `/spaces*`
(+ car-profile/home-profile/members sub-routes), `/grocery/mine`,
`apiResource('items', ...)` + `/items/{id}/members*`,
`apiResource('recipes', ...)`, `/ingredient-references`, `/quick-add`.

## Schema notes

MySQL (`DB_DATABASE=lifeos`). `spaces.type` is a real column (added
2026-09, migration `2026_09_20_201444_add_type_to_spaces_table.php`) —
set once at creation, never editable via update; `detectSpaceType()`
on the frontend reads it first. `items` has indexes on
`(user_id,type)`, `(user_id,status)`, `(user_id,due_at)`,
`(space_id,type)` — none on `recurrence`, despite it being scanned by
Dashboard/Calendar/Budget (known perf gap). `backendDB.md` at the repo
root is an early design-notes doc (UUID vs bigint musing, an RBAC
schema that only partially matches what's actually implemented) — 
don't treat it as current schema documentation, check migrations or
query the DB directly instead.
