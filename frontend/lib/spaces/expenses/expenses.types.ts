export type ExpenseEntry = {
  id: string;
  name: string;
  price: number;
  date: string;
  /** Optional context for later -- "rambursabil de la muncă", "cadou
   * pentru X" -- the kind of thing that's obvious when you add it and
   * a mystery a month later without it. */
  notes?: string;
  /** A Calendar event's purchase, listed here read-only (it's edited in
   * Calendar) so the space's totals match Buget's. */
  source?: "calendar";
  /** Its day hasn't come yet: listed, not counted as spent. */
  planned?: boolean;
  /** "Bani fără vină" (items.guilt_free): still counted in this space's
   * own totals, but out of Buget's necessities. */
  guiltFree?: boolean;
};
