import { useRef, useState } from "react";
import { notifyAction } from "@/lib/confirm";

/** Keep the record editable on failure and exclude overlapping save/delete. */
export function useRecordMutation() {
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = async (write: () => void | Promise<void>) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    try { await write(); }
    catch (error: any) { notifyAction("Nu am putut salva modificarea", error?.message || "Încearcă din nou."); }
    finally { locked.current = false; setBusy(false); }
  };
  return { busy, run, canClose: () => !locked.current };
}
