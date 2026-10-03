export const formatCarNumber = (value: number) =>
  new Intl.NumberFormat("ro-RO").format(value);

/** "1 octombrie" (+ year when it isn't this year). */
export const formatCarDate = (date: string) => {
  const d = new Date(date);
  return d.toLocaleDateString("ro-RO", {
    day: "numeric",
    month: "long",
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" as const } : {}),
  });
};
