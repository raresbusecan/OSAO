import type { Ionicons } from "@expo/vector-icons";

/**
 * The Acasă screen is a list of cards the user arranges: which cards,
 * in what order, wide or compact (two compact cards share a row), an
 * optional color, hidden or not, and a few per-card settings. Saved
 * per user on the server (PUT /dashboard/layout) so it's the same on
 * the phone and the web; `null` there means "never customized" and the
 * app shows DEFAULT_LAYOUT. Mockup: the "orgOS Acasă personalizabil"
 * canvas.
 */

export type WidgetType = "spend" | "todo" | "bills" | "savings" | "budget" | "car" | "grocery" | "supplies" | "calendar" | "expenses";
export type WidgetSize = "wide" | "compact";

export type WidgetSettings = {
  /** Replaces the card's own heading. */
  title?: string;
  /** todo: only this space ("" / undefined = all); car/supplies/expenses: which space. */
  spaceId?: string;
  /** grocery: which shopping list. */
  listId?: string;
  /** List cards: how many rows (0 = all). */
  rows?: number;
  /** spend: a ring (default) or the horizontal split bar. */
  chart?: "ring" | "bar";
};

export type Widget = {
  id: string;
  type: WidgetType;
  size: WidgetSize;
  /** A palette hex; null/undefined = the card's natural color (its Space's). */
  color?: string | null;
  hidden?: boolean;
  settings?: WidgetSettings;
};

type IconName = keyof typeof Ionicons.glyphMap;

export const WIDGET_META: Record<WidgetType, {
  label: string;
  description: string;
  group: "bani" | "todo" | "spatii";
  icon: IconName;
  defaultSize: WidgetSize;
  /** Cards that point at one space/list -- one card per instance. */
  perInstance?: "car" | "list" | "home" | "expenses";
  /** List-style cards offer "câte rânduri". */
  hasRows?: boolean;
}> = {
  spend: { label: "Cheltuit în luna asta", description: "Totalul lunii, pe spații", group: "bani", icon: "wallet-outline", defaultSize: "wide" },
  budget: { label: "Cheltuit pe spații", description: "Cât ai cheltuit luna asta în fiecare spațiu", group: "bani", icon: "pie-chart-outline", defaultSize: "wide" },
  savings: { label: "Economii", description: "Obiectivul și cât ai strâns", group: "bani", icon: "trending-up-outline", defaultSize: "wide" },
  bills: { label: "Plăți recurente", description: "Următoarele facturi și restanțele", group: "bani", icon: "repeat", defaultSize: "wide", hasRows: true },
  todo: { label: "De făcut", description: "Cel mai urgent din fiecare spațiu", group: "todo", icon: "checkbox-outline", defaultSize: "wide", hasRows: true },
  calendar: { label: "Următoarele 7 zile", description: "Ce urmează, zi cu zi", group: "todo", icon: "calendar-outline", defaultSize: "wide", hasRows: true },
  car: { label: "Mașină", description: "Kilometraj, următorul service, documente", group: "spatii", icon: "car-outline", defaultSize: "compact", perInstance: "car" },
  grocery: { label: "Listă de cumpărături", description: "Ce mai ai de luat", group: "spatii", icon: "cart-outline", defaultSize: "wide", perInstance: "list", hasRows: true },
  supplies: { label: "Provizii", description: "Ce se termină în Casă", group: "spatii", icon: "basket-outline", defaultSize: "compact", perInstance: "home" },
  expenses: { label: "Cheltuieli", description: "Cât ai cheltuit luna asta", group: "spatii", icon: "receipt-outline", defaultSize: "compact", perInstance: "expenses" },
};

/** Card colors: the identity hues plus a few more, all chosen to stay
 * readable as a tint on both the dark and the light theme. */
export const WIDGET_PALETTE: { name: string; hex: string }[] = [
  { name: "Albastru", hex: "#3B82F6" },
  { name: "Mov", hex: "#9333EA" },
  { name: "Chihlimbar", hex: "#F59E0B" },
  { name: "Turcoaz", hex: "#14B8A6" },
  { name: "Roz", hex: "#EC4899" },
  { name: "Verde", hex: "#2EBD85" },
  { name: "Portocaliu", hex: "#F97316" },
  { name: "Ardezie", hex: "#64748B" },
];

export const ROW_CHOICES: { key: string; label: string; value: number }[] = [
  { key: "3", label: "3", value: 3 },
  { key: "5", label: "5", value: 5 },
  { key: "0", label: "Toate", value: 0 },
];

export function newWidgetId(): string {
  return `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function newWidget(type: WidgetType, settings?: WidgetSettings): Widget {
  return { id: newWidgetId(), type, size: WIDGET_META[type].defaultSize, color: null, hidden: false, settings: settings ?? {} };
}

/** What Acasă showed before it was customizable -- also "Revino la implicit". */
export function defaultLayout(): Widget[] {
  return [
    { id: "spend", type: "spend", size: "wide" },
    { id: "todo", type: "todo", size: "wide" },
    { id: "bills", type: "bills", size: "wide", settings: { rows: 3 } },
    { id: "savings", type: "savings", size: "wide" },
  ];
}

export type LayoutTemplate = { key: string; name: string; description: string; build: (ctx: { firstListId?: string; firstCarId?: string }) => Widget[] };

export const LAYOUT_TEMPLATES: LayoutTemplate[] = [
  { key: "complet", name: "Complet", description: "Cum e acum", build: () => defaultLayout() },
  {
    key: "bani",
    name: "Doar bani",
    description: "Buget, plăți, economii",
    build: () => [
      { ...newWidget("spend"), size: "compact" },
      { ...newWidget("savings"), size: "compact" },
      newWidget("budget"),
      { ...newWidget("bills"), settings: { rows: 5, title: "Plăți luna asta" } },
    ],
  },
  {
    key: "minimal",
    name: "Minimal",
    description: "De făcut și o listă",
    build: ({ firstListId, firstCarId }) => [
      { ...newWidget("todo"), settings: { rows: 3 } },
      ...(firstCarId ? [newWidget("car", { spaceId: firstCarId })] : []),
      { ...newWidget("calendar"), size: "compact" as WidgetSize, settings: { rows: 3 } },
      ...(firstListId ? [newWidget("grocery", { listId: firstListId, rows: 3 })] : []),
    ],
  },
];

/** Two compact cards side by side, everything else on its own row; a
 * lone compact card keeps its half width (an empty slot beside it). */
export function toRows(widgets: Widget[]): Widget[][] {
  const rows: Widget[][] = [];
  let pending: Widget | null = null;
  widgets.forEach((w) => {
    if (w.size === "compact") {
      if (pending) {
        rows.push([pending, w]);
        pending = null;
      } else {
        pending = w;
      }
      return;
    }
    if (pending) {
      rows.push([pending]);
      pending = null;
    }
    rows.push([w]);
  });
  if (pending) rows.push([pending]);
  return rows;
}

/** Keeps only well-formed cards of known types (a layout saved by a
 * newer app version can't crash an older one). */
export function sanitizeLayout(raw: unknown): Widget[] | null {
  if (!Array.isArray(raw)) return null;
  const out = raw.filter(
    (w: any) => w && typeof w.id === "string" && w.type in WIDGET_META && (w.size === "wide" || w.size === "compact"),
  ) as Widget[];
  return ensureSpendCard(out);
}

/** The monthly spend card (ring chart) is mandatory on Acasă (user decision
 * 2026-10-09): it can be moved, resized and recoloured, but never removed
 * or hidden. Puts one first if a layout (saved, template, draft) lacks it
 * and un-hides an existing one. */
export function ensureSpendCard(layout: Widget[]): Widget[] {
  if (layout.some((w) => w.type === "spend")) {
    return layout.map((w) => (w.type === "spend" && w.hidden ? { ...w, hidden: false } : w));
  }
  return [{ id: "spend", type: "spend", size: "wide" }, ...layout];
}
