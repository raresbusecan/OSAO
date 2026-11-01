import { daysFromToday, roCount, roNumber } from "@/lib/format";
import { maintenanceLabel } from "@/lib/spaces/car/maintenanceLabels";
import { kmUrgencyTier, type KmUrgencyTier } from "@/lib/spaces/car/maintenanceTiers";
import { recordActionHref } from "@/lib/navigation/recordActionRoute";

/** Per-Space counts of what's due, by LOCAL calendar day. */
export type SpaceDue = { overdue: number; today: number; upcoming: number };

/** Buckets /api/dashboard's items (overdue + today + upcoming, any
 * order) per space id, by daysFromToday -- the same rule the "De făcut"
 * sheet and the Casă Scadențe card use, so a tile's number matches. */
export function dueBySpace(items: { due_at: string; space?: { id: number | string } | null; reminder?: boolean }[]): Map<string, SpaceDue> {
  const out = new Map<string, SpaceDue>();
  items.forEach((it) => {
    // A credit instalment (`reminder: true`) is a reminder, never "1 azi".
    if (!it.space || it.reminder) return;
    const key = String(it.space.id);
    const d = out.get(key) ?? { overdue: 0, today: 0, upcoming: 0 };
    const days = daysFromToday(it.due_at);
    if (days < 0) d.overdue += 1;
    else if (days === 0) d.today += 1;
    else d.upcoming += 1;
    out.set(key, d);
  });
  return out;
}

/** A tile's one status line: the most severe tier only -- "8 restante"
 * (red), else "1 azi" (amber), else null (the caller says "La zi" or
 * shows something else). "Restant" never covers anything not yet due. */
export function dueStatus(d: SpaceDue | undefined): { text: string; tone: "error" | "warning" } | null {
  if (!d) return null;
  if (d.overdue > 0) return { text: roCount(d.overdue, "restantă", "restante"), tone: "error" };
  if (d.today > 0) return { text: `${d.today} azi`, tone: "warning" };
  return null;
}

/** Car document types stored as typed keys (CarDocumentForm /
 * quickAdd's DOCUMENT_TYPES) -- a document saved without its own title
 * carries the key as its title. */
const DOCUMENT_TITLE_LABEL: Record<string, string> = { Tax: "Impozit", Rovinieta: "Rovinietă" };

/** Display title for any record that may carry an English storage key as
 * its title: a car service ("Oil Change" -> "Schimb ulei"), a fill-up
 * saved without a station ("Fuel fill-up" -> "Alimentare"), a document
 * titled by its type ("Tax" -> "Impozit"). Everything else as typed. Use it
 * wherever a server row's title is shown (De făcut, Calendar, Buget). */
export function todoTitle(item: { type: string; title: string }): string {
  if (item.type === "car_maintenance") return maintenanceLabel(item.title);
  if (item.type === "car_fuel" && (!item.title || item.title === "Fuel fill-up")) return "Alimentare";
  if (item.type === "car_document") return DOCUMENT_TITLE_LABEL[item.title] ?? item.title;
  return item.title;
}

/** A car service due by km has no real date. Past its km the server dates
 * it yesterday (groups as restant) and sends `overdue_km`; within the
 * Mașină space's window (lib/spaces/car/maintenanceTiers.ts) it dates it
 * tomorrow and sends `km_left`. This is the label + tier every screen
 * shows for it, same as Mașină's (color it with urgencyTierColor). */
export function serviceKmStatus(item: { overdue_km?: number | null; km_left?: number | null }): { label: string; tier: KmUrgencyTier } | null {
  if (item.overdue_km) return { label: `Depășit cu ${roNumber(item.overdue_km)} km`, tier: "critical" };
  if (item.km_left != null) {
    const tier = kmUrgencyTier(item.km_left);
    if (tier) return { label: item.km_left === 0 ? "Acum" : `În ${roNumber(item.km_left)} km`, tier };
  }
  return null;
}

/** Space records open their owning section in a temporary root Stack flow;
 * completion returns to the unchanged origin. Payment rows retain item_id
 * separately from their synthetic occurrence id. Personal events use Calendar. */
export function todoHref(item: { id: number | string; item_id?: number | string; type: string; due_at?: string | null; space?: { id: number | string } | null; space_id?: number | string | null }, intent: "view" | "resolve" = "view"): string {
  const spaceId = item.space_id ?? item.space?.id;
  if (spaceId != null) {
    const href = recordActionHref({ ...item, id: item.item_id ?? item.id, space: { id: spaceId } });
    // Due car alerts create the next document/service; history keeps the saved record.
    const action = intent === "resolve" && (item.type === "car_document" || item.type === "car_maintenance") ? `${href}&action=renew` : href;
    // Resolving opens just the form, over the screen it came from (user,
    // 2026-11-01) -- see app/record-action.tsx.
    return intent === "resolve" && action.startsWith("/record-action") ? `${action}&overlay=1` : action;
  }
  // Missing an eager-loaded relation must never turn a Space record into
  // a Calendar event. Only personal events belong to Calendar.
  if (item.type !== "custom_event") return "/spaces";
  if (!item.due_at) return "/calendar";
  const due = new Date(item.due_at);
  if (Number.isNaN(due.getTime())) return "/calendar";
  return `/calendar?date=${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
}
