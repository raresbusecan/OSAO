import type { HomeData } from "@/components/spaces/home/home.data.types";
import type { HomeNextItem } from "@/components/spaces/home/home.ui.types";

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DOC_ALERT_DAYS = 45;
const DUE_ALERT_DAYS = 14;

export function getThisMonthHomeExpenses(homeData: HomeData): number {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const isCurrentMonth = (dateString: string) => {
    const d = new Date(dateString);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  };

  let total = 0;

  homeData.expenseEntries.forEach((entry) => {
    if (isCurrentMonth(entry.date)) {
      total += entry.amount;
    }
  });

  homeData.maintenanceEntries.forEach((entry) => {
    if (isCurrentMonth(entry.date)) {
      total += entry.price;
    }
  });

  return total;
}

function daysUntil(dateString: string, now: Date): number {
  return Math.ceil(
    (new Date(dateString).getTime() - now.getTime()) / MS_PER_DAY,
  );
}

function dueSubtitle(daysRemaining: number, verb: "Expires" | "Due"): string {
  if (daysRemaining < 0) {
    const overdueVerb = verb === "Expires" ? "Expired" : "Overdue by";
    const days = Math.abs(daysRemaining);
    return verb === "Expires"
      ? `${overdueVerb} ${days} day${days !== 1 ? "s" : ""} ago`
      : `${overdueVerb} ${days} day${days !== 1 ? "s" : ""}`;
  }

  return `${verb} in ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}`;
}

export function getUpcomingHomeItems(
  homeData: HomeData,
  limit?: number,
): HomeNextItem[] {
  const now = new Date();
  const items: Array<HomeNextItem & { urgency: number }> = [];

  homeData.documentEntries.forEach((entry) => {
    if (!entry.expiryDate) return;

    const remaining = daysUntil(entry.expiryDate, now);
    if (remaining > DOC_ALERT_DAYS) return;

    items.push({
      id: `doc-${entry.id}`,
      icon: "document-text-outline",
      title: entry.title,
      subtitle: dueSubtitle(remaining, "Expires"),
      urgency: remaining,
    });
  });

  homeData.maintenanceEntries.forEach((entry) => {
    if (!entry.nextDueDate) return;

    const remaining = daysUntil(entry.nextDueDate, now);
    if (remaining > DUE_ALERT_DAYS) return;

    items.push({
      id: `maint-${entry.id}`,
      icon: "construct-outline",
      title: entry.service,
      subtitle: dueSubtitle(remaining, "Due"),
      urgency: remaining,
    });
  });

  homeData.recurringEntries.forEach((entry) => {
    const remaining = daysUntil(entry.nextDueDate, now);
    if (remaining > DUE_ALERT_DAYS) return;

    items.push({
      id: `rec-${entry.id}`,
      icon: "repeat-outline",
      title: entry.title,
      subtitle: dueSubtitle(remaining, "Due"),
      urgency: remaining,
    });
  });

  items.sort((a, b) => a.urgency - b.urgency);

  const limited = limit !== undefined ? items.slice(0, limit) : items;

  return limited.map(({ urgency, ...item }) => item);
}
