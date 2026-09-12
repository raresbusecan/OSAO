export const formatCarNumber = (value: number) =>
  new Intl.NumberFormat("en-US").format(value);

export const formatCarDate = (date: string) => {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};