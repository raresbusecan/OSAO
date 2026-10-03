import type { CarData } from "@/components/spaces/car/car.data.types";
import { roCount, roDate, roNumber } from "@/lib/format";
import type { CarNextItem } from "@/components/spaces/car/car.ui.types";
import type {
  CarDocumentEntry,
  CarMaintenanceEntry,
} from "../car.types";
import { getSortedFuelEntries } from "./../utils/fuel.utils";
import {
  calculateDistance,
  calculateEstimatedLitersConsumed,
} from "./fuel.calculations";

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DOC_ALERT_DAYS = 45;

export function getCurrentOdometer(carData: CarData): number {
  let maxOdometer = carData.vehicle.mileage || 0;

  carData.fuelEntries.forEach((entry) => {
    if (entry.odometer !== undefined && entry.odometer > maxOdometer) {
      maxOdometer = entry.odometer;
    }
  });

  carData.maintenanceEntries.forEach((entry) => {
    if (entry.odometer !== undefined && entry.odometer > maxOdometer) {
      maxOdometer = entry.odometer;
    }
  });

  carData.expenseEntries.forEach((entry) => {
    if (entry.odometer && entry.odometer > maxOdometer) {
      maxOdometer = entry.odometer;
    }
  });

  return maxOdometer;
}

export function getThisMonthExpenses(carData: CarData): number {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const isCurrentMonth = (dateString: string) => {
    const d = new Date(dateString);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  };

  let total = 0;

  carData.fuelEntries.forEach((entry) => {
    if (isCurrentMonth(entry.date)) {
      total += entry.total_paid ?? 0;
    }
  });

  carData.maintenanceEntries.forEach((entry) => {
    if (isCurrentMonth(entry.date)) {
      total += entry.price;
    }
  });

  carData.documentEntries.forEach((entry) => {
    if (entry.price && isCurrentMonth(entry.date)) {
      total += entry.price;
    }
  });

  carData.expenseEntries.forEach((entry) => {
    if (isCurrentMonth(entry.date)) {
      total += entry.amount;
    }
  });

  return total;
}

/**
 * Average fuel consumption across all recorded fuel entries, as a
 * single L/100km number.
 *
 * We DON'T average the individual per-entry consumption values —
 * that would weight a 50km trip the same as a 2000km trip. Instead
 * we sum total liters consumed and total distance covered across all
 * valid consecutive entry pairs, then compute one overall rate
 * (totalLiters / totalDistance × 100). This matches real-world fuel
 * economy better.
 *
 * Returns null when there isn't enough data yet (fewer than 2 fuel
 * entries, no tank capacity set, or no valid consecutive pair —
 * e.g. only partial fills where the tank level went the wrong way).
 */
export function getAverageFuelConsumption(
  carData: CarData,
): number | null {
  const tankCapacity = carData.vehicle.tank_capacity_liters ?? 0;

  if (tankCapacity <= 0) {
    return null;
  }

  const sortedEntries = getSortedFuelEntries(carData.fuelEntries);

  if (sortedEntries.length < 2) {
    return null;
  }

  let totalDistance = 0;
  let totalLiters = 0;

  for (let i = 1; i < sortedEntries.length; i++) {
    const previousEntry = sortedEntries[i - 1];
    const currentEntry = sortedEntries[i];

    const distance = calculateDistance(previousEntry, currentEntry);
    const litersConsumed = calculateEstimatedLitersConsumed(
      previousEntry,
      currentEntry,
      tankCapacity,
    );

    if (distance === null || litersConsumed === null) {
      continue;
    }

    totalDistance += distance;
    totalLiters += litersConsumed;
  }

  if (totalDistance <= 0 || totalLiters <= 0) {
    return null;
  }

  return Number(((totalLiters / totalDistance) * 100).toFixed(2));
}

function parseDateString(dateStr: string): Date | null {
  // Matches DD.MM.YYYY
  const match = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  return new Date(year, month - 1, day);
}

/* ============================================================
   DOCUMENT STATUS
   ============================================================ */

export type DocumentStatus =
  | "valid"
  | "expiring_soon"
  | "expired"
  | "no_expiry";

export type DocumentStatusResult = {
  status: DocumentStatus;
  daysUntilExpiry: number | null;
};

export function getDocumentStatus(
  entry: CarDocumentEntry,
  referenceDate: Date = new Date(),
): DocumentStatusResult {
  if (!entry.expiryDate) {
    return { status: "no_expiry", daysUntilExpiry: null };
  }

  const expiry = parseDateString(entry.expiryDate);

  if (!expiry) {
    return { status: "no_expiry", daysUntilExpiry: null };
  }

  const daysUntilExpiry = Math.ceil(
    (expiry.getTime() - referenceDate.getTime()) / MS_PER_DAY,
  );

  if (daysUntilExpiry < 0) {
    return { status: "expired", daysUntilExpiry };
  }

  if (daysUntilExpiry <= DOC_ALERT_DAYS) {
    return { status: "expiring_soon", daysUntilExpiry };
  }

  return { status: "valid", daysUntilExpiry };
}

// Shared by documents (day-based) and maintenance (km-based, day-based,
// or both -- see getMaintenanceUrgency below): the same 3 severity bands,
// so DUE SOON/RECENT/History/Expenses can render both categories with
// one set of colors/badges regardless of which one a row is.
export type UrgencyTier = "light" | "medium" | "critical";
/** @deprecated use UrgencyTier -- kept as an alias so existing call sites
 * that name it explicitly don't need to change. */
export type DocumentUrgencyTier = UrgencyTier;

const DOC_TIER_MEDIUM_DAYS = 30;
const DOC_TIER_CRITICAL_DAYS = 15;

function urgencyTierFromDays(daysUntilExpiry: number): UrgencyTier {
  if (daysUntilExpiry <= DOC_TIER_CRITICAL_DAYS) return "critical";
  if (daysUntilExpiry <= DOC_TIER_MEDIUM_DAYS) return "medium";
  return "light";
}

/**
 * Which of the 3 severity bands a document falls into -- a presentation
 * split of the existing expiring_soon/expired window (see
 * getDocumentStatus / DOC_ALERT_DAYS above), not a new alert boundary:
 * 45→30 days left is "light", 30→15 is "medium", under 15 -- including
 * already expired, since daysUntilExpiry goes negative -- is "critical".
 * null once the document isn't in the alert window at all (getUpcomingItems
 * already filters those out before this ever matters, but exported for
 * anywhere else that wants the same 3-way read on a single document).
 */
export function getDocumentUrgencyTier(
  entry: CarDocumentEntry,
  referenceDate: Date = new Date(),
): DocumentUrgencyTier | null {
  const { status, daysUntilExpiry } = getDocumentStatus(entry, referenceDate);
  if (status !== "expiring_soon" && status !== "expired") return null;
  if (daysUntilExpiry === null) return null;
  return urgencyTierFromDays(daysUntilExpiry);
}

export type CarDocumentEntryWithStatus = CarDocumentEntry &
  DocumentStatusResult;

export function getDocumentEntriesWithStatus(
  carData: CarData,
  referenceDate: Date = new Date(),
): CarDocumentEntryWithStatus[] {
  return carData.documentEntries.map((entry) => ({
    ...entry,
    ...getDocumentStatus(entry, referenceDate),
  }));
}

/**
 * True once a newer document of the same type exists (a real renewal, not
 * an edit -- see CarDashboard.tsx's "renew" flow off a NEXT alert, which
 * always creates a separate record rather than overwriting this one).
 * getUpcomingItems uses this to stop alerting on the old RCA/ITP/etc. the
 * moment its replacement is saved, instead of nagging about it until its
 * own expiry date happens to pass.
 */
export function isDocumentSuperseded(
  entry: CarDocumentEntry,
  allDocuments: CarDocumentEntry[],
): boolean {
  if (!entry.expiryDate) return false;
  const thisExpiry = parseDateString(entry.expiryDate);
  if (!thisExpiry) return false;

  return allDocuments.some((other) => {
    if (other.id === entry.id) return false;
    if (other.documentType !== entry.documentType) return false;
    if (!other.expiryDate) return false;

    const otherExpiry = parseDateString(other.expiryDate);
    return otherExpiry !== null && otherExpiry.getTime() > thisExpiry.getTime();
  });
}

/* ============================================================
   MAINTENANCE URGENCY -- km OR date, whichever comes first
   ============================================================
   A real interval like "10,000 km or 12 months" has two independent
   triggers; nextServiceOdometer and nextServiceDate on the entry are
   each optional and don't depend on each other. Whichever one is closer
   decides the tier, same as the actual rule mechanics/manufacturers use. */

const MAINT_TIER_LIGHT_KM = 2000; // entry point, same value MAINT_ALERT_KM used to alert at alone
const MAINT_TIER_MEDIUM_KM = 1000;
const MAINT_TIER_CRITICAL_KM = 500;

function urgencyTierFromKm(remainingKm: number): UrgencyTier {
  if (remainingKm <= MAINT_TIER_CRITICAL_KM) return "critical";
  if (remainingKm <= MAINT_TIER_MEDIUM_KM) return "medium";
  return "light";
}

type SingleDimensionUrgency = { tier: UrgencyTier; overdue: boolean };

function maintenanceKmUrgency(
  entry: CarMaintenanceEntry,
  currentOdometer: number,
): (SingleDimensionUrgency & { remainingKm: number }) | null {
  if (entry.nextServiceOdometer === undefined) return null;

  const remainingKm = entry.nextServiceOdometer - currentOdometer;
  if (remainingKm > MAINT_TIER_LIGHT_KM) return null; // not in the alert window yet

  return { tier: urgencyTierFromKm(remainingKm), overdue: remainingKm < 0, remainingKm };
}

function maintenanceDateUrgency(
  entry: CarMaintenanceEntry,
  referenceDate: Date,
): (SingleDimensionUrgency & { daysUntilService: number }) | null {
  if (!entry.nextServiceDate) return null;

  const target = parseDateString(entry.nextServiceDate);
  if (!target) return null;

  const daysUntilService = Math.ceil((target.getTime() - referenceDate.getTime()) / MS_PER_DAY);
  if (daysUntilService > DOC_ALERT_DAYS) return null; // not in the alert window yet

  return { tier: urgencyTierFromDays(daysUntilService), overdue: daysUntilService < 0, daysUntilService };
}

// critical+overdue outranks plain critical, which outranks medium, then
// light, then "not in window at all" (rank 0) -- this is the whole
// "whichever comes first" comparison, reduced to one number per dimension.
function urgencyRank(urgency: SingleDimensionUrgency | null): number {
  if (!urgency) return 0;
  const base = urgency.tier === "critical" ? 3 : urgency.tier === "medium" ? 2 : 1;
  return urgency.overdue ? base + 0.5 : base;
}

export type MaintenanceUrgencyResult = {
  tier: UrgencyTier | null;
  overdue: boolean;
  /** Which dimension actually produced `tier`/`overdue` -- null when
   * neither km nor date is close enough to matter (tier is null then
   * too). Lets callers build a message/label from the right numbers
   * instead of guessing which one to read. */
  decidedBy: "km" | "date" | null;
  remainingKm: number | null;
  daysUntilService: number | null;
};

/**
 * The single combined "how urgent is this service" read. Either,
 * both, or neither of nextServiceOdometer/nextServiceDate can be set on
 * an entry; when both are, whichever is more urgent wins -- exactly how
 * a real "X km or Y months" interval is meant to work. `tier` is null
 * (nothing to show) once neither dimension is within its own alert
 * window (2000 km / 45 days).
 */
export function getMaintenanceUrgency(
  entry: CarMaintenanceEntry,
  currentOdometer: number,
  referenceDate: Date = new Date(),
): MaintenanceUrgencyResult {
  const byKm = maintenanceKmUrgency(entry, currentOdometer);
  const byDate = maintenanceDateUrgency(entry, referenceDate);

  const decidedBy: "km" | "date" | null =
    urgencyRank(byKm) === 0 && urgencyRank(byDate) === 0
      ? null
      : urgencyRank(byKm) >= urgencyRank(byDate)
        ? "km"
        : "date";

  const winner = decidedBy === "date" ? byDate : byKm;

  return {
    tier: winner?.tier ?? null,
    overdue: winner?.overdue ?? false,
    decidedBy,
    remainingKm: byKm?.remainingKm ?? null,
    daysUntilService: byDate?.daysUntilService ?? null,
  };
}

/**
 * Service types that are inherently one-off, unpredictable events, not a
 * periodic thing with an interval -- a repair just happens when it
 * happens, there's no "next one due" to forecast. CarMaintenanceForm.tsx
 * uses this to skip asking for Next Service km/date at all for these
 * (nothing to predict), and isMaintenanceSuperseded below uses it so two
 * unrelated entries that happen to share this generic name (e.g. two
 * different "Repair" entries months apart) never get treated as one
 * renewing the other -- they're independent, both stay active forever.
 */
export const NON_RECURRING_MAINTENANCE_TYPES = new Set(["Repair"]);

/** Same idea as isDocumentSuperseded -- a later entry of the same
 * *recurring* service (e.g. a second "Oil Change" logged after this one)
 * means this one's own "next service due" prediction is stale; stop
 * alerting on it. Never true for NON_RECURRING_MAINTENANCE_TYPES (see
 * above) -- those just accumulate, they don't replace each other. */
export function isMaintenanceSuperseded(
  entry: CarMaintenanceEntry,
  allEntries: CarMaintenanceEntry[],
): boolean {
  if (NON_RECURRING_MAINTENANCE_TYPES.has(entry.service)) return false;

  return allEntries.some((other) => {
    if (other.id === entry.id) return false;
    if (other.service !== entry.service) return false;
    return new Date(other.date).getTime() > new Date(entry.date).getTime();
  });
}

export function getUpcomingItems(
  carData: CarData,
  currentOdometer: number,
  limit?: number,
): CarNextItem[] {
  const items: Array<CarNextItem & { urgency: number }> = [];

  // 1. Documents expiring soon or already expired -- but not once a
  // renewal (a newer document of the same type) has been saved. Without
  // this check, renewing RCA off its own NEXT alert wouldn't actually
  // clear that alert until its exact expiry date happened to pass.
  const documentsWithStatus = getDocumentEntriesWithStatus(carData);

  documentsWithStatus.forEach((entry) => {
    if (
      (entry.status !== "expiring_soon" && entry.status !== "expired") ||
      entry.daysUntilExpiry === null
    ) {
      return;
    }

    // `archived` (set explicitly when a renewal is saved) is the
    // authoritative signal; isDocumentSuperseded is a date-based fallback
    // for entries saved before archiving existed, or edited outside the
    // renew flow.
    if (entry.archived || isDocumentSuperseded(entry, carData.documentEntries)) {
      return;
    }

    const expiry = parseDateString(entry.expiryDate!);
    if (!expiry) return;

    // Subtitle = the absolute date, chip (`right`) = how far away it is
    // -- same split Home's "De făcut" rows use.
    const days = entry.daysUntilExpiry;
    const subtitle = entry.status === "expired" ? `a expirat pe ${roDate(expiry)}` : `expiră pe ${roDate(expiry)}`;
    const right =
      entry.status === "expired"
        ? `Expirat de ${roCount(Math.max(1, Math.abs(days)), "zi", "zile")}`
        : days === 0
          ? "Azi"
          : `în ${roCount(days, "zi", "zile")}`;

    items.push({
      id: `doc-${entry.id}`,
      icon: "document-text-outline",
      title: entry.title,
      subtitle,
      right,
      urgency: entry.daysUntilExpiry, // Lower (more negative once expired) is more urgent
      urgencyTier: urgencyTierFromDays(entry.daysUntilExpiry),
      overdue: entry.status === "expired",
      sourceType: "document",
      sourceId: entry.id,
    });
  });

  // 2. Maintenance due soon or overdue -- same "already renewed" guard,
  // and the same km-or-date "whichever comes first" read as the DUE
  // SOON badge/dots elsewhere (see getMaintenanceUrgency above).
  carData.maintenanceEntries.forEach((entry) => {
    const urgency = getMaintenanceUrgency(entry, currentOdometer);
    if (!urgency.tier) return;

    if (entry.archived || isMaintenanceSuperseded(entry, carData.maintenanceEntries)) {
      return;
    }

    // Skip maintenance overdue by a lot on the km side — it's likely
    // stale/irrelevant (no equivalent guard needed for date: nothing
    // stays silently "overdue by years" the way an untouched odometer
    // reading can).
    if (urgency.remainingKm !== null && urgency.remainingKm < -5000) {
      return;
    }

    // Heuristic so km-based urgency sorts comparably against documents'
    // real day counts (~30km/day) -- date-based urgency already IS a day
    // count, no conversion needed.
    const equivalentDays =
      urgency.decidedBy === "date" ? urgency.daysUntilService! : urgency.remainingKm! / 30;

    let subtitle: string;
    let right: string;

    if (urgency.decidedBy === "date") {
      const days = urgency.daysUntilService!;
      const target = parseDateString(entry.nextServiceDate!)!;
      subtitle = urgency.overdue ? `trebuia pe ${roDate(target)}` : `programat pe ${roDate(target)}`;
      right = urgency.overdue
        ? `Depășit cu ${roCount(Math.max(1, Math.abs(days)), "zi", "zile")}`
        : days === 0
          ? "Azi"
          : `în ${roCount(days, "zi", "zile")}`;
    } else {
      const km = urgency.remainingKm!;
      subtitle = "după kilometraj";
      right = urgency.overdue ? `Depășit cu ${roNumber(Math.abs(km))} km` : `în ${roNumber(km)} km`;
    }

    items.push({
      id: `maint-${entry.id}`,
      icon: "construct-outline",
      title: entry.service,
      subtitle,
      right,
      urgency: equivalentDays,
      urgencyTier: urgency.tier,
      overdue: urgency.overdue,
      sourceType: "maintenance",
      sourceId: entry.id,
    });
  });

  // Sort by urgency (ascending). No limit unless the caller asks for one
  // — the dashboard's "NEXT" preview passes limit=3, a full alerts/
  // history view can call this with no limit to get everything.
  items.sort((a, b) => a.urgency - b.urgency);

  const limited =
    limit !== undefined ? items.slice(0, limit) : items;

  return limited.map(({ urgency, ...item }) => item);
}