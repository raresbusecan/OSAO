import { parseDateInput } from "@/lib/spaces/car/utils/dateInput";

export const formatCarNumber = (value: number) =>
  new Intl.NumberFormat("ro-RO").format(value);

/** "1 octombrie" (+ year when it isn't this year). Accepts ISO strings and
 * the documents' "DD.MM.YYYY" (new Date() reads that as Invalid Date). */
export const formatCarDate = (date: string) => {
  const d = new Date(parseDateInput(date) ?? date);
  return d.toLocaleDateString("ro-RO", {
    day: "numeric",
    month: "long",
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" as const } : {}),
  });
};
