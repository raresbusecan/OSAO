/**
 * First-use tours ("ghiduri"): a few steps that point at the real thing
 * on a screen, one card at a time. Everything a tour SAYS lives here, like
 * lib/help.ts -- the overlay that shows it is components/ui/TourHost.tsx
 * (mounted once at the root), screens register what it points at with
 * components/ui/tourTargets.ts, and lib/useAutoTour.ts starts a screen's
 * tour the first time the user lands there.
 *
 * Seen state lives on the server (users.tours, PUT /user/tours/{key},
 * DELETE /user/tours) and on the auth user (`user.tours`). A tour that
 * failed to save is still remembered for this app session (`seenLocally`).
 *
 * Copy rules: same as help.ts -- Romanian, sentence case, what the person
 * SEES. Spec + mockup: design-lead's "Acasă cu ghid" canvas (2026-10-08).
 */

export type TourKey = "home" | "spaces" | "budget" | "calendar" | "space_car" | "space_home" | "space_grocery" | "space_expenses";

export type TourCtx = {
  hasSpaces: boolean;
  emailState: "verified" | "unverified" | null;
  hasPlan: boolean;
  /** How the user's spend card draws: a ring (default) or a bar. */
  spendChart: "ring" | "bar";
  /** The avatar's letter, for the avatar glyph. */
  initial?: string;
};

/** The small decorative mark in front of a point (TourHost draws it). */
export type TourGlyph = "info" | "avatar" | "spent" | "faded" | "remaining" | "tap" | "pencil" | "budget";
export type TourPoint = { glyph: TourGlyph; lead?: string; text: string };
export type TourIllustration = "spaceDots" | "ring" | "ghostCards" | "spaceKinds";

export type TourStep = {
  id: string;
  /** A useTourTarget id. Missing / not measurable / no room -> no hole. */
  target?: string;
  /** Where the card sits: at the bottom (target above it) or the top. */
  placement: "bottom" | "top";
  illustration?: TourIllustration;
  /** "always": the illustration is part of the step. "fallback" (default):
   * only shown when the target can't be cut out of the scrim. */
  illustrationWhen?: "always" | "fallback" | ((ctx: TourCtx) => "always" | "fallback");
  title: (ctx: TourCtx) => string;
  body?: (ctx: TourCtx) => string | null;
  points?: (ctx: TourCtx) => TourPoint[];
  /** Scroll the screen (useTourScroll) so the target sits at the top. */
  scrollIntoView?: boolean;
  /** The target's own corner radius (the hole adds 6). */
  targetRadius: number;
};

export type TourDef = {
  key: TourKey;
  version: number;
  /** The useTourScroll screen key: scrolled to bring targets in view and
   * back to the top when the tour closes. */
  screen?: string;
  steps: TourStep[];
  /** The last step's primary button, when it leads somewhere. */
  finalCta?: (ctx: TourCtx) => { label: string; href: string } | null;
};

/** TEMP-for-testing switch (product decision 2026-10-08): false = every
 * screen may auto-start its own tour in the same session. Flip to true to
 * allow only ONE automatic tour per app session (manual starts are never
 * limited). */
export const ONE_AUTO_TOUR_PER_SESSION = false;

/* ---------------- Acasă ---------------- */

const HOME: TourDef = {
  key: "home",
  version: 1,
  screen: "home",
  steps: [
    {
      id: "welcome",
      target: "home.header",
      placement: "bottom",
      illustration: "spaceDots",
      targetRadius: 16,
      title: () => "Bun venit pe Acasă",
      body: () => "Aici vezi, pe un singur ecran, ce contează din toate spațiile tale: banii lunii, ce ai de făcut, plățile care urmează.",
      points: (ctx) => [
        { glyph: "info", text: "Butonul „ⓘ” de lângă un card îți explică ce vezi în el." },
        {
          glyph: "avatar",
          text:
            "Cercul cu inițiala ta deschide profilul și setările." +
            (ctx.emailState === "unverified"
              ? " Semnul „!” de pe el: emailul nu e confirmat încă."
              : ctx.emailState === "verified"
                ? " Bifa de pe el: emailul e confirmat."
                : ""),
        },
      ],
    },
    {
      id: "spend",
      target: "home.card.spend",
      placement: "bottom",
      illustration: "ring",
      scrollIntoView: true,
      targetRadius: 20,
      // A new account's spend card is empty -- nothing "plin"/"estompat"
      // to point at, so the ring illustration shows what it will look like.
      illustrationWhen: (ctx) => (ctx.hasSpaces ? "fallback" : "always"),
      title: () => "Cheltuit în luna asta",
      body: (ctx) => (ctx.hasSpaces ? null : "Acum e gol. Când adaugi cheltuieli, cardul arată așa:"),
      points: (ctx) => [
        { glyph: "spent", lead: "Plin:", text: "ce ai cheltuit deja, în culoarea spațiului." },
        ctx.spendChart === "bar"
          ? { glyph: "faded", lead: "„+ … de plătit” și „planificat”:", text: "facturi și cumpărături din Calendar care nu sunt cheltuite încă; le scădem din buget din timp." }
          : { glyph: "faded", lead: "Estompat:", text: "facturi de plătit și cumpărături planificate în Calendar. Nu sunt cheltuite încă, dar le scădem din buget din timp." },
        { glyph: "remaining", lead: "Mai ai:", text: "ce rămâne din buget până la sfârșitul lunii. Se face roșu dacă treci de buget." },
        { glyph: "tap", text: ctx.hasSpaces ? "Atinge cardul ca să deschizi Buget." : "Când ai un spațiu, atingi cardul ca să deschizi Buget." },
      ],
    },
    {
      id: "cards",
      target: "home.edit",
      placement: "bottom",
      illustration: "ghostCards",
      illustrationWhen: "always",
      targetRadius: 22,
      title: () => "Cardurile vin cu datele tale",
      body: () => "De făcut, Plăți recurente și Economii apar aici când au ce arăta: o sarcină cu dată, o factură recurentă, un obiectiv de economii.",
      points: () => [
        { glyph: "pencil", text: "Cu creionul alegi ce carduri vezi, le muți, le micșorezi și le colorezi. Merge și o apăsare lungă pe un loc gol." },
      ],
    },
    {
      id: "spaces",
      target: "tab.spaces",
      placement: "top",
      illustration: "spaceKinds",
      illustrationWhen: "always",
      targetRadius: 16,
      title: (ctx) => (ctx.hasSpaces ? "Spațiile tale" : "Începe cu un spațiu"),
      body: (ctx) =>
        ctx.hasSpaces
          ? "Le găsești în Spații, jos. Tot ce adaugi în ele apare aici, pe Acasă."
          : "Un spațiu e o parte din viața ta pe care o ții în ordine: Mașină, Casă, Cumpărături sau Cheltuieli. Îl creezi din Spații, iar ce adaugi în el apare aici.",
      points: (ctx) => (ctx.hasPlan ? [] : [{ glyph: "budget", text: "Apoi, în Buget, adaugi venitul lunar și vezi cât mai ai de cheltuit." }]),
    },
  ],
  finalCta: (ctx) => (ctx.hasSpaces ? null : { label: "Creează primul spațiu", href: "/spaces" }),
};

export const TOURS: Partial<Record<TourKey, TourDef>> = { home: HOME };

/** Every tour the app plans, in Settings' "Revezi ghidurile" order. Only
 * the ones in TOURS exist yet -- the rest show as "În curând". */
export const TOUR_LIST: { key: TourKey; label: string; icon: string }[] = [
  { key: "home", label: "Acasă", icon: "home-outline" },
  { key: "spaces", label: "Spații", icon: "grid-outline" },
  { key: "calendar", label: "Calendar", icon: "calendar-outline" },
  { key: "budget", label: "Buget", icon: "wallet-outline" },
  { key: "space_car", label: "Mașină", icon: "car-outline" },
  { key: "space_home", label: "Casă", icon: "bed-outline" },
  { key: "space_grocery", label: "Cumpărături", icon: "cart-outline" },
  { key: "space_expenses", label: "Cheltuieli", icon: "receipt-outline" },
];

/* ---------------- runtime state (module-level, like help.ts) ---------------- */

type TourHandler = (def: TourDef, ctx: TourCtx, auto: boolean) => void;
let tourHandler: TourHandler | null = null;
let active = false;
let pending: TourKey | null = null;
const seenLocally = new Set<TourKey>();
/** Set when an automatic tour starts (ONE_AUTO_TOUR_PER_SESSION). */
let autoTourShownThisSession = false;
export function wasAutoTourShownThisSession(): boolean {
  return autoTourShownThisSession;
}

const listeners = new Set<() => void>();
let version = 0;
function emit() {
  version += 1;
  listeners.forEach((l) => l());
}
/** Re-evaluate anything gated on tour state (useAutoTour). */
export function subscribeTours(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function getToursVersion(): number {
  return version;
}

/** Called once by TourHost. */
export function setTourHandler(handler: TourHandler | null): void {
  tourHandler = handler;
}

/** Starts a tour now (bypasses seen state). False if it doesn't exist,
 * the host isn't mounted, or another tour is already on screen. */
export function startTour(key: TourKey, ctx: TourCtx, opts?: { auto?: boolean }): boolean {
  const def = TOURS[key];
  if (!def || !tourHandler || active) return false;
  active = true;
  if (opts?.auto) autoTourShownThisSession = true;
  tourHandler(def, ctx, !!opts?.auto);
  emit();
  return true;
}

/** TourHost: the overlay closed. */
export function tourEnded(): void {
  active = false;
  emit();
}

export function isTourActive(): boolean {
  return active;
}

export function tourExists(key: TourKey): boolean {
  return !!TOURS[key];
}

/** Ask the screen that owns `key` to start it as soon as it's on screen
 * and nothing else is open (Settings / HelpHost replay). Consumed by that
 * screen's useAutoTour. */
export function requestTour(key: TourKey): void {
  pending = key;
  emit();
}
export function pendingTour(): TourKey | null {
  return pending;
}
export function consumePendingTour(key: TourKey): void {
  if (pending === key) pending = null;
}

/** Remembered for this session even if saving it failed. */
export function markSeenLocally(key: TourKey): void {
  seenLocally.add(key);
}
export function isSeenLocally(key: TourKey): boolean {
  return seenLocally.has(key);
}
/** "Arată-le din nou pe toate". */
export function clearSeenLocally(): void {
  seenLocally.clear();
  autoTourShownThisSession = false;
  emit();
}
