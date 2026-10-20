import { createContext, useContext } from "react";

/** A temporary action has its own stack entry; the origin stays mounted. */
export type RecordAction = { complete: () => void; cancel: () => void };
export const RecordActionContext = createContext<RecordAction | null>(null);
export const useRecordAction = () => useContext(RecordActionContext);
