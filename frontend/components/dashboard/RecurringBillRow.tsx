import React from "react";
import { View, Text } from "react-native";
import { useTheme } from "@/lib/theme";
import { CUSTOM_EVENT_COLOR, spaceColors, spaceTextColor } from "@/lib/spaces/spaceProfile";
import { Group, IconWell, InfoButton, Row } from "@/components/ui/primitives";
import { capitalize, daysFromToday, lei, roDate } from "@/lib/format";
import { GuiltFreeChip } from "@/components/dashboard/GuiltFree";
import { TitleChipRow } from "@/components/spaces/expenses/TitleChipRow";

const FREQUENCY_LABEL: Record<string, string> = { daily: "zilnic", weekly: "săptămânal", monthly: "lunar", yearly: "anual" };

/** Types that are bills -- mirrors the backend's Item::RECURRING_TYPE_SPACE
 * (the same set the "de plătit" monthly total sums). */
const RECURRING_BILL_TYPES = ["home_recurring"];

export type RecurringKind = "bill" | "maintenance";

/**
 * Two kinds of recurring cost, never mixed in one unexplained list:
 * a BILL (Casă -> Plăți recurente) counts against the budget up front as
 * "de plătit"; a recurring MAINTENANCE visit (Casă -> Mentenanță) only
 * adds its cost to "Cheltuit" when it's marked done. A recurring task
 * without an amount isn't a payment at all (De făcut / agenda only).
 */
export function recurringKind(item: any): RecurringKind | null {
  if (!item?.recurrence || !(Number(item.amount) > 0)) return null;
  if (RECURRING_BILL_TYPES.includes(item.type)) return "bill";
  if (item.type === "home_maintenance") return "maintenance";
  return null;
}

export function isRecurringPayment(item: any): boolean {
  return recurringKind(item) !== null;
}

/** Group headings; how each kind touches the budget is its "ⓘ"
 * (lib/help.ts: recurring.bill / recurring.maintenance). */
export const RECURRING_GROUP: Record<RecurringKind, { label: string; info: "recurring.bill" | "recurring.maintenance" }> = {
  bill: { label: "Facturi", info: "recurring.bill" },
  maintenance: { label: "Mentenanță recurentă", info: "recurring.maintenance" },
};

/** What a recurring amount costs per month (weekly ~4,33x, yearly /12). */
export function monthlyEquivalent(item: any): number {
  const amount = Number(item.amount) || 0;
  switch (item.recurrence) {
    case "daily": return (amount * 365) / 12;
    case "weekly": return (amount * 52) / 12;
    case "yearly": return amount / 12;
    default: return amount;
  }
}

/**
 * A recurring list split by kind: per group a heading with its "ⓘ" and
 * its total, then the rows. `total`:
 * "monthly" = monthly equivalent (Buget), "sum" = the occurrences listed
 * (Calendar's month).
 */
export function RecurringGroups({
  items,
  renderRow,
  total = "monthly",
}: {
  items: any[];
  renderRow: (item: any) => React.ReactNode;
  total?: "monthly" | "sum";
}) {
  const { colors, spacing } = useTheme();
  const groups = (["bill", "maintenance"] as RecurringKind[])
    .map((kind) => ({ kind, items: items.filter((it) => recurringKind(it) === kind) }))
    .filter((g) => g.items.length > 0);
  return (
    <View style={{ gap: spacing.lg }}>
      {groups.map((g) => {
        const amountOf = (it: any) => (total === "monthly" ? monthlyEquivalent(it) : Number(it.amount) || 0);
        // Fără vină bills come out of their own jar, not the budget: kept
        // out of the group's total (which matches Buget's "de plătit")
        // and shown as their own line.
        const sum = g.items.filter((it) => !it.guilt_free).reduce((s, it) => s + amountOf(it), 0);
        const guiltFreeSum = g.items.filter((it) => !!it.guilt_free).reduce((s, it) => s + amountOf(it), 0);
        return (
          <View key={g.kind} style={{ gap: spacing.sm }} testID={`recurring-group-${g.kind}`}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurfaceSecondary }}>{`${RECURRING_GROUP[g.kind].label} · ${g.items.length}`}</Text>
                <InfoButton topic={RECURRING_GROUP[g.kind].info} />
              </View>
              <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }}>{total === "monthly" ? `${lei(Math.round(sum))} / lună` : lei(Math.round(sum))}</Text>
            </View>
            {guiltFreeSum > 0 ? (
              <Text testID={`recurring-group-${g.kind}-guilt-free`} style={{ fontSize: 13, color: colors.onSurfaceTertiary, textAlign: "right", marginTop: -4 }}>
                {`+ ${lei(Math.round(guiltFreeSum))}${total === "monthly" ? " / lună" : ""} fără vină, socotiți separat`}
              </Text>
            ) : null}
            <Group inset={68}>{g.items.map(renderRow)}</Group>
          </View>
        );
      })}
    </View>
  );
}

/**
 * One recurring payment, the same on Acasă, Calendar and Buget: repeat
 * icon in the Space's color, "{Spațiu} · {frecvență}" under the title,
 * amount over the date on the right. A bill still unpaid after its date
 * reads "Restantă · 28 sept." in red everywhere (the server keeps it on
 * that date until it's resolved -- RecurrenceProjector::currentDue).
 */
export function RecurringBillRow({
  item,
  onPress,
  testID,
  isCurrentDue = true,
}: {
  item: any;
  onPress?: () => void;
  testID?: string;
  /** false for a projected PAST occurrence that isn't the one still
   * owed (Calendar, an earlier month) -- only the current one is "Restantă". */
  isCurrentDue?: boolean;
}) {
  const { colors, isDark } = useTheme();
  // That bill's own space colour (its pick, else its kind's default).
  const own = item.space ? spaceColors(item.space, isDark) : null;
  const color = item.space ? own?.color ?? colors.onSurfaceTertiary : CUSTOM_EVENT_COLOR;
  const tint = item.space ? own?.tint ?? color : spaceTextColor("custom", isDark) ?? color;
  const freq = FREQUENCY_LABEL[item.recurrence] ?? item.recurrence;
  const isMaintenance = recurringKind(item) === "maintenance";
  const overdue = isCurrentDue && daysFromToday(item.due_at) < 0;
  const date = roDate(item.due_at, { short: true });
  const leading = <IconWell icon={isMaintenance ? "construct-outline" : "repeat"} color={color} tint={tint} />;
  const subtitle = capitalize(`${item.space ? item.space.name : "Personal"}${isMaintenance ? " · mentenanță" : ""} · ${freq}`);
  const trailing = (
    <View style={{ alignItems: "flex-end", gap: 2 }}>
      <Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface }}>{lei(Number(item.amount))}</Text>
      <Text style={{ fontSize: 13, color: overdue ? colors.error : colors.onSurfaceTertiary }}>
        {overdue ? `Restantă · ${date}` : date}
      </Text>
    </View>
  );
  // A fără vină bill carries the chip (Row's title has no slot for it).
  if (item.guilt_free) {
    return (
      <TitleChipRow
        testID={testID}
        onPress={onPress}
        leading={leading}
        title={item.title}
        chip={<GuiltFreeChip testID={testID ? `${testID}-guilt-free` : undefined} />}
        subtitle={subtitle}
        trailing={trailing}
      />
    );
  }
  return <Row testID={testID} onPress={onPress} leading={leading} title={item.title} subtitle={subtitle} trailing={trailing} />;
}
