> **Superseded (2026-10):** the app moved to a layered, dark-first redesign
> (filled cards, identity colors, IBM Plex Sans). The rules live in
> `frontend/CLAUDE.md` → "Theme (2026-10 redesign)". This file is kept only
> as history of the earlier hairline direction.

# Design reference — how to make orgOS feel more modern

Written after the user compared orgOS's look to other apps and felt it
came up short. **This is a calibration reference for incremental
polish, not a redesign brief.** orgOS's current flat "hairline" style
(see below) is already close to what these reference apps do — the
gap is mostly in a handful of concrete, measurable details, not the
overall direction. Don't restyle screens wholesale from this file;
use it to judge specific choices (a weight, a radius, a spacing value)
against real precedent when touching a screen for another reason, or
when doing a scoped polish pass the user has explicitly asked for.

## Reference apps (real, current, well-regarded — 2026)

Pulled from real design-token extractions, not screenshots described
from memory — each one is genuinely close to orgOS's own domain
(productivity / organization / fintech) and each is consistently
named as one of the best-designed apps in its category right now.

- **[Linear](https://linear.app)** — project management. The clearest
  example of "flat + hairline, no shadows, done well": a 4-step
  charcoal surface ladder, 1px hairline borders as the ONLY depth cue,
  one reserved accent color (lavender), aggressive negative tracking
  on large display type only. Closest match to orgOS's own direction —
  borrow its *discipline*, not its dark-only palette.
- **[Notion](https://notion.so)** — all-in-one workspace. Warm
  minimalism: rectangular 8px buttons (deliberately NOT pills, "a
  sober editorial choice"), pastel tint cards used sparingly for
  category/feature differentiation, body text at weight 400 by
  default. Closest match for "personal organization app that still
  feels warm, not cold/corporate."
- **[Cal.com](https://cal.com)** — scheduling. Near-identical color
  language to orgOS already (`#111111` primary, `#e5e7eb` hairline —
  practically the same values orgOS's own `light` theme already
  uses). Useful as a sanity check that orgOS's existing palette choice
  is sound, not a needed change.
- **[Revolut](https://revolut.com)** — digital banking. The fintech
  reference, relevant for Budget/Expenses screens specifically: strict
  touch-target minimums (48px buttons, 56px text inputs — "fintech-
  grade accessibility"), a hard rule of exactly two dark-surface steps
  and never more, semantic accent colors reserved for illustrations/
  status only, never for buttons.

Full extracted token sets for these (and other apps — Stripe, Wise,
Coinbase, Zapier, Cursor, Raycast, Vercel) live at
[github.com/voltagent/awesome-design-md](https://github.com/voltagent/awesome-design-md)
if a future pass wants another concrete reference point.

## What orgOS already gets right (keep exactly as-is)

Checked against all 4 references above — don't change these, they
already match current best practice:

- **Hairline-border flat style, no drop shadows.** `theme.tsx`'s
  `colors.border`/`borderStrong` + 1px borders on every card is
  exactly Linear/Cal.com/Revolut's own "no shadow language, depth
  through borders and surface tone only" rule. This is the single
  biggest thing to protect — do not introduce shadows/gradients while
  chasing "modern."
- **Spacing scale.** `spacing = { xs:4, sm:8, md:12, lg:16, xl:24,
  2xl:32, 3xl:48 }` is a clean base-4 scale, structurally identical to
  Linear's/Notion's/Cal's own spacing tokens.
- **Border radius scale.** `radius = { sm:6, md:12, lg:20, pill:999 }`
  sits right between Notion's (8/12/16) and Revolut's (8/12/20) —
  no change needed.
- **Monochrome, restrained color use.** `brandPrimary` = near-black/
  near-white with color reserved for semantic states
  (success/caution/warning/error) matches Cal.com's "monochrome
  actions" rule and Revolut's "accent colors for illustrations/status
  only, never buttons" rule almost exactly.
- **Where color gets placed.** Checked by grep, not impression: only 2
  places in the whole `components/spaces/` tree fill a card's entire
  background with a semantic color; the actual pattern used 28 times
  across 26 files is a small tinted icon chip (`${SPACE_IDENTITY_COLORS.x}1A`
  — the color at ~10% opacity, behind a 32-42px icon only). That's
  functionally identical to Notion's own pastel feature-card tints and
  Revolut's "accent colors for illustrations only" rule — color marks
  *what something is*, on a small contained shape, never *how big a
  surface it covers*. Don't lose this discipline chasing "more color."
- **Button shape.** A primary/CTA button is consistently a rounded
  rectangle (`radius.md`/`radius.lg`, filled); pills (`radius.pill`)
  are consistently reserved for tabs, filter chips, badges, and
  circular icon-only buttons (back arrows, close buttons) — never a
  primary action. This is exactly Notion's own explicit rule ("8px
  rectangular buttons, not pills — a sober editorial choice") and
  Cal.com/Revolut's split (pill for nav-pills/badges, rounded-rect for
  real buttons). Already correct; don't introduce pill-shaped primary
  buttons anywhere.

## Two concrete, measurable gaps

Not vague "needs more polish" impressions — both counted directly
against the actual component code, both fixable without touching the
overall direction.

### 1. Cards have no fill — only a border, on the SAME color as the page

Checked by grep across `components/spaces/`: `backgroundColor:
"transparent"` appears **135 times** on what are otherwise styled as
cards (1px `borderColor: colors.border` alongside it, 157 times) —
`colors.surfaceSecondary`/`surfaceTertiary` (the tokens that exist
specifically for this) are used only **58 times combined**. In
practice, most "cards" in the app are the exact same color as the
page behind them, told apart only by a 1px outline — closer to a
wireframe than a real surface.

Every single reference app does the opposite: page background and
card background are always two distinct tones, with the card reading
as its own layer, THEN a hairline border on top of that (not instead
of it):

| App | Page background | Card background |
|---|---|---|
| Linear | `#010102` (canvas) | `#0f1011` (surface-1) + hairline |
| Notion | `#f6f5f4` (surface) | `#ffffff` (card) + hairline |
| Cal.com | `#ffffff` (canvas) | `#f5f5f5` (abstract) / `#ffffff` (product UI) + hairline |
| Revolut | `#f4f4f4` (surface soft) | `#ffffff` (card) + hairline |
| **orgOS (current)** | `colors.surface` | **same `colors.surface`** (transparent) + hairline |

**Concrete, bounded suggestion for a future pass:** orgOS already has
the right tokens sitting unused for this (`colors.surfaceSecondary`/
`surfaceTertiary`) — swap a card's `backgroundColor: "transparent"` to
`colors.surfaceSecondary` (keep the existing hairline border, don't
remove it) wherever a card currently floats on the identical page
color. This is the single change most likely to make the app read as
"designed" rather than "outlined," bigger than the type-weight gap
below. Same caveat as everything else here: touches nearly every
screen, needs the user's go-ahead and a proper branch/qa pass, not a
blind find-and-replace (a nested card-inside-a-card may legitimately
want `surfaceTertiary` one step further, not the same token twice).

### 2. Type weight is heavy everywhere

orgOS's `typography` scale in `theme.tsx`:

```
display:  26px / 800 / -0.5    title:   22px / 800 / -0.4
subtitle: 17px / 800           body:    14.5px / 700
label:    12px / 800 / +0.4    caption: 12px / 500
micro:    11px / 600
```

Every reference app keeps **body text at weight 400**, uses 500-600
for UI/buttons/emphasis, and reserves 600-700 (never 800) even for
large display headlines — weight is spent deliberately, on the
biggest text only, with negative letter-spacing doing the "premium"
work instead of raw boldness:

| App | body weight | display weight | display tracking |
|---|---|---|---|
| Linear | 400 | 600 | -3.0px at 80px |
| Notion | 400 | 600 | -2px at 80px |
| Cal.com | 400 | 600 | -2px at 64px |
| Revolut | 400 | 500 | -2.7px at 136px |
| **orgOS (current)** | **700** | **800** | -0.5px at 26px |

orgOS's body text at weight 700 (heavier than every reference app's
own *headline* weight) is a real, specific reason the app can read as
"loud"/less refined next to these — everything competes for attention
at once instead of a clear hierarchy where only headlines are bold.
orgOS's own negative-tracking direction is already correct, just at a
much smaller scale (proportionally appropriate, since orgOS's display
size is also much smaller than a marketing hero).

**Concrete, bounded suggestion for a future pass** (do not apply
without the user's explicit go-ahead — this touches every screen):
drop `body` to weight 500-600 and `caption`/`micro` stay light,
reserve 800 for `display` only, step `title`/`subtitle` down to
700/600. Test on both light and dark theme before committing — a
lighter weight can read as low-contrast on the dark theme's
`onSurfaceTertiary` grays specifically, worth an explicit check.

## Using this file

- When a design-lead pass (this skill, a subagent, or a manual review)
  is asked to "make X feel more modern," check the change against a
  reference app's *actual token*, not a vague adjective — e.g. "Cal.com
  uses 8px radius + 1px hairline for this exact component type" beats
  "make it feel cleaner."
- Default to the "keep as-is" list above being correct. The burden of
  proof is on a proposed change to cite which reference app does it
  differently and why that's actually a gap, not just novelty.
- Flag anything that would require adding shadows, gradients, a second
  accent color, or pill-shaped buttons where orgOS currently uses
  rectangular ones — those are direction changes, not polish, and need
  the user's explicit sign-off first (see `../CLAUDE.md`'s "Found
  something unrelated to your task?" rule — log it, don't just do it).
