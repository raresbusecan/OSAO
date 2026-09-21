/**
 * A client-generated placeholder id (e.g. "fuel-1699999999999-42",
 * "doc-1699999999999-7") looks like "<prefix>-<timestamp>-...' -- never a
 * bare number. A real, already-saved item's id is the numeric database id
 * (as a string). Used by every space's own entry<->Item mapper
 * (car/carItems.ts, home/homeItems.ts, ...) to decide create vs. update
 * when a save handler fires -- one shared definition instead of the same
 * regex duplicated per space.
 */
export function isSavedItemId(id: string): boolean {
  return /^\d+$/.test(id);
}
