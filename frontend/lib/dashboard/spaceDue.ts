import { daysFromToday, roCount, roNumber } from "@/lib/format";
import { maintenanceLabel } from "@/lib/spaces/car/maintenanceLabels";

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

/** Display title for a "De făcut" item -- car services are stored under
 * an English key ("Oil Change") and shown by their Romanian label. */
export function todoTitle(item: { type: string; title: string }): string {
  return item.type === "car_maintenance" ? maintenanceLabel(item.title) : item.title;
}

/** A car service past its km threshold has no real date; the server
 * dates it yesterday (so it groups as restant) and sends `overdue_km` --
 * this is the label every screen shows for it, same as Mașină's. */
export function overdueKmLabel(item: { overdue_km?: number | null }): string | null {
  return item.overdue_km ? `Depășit cu ${roNumber(item.overdue_km)} km` : null;
}

/** Where a "De făcut" item gets resolved: its Space's own sub-view
 * (see [id].tsx's itemId/itemType deep-link), or Calendar on that day
 * for a personal event, which has no space. */
export function todoHref(item: { id: number | string; type: string; due_at: string; space?: { id: number | string } | null }): string {
  if (item.space) return `/${item.space.id}?itemId=${item.id}&itemType=${item.type}`;
  const due = new Date(item.due_at);
  if (Number.isNaN(due.getTime())) return "/calendar";
  return `/calendar?date=${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
}
