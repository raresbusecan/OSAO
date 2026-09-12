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
 * Real type detection: the real profile's `kind` first (reliable
 * regardless of the space's current display name), falling back to the
 * old type/slug/name heuristic only for spaces with neither profile --
 * either they predate this feature, or their type has no dedicated form
 * at all (Grocery, Expenses, anything custom).
 */
export function detectSpaceType(space: any, profile: SpaceProfile | null): SpaceKind {
  if (profile?.kind === "car") return "car";
  if (profile?.kind === "home") return "home";

  const spaceType = String(space?.type || space?.slug || space?.kind || "").toLowerCase();
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
