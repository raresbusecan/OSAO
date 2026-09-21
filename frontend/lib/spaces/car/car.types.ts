export type CarVehicle = {
  make: string;
  model: string;
  year: number;
  registration_number?: string;
  mileage: number;
  fuel_type?: string;
  engine?: string;
  tank_capacity_liters: number;
};

export type CarFuelEntry = {
  id: string;
  date: string;
  liters?: number;
  total_paid?: number;
  odometer?: number;
  level_before?: number;
  level_after?: number;
  station?: string;
};

export type CarMaintenanceEntry = {
  id: string;
  date: string;
  service: string;
  description: string;
  price: number;
  /** Optional -- only Oil Change actually requires it (see
   * maintenance.validation.ts); any other entry updating this leaves the
   * car's current-odometer read (getCurrentOdometer) no more informed
   * than whatever fuel/other entries already provided, so forcing it on
   * every single maintenance record would just be redundant re-entry. */
  odometer?: number;
  provider?: string;
  nextServiceOdometer?: number;
  /** "DD.MM.YYYY", same raw-string convention as CarDocumentEntry's
   * expiryDate (see dashboard.calculations.ts's parseDateString) --
   * independent of nextServiceOdometer, either or both can be set.
   * Whichever comes first wins for urgency, see getMaintenanceUrgency. */
  nextServiceDate?: string;
  /** True when this service cost nothing out of pocket (warranty/recall
   * work) -- lets `price` be validly 0 (see maintenance.validation.ts)
   * instead of the usual "must be a real positive amount" requirement,
   * which otherwise catches an accidentally-blank Price field. */
  underWarranty?: boolean;
  /** Same idea as CarDocumentEntry.archived -- true once a newer service
   * of the same type has been logged via the "renew" flow. */
  archived?: boolean;
  /** Only set on the NEW record created by the renew flow. */
  renewedFromId?: string;
};

export type CarDocumentEntry = {
  id: string;
  date: string;
  documentType: string;
  title: string;
  issuer?: string;
  issueDate?: string;
  expiryDate?: string;
  price?: number;
  notes?: string;
  /** True once a newer renewal of this document has been saved -- see
   * CarDashboard.tsx's "renew" flow off a NEXT alert. Archived entries
   * are hidden from RECENT (decluttered) but still counted in Expenses
   * totals (the money was still spent) and shown there, tagged. */
  archived?: boolean;
  /** Only set on the NEW record created by the renew flow -- the id of
   * the (now archived) entry it replaced. */
  renewedFromId?: string;
};

export type CarExpenseEntry = {
  id: string;
  date: string;
  category: string;
  title: string;
  amount: number;
  odometer?: number;
  provider?: string;
  notes?: string;
};