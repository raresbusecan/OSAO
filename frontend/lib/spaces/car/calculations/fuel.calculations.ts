import type { CarFuelEntry } from "../car.types";
import { getPreviousFuelEntry } from "../utils/fuel.utils";


export function calculateSuggestedLiters(
    tankCapacityLiters: number,
    levelBefore: number,
    levelAfter: number,
): number | null {
    if (tankCapacityLiters <= 0) return null;

    if (levelBefore < 0 || levelBefore > 100) {
        return null;
    }

    if (levelAfter < 0 || levelAfter > 100) {
        return null;
    }

    if (levelAfter < levelBefore) {
        return null;
    }

    const liters =
        tankCapacityLiters *
        ((levelAfter - levelBefore) / 100);

    return Number(liters.toFixed(2));
}

export function calculatePricePerLiter(
    liters: number,
    totalPaid: number,
): number | null {
    if (liters <= 0 || totalPaid <= 0) return null;

    return Number((totalPaid / liters).toFixed(2));
}

export function calculateDistance(
    previousEntry: CarFuelEntry | null,
    currentEntry: CarFuelEntry,
): number | null {
    if (!previousEntry) return null;

    if (
        previousEntry.odometer === undefined ||
        currentEntry.odometer === undefined
    ) {
        return null;
    }

    const distance =
        currentEntry.odometer - previousEntry.odometer;

    if (distance <= 0) return null;

    return distance;
}

export function calculateEstimatedLitersConsumed(
    previousEntry: CarFuelEntry | null,
    currentEntry: CarFuelEntry,
    tankCapacityLiters: number,
): number | null {
    if (!previousEntry || tankCapacityLiters <= 0) {
        return null;
    }

    if (
        previousEntry.level_after === undefined ||
        currentEntry.level_before === undefined
    ) {
        return null;
    }

    const consumed =
        tankCapacityLiters *
        ((previousEntry.level_after - currentEntry.level_before) / 100);

    if (consumed <= 0) return null;

    return Number(consumed.toFixed(2));
}

export type ConsumptionPreview = {
    distance: number | null;
    litersConsumed: number | null;
    consumption: number | null;
};

/**
 * Live preview used inside the Fuel form, before the entry actually
 * exists (so we don't have an `id`/`date` yet — just draft values
 * coming from the inputs/sliders).
 *
 * Same formula as calculateEstimatedConsumption, but works off raw
 * draft values instead of a saved CarFuelEntry.
 */
export function calculateConsumptionPreview(
    previousEntry: CarFuelEntry | null,
    odometer: number,
    levelBefore: number,
    tankCapacityLiters: number,
): ConsumptionPreview {
    if (!previousEntry || previousEntry.odometer === undefined) {
        return { distance: null, litersConsumed: null, consumption: null };
    }

    const distance = odometer - previousEntry.odometer;

    if (!Number.isFinite(distance) || distance <= 0) {
        return { distance: null, litersConsumed: null, consumption: null };
    }

    if (tankCapacityLiters <= 0 || previousEntry.level_after === undefined) {
        return { distance, litersConsumed: null, consumption: null };
    }

    const litersConsumed =
        tankCapacityLiters *
        ((previousEntry.level_after - levelBefore) / 100);

    if (!Number.isFinite(litersConsumed) || litersConsumed <= 0) {
        return { distance, litersConsumed: null, consumption: null };
    }

    const consumption = (litersConsumed / distance) * 100;

    return {
        distance,
        litersConsumed: Number(litersConsumed.toFixed(2)),
        consumption: Number(consumption.toFixed(2)),
    };
}

export function calculateEstimatedConsumption(
    fuelEntries: CarFuelEntry[],
    currentEntry: CarFuelEntry,
    tankCapacityLiters: number,
): number | null {
    if (
        currentEntry.odometer === undefined ||
        currentEntry.level_before === undefined
    ) {
        return null;
    }

    const previousEntry = getPreviousFuelEntry(
        fuelEntries,
        currentEntry.date,
    );

    if (!previousEntry || previousEntry.odometer === undefined) {
        return null;
    }

    const distance =
        currentEntry.odometer - previousEntry.odometer;

    if (distance <= 0) {
        return null;
    }

    if (previousEntry.level_after === undefined) {
        return null;
    }

    const litersConsumed =
        tankCapacityLiters *
        (
            (previousEntry.level_after -
                currentEntry.level_before) /
            100
        );

    if (litersConsumed <= 0) {
        return null;
    }

    return Number(
        ((litersConsumed / distance) * 100).toFixed(2),
    );
}