/**
 * Car and Home need real structured fields (make/model/year/price;
 * county/city/ownership/price) that the generic Space model didn't have
 * room for -- now backed by their own tables (car_profiles, home_profiles,
 * 1:1 with spaces, see backend/app/Models/CarProfile.php and
 * HomeProfile.php). The database is the source of truth: `api.getSpace`/
 * `api.listSpaces` eager-load both relations, so a space object arrives
 * with `car_profile`/`home_profile` already attached (null if this space
 * has neither) -- `profileFromSpace` below converts whichever is present
 * into this file's frontend (camelCase, `kind`-tagged) shape.
 *
 * `kind` doubles as the space's real type discriminator: it used to be
 * guessed from the space's own `name` ("car" -> Car space), which breaks
 * the moment a user renames "Car" to "BMW" -- the entire point of this
 * feature. `detectSpaceType` below checks the real profile's `kind`
 * first, and only falls back to the old name-guessing for spaces with
 * neither profile (either they predate this feature, or their type has
 * no dedicated form at all, e.g. Grocery/Expenses).
 */

export type CarProfile = {
  kind: "car";
  make: string;
  model: string;
  color?: string;
  year: number;
  purchasePrice: number;
  /** The Fuel form's "tank level before/after" sliders convert their %
   * into real liters using exactly this number (see CarFuelForm.tsx's
   * `tankCapacity` prop) -- keep both in sync, don't let a second source
   * of truth for capacity appear elsewhere. */
  tankCapacity: number;
  /** Km typed on the Mașină top card ("Actualizează kilometrajul", PUT
   * /spaces/:id/car-profile/odometer) -- null = never set by hand. Feeds
   * carData.vehicle.mileage, so getCurrentOdometer() = max(this, logged).
   * Not part of carProfileToApiBody: the profile edit form never sends it
   * (the server keeps it). */
  odometer?: number | null;
  /** ISO timestamp of the last manual odometer change. */
  odometerUpdatedAt?: string | null;
};

export type HomeOwnership = "bought" | "inherited";

export type HomeProfile = {
  kind: "home";
  county: string;
  city: string;
  ownership: HomeOwnership;
  purchasePrice?: number;
};

export type SpaceProfile = CarProfile | HomeProfile;

export type SpaceKind = "car" | "home" | "grocery" | "expenses" | "other";

/* ------------------------------------------------------------------ */
/* Space colours (2026-10-09: the user picks one per space)            */
/* ------------------------------------------------------------------ */

/**
 * The curated palette a space's colour is picked from (Spații > edit a
 * space, the Mașină/Casă profile forms, EditSpaceModal). `spaces.color`
 * stores the KEY (validated server-side against this same list,
 * `App\Models\Space::PALETTE_KEYS`); null = the kind's default swatch
 * (KIND_DEFAULT_COLOR). Legacy rows still hold old hexes (#111111,
 * #374151...) -- anything that isn't a key (or a palette base hex) is
 * ignored and the kind default wins.
 *
 * Per swatch: `color` = the base, for fills (bars, dots, IconWell /
 * translucent tints via hexToRgba, Field focus ring, Sheet icon);
 * `text` = the colour as TEXT or a stroke icon, >= 4.5:1 on all three
 * surface layers of its theme (dark #0F1218/#171B23/#20252F, light
 * #F3F5F8/#FFFFFF/#E9EDF2) -- except the two inherited kind defaults
 * marked below, kept as they were; `fill` + `ink` = a filled button with
 * a text label (>= 4.5:1).
 *
 * Hues deliberately left out: red/rose (= `error`, restant), orange (=
 * `warning`, "Azi"), yellow/ochre (= `caution`), green/emerald (=
 * `success`, finance), lime (= CUSTOM_EVENT_COLOR, Calendar events).
 * Closest calls, accepted: `pink` sits nearest the red family -- it is
 * lighter and bluer than `error` and status red only ever appears as a
 * small dot/number, never as a whole space's tone; `amber` (the grocery
 * default, inherited) is next to `warning` orange -- unchanged since
 * before this palette existed.
 */
export type SpaceColorKey =
  | "blue"
  | "indigo"
  | "purple"
  | "fuchsia"
  | "pink"
  | "amber"
  | "teal"
  | "sky"
  | "slate";

export type SpaceSwatch = {
  key: SpaceColorKey;
  /** Romanian name -- the picker's a11y label. */
  name: string;
  color: string;
  text: { dark: string; light: string };
  fill: string;
  ink: string;
};

// Contrast (text on page/card/tertiary; fill/ink):
//  blue    dark 7.5/6.9/6.2  light 4.7/5.2/4.4*  btn 5.2   (car default)
//  indigo  dark 7.9/7.3/6.5  light 5.8/6.3/5.4   btn 6.3
//  purple  dark 6.3/5.8/5.2  light 6.4/7.0/5.9   btn 5.4   (home default)
//  fuchsia dark 7.7/7.1/6.3  light 5.8/6.3/5.4   btn 4.7
//  pink    dark 7.4/6.8/6.0  light 5.5/6.0/5.1   btn 4.6
//  amber   dark 10/9.2/8.2   light 4.6/5.0/4.3*  btn 8.6   (grocery default)
//  teal    dark 10/9.3/8.2   light 5.0/5.5/4.7   btn 6.9   (expenses default)
//  sky     dark 9.0/8.3/7.4  light 5.4/5.9/5.1   btn 6.5
//  slate   dark 8.5/7.8/7.0  light 6.9/7.6/6.4   btn 7.6
// * inherited kind defaults, unchanged on purpose: on the light
//   surfaceTertiary (chips/inputs) they are 4.4 / 4.3 -- fine on the page
//   and on cards, where space-coloured text actually sits.
export const SPACE_PALETTE: SpaceSwatch[] = [
  { key: "blue", name: "Albastru", color: "#3B82F6", text: { dark: "#6FA5F8", light: "#2563EB" }, fill: "#2563EB", ink: "#FFFFFF" },
  { key: "indigo", name: "Indigo", color: "#6366F1", text: { dark: "#9EA1F7", light: "#4F46E5" }, fill: "#4F46E5", ink: "#FFFFFF" },
  { key: "purple", name: "Mov", color: "#9333EA", text: { dark: "#B37BF5", light: "#7E22CE" }, fill: "#9333EA", ink: "#FFFFFF" },
  { key: "fuchsia", name: "Fucsia", color: "#D946EF", text: { dark: "#E67EF5", light: "#A21CAF" }, fill: "#C026D3", ink: "#FFFFFF" },
  { key: "pink", name: "Roz", color: "#EC4899", text: { dark: "#F27AB6", light: "#BE185D" }, fill: "#DB2777", ink: "#FFFFFF" },
  { key: "amber", name: "Chihlimbar", color: "#F59E0B", text: { dark: "#F5B13D", light: "#B45309" }, fill: "#F59E0B", ink: "#1A1206" },
  { key: "teal", name: "Turcoaz", color: "#14B8A6", text: { dark: "#3DD3BF", light: "#0F766E" }, fill: "#14B8A6", ink: "#04201C" },
  { key: "sky", name: "Bleu", color: "#0EA5E9", text: { dark: "#4CC0F2", light: "#0369A1" }, fill: "#0EA5E9", ink: "#04182A" },
  { key: "slate", name: "Gri", color: "#64748B", text: { dark: "#A3B0C2", light: "#475569" }, fill: "#475569", ink: "#FFFFFF" },
];

const PALETTE_BY_KEY: Record<string, SpaceSwatch> = Object.fromEntries(SPACE_PALETTE.map((s) => [s.key, s]));
const PALETTE_BY_HEX: Record<string, SpaceSwatch> = Object.fromEntries(SPACE_PALETTE.map((s) => [s.color.toLowerCase(), s]));

/** Each kind's colour when the user never picked one (spaces.color null). */
export const KIND_DEFAULT_COLOR: Record<"car" | "home" | "grocery" | "expenses", SpaceColorKey> = {
  car: "blue",
  home: "purple",
  grocery: "amber",
  expenses: "teal",
};

/** A stored `spaces.color` -> its palette key, or null (legacy hex / unset). */
export function paletteKey(value: unknown): SpaceColorKey | null {
  if (typeof value !== "string" || !value) return null;
  const hit = PALETTE_BY_KEY[value] ?? PALETTE_BY_HEX[value.toLowerCase()];
  return hit ? hit.key : null;
}

export type SpaceColors = {
  key: SpaceColorKey;
  /** Base -- fills, dots, bars, IconWell, Field/Sheet `tone`. */
  color: string;
  /** Text / stroke icons on the current theme's surfaces. */
  tint: string;
  /** Filled button with a text label. */
  fill: string;
  /** Ink on `fill` ONLY -- on the base `color` it fails 4.5:1 for blue/indigo/fuchsia/pink/slate, so text-on-colour must use `fill`. */
  ink: string;
};

function colorsOf(sw: SpaceSwatch, isDark: boolean): SpaceColors {
  return { key: sw.key, color: sw.color, tint: isDark ? sw.text.dark : sw.text.light, fill: sw.fill, ink: sw.ink };
}

/**
 * THE resolver for a space's colours. Pass a space object (anything with
 * `color` + `type`, e.g. from api.listSpaces / getSpace, or an item's
 * embedded `space`), a palette key, or a kind -- for a space it uses its
 * own picked colour when that's a palette key, else its kind's default.
 * Null only for a space of no known kind with no picked colour (callers
 * fall back to a neutral). For a whole space screen use
 * `useSpaceColors(kind)` (lib/spaces/spaceTheme.tsx) instead, which reads
 * the SpaceThemeProvider [id].tsx mounts.
 */
export function spaceColors(spaceOrKind: any, isDark: boolean): SpaceColors | null {
  if (spaceOrKind == null) return null;
  if (typeof spaceOrKind === "string") {
    const asKey = paletteKey(spaceOrKind);
    if (asKey) return colorsOf(PALETTE_BY_KEY[asKey], isDark);
    const k = KIND_DEFAULT_COLOR[spaceOrKind as keyof typeof KIND_DEFAULT_COLOR];
    return k ? colorsOf(PALETTE_BY_KEY[k], isDark) : null;
  }
  const picked = paletteKey(spaceOrKind.color);
  if (picked) return colorsOf(PALETTE_BY_KEY[picked], isDark);
  const kind = spaceOrKind.kind && KIND_DEFAULT_COLOR[spaceOrKind.kind as keyof typeof KIND_DEFAULT_COLOR]
    ? spaceOrKind.kind
    : detectSpaceType(spaceOrKind, profileFromSpace(spaceOrKind));
  const k = KIND_DEFAULT_COLOR[kind as keyof typeof KIND_DEFAULT_COLOR];
  return k ? colorsOf(PALETTE_BY_KEY[k], isDark) : null;
}

// KIND-level colours (derived from the palette's kind defaults). Use these
// only where the colour stands for the KIND, not one particular space --
// Buget's per-kind rows/bars/overview, the "create" template tiles, the
// tour illustrations, the empty spend card's legend, Acasă's spend-by-kind
// bar. Anything about ONE space goes through spaceColors(space) /
// useSpaceColors(kind) so the user's pick shows.
const KIND_SWATCH = (k: keyof typeof KIND_DEFAULT_COLOR) => PALETTE_BY_KEY[KIND_DEFAULT_COLOR[k]];

export const SPACE_IDENTITY_COLORS: Partial<Record<SpaceKind, string>> = {
  car: KIND_SWATCH("car").color,
  home: KIND_SWATCH("home").color,
  grocery: KIND_SWATCH("grocery").color,
  expenses: KIND_SWATCH("expenses").color,
};

/** The identity color as TEXT (a label, a subtitle) or a stroke icon on
 * a card. The base identity colors are tuned for filled marks -- a
 * purple #9333EA label on the dark card layer is only ~3:1 -- so text
 * gets a lighter tint in dark mode and a deeper one in light mode, same
 * hue. Fills (bars, buttons, dots) keep using SPACE_IDENTITY_COLORS. */
const SPACE_TEXT_COLORS: Record<"dark" | "light", Partial<Record<SpaceKind | "custom", string>>> = {
  dark: {
    car: KIND_SWATCH("car").text.dark,
    home: KIND_SWATCH("home").text.dark,
    grocery: KIND_SWATCH("grocery").text.dark,
    expenses: KIND_SWATCH("expenses").text.dark,
    custom: "#A3E635",
  },
  light: {
    car: KIND_SWATCH("car").text.light,
    home: KIND_SWATCH("home").text.light,
    grocery: KIND_SWATCH("grocery").text.light,
    expenses: KIND_SWATCH("expenses").text.light,
    custom: "#4D7C0F",
  },
};

/** Kind-level text tint. `"custom"` = a calendar event with no space
 * (CUSTOM_EVENT_COLOR). */
export function spaceTextColor(kind: SpaceKind | "custom", isDark: boolean): string | undefined {
  return SPACE_TEXT_COLORS[isDark ? "dark" : "light"][kind];
}

/** Kind-level ink on a filled identity color. Amber and teal are too
 * light for white (2.2:1 / 2.5:1), so they take a dark ink. */
export const SPACE_ON_FILL: Partial<Record<SpaceKind, string>> = {
  car: KIND_SWATCH("car").ink,
  home: KIND_SWATCH("home").ink,
  grocery: KIND_SWATCH("grocery").ink,
  expenses: KIND_SWATCH("expenses").ink,
};

/** Kind-level fill for a filled button carrying a TEXT label. White on
 * the car blue (#3B82F6) is only 3.7:1 -- so labelled buttons use a
 * deeper shade of the same hue. */
export const SPACE_BUTTON_FILL: Partial<Record<SpaceKind, string>> = {
  car: KIND_SWATCH("car").fill,
  home: KIND_SWATCH("home").fill,
  grocery: KIND_SWATCH("grocery").fill,
  expenses: KIND_SWATCH("expenses").fill,
};

/** Romanian display name per space kind. */
export const SPACE_KIND_LABEL: Partial<Record<SpaceKind, string>> = {
  car: "Mașină",
  home: "Casă",
  grocery: "Cumpărături",
  expenses: "Cheltuieli",
};

/** Same idea as SPACE_IDENTITY_COLORS, for the one thing that's
 * deliberately NOT in a space: a custom calendar event created with no
 * space_id (see calendar.tsx). Kept here rather than re-declared per
 * screen so Calendar, Home's "De făcut" breakdown and its carousel all
 * agree on the same color instead of three independent copies of it.
 * Lime (2026-10-05, was pink #EC4899): a hue no space, status or the
 * calendar's red heat uses -- the pink event dot got mixed up with the
 * red "restant" dot. */
export const CUSTOM_EVENT_COLOR = "#84CC16";

/** backend/app/Http/Controllers/Api/SpaceController.php's car_profile shape. */
export function carProfileFromApi(raw: any): CarProfile | null {
  if (!raw) return null;

  return {
    kind: "car",
    make: raw.make,
    model: raw.model,
    color: raw.color ?? undefined,
    year: Number(raw.year),
    purchasePrice: Number(raw.purchase_price),
    tankCapacity: Number(raw.tank_capacity),
    odometer: raw.odometer != null ? Number(raw.odometer) : null,
    odometerUpdatedAt: raw.odometer_updated_at ?? null,
  };
}

/** backend/app/Http/Controllers/Api/SpaceController.php's home_profile shape. */
export function homeProfileFromApi(raw: any): HomeProfile | null {
  if (!raw) return null;

  return {
    kind: "home",
    county: raw.county,
    city: raw.city,
    ownership: raw.ownership,
    purchasePrice: raw.purchase_price != null ? Number(raw.purchase_price) : undefined,
  };
}

/**
 * Pulls whichever profile a space (from api.getSpace/listSpaces, with
 * carProfile/homeProfile eager-loaded) actually has, already converted to
 * this file's frontend shape. Null for a space with neither (Grocery,
 * Expenses, a Car/Home space whose profile hasn't been filled in yet).
 */
export function profileFromSpace(space: any): SpaceProfile | null {
  if (space?.car_profile) return carProfileFromApi(space.car_profile);
  if (space?.home_profile) return homeProfileFromApi(space.home_profile);
  return null;
}

/** The body PUT /spaces/:id/car-profile expects. */
export function carProfileToApiBody(profile: CarProfile) {
  return {
    make: profile.make,
    model: profile.model,
    color: profile.color ?? null,
    year: profile.year,
    purchase_price: profile.purchasePrice,
    tank_capacity: profile.tankCapacity,
  };
}

/** The body PUT /spaces/:id/home-profile expects. */
export function homeProfileToApiBody(profile: HomeProfile) {
  return {
    county: profile.county,
    city: profile.city,
    ownership: profile.ownership,
    purchase_price: profile.purchasePrice ?? null,
  };
}

export function carProfileName(profile: CarProfile): string {
  return profile.make.trim();
}

export function homeProfileName(profile: HomeProfile): string {
  return profile.city.trim();
}

/**
 * Real type detection, in order of how trustworthy the signal is:
 *
 * 1. `space.type` -- a real, permanent DB column set once at creation
 *    (see SpaceController::store) and never editable afterward. The
 *    only signal that's reliable for EVERY kind regardless of name --
 *    previously Car/Home leaned on their profile row for this (below)
 *    while Grocery/Expenses had nothing but a name/icon guess, so
 *    renaming "Expenses" to "Expenses Rares" could silently misdetect
 *    it. Every space created from here on carries this.
 * 2. The real profile's `kind` -- for a Car/Home space that predates
 *    this column (`space.type` is null on it), still reliable
 *    regardless of the space's current display name.
 * 3. The old type/slug/name/icon heuristic -- last resort, only for a
 *    space with neither of the above (predates both, or its kind has no
 *    dedicated form at all, e.g. a hidden "Finance" template).
 */
export function detectSpaceType(space: any, profile: SpaceProfile | null): SpaceKind {
  const persistedType = String(space?.type || "").toLowerCase();
  if (persistedType === "car" || persistedType === "home" || persistedType === "grocery" || persistedType === "expenses") {
    return persistedType as SpaceKind;
  }

  if (profile?.kind === "car") return "car";
  if (profile?.kind === "home") return "home";

  const spaceType = String(space?.slug || space?.kind || "").toLowerCase();
  const name = String(space?.name || "").toLowerCase();
  const icon = String(space?.icon || "").toLowerCase();

  if (spaceType === "car" || spaceType === "vehicle" || name === "car") return "car";
  if (spaceType === "home" || spaceType === "house" || name === "home") return "home";
  if (
    spaceType === "grocery" ||
    spaceType === "groceries" ||
    spaceType === "food" ||
    name === "grocery" ||
    name === "groceries"
  ) {
    return "grocery";
  }
  if (spaceType === "expenses" || spaceType === "expense" || name === "expenses") {
    return "expenses";
  }

  // Last resort: the icon set on the space when it was created/renamed
  // (car-outline, home-outline, cart-outline, receipt-outline -- see
  // CarProfileForm/HomeProfileForm's create calls and the Quick Templates).
  // Needed specifically for a space that predates real DB persistence: its
  // profile lived only in device-local storage, wiped when that was
  // replaced, AND its name got renamed away from the generic "Car"/"Home"
  // default (to the Make/City-derived name) before the wipe -- so neither
  // check above still applies, only the icon survived in the database.
  if (icon === "car-outline") return "car";
  if (icon === "home-outline") return "home";
  if (icon === "cart-outline") return "grocery";
  if (icon === "receipt-outline") return "expenses";

  return "other";
}
