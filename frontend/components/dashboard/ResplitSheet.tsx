/**
 * @deprecated DEAD since 2026-11-02 (user decision: Necesități is ONE
 * envelope, no per-space limits). Was "Reîmparte" -- the sheet that split
 * the Necesități envelope over the spaces (PUT /budget/limits). Zero
 * importers; kept only because file deletion is denied in this
 * environment. Delete it when you can. The old version is in git
 * (feat/budget-pace @ 212c030).
 */
export function ResplitSheet(_props: Record<string, unknown>): null {
  return null;
}
