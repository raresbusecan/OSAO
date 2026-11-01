export type DialogChoice = { key: string; label: string; secondary?: boolean; destructive?: boolean };
export type DialogRequest = {
  kind: "confirm" | "notify" | "choice";
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  choices?: DialogChoice[];
  resolve: (value: any) => void;
};

type Host = { priority: number; show: (request: DialogRequest | null) => void };
const hosts = new Map<number, Host>();
const pending: { request: DialogRequest; owner: number | null }[] = [];
const listeners = new Set<() => void>();
const sheetListeners = new Set<() => void>();
let sequence = 0;
let open = false;

function topHost(): number | null {
  let selected: number | null = null;
  for (const [id, host] of hosts) {
    if (selected === null || host.priority >= hosts.get(selected)!.priority) selected = id;
  }
  return selected;
}

function publish() {
  const top = topHost();
  for (const [id, host] of hosts) host.show(id === top ? pending[0]?.request ?? null : null);
  const nextOpen = pending.length > 0;
  if (nextOpen !== open) {
    open = nextOpen;
    listeners.forEach((listener) => listener());
  }
}

function answer(request: DialogRequest, value: any) {
  request.resolve(request.kind === "choice" && value === false ? null : value);
}

/** Visible Sheets register above the root; nested Sheets win by depth. */
export function registerDialogHost(priority: number, show: Host["show"]): () => void {
  const id = ++sequence;
  hosts.set(id, { priority, show });
  publish();
  sheetListeners.forEach((listener) => listener());
  return () => {
    hosts.delete(id);
    // Leaving a form must release its pending confirmations, never leave
    // a spinner awaiting a dialog that no longer has a visible owner.
    for (let index = pending.length - 1; index >= 0; index--) {
      if (pending[index].owner === id || !hosts.size) {
        const [entry] = pending.splice(index, 1);
        answer(entry.request, false);
      }
    }
    publish();
    sheetListeners.forEach((listener) => listener());
  };
}

function enqueue(request: DialogRequest) {
  const owner = topHost();
  if (owner === null) { answer(request, false); return; }
  pending.push({ request, owner: request.kind === "notify" ? null : owner });
  publish();
}

export function settleDialog(request: DialogRequest, value: any) {
  if (pending[0]?.request !== request) return;
  pending.shift();
  publish();
  answer(request, value);
}

/** Android's native Modal consumes Back before the inline overlay can. */
export function dismissDialogAtLayer(priority: number): boolean {
  const top = topHost();
  if (!pending.length || top === null || hosts.get(top)?.priority !== priority) return false;
  settleDialog(pending[0].request, false);
  return true;
}

export function showConfirmDialog(req: Omit<DialogRequest, "kind" | "resolve" | "choices">): Promise<boolean> {
  return new Promise((resolve) => enqueue({ ...req, kind: "confirm", resolve }));
}
export function showChoiceDialog(req: { title: string; message: string; choices: DialogChoice[] }): Promise<string | null> {
  return new Promise((resolve) => enqueue({ ...req, kind: "choice", resolve }));
}
export function showNotifyDialog(title: string, message: string): void {
  enqueue({ kind: "notify", title, message, resolve: () => {} });
}
export const isDialogOpen = () => open;
export function subscribeDialog(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** How many Sheets are open right now (each visible Sheet registers a
 * dialog host above the root, priority > 0). record-action uses it to
 * know its form is on screen. */
export function visibleSheetCount(): number {
  let count = 0;
  for (const host of hosts.values()) if (host.priority > 0) count++;
  return count;
}
export function subscribeSheets(listener: () => void): () => void {
  sheetListeners.add(listener);
  return () => { sheetListeners.delete(listener); };
}
