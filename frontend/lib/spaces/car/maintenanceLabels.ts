/**
 * Romanian display names for the Car maintenance Quick Select types.
 * The stored `service` value stays the English key (it drives logic:
 * AUTO_DATE_INTERVAL_MONTHS, NON_RECURRING_MAINTENANCE_TYPES,
 * isMaintenanceSuperseded's same-name check), so only what's SHOWN goes
 * through maintenanceLabel(). A custom service name passes through.
 */
const LABELS: Record<string, string> = {
  "Oil Change": "Schimb ulei",
  Filters: "Filtre",
  Brakes: "Frâne",
  Tires: "Anvelope",
  Battery: "Baterie",
  Fluids: "Lichide",
  Service: "Revizie",
  Repair: "Reparație",
};

export function maintenanceLabel(service: string): string {
  return LABELS[service] ?? service;
}
