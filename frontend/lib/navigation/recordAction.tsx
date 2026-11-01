import { createContext, useContext } from "react";

/** A temporary action has its own stack entry; the origin stays mounted. */
export type RecordAction = {
  complete: () => void;
  cancel: () => void;
  /** The Space screen finished its first load, `ok` = the space loaded
   * (record-action's overlay waits for it before deciding the form isn't
   * coming, and leaves at once when it failed). */
  loaded?: (ok: boolean) => void;
};
export const RecordActionContext = createContext<RecordAction | null>(null);
export const useRecordAction = () => useContext(RecordActionContext);
