export const RECORD_ACTION_TYPES = new Set([
  "car_document", "car_maintenance", "home_task", "home_recurring", "home_maintenance", "home_document",
]);

/** Only actionable records use the temporary flow; browsing keeps its route. */
export function recordActionHref(item: { id: number | string; type: string; space: { id: number | string } }): string {
  const query = `itemId=${encodeURIComponent(String(item.id))}&itemType=${encodeURIComponent(item.type)}`;
  return RECORD_ACTION_TYPES.has(item.type)
    ? `/record-action?id=${encodeURIComponent(String(item.space.id))}&${query}`
    : `/${encodeURIComponent(String(item.space.id))}?${query}`;
}

export function validRecordAction(id?: string, itemId?: string, type?: string): boolean {
  return typeof id === "string" && /^[1-9]\d*$/.test(id) && typeof itemId === "string" && /^[1-9]\d*$/.test(itemId) && typeof type === "string" && RECORD_ACTION_TYPES.has(type);
}

type NavigationState = { index?: number; routes: readonly { name: string; params?: object; state?: NavigationState }[] };
/** Preserve a Space's internal page when the temporary stack screen closes. */
export function actionOriginSpaceHref(state: NavigationState): string | null {
  // Expo's generated navigator wraps the app's Stack in an active __root
  // route; history belongs to that inner Stack, not to the wrapper.
  let active = state.routes[state.index ?? 0];
  while (active?.name === "__root" && active.state) {
    state = active.state;
    active = state.routes[state.index ?? 0];
  }
  let origin = state.routes[(state.index ?? 0) - 1];
  while (origin?.state) origin = origin.state.routes[origin.state.index ?? 0];
  if (origin?.name !== "[id]" || !origin.params || !("id" in origin.params)) return null;
  const id = origin.params.id;
  return (typeof id === "string" || typeof id === "number") && /^[1-9]\d*$/.test(String(id)) ? `/${id}` : null;
}
