import React, { useState } from "react";
import { View, Text } from "react-native";
import { useTheme } from "@/lib/theme";
import { hexToRgba } from "@/components/ui/primitives";

/**
 * A space's budget bar, everywhere it appears (Acasă's "Buget pe spații",
 * Buget's "Pe spații", the month overview) -- variant B of the 2026-10
 * mockup: the bar spans max(budget, spent + bills), with
 *  - a SOLID part for what was actually spent (red once over budget),
 *  - a HATCHED part (same color) for money the budget already counts but
 *    that isn't spent yet: recurring bills not paid, and Calendar
 *    purchases whose day hasn't come ("planificat", EventSpend),
 *  - a vertical LINE at the budget, drawn only when the bar runs past it.
 * Without this a space with nothing spent read "0 / 140 lei" over a full
 * red bar. The number next to it reads "0 + 725 / 140 lei" (see
 * budgetAmountParts) and BudgetUpcomingNote says what the two marks mean.
 */
export function BudgetSplitBar({
  recorded,
  upcoming,
  limit,
  color,
  upcomingColor,
  todayAt,
  style,
}: {
  recorded: number;
  upcoming: number;
  limit: number;
  /** The spent part (a severity tone or the space's color). */
  color: string;
  /** The bills part, hatched -- defaults to `color`. */
  upcomingColor?: string;
  /** Buget "Ritmul lunii": where the space should normally be today, as a
   * fraction of the bar (0..1) -- a grey tick, unlike the budget line
   * (onSurface). Omitted = no tick (Acasă never passes it). */
  todayAt?: number | null;
  style?: any;
}) {
  const { colors } = useTheme();
  const spent = Math.max(0, recorded);
  const bills = Math.max(0, upcoming);
  const scale = Math.max(limit, spent + bills, 1);
  const solid = spent / scale;
  const hatched = bills / scale;
  const budgetAt = limit > 0 && scale > limit ? limit / scale : null;
  return (
    <View style={[{ height: 6, justifyContent: "center" }, style]}>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceTertiary, overflow: "hidden", flexDirection: "row" }}>
        {solid > 0 ? <View style={{ width: `${solid * 100}%`, height: "100%", backgroundColor: spent > limit ? colors.error : color }} /> : null}
        {hatched > 0 ? <Hatch width={`${hatched * 100}%`} color={upcomingColor ?? color} /> : null}
      </View>
      {budgetAt !== null ? (
        <View
          accessibilityLabel="Bugetul"
          style={{ position: "absolute", left: `${budgetAt * 100}%`, top: -3, width: 2, height: 12, marginLeft: -1, borderRadius: 1, backgroundColor: colors.onSurface }}
        />
      ) : null}
      {todayAt != null ? (
        <View
          accessibilityLabel="Ritmul normal până azi"
          style={{ position: "absolute", left: `${Math.max(0, Math.min(1, todayAt)) * 100}%`, top: -3, width: 2, height: 12, marginLeft: -1, borderRadius: 1, backgroundColor: colors.onSurfaceTertiary }}
        />
      ) : null}
    </View>
  );
}

/** Diagonal stripes (RN has no repeating gradient): thin rotated bars
 * every 6px over a pale wash of the same color. */
function Hatch({ width, color }: { width: `${number}%`; color: string }) {
  const [w, setW] = useState(0);
  const count = Math.ceil((w + 12) / 6);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ width, height: "100%", overflow: "hidden", backgroundColor: hexToRgba(color, 0.2) }}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{ position: "absolute", left: i * 6 - 6, top: -7, width: 3, height: 20, backgroundColor: hexToRgba(color, 0.6), transform: [{ rotate: "45deg" }] }}
        />
      ))}
    </View>
  );
}

/** " + 725" to put between the spent number and "/ 140 lei", or "". */
export function budgetUpcomingSuffix(upcoming: number): string {
  return upcoming > 0 ? ` + ${Math.round(upcoming).toLocaleString("ro-RO")}` : "";
}

/** What the hatched part holds, in words: `planned` is the share of
 * `upcoming` that's Calendar purchases, the rest is unpaid bills. */
function hatchedMeaning(upcoming: number, planned: number): string {
  const bills = upcoming - planned > 0.004;
  if (planned > 0 && bills) return "facturi neplătite și cumpărături planificate";
  if (planned > 0) return "cumpărături planificate în Calendar";
  return "facturi neplătite";
}

/** The legend under a bar that holds money not spent yet -- null otherwise. */
export function budgetUpcomingNote(recorded: number, upcoming: number, limit: number, planned = 0): { text: string; tone: "muted" | "warning" } | null {
  if (!(upcoming > 0)) return null;
  const overByUpcoming = limit > 0 && recorded <= limit && recorded + upcoming > limit;
  const hatched = `Hașurat = ${hatchedMeaning(upcoming, planned)}.`;
  return { text: overByUpcoming ? `Linia = bugetul. ${hatched}` : hatched, tone: "muted" };
}

/** "+ 725 lei facturi de plătit + 200 lei planificat" -- the not-yet-spent
 * money in words, for a line or an accessibility label; "" when none. */
export function upcomingWords(bills: number, planned: number, lei: (n: number) => string): string {
  return [bills > 0 ? `+ ${lei(bills)} facturi de plătit` : null, planned > 0 ? `+ ${lei(planned)} planificat` : null].filter(Boolean).join(" ");
}

/** Renders budgetUpcomingNote (or nothing). */
export function BudgetUpcomingNote({ recorded, upcoming, limit, planned = 0, style }: { recorded: number; upcoming: number; limit: number; planned?: number; style?: any }) {
  const { colors } = useTheme();
  const note = budgetUpcomingNote(recorded, upcoming, limit, planned);
  if (!note) return null;
  return (
    <Text style={[{ fontSize: 13, lineHeight: 18, color: note.tone === "warning" ? colors.warning : colors.onSurfaceTertiary }, style]}>
      {note.text}
    </Text>
  );
}
