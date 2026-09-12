import type { CarFuelEntry } from "../car.types";

export function getSortedFuelEntries(
  fuelEntries: CarFuelEntry[],
): CarFuelEntry[] {
  return [...fuelEntries].sort(
    (a, b) =>
      new Date(a.date).getTime() -
      new Date(b.date).getTime(),
  );
}

export function getPreviousFuelEntry(
  fuelEntries: CarFuelEntry[],
  currentDate: string,
): CarFuelEntry | null {
  const previousEntries = fuelEntries
    .filter(
      (entry) =>
        new Date(entry.date).getTime() <
        new Date(currentDate).getTime(),
    )
    .sort((a, b) => {
      const dateDiff =
        new Date(b.date).getTime() -
        new Date(a.date).getTime();

      // Tie-break by odometer in case two entries share a timestamp.
      return dateDiff !== 0
        ? dateDiff
        : (b.odometer ?? 0) - (a.odometer ?? 0);
    });

  return previousEntries[0] ?? null;
}

/**
 * Most recent saved fuel entry, used as the reference point while a
 * NEW entry is still being drafted in the form (i.e. before it has
 * an id/date of its own).
 */
export function getLatestFuelEntry(
  fuelEntries: CarFuelEntry[],
): CarFuelEntry | null {
  const sorted = getSortedFuelEntries(fuelEntries);
  return sorted[sorted.length - 1] ?? null;
}