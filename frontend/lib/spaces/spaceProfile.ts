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

// Fixed identity color per space -- unrelated to any budget-health tone
// color (success/warning/error, which shift with how close a space is
// to its limit). This one never changes, so a color reads as "which
// space" at a glance the same way the icon does: used by the Budget
// tab's "Buget total" entry row and by BudgetOverviewPage's ring and
// ranked list, so both always agree on which color is which space.
export const SPACE_IDENTITY_COLORS: Partial<Record<SpaceKind, string>> = {
  car: "#3B82F6",
  home: "#9333EA",
  grocery: "#F59E0B",
  expenses: "#14B8A6",
};

/** The identity color as TEXT (a label, a subtitle) or a stroke icon on
 * a card. The base identity colors are tuned for filled marks -- a
 * purple #9333EA label on the dark card layer is only ~3:1 -- so text
 * gets a lighter tint in dark mode and a deeper one in light mode, same
 * hue. Fills (bars, buttons, dots) keep using SPACE_IDENTITY_COLORS. */
const SPACE_TEXT_COLORS: Record<"dark" | "light", Partial<Record<SpaceKind | "custom", string>>> = {
  dark: { car: "#6FA5F8", home: "#B37BF5", grocery: "#F5B13D", expenses: "#3DD3BF", custom: "#A3E635" },
  light: { car: "#2563EB", home: "#7E22CE", grocery: "#B45309", expenses: "#0F766E", custom: "#4D7C0F" },
};

/** `"custom"` = a calendar event with no space (CUSTOM_EVENT_COLOR). */
export function spaceTextColor(kind: SpaceKind | "custom", isDark: boolean): string | undefined {
  return SPACE_TEXT_COLORS[isDark ? "dark" : "light"][kind];
}

/** Ink for text/icons ON a filled identity color (a primary button, the
 * active Grocery pill). Amber and teal are too light for white (2.2:1 /
 * 2.5:1), so they take a dark ink. */
export const SPACE_ON_FILL: Partial<Record<SpaceKind, string>> = {
  car: "#FFFFFF",
  home: "#FFFFFF",
  grocery: "#1A1206",
  expenses: "#04201C",
};

/** Fill for a filled button carrying a TEXT label. White on the car blue
 * (#3B82F6) is only 3.7:1 -- fine for an icon, short of 4.5:1 for a
 * label -- so labelled buttons use a deeper shade of the same hue. */
export const SPACE_BUTTON_FILL: Partial<Record<SpaceKind, string>> = {
  car: "#2563EB",
  home: "#9333EA",
  grocery: "#F59E0B",
  expenses: "#14B8A6",
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
