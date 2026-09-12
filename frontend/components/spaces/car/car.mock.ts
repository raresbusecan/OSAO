import type { CarData } from "./car.data.types";

export const initialCarData: CarData = {
  vehicle: {
    make: "BMW",
    model: "320d",
    year: 2018,
    mileage: 124580,
    fuel_type: "diesel",
    tank_capacity_liters: 57,
  },

  fuelEntries: [],

  maintenanceEntries: [],

  documentEntries: [],

  expenseEntries: [],
};