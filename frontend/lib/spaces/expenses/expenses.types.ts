export type ExpenseEntry = {
  id: string;
  name: string;
  price: number;
  date: string;
  /** Optional context for later -- "rambursabil de la muncă", "cadou
   * pentru X" -- the kind of thing that's obvious when you add it and
   * a mystery a month later without it. */
  notes?: string;
};
