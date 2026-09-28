export type HomeDocumentEntry = {
  id: string;
  date: string;
  documentType: string;
  title: string;
  issuer?: string;
  issueDate?: string;
  expiryDate?: string;
};

export type HomeExpenseEntry = {
  id: string;
  date: string;
  title: string;
  amount: number;
  notes?: string;
};

export type HomeMaintenanceEntry = {
  id: string;
  date: string;
  service: string;
  description: string;
  price: number;
  provider?: string;
  nextDueDate?: string;
  /** "Recurent" toggle -- when on, this visit repeats every
   * `recurrenceInterval` `recurrenceFrequency` periods starting from
   * `date` (e.g. interval=3, frequency="monthly" = every 3 months), the
   * same due_at + recurrence + RecurrenceProjector machinery
   * home_recurring bills already use. Off (the default) leaves this as a
   * plain one-time service log, same as before. */
  isRecurring?: boolean;
  recurrenceFrequency?: "weekly" | "monthly" | "yearly";
  /** "Every N periods" -- 1 (the default) means every single period,
   * matching a plain recurring bill; 3 with frequency "monthly" means
   * every 3 months, 2 with "yearly" means every 2 years, etc. */
  recurrenceInterval?: number;
  /** Set only via the "Resolved" action (never the create/edit form) --
   * a non-recurring entry marked resolved goes inactive/hidden for
   * good; a recurring one never sets this at all, it just advances
   * nextDueDate and stays active instead. See homeCategoryConfig.ts's
   * "maintenance" resolveEntry. */
  completed?: boolean;
  /** Set alongside `completed` (non-recurring resolve only) -- when it
   * actually happened, so the archive can show "Rezolvat acum 3 zile"
   * instead of just a bare list. Same idea as HomeTaskEntry's own
   * completedAt. */
  completedAt?: string;
};

export type HomeRecurringEntry = {
  id: string;
  title: string;
  category: string;
  amount: number;
  frequency: "weekly" | "monthly" | "yearly";
  nextDueDate: string;
  notes?: string;
};

/** One logged restock event: when it happened and how much was bought.
 * The quantity matters because the gap between two restocks isn't a
 * reliable signal on its own -- buying 1 unit vs. 5 units of the same
 * product naturally lasts different lengths of time. Recording quantity
 * per event lets getSupplyRestockEstimate compute a consumption RATE
 * (units/day) instead of a raw day-gap average. */
export type SupplyRestockEvent = {
  date: string;
  quantity: number;
};

export type HomeSupplyEntry = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  lastRestockedDate?: string;
  notes?: string;
  /** Which space this supply actually lives in -- Home's own code
   * always knows its current space explicitly and never reads this.
   * Only set (from item.space_id) so Grocery, which reads supplies
   * cross-space, can write a restock event back to the right item --
   * see GroceryDashboard.tsx's logSupplyRestock. */
  spaceId?: string;
  /** Every past restock, oldest first -- unlimited, no cap. Powers
   * getSupplyRestockEstimate: the restock pattern only starts predicting
   * once there are 2+ entries here (1+ real interval to measure), per
   * the user's own "starts after the second purchase" rule, and keeps
   * refining as more get logged. */
  restockHistory?: SupplyRestockEvent[];
};

export type HomeTaskEntry = {
  id: string;
  title: string;
  dueDate?: string;
  completed: boolean;
  completedAt?: string;
  notes?: string;
  /** Set at creation (HomeTaskForm's "Implică o cumpărare" toggle) --
   * drives whether resolving this task prompts for a price instead of
   * completing instantly. */
  isPurchase?: boolean;
  /** Only ever set once, at resolution (HomeTaskResolveSheet) -- never
   * asked for at creation, since the real cost usually isn't known yet. */
  price?: number;
  /** Set at creation (HomeTaskForm's "Task recurent" toggle). A
   * recurring task never actually completes -- resolving it logs
   * completedAt and stays active instead of archiving, so it's always
   * back in DUE SOON/ALL ready for its next occurrence. Only a task
   * without this flag archives once resolved. */
  isRecurring?: boolean;
  /** Required when isRecurring is true -- how far dueDate advances each
   * time the task is resolved (see resolveTask in HomeDashboard.tsx). */
  recurrenceFrequency?: "daily" | "weekly" | "monthly";
};