import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { ToggleRow, hexToRgba } from "@/components/ui/primitives";
import { useBudgetPlan } from "@/lib/budget/plan";
import { lei } from "@/lib/format";

/**
 * "Bani fără vină" -- the per-item flag (items.guilt_free) that takes a
 * record out of its space's spend/budget/average and counts it against
 * the 5% jar instead. Two shared pieces so every form and list reads the
 * same:
 *  - <GuiltFreeToggle>: the ToggleRow for EDIT forms only (not quick-add).
 *    Renders nothing until the person set an income (no plan = no jar).
 *    A record already flagged keeps its toggle visible so it can be undone.
 *  - <GuiltFreeChip>: the small "Fără vină" label on a flagged row.
 * Send `guilt_free: boolean` in the item body; the server 422s it on
 * types that aren't spending/recurring (e.g. expense_credit, tasks).
 */
export function GuiltFreeToggle({
  value,
  onChange,
  tone,
  testID = "guilt-free-toggle",
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  /** The screen's tone (the Space color); defaults to success green. */
  tone?: string;
  testID?: string;
}) {
  const summary = useBudgetPlan();
  if (!summary?.plan && !value) return null;
  const budget = summary?.guiltFree.budget;
  return (
    <ToggleRow
      testID={testID}
      label="Bani fără vină"
      hint={budget != null ? `Din cei ${lei(Math.round(budget))}, nu din necesități` : "Nu din necesități"}
      icon="heart-outline"
      value={value}
      onChange={onChange}
      tone={tone}
    />
  );
}

export function GuiltFreeChip({ testID }: { testID?: string }) {
  const { colors, isDark } = useTheme();
  const ink = isDark ? "#B9C0CD" : "#3D4553";
  return (
    <View
      testID={testID}
      accessibilityLabel="Bani fără vină"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        backgroundColor: hexToRgba(colors.onSurfaceTertiary.length === 7 ? colors.onSurfaceTertiary : "#5B6474", isDark ? 0.16 : 0.12),
        alignSelf: "flex-start",
      }}
    >
      <Ionicons name="heart-outline" size={11} color={ink} />
      <Text style={{ fontSize: 12, fontWeight: "600", color: ink }} numberOfLines={1}>Fără vină</Text>
    </View>
  );
}
