import type {
  CarDocumentEntry,
  CarExpenseEntry,
  CarFuelEntry,
  CarMaintenanceEntry,
  CarVehicle,
} from "@/lib/spaces/car/car.types";

export type CarData = {
  vehicle: CarVehicle;
  fuelEntries: CarFuelEntry[];
  maintenanceEntries: CarMaintenanceEntry[];
  documentEntries: CarDocumentEntry[];
  expenseEntries: CarExpenseEntry[];
};