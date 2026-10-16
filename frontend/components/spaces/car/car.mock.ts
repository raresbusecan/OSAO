import type { CarData } from "./car.data.types";

/** The EMPTY starting state of a car space, before its profile and items
 * load. It used to carry a demo BMW (mileage 124580, 57 l tank) that
 * leaked into every car: getCurrentOdometer() takes the max of
 * vehicle.mileage and the logged odometers, so a brand-new car with no
 * records showed 124.580 km, and the consumption math used 57 l. Real
 * values come from the car profile ([id].tsx) and the logged entries. */
export const initialCarData: CarData = {
  vehicle: {
    make: "",
    model: "",
    year: 0,
    mileage: 0,
    tank_capacity_liters: 0,
  },

  fuelEntries: [],

  maintenanceEntries: [],

  documentEntries: [],

  expenseEntries: [],
};