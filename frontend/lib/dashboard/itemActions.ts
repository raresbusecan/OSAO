import { api } from "@/lib/api";
import { chooseAction, confirmAction, notifyAction } from "@/lib/confirm";
import { daysFromToday, lei, roDate, roNumber } from "@/lib/format";
import { addRecurrenceInterval } from "@/components/spaces/home/homeCategoryConfig";
import { nextTaskOccurrence } from "@/lib/spaces/home/calculations/dashboard.calculations";
import { formatDateInput, isValidDateInput, parseDateInput } from "@/lib/spaces/car/utils/dateInput";
import { todoHref, todoTitle } from "@/lib/dashboard/spaceDue";
import { askRenewal, parseDocDate, renewalPeriod, renewedTitle, toCarDate, toIsoDate } from "@/lib/dashboard/documentRenewal";

/** The shape every aggregated list (Acasă, "De făcut", Calendar, Buget)
 * gets from the API -- enough to resolve or delete it from there. */
export type ActionItem = {
  id: number | string;
  type: string;
  title: string;
  due_at: string;
  amount?: number | string | null;
  recurrence?: string | null;
  metadata?: Record<string, any> | null;
  space?: { id: number | string } | null;
  space_id?: number | string | null;
  overdue_km?: number | null;
  current_odometer?: number | null;
};

/**
 * Swipe-right ("rezolvă") and swipe-left ("șterge") for an item shown
 * OUTSIDE its own Space (Acasă, "De făcut", Calendar, Buget) -- one rule
 * set, so a bill paid from Acasă ends up exactly as if it were paid
 * inside Casă.
 *
 * Resolving from a summary screen never leaves it: one dialog offers
 * "Rezolvă cu datele salvate" (resolved right there, with the amount /
 * provider / interval already saved on the record) or "Modifică
 * informațiile" (opens that record's own resolve step in its Space).
 * A document's swipe-right RENEWS it (askRenewal): a new validity period
 * computed from the old validity dates, or the renewal form.
 */
export function canSwipeResolve(item: ActionItem): boolean {
  switch (item.type) {
    case "home_recurring":
    case "home_task":
    case "home_maintenance":
    case "car_maintenance":
    case "car_document":
    case "home_document":
      return true;
    case "custom_event":
      return !item.recurrence;
    default:
      return false; // documents, logs
  }
}

/** "Modifică informațiile": the record's own resolve step in its Space. */
export function editRoute(item: ActionItem): string {
  const base = todoHref(item, "resolve");
  if (item.type === "home_maintenance") return `${base}&action=resolve`;
  return base;
}

const amountOf = (item: ActionItem) => Number(item.amount ?? 0) || 0;

/** What "datele salvate" means for this record, said in one line. */
function savedSummary(item: ActionItem): string {
  const meta = item.metadata ?? {};
  const amount = amountOf(item);
  switch (item.type) {
    case "home_recurring":
      return amount > 0 ? `Plata de ${lei(amount)} se înregistrează azi.` : "Trece la următoarea scadență.";
    case "home_maintenance":
      return amount > 0 ? `Costul de ${lei(amount)} se înregistrează azi.` : "Se marchează făcută azi.";
    case "home_task":
      return meta.isPurchase && amount > 0 ? `Prețul de ${lei(amount)} se înregistrează azi.` : "Se marchează rezolvată azi.";
    case "car_maintenance": {
      const parts = [
        item.current_odometer ? `la ${roNumber(item.current_odometer)} km` : null,
        meta.provider ? `la ${meta.provider}` : null,
        amount > 0 ? lei(amount) : null,
      ].filter(Boolean);
      return `Se înregistrează un service nou, azi${parts.length ? `, ${parts.join(", ")}` : ""}, ca ultima dată.`;
    }
    default:
      return "Se marchează rezolvat azi.";
  }
}

/**
 * Paying/resolving a recurring item BEFORE its date: ask whether the
 * next date counts from today (re-anchor the schedule) or keeps the
 * usual rhythm. `advance(base)` computes the next date from a base.
 * Returns the chosen date (ISO), or null on cancellation. Exported for Casă.
 */
export async function nextDateAfterResolve(dueIso: string, advance: (baseIso: string) => string): Promise<string | null> {
  const usual = advance(dueIso);
  if (daysFromToday(dueIso) <= 0) return usual;
  const today = new Date();
  const fromToday = advance(new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString());
  const choice = await chooseAction(
    "Văd că rezolvi mai devreme",
    `Scadența era pe ${roDate(dueIso)}. Următoarea dată o calculez de azi (${roDate(fromToday)}) sau păstrez programul (${roDate(usual)})?`,
    [
      { key: "today", label: "De azi" },
      { key: "schedule", label: `Păstrez ${roDate(usual, { short: true })}`, secondary: true },
    ],
  );
  return choice === "today" ? fromToday : choice === "schedule" ? usual : null;
}

/**
 * Swipe-right from a summary screen. Returns true when the record
 * changed (the caller refreshes); "Modifică informațiile" navigates and
 * returns false.
 */
export async function resolveFromSummary(item: ActionItem, navigate: (href: string) => void): Promise<boolean> {
  if (item.type === "car_document" || item.type === "home_document") {
    const meta = item.metadata ?? {};
    const period = renewalPeriod(meta.issueDate, meta.expiryDate);
    const pick = await askRenewal(todoTitle(item), period);
    if (pick === "edit") {
      navigate(editRoute(item));
      return false;
    }
    if (pick !== "saved" || !period) return false;
    try {
      await renewDocumentWithSaved(item, period);
      notifyAction("Reînnoit", `Valabil până pe ${roDate(period.expiry, { withYear: true })}.`);
      return true;
    } catch (error: any) {
      notifyAction("Nu am putut reînnoi", error?.message || "A apărut o eroare.");
      return false;
    }
  }
  const choice = await chooseAction(
    `Rezolvi „${todoTitle(item)}”?`,
    `Rezolvă înregistrarea conform informațiilor salvate inițial sau modifică informațiile. ${savedSummary(item)}`,
    [
      { key: "saved", label: "Rezolvă cu datele salvate" },
      { key: "edit", label: "Modifică informațiile", secondary: true },
    ],
  );
  if (choice === "edit") {
    navigate(editRoute(item));
    return false;
  }
  if (choice !== "saved") return false;
  return resolveWithSaved(item);
}

/** Resolves with what's already saved on the record -- the same end
 * state each Space's own resolve produces. */
async function resolveWithSaved(item: ActionItem): Promise<boolean> {
  const meta = item.metadata ?? {};
  const now = new Date().toISOString();
  const amount = amountOf(item);
  const history: any[] = Array.isArray(meta.spendHistory) ? meta.spendHistory : [];
  const withSpend = amount > 0 ? [...history, { date: now, amount }] : history;
  try {
    switch (item.type) {
      case "home_recurring": {
        const next = await nextDateAfterResolve(item.due_at, (base) => addRecurrenceInterval(base, (item.recurrence as any) ?? "monthly", 1));
        if (next === null) return false;
        await api.updateItem(item.id, { due_at: next, metadata: { spendHistory: withSpend } });
        notifyAction("Plătită", `Următoarea scadență: ${roDate(next)}.`);
        return true;
      }
      case "home_task": {
        const spend = meta.isPurchase ? { metadata: { spendHistory: withSpend } } : {};
        if (meta.isRecurring || item.recurrence) {
          const freq = (meta.recurrenceFrequency ?? item.recurrence ?? "weekly") as "daily" | "weekly" | "monthly";
          const next = await nextDateAfterResolve(item.due_at, (base) => nextTaskOccurrence(base, freq));
          if (next === null) return false;
          await api.updateItem(item.id, { due_at: next, completed_at: now, ...spend });
          notifyAction("Rezolvată", `Următoarea dată: ${roDate(next)}.`);
        } else {
          await api.updateItem(item.id, { status: "completed", completed_at: now, ...spend });
        }
        return true;
      }
      case "home_maintenance": {
        if (item.recurrence) {
          const base = meta.nextDueDate || item.due_at;
          const interval = Number(meta.recurrenceInterval ?? 1) || 1;
          const next = await nextDateAfterResolve(base, (b) => addRecurrenceInterval(b, (item.recurrence as any) ?? "monthly", interval));
          if (next === null) return false;
          await api.updateItem(item.id, { metadata: { nextDueDate: next, spendHistory: withSpend } });
          notifyAction("Rezolvată", `Următoarea dată: ${roDate(next)}.`);
        } else {
          await api.updateItem(item.id, { status: "completed", completed_at: now });
        }
        return true;
      }
      case "car_maintenance":
        await logCarServiceAgain(item);
        notifyAction("Service înregistrat", "L-am adăugat azi, cu datele de data trecută.");
        return true;
      default:
        await api.updateItem(item.id, { status: "completed", completed_at: now });
        return true;
    }
  } catch (error: any) {
    notifyAction("Nu am putut marca drept rezolvat", error?.message || "A apărut o eroare.");
    return false;
  }
}

/** A due car service, "same as last time": a new service record today
 * at the current odometer, with the same provider/price, and its next
 * service pushed by the same km/day interval the previous one had. The
 * newer record supersedes the old one's alert (isMaintenanceSuperseded,
 * DashboardController::carServiceDue). */
async function logCarServiceAgain(item: ActionItem) {
  const meta = item.metadata ?? {};
  const odo = item.current_odometer ?? null;
  const kmInterval = meta.odometer != null && meta.nextServiceOdometer != null ? Number(meta.nextServiceOdometer) - Number(meta.odometer) : null;
  let nextServiceDate: string | null = null;
  if (typeof meta.nextServiceDate === "string" && isValidDateInput(meta.nextServiceDate) && item.due_at) {
    const days = Math.round((new Date(parseDateInput(meta.nextServiceDate)!).getTime() - new Date(item.due_at).getTime()) / 86400000);
    if (days > 0) nextServiceDate = formatDateInput(new Date(Date.now() + days * 86400000));
  }
  const amount = amountOf(item);
  await api.createItem({
    space_id: item.space?.id,
    type: "car_maintenance",
    title: item.title,
    amount: amount > 0 ? amount : null,
    currency: amount > 0 ? "RON" : null,
    due_at: new Date().toISOString(),
    metadata: {
      description: meta.description ?? null,
      provider: meta.provider ?? null,
      odometer: odo,
      nextServiceOdometer: odo != null && kmInterval && kmInterval > 0 ? odo + kmInterval : null,
      nextServiceDate,
      underWarranty: false,
      renewedFromId: String(item.id),
    },
  } as any);
}

/** "Reînnoiește cu datele vechi" from a summary screen. A car document
 * becomes a NEW record (the old one stays in history -- archived right
 * away only if it had already expired, same rule as the Car renew form);
 * a Casă document has no history, so its dates move forward in place. */
async function renewDocumentWithSaved(item: ActionItem, period: { issue: Date; expiry: Date }) {
  const meta = item.metadata ?? {};
  if (item.type === "home_document") {
    await api.updateItem(item.id, { metadata: { issueDate: toIsoDate(period.issue), expiryDate: toIsoDate(period.expiry) } });
    return;
  }
  const oldExpiry = parseDocDate(meta.expiryDate);
  const amount = amountOf(item);
  await api.createItem({
    space_id: item.space?.id,
    type: "car_document",
    title: renewedTitle(item.title, oldExpiry, period.expiry),
    amount: amount > 0 ? amount : null,
    currency: amount > 0 ? "RON" : null,
    due_at: new Date().toISOString(),
    metadata: {
      documentType: meta.documentType ?? null,
      issuer: meta.issuer ?? null,
      notes: meta.notes ?? null,
      issueDate: toCarDate(period.issue),
      expiryDate: toCarDate(period.expiry),
      renewedFromId: String(item.id),
    },
  } as any);
  if (oldExpiry && daysFromToday(oldExpiry) < 0) await api.updateItem(item.id, { status: "archived" });
}

/** Swipe-left: deletes after a confirmation that says what goes. */
export async function deleteAnywhere(item: ActionItem): Promise<boolean> {
  const title = todoTitle(item);
  const series = !!item.recurrence || item.type === "home_recurring";
  const ok = await confirmAction(
    series ? "Ștergi plata recurentă?" : "Ștergi?",
    series ? `„${title}” și toate scadențele ei viitoare dispar definitiv.` : `„${title}” se șterge definitiv.`,
    { confirmLabel: "Șterge", destructive: true },
  );
  if (!ok) return false;
  try {
    await api.deleteItem(item.id);
    return true;
  } catch (error: any) {
    notifyAction("Nu am putut șterge", error?.message || "A apărut o eroare.");
    return false;
  }
}
