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

/** What a tour's copy may depend on. Each screen fills what its own tour
 * reads (Acasă: hasSpaces/emailState/hasPlan/spendChart/initial; Calendar:
 * nothing yet; Buget: hasPlan/hasSpaces/hasBudgets/hasCredit; Mașină:
 * hasCredit/hasUpcoming). */
export type TourCtx = {
  hasSpaces?: boolean;
  emailState?: "verified" | "unverified" | null;
  hasPlan?: boolean;
  /** Buget: at least one space has a monthly budget (a bar to point at). */
  hasBudgets?: boolean;
  /** Buget: at least one active credit (the third part is "Credit").
   * Mașină: a credit linked to THIS car (the line under its top card). */
  hasCredit?: boolean;
  /** Mașină: the "Urmează" block is on screen (something due soon). */
  hasUpcoming?: boolean;
  /** How the user's spend card draws: a ring (default) or a bar. */
  spendChart?: "ring" | "bar";
  /** The avatar's letter, for the avatar glyph. */
  initial?: string;
};

/** The small decorative mark in front of a point (TourHost draws it). */
export type TourGlyph =
  | "info" | "avatar" | "spent" | "faded" | "remaining" | "tap" | "pencil" | "budget"
  // Calendar
  | "month" | "heat" | "eventDot" | "lateDot" | "swipe" | "reminder"
  // Buget
  | "jarNeeds" | "jarGuiltFree" | "jarThird" | "jarSaving" | "barSpent" | "barHatched" | "barLine" | "repeat" | "savings"
  // Mașină (car-tinted icons)
  | "odometer" | "fuel" | "service" | "expense" | "document" | "archive" | "history";
export type TourPoint = { glyph: TourGlyph; lead?: string; text: string };
export type TourIllustration = "spaceDots" | "ring" | "ghostCards" | "spaceKinds" | "heatDays" | "swipeRow" | "eventChip" | "jarBar" | "splitBar" | "carHero" | "carActions" | "carNext" | "carPages";

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

/** TEMP (testing, 2026-10-08): a "Pornește ghidul" pill on every screen
 * that has a tour (Acasă, Calendar, Buget, Mașină) to start it on demand. Set to false
 * (and delete the pills) once the tours have been tried on the phone. */
export const SHOW_TOUR_TEST_BUTTON = true;

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

/* ---------------- Calendar ---------------- */

const CALENDAR: TourDef = {
  key: "calendar",
  version: 1,
  screen: "calendar",
  steps: [
    {
      id: "months",
      target: "calendar.nav",
      placement: "bottom",
      illustration: "heatDays",
      targetRadius: 16,
      title: () => "Calendarul tău",
      body: () => "Aici vezi, zi cu zi, tot ce are o dată în spațiile tale, plus evenimentele tale.",
      points: () => [
        { glyph: "month", text: "Săgețile schimbă luna; poți și glisa calendarul stânga-dreapta. „Azi” te aduce înapoi." },
        { glyph: "tap", lead: "Următoarele 3 luni:", text: "fiecare bulă arată cât de plină e luna față de timpul tău liber. Atinge una ca să sari la ea." },
      ],
    },
    {
      id: "days",
      target: "calendar.grid",
      placement: "bottom",
      illustration: "heatDays",
      scrollIntoView: true,
      targetRadius: 16,
      title: () => "Ce înseamnă culorile",
      points: () => [
        { glyph: "heat", lead: "Culoarea zilei:", text: "cât din timpul tău liber din ziua aceea e ocupat; weekendul încape mai mult. Zilele trecute nu se colorează." },
        { glyph: "eventDot", lead: "Punct verde:", text: "un eveniment al tău." },
        { glyph: "lateDot", lead: "Punct roșu:", text: "pe o zi trecută a rămas ceva nerezolvat." },
        { glyph: "tap", text: "Atinge o zi ca să vezi dedesubt ce pică atunci." },
      ],
    },
    {
      id: "day",
      target: "calendar.day",
      placement: "bottom",
      illustration: "swipeRow",
      scrollIntoView: true,
      targetRadius: 16,
      title: () => "De rezolvat în ziua aleasă",
      body: () => "Exact ce pică în ziua aleasă în spațiile tale: sarcini, facturi, mentenanță, documente. Evenimentele zilei apar deasupra, ca etichete verzi.",
      points: () => [
        { glyph: "swipe", text: "Glisează un rând spre dreapta ca să-l rezolvi, spre stânga ca să-l ștergi. Atinge-l ca să-l deschizi în spațiul lui." },
        { glyph: "reminder", lead: "Mementouri:", text: "ratele creditelor din Cheltuieli, doar ca să-ți amintească. Nu se bifează și nu devin restante." },
      ],
    },
    {
      id: "events",
      target: "calendar.events",
      placement: "top",
      illustration: "eventChip",
      scrollIntoView: true,
      targetRadius: 12,
      title: () => "Evenimentele tale",
      body: () => "Cu „+ Eveniment” adaugi ce nu ține de un spațiu: o programare, o aniversare, o întâlnire. Se poate repeta săptămânal, lunar sau anual.",
      points: () => [
        { glyph: "budget", lead: "Implică o cumpărare:", text: "suma apare în Buget ca „planificat” până în ziua evenimentului, apoi trece la Cheltuit." },
        { glyph: "eventDot", text: "Lista de aici arată evenimentele din următoarele 3 luni, fiecare o singură dată." },
      ],
    },
  ],
};

/* ---------------- Buget ---------------- */

// Two states: no income yet (onboarding card, "Pe spații", standalone
// Economii card) and with a plan (hero on the necessities, the five jars,
// "Necesități pe spații", Economii = the "Termen scurt" row). Facts come
// from lib/help.ts budget.* -- keep the two in sync.
const BUDGET: TourDef = {
  key: "budget",
  version: 1,
  screen: "budget",
  steps: [
    {
      id: "income",
      // No plan: the onboarding card. With a plan: the hero ring card.
      target: "budget.top",
      placement: "bottom",
      illustration: "jarBar",
      targetRadius: 20,
      title: () => "Bugetul pornește de la venit",
      body: (ctx) =>
        ctx.hasPlan
          ? "Venitul tău net se împarte în cinci părți. Cea mai mare, necesitățile, e bugetul spațiilor tale. Aici vezi cât ai cheltuit din ea luna asta."
          : "Spune-ne cât câștigi net pe lună, după taxe. Îl împărțim în cinci părți, iar fiecare spațiu își primește bugetul din necesități.",
      points: (ctx) =>
        ctx.hasPlan
          ? [
              { glyph: "spent", lead: "Cheltuit din necesități:", text: "tot ce ai înregistrat luna asta în spații. Cheltuielile „fără vină” nu intră aici." },
              { glyph: "faded", lead: "„+ de plătit” și „planificat”:", text: "facturi recurente și cumpărături din Calendar care nu sunt cheltuite încă; le scădem din timp." },
              { glyph: "remaining", lead: "Mai ai:", text: "necesitățile minus cheltuit, de plătit și planificat. Se face roșu dacă treci de ele." },
              { glyph: "tap", text: "Atinge cardul ca să vezi unde s-au dus banii lunii, pe spații." },
            ]
          : [
              { glyph: "tap", text: "Atinge „Adaugă venitul”. Îl schimbi doar când se schimbă." },
              ctx.hasBudgets
                ? { glyph: "budget", text: "Ai deja bugete pe spații: la prima salvare alegi dacă le păstrezi sau reîmparți necesitățile după cât cheltuiești." }
                : { glyph: "budget", text: "Până atunci, ecranul arată bugetele pe spații, ca înainte." },
            ],
    },
    {
      id: "jars",
      // No plan: the 55/5/10/15/15 bar + legend on the onboarding card.
      // With a plan: "Venit net lunar" + the 5-part bar (IncomeSplitCard).
      target: "budget.split",
      placement: "bottom",
      illustration: "jarBar",
      scrollIntoView: true,
      targetRadius: 16,
      title: () => "Cele cinci părți",
      body: (ctx) =>
        ctx.hasPlan
          ? "Venitul, împărțit în cinci. Venitul îl schimbi din creion, procentele din „Procente”. Sub bară, fiecare parte are rândul ei."
          : "După ce adaugi venitul, îl împărțim implicit 55 / 5 / 10 / 15 / 15. Procentele le poți schimba oricând.",
      points: (ctx) => [
        { glyph: "jarNeeds", lead: "Necesități:", text: "bugetele spațiilor: Mașină, Casă, Cumpărături, Cheltuieli." },
        { glyph: "jarGuiltFree", lead: "Bani fără vină:", text: "pe ce vrei tu. Marchezi o cheltuială „fără vină” când o editezi și nu mai intră în bugetul spațiului." },
        ctx.hasCredit
          ? { glyph: "jarThird", lead: "Credit:", text: "cât timp ai un credit activ, partea asta urmărește ratele. Dacă trec de procentul ales, te avertizăm." }
          : { glyph: "jarThird", lead: "Credit sau investiții:", text: "cu un credit activ în Cheltuieli, urmărește ratele; fără credit, e o țintă de investit." },
        { glyph: "jarSaving", lead: "Termen scurt și lung:", text: "termenul scurt se adaugă singur la Economii la începutul fiecărei luni; termenul lung e o țintă de pus deoparte." },
      ],
    },
    {
      id: "spaces",
      // The first space row (or the empty state when there's no space).
      target: "budget.spaces",
      placement: "bottom",
      illustration: "splitBar",
      // No bar on screen yet (no space, or no budget set) -> show one.
      illustrationWhen: (ctx) => (ctx.hasSpaces && ctx.hasBudgets ? "fallback" : "always"),
      scrollIntoView: true,
      targetRadius: 16,
      title: (ctx) => (ctx.hasPlan ? "Necesități pe spații" : "Bugetele pe spații"),
      body: (ctx) =>
        !ctx.hasSpaces
          ? "Când creezi un spațiu Mașină, Casă, Cumpărături sau Cheltuieli, apare aici cu bugetul lui și o bară ca asta:"
          : ctx.hasPlan
            ? "Fiecare spațiu primește o parte din necesități. Procentul de lângă nume e partea lui."
            : "Fiecare spațiu poate avea un buget lunar. Bara lui arată așa:",
      points: (ctx) => [
        { glyph: "barSpent", lead: "Plin:", text: "ce ai cheltuit deja." },
        { glyph: "barHatched", lead: "Hașurat:", text: "bani socotiți din timp, dar necheltuiți încă: facturi neplătite și cumpărături planificate în Calendar." },
        { glyph: "barLine", lead: "Linia:", text: "bugetul, când bara trece de el." },
        ...(ctx.hasPlan && ctx.hasSpaces
          ? [{ glyph: "budget" as TourGlyph, lead: "„Reîmparte”:", text: "împarte necesitățile pe spații după cât cheltuiești de obicei. Dedesubt vezi cât e împărțit și cât a rămas nealocat." }]
          : []),
        ...(ctx.hasSpaces ? [{ glyph: "tap" as TourGlyph, text: "Atinge un spațiu ca să-i vezi cheltuielile și să-i setezi sau schimbi bugetul." }] : []),
      ],
    },
    {
      id: "recurring",
      // The "Plăți recurente" header; its list is right under it.
      target: "budget.recurring",
      placement: "top",
      illustration: "swipeRow",
      scrollIntoView: true,
      targetRadius: 12,
      title: () => "Plăți recurente și economii",
      body: () => "Tot ce se repetă și costă bani, din Casă: facturile și mentenanța recurentă.",
      points: (ctx) => [
        { glyph: "repeat", lead: "Facturi:", text: "le scădem din buget din timp, ca „de plătit”. Mentenanța intră la Cheltuit abia când o marchezi făcută." },
        { glyph: "swipe", text: "Glisează o plată spre dreapta ca s-o rezolvi, spre stânga ca s-o ștergi." },
        ...(ctx.hasCredit
          ? [{ glyph: "reminder" as TourGlyph, lead: "Credite:", text: "ratele apar tot aici, dar se socotesc la Credit, nu în bugetul spațiului." }]
          : []),
        ctx.hasPlan
          ? { glyph: "savings", lead: "Economii:", text: "la începutul fiecărei luni primesc partea pe termen scurt și ce a rămas necheltuit din bugete. Le vezi la „Termen scurt”." }
          : { glyph: "savings", lead: "Economii:", text: "la începutul fiecărei luni primesc ce a rămas necheltuit din bugetele spațiilor. Atinge cardul Economii ca să-ți pui o țintă." },
      ],
    },
  ],
  finalCta: (ctx) => (ctx.hasSpaces ? null : { label: "Creează primul spațiu", href: "/spaces" }),
};

/* ---------------- Mașină ---------------- */

// Fires on the first open of ANY car space (one key for all of them).
// Facts come from lib/help.ts car.* -- keep the two in sync.
const SPACE_CAR: TourDef = {
  key: "space_car",
  version: 1,
  screen: "space_car",
  steps: [
    {
      id: "car",
      // The top card (Kilometraj / Luna asta / Consum mediu) + the linked
      // credit line under it.
      target: "car.top",
      placement: "bottom",
      illustration: "carHero",
      targetRadius: 20,
      title: () => "Mașina ta",
      body: () => "Sus vezi kilometrajul și cât te-a costat mașina luna asta.",
      points: (ctx) => [
        { glyph: "odometer", lead: "Kilometraj:", text: "cel mai mare introdus la o alimentare, un service sau de mână. Atinge kilometrajul ca să-l actualizezi." },
        { glyph: "tap", lead: "Luna asta:", text: "atinge suma ca să vezi tot ce a costat mașina, pe perioada aleasă." },
        { glyph: "fuel", lead: "Consum mediu:", text: "apare după cel puțin două alimentări, dacă ai trecut capacitatea rezervorului în profil (creionul din dreapta sus)." },
        ...(ctx.hasCredit
          ? [{ glyph: "reminder" as TourGlyph, lead: "Rata:", text: "linia de sub card arată creditul sau leasingul mașinii. Îl modifici din Cheltuieli › Credite." }]
          : []),
      ],
    },
    {
      id: "add",
      target: "car.actions",
      placement: "bottom",
      illustration: "carActions",
      scrollIntoView: true,
      targetRadius: 18,
      title: () => "Adaugă rapid",
      body: () => "Fiecare buton deschide formularul lui. Ce ai plătit intră în cheltuielile mașinii.",
      points: () => [
        { glyph: "fuel", lead: "Alimentare:", text: "doar prețul e obligatoriu. Kilometrajul de la plin îl actualizează pe al mașinii." },
        { glyph: "service", lead: "Service:", text: "toate lucrările de la o vizită și, dacă vrei, când e următorul: la kilometri, la dată sau ambele." },
        { glyph: "expense", lead: "Cheltuială:", text: "orice altceva: spălătorie, parcare, accesorii, amenzi." },
        { glyph: "document", lead: "Document:", text: "RCA, ITP, rovinietă, CASCO. Din data emiterii și a expirării știm când să te anunțăm." },
      ],
    },
    {
      id: "next",
      // The "Urmează" block -- only on screen when something is due.
      target: "car.next",
      placement: "bottom",
      illustration: "carNext",
      illustrationWhen: (ctx) => (ctx.hasUpcoming ? "fallback" : "always"),
      scrollIntoView: true,
      targetRadius: 16,
      title: () => "Urmează",
      body: (ctx) =>
        ctx.hasUpcoming
          ? "Documentele care expiră și service-urile care se apropie."
          : "Acum nu urmează nimic. Când se apropie un document sau un service, apare sub butoane, așa:",
      points: () => [
        { glyph: "document", lead: "Documente:", text: "apar cu 45 de zile înainte de expirare: galben, apoi portocaliu, roșu sub 15 zile sau expirat." },
        { glyph: "service", lead: "Service:", text: "apare când mai ai sub 2.000 km sau se apropie data." },
        { glyph: "swipe", text: "Glisează spre dreapta ca să reînnoiești un document sau să înregistrezi service-ul. Spre stânga ștergi un document." },
        { glyph: "tap", text: "Atinge un rând: se deschide formularul pentru reînnoire sau pentru următorul service, deja precompletat." },
      ],
    },
    {
      id: "records",
      // The Documente / Arhivă / Istoric pills under the car's name.
      target: "car.pages",
      placement: "bottom",
      illustration: "carPages",
      targetRadius: 20,
      title: () => "Istoric, documente, arhivă",
      body: () => "Pe pagină rămâne ce ai înregistrat azi și în ultimele 7 zile, cu filtre pe alimentări, service și cheltuieli. Nimic nu se pierde:",
      points: () => [
        { glyph: "history", lead: "Istoric:", text: "înregistrările mai vechi de 7 zile, grupate pe luni." },
        { glyph: "document", lead: "Documente:", text: "toate documentele mașinii, ordonate după expirare." },
        { glyph: "archive", lead: "Arhivă:", text: "documentele și lucrările înlocuite la reînnoire. Se numără în continuare la cheltuieli." },
        { glyph: "swipe", text: "Atinge o înregistrare ca s-o modifici, glisează spre stânga ca s-o ștergi." },
      ],
    },
  ],
};

export const TOURS: Partial<Record<TourKey, TourDef>> = { home: HOME, calendar: CALENDAR, budget: BUDGET, space_car: SPACE_CAR };

/** Every tour the app plans, in Settings' "Revezi ghidurile" order. Only
 * the ones in TOURS exist yet -- the rest show as "În curând". */
/** `href`: the screen that owns the tour (Settings goes there to replay it).
 * `spaceKind`: a Space tour -- its screen is the user's FIRST space of that
 * kind (`/<id>`, Settings looks it up); none yet = "După primul spațiu". */
export const TOUR_LIST: { key: TourKey; label: string; icon: string; href?: string; spaceKind?: "car" | "home" | "grocery" | "expenses" }[] = [
  { key: "home", label: "Acasă", icon: "home-outline", href: "/(tabs)/home" },
  { key: "spaces", label: "Spații", icon: "grid-outline" },
  { key: "calendar", label: "Calendar", icon: "calendar-outline", href: "/(tabs)/calendar" },
  { key: "budget", label: "Buget", icon: "wallet-outline", href: "/(tabs)/budget" },
  { key: "space_car", label: "Mașină", icon: "car-outline", spaceKind: "car" },
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
