/** One boundary for account-scoped memory and asynchronous responses. */
let version = 0;
const resetters = new Set<() => void>();

export const sessionVersion = () => version;
export const onSessionReset = (reset: () => void) => { resetters.add(reset); };
export function resetSessionCaches() {
  version++;
  resetters.forEach((reset) => reset());
}
