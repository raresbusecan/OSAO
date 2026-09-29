import React, { useRef } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, Animated, Dimensions } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";

import type { HomeData } from "./home.data.types";
import type { HomeTaskEntry } from "@/lib/spaces/home/home.types";
import {
  getHomeTasksView,
  getRecurringTaskWarnings,
  type HomeTaskRow,
  type RecurringWarningTier,
} from "@/lib/spaces/home/calculations/dashboard.calculations";
import { severityColor } from "@/lib/statusColors";
import { SPACE_IDENTITY_COLORS } from "@/lib/spaces/spaceProfile";

export type HomeTasksPageProps = {
  homeData: HomeData;
  onBack: () => void;
  onAdd: () => void;
  onEdit: (entry: HomeTaskEntry) => void;
  /** Restanțe card tap -- opens HomeRecurringWarningsPage, the itemized
   * breakdown of the 4 counts shown on the card. */
  onWarningsPress: () => void;
  /** Checkbox tap -- the caller decides what happens: a purchase task
   * opens HomeTaskResolveSheet for the price, everything else completes
   * instantly. Not named onToggleComplete because it isn't always one. */
  onCheckboxPress: (entry: HomeTaskEntry) => void;
  /** The row's own trash icon -- deletes directly, without going
   * through the edit form first. Caller is expected to confirm before
   * actually deleting (see HomeDashboard's handleTaskRowDelete). */
  onDelete: (entry: HomeTaskEntry) => void;
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

// Same mapping as HomeRecurringWarningsPage's own tierStyle -- a task
// reads the same color here as it would on the Restanțe page.
function tierColor(tier: RecurringWarningTier | undefined, colors: any): string {
  if (tier === "red") return severityColor("critical", colors);
  if (tier === "orangeToday" || tier === "orangeDays") return severityColor("warning", colors);
  if (tier === "yellow") return severityColor("caution", colors);
  return colors.onSurfaceTertiary;
}

function tierLabel(row: HomeTaskRow): string {
  if (row.tier === "red") return "RESTANT";
  if (row.tier === "orangeToday") return "Azi";
  if (row.daysRemaining != null) return `${row.daysRemaining} zile`;
  return "";
}

export function HomeTasksPage({
  homeData,
  onBack,
  onAdd,
  onEdit,
  onWarningsPress,
  onCheckboxPress,
  onDelete,
}: HomeTasksPageProps) {
  const { colors, spacing, radius } = useTheme();

  const { counts: warningCounts } = getRecurringTaskWarnings(homeData);
  const { dueSoon, upcoming, recentDone } = getHomeTasksView(homeData);

  const findEntry = (id: string) => homeData.taskEntries.find((t) => t.id === id)!;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: 100 }}
      >
        {/* Header -- no per-page Archive button anymore, see
            HomeArchivePage: one space-level entry point on Home's own
            main dashboard instead (matches Car's Archive/History
            pattern, always visible there, not scattered per category). */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xl }}>
          <Pressable
            onPress={onBack}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{
              width: 36,
              height: 36,
              borderRadius: radius.pill,
              backgroundColor: "transparent",
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="chevron-back" size={20} color={colors.onSurface} />
          </Pressable>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: radius.md,
              backgroundColor: `${SPACE_IDENTITY_COLORS.home}1A`,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="checkmark-circle-outline" size={16} color={SPACE_IDENTITY_COLORS.home} />
          </View>
          <Text style={{ fontSize: 26, fontWeight: "800", letterSpacing: -0.4, color: colors.onSurface }}>
            Tasks
          </Text>
        </View>

        {/* Restanțe -- recurring tasks only, broken down by the 4
            states (galben 3-4 zile, portocaliu 1-2 zile, portocaliu azi,
            roșu restant). Tap opens the itemized list
            (HomeRecurringWarningsPage). */}
        <Pressable
          onPress={onWarningsPress}
          accessibilityRole="button"
          accessibilityLabel="View recurring task warnings"
          style={{
            marginBottom: spacing.xl,
            padding: spacing.lg,
            borderRadius: radius.sm,
            backgroundColor: colors.surfaceSecondary,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md }}>
            <Text style={{ fontSize: 13, fontWeight: "800", color: colors.onSurface }}>Restanțe</Text>
            <Ionicons name="chevron-forward" size={15} color={colors.onSurfaceTertiary} />
          </View>
          <View style={{ flexDirection: "row" }}>
            <WarningCount value={warningCounts.yellow} label="4 zile" color={severityColor("caution", colors)} />
            <WarningCount value={warningCounts.orangeDays} label="2 zile" color={severityColor("warning", colors)} />
            <WarningCount value={warningCounts.orangeToday} label="Azi" color={severityColor("warning", colors)} />
            <WarningCount value={warningCounts.red} label="Restant" color={severityColor("critical", colors)} last />
          </View>
        </Pressable>

        {/* Add -- always the first row of the list, above every section
            (never buried at the bottom of ALL, which could be scrolled
            past on a long list), and not a floating circle so it never
            duplicates/overlaps the shared "+" FAB. */}
        <AddTaskRow onPress={onAdd} colors={colors} spacing={spacing} radius={radius} />

        {/* DUE SOON */}
        {dueSoon.length > 0 ? (
          <View style={{ marginBottom: spacing.xl }}>
            <SectionTitle title="DUE SOON" colors={colors} />
            <View style={{ gap: spacing.sm }}>
              {dueSoon.map((row) => (
                <TaskRowCard
                  key={row.id}
                  row={row}
                  colors={colors}
                  spacing={spacing}
                  radius={radius}
                  onToggle={() => onCheckboxPress(findEntry(row.id))}
                  onPress={() => onEdit(findEntry(row.id))}
                  onDelete={() => onDelete(findEntry(row.id))}
                />
              ))}
            </View>
          </View>
        ) : null}

        {/* RECENT (done today) */}
        {recentDone.length > 0 ? (
          <View style={{ marginBottom: spacing.xl }}>
            <SectionTitle title="RECENT (Azi)" colors={colors} />
            <View style={{ backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, overflow: "hidden" }}>
              {recentDone.map((row, index) => (
                <DoneRow
                  key={row.id}
                  row={row}
                  colors={colors}
                  spacing={spacing}
                  last={index === recentDone.length - 1}
                  onToggle={() => onCheckboxPress(findEntry(row.id))}
                  onPress={() => onEdit(findEntry(row.id))}
                />
              ))}
            </View>
          </View>
        ) : null}

        {/* ALL -- everything else not yet done */}
        <View>
          <SectionTitle title="ALL" colors={colors} />
          {upcoming.length > 0 ? (
            <View style={{ backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, overflow: "hidden" }}>
              {upcoming.map((row, index) => (
                <UpcomingRow
                  key={row.id}
                  row={row}
                  colors={colors}
                  spacing={spacing}
                  last={index === upcoming.length - 1}
                  onToggle={() => onCheckboxPress(findEntry(row.id))}
                  onPress={() => onEdit(findEntry(row.id))}
                  onDelete={() => onDelete(findEntry(row.id))}
                />
              ))}
            </View>
          ) : (
            <View style={{ alignItems: "center", paddingVertical: spacing.xl, gap: spacing.sm }}>
              <Ionicons name="checkmark-done-outline" size={26} color={colors.onSurfaceTertiary} />
              <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>Nimic altceva de făcut.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function WarningCount({
  value,
  label,
  color,
  last,
}: {
  value: number;
  label: string;
  color: string;
  last?: boolean;
}) {
  return (
    <View style={{ flex: 1, alignItems: "center", borderRightWidth: last ? 0 : 1, borderRightColor: `${color}22` }}>
      <Text style={{ fontSize: 20, fontWeight: "800", color: value > 0 ? color : "#A3A3A3" }}>{value}</Text>
      <Text style={{ fontSize: 10.5, fontWeight: "700", color: "#A3A3A3", marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function SectionTitle({ title, colors }: { title: string; colors: any }) {
  return (
    <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 1, color: colors.onSurfaceTertiary, marginBottom: 10 }}>
      {title}
    </Text>
  );
}

function AddTaskRow({
  onPress,
  colors,
  spacing,
  radius,
}: {
  onPress: () => void;
  colors: any;
  spacing: any;
  radius: any;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Add task"
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        height: 46,
        borderRadius: radius.md,
        backgroundColor: colors.onSurface,
        marginBottom: spacing.xl,
      }}
    >
      <Ionicons name="add" size={15} color={colors.surface} />
      <Text style={{ fontSize: 13.5, fontWeight: "800", color: colors.surface }}>Add Task</Text>
    </Pressable>
  );
}

// Swipe right (drag rightward, uncovering the LEFT side) resolves;
// swipe left (uncovering the RIGHT side) deletes -- the same
// convention iOS Mail/Reminders use, and the same two actions the
// checkbox/trash icon already offer on every row. This is a shortcut
// on top of those, not a replacement -- both icons stay visible, and
// the swipe fires the EXACT SAME onToggle/onDelete callback a tap on
// them already would (same confirm-before-delete flow, same
// purchase-price-prompt flow), never a second parallel action path.
// `cornerRadius` matches whatever the wrapped row's own corners are
// (TaskRowCard's independent radius.sm card, or 0 for UpcomingRow's
// flat divided-list rows) so the action panel's outer edge lines up
// with the row instead of showing a mismatched square corner.
// A swipe that clears this fraction of the screen width auto-fires
// the action on release (no extra tap needed) -- same "commit swipe"
// convention Mail/Gmail use for archive/delete. A shorter swipe still
// reveals the colored panel (and it's still tappable, e.g. for anyone
// who prefers a deliberate two-step tap) but SPRINGS BACK without
// firing anything if released before this point -- that's the
// necessary trade-off of a single auto-fire threshold: it can't both
// "always stay open for a later tap" and "commit past a point," since
// react-native-gesture-handler's Swipeable only has the one
// open/closed snap threshold. 0.4 was picked as a reasonable middle
// ground (deliberate, not a hair-trigger); tune SWIPE_TRIGGER_PERCENT
// if that feels off in practice.
const SWIPE_TRIGGER_PERCENT = 0.4;
const SWIPE_TRIGGER_DISTANCE = Dimensions.get("window").width * SWIPE_TRIGGER_PERCENT;

function TaskSwipeRow({
  onResolve,
  onDelete,
  cornerRadius,
  colors,
  children,
}: {
  onResolve: () => void;
  onDelete: () => void;
  cornerRadius: number;
  colors: any;
  children: React.ReactNode;
}) {
  const ref = useRef<Swipeable>(null);

  return (
    <Swipeable
      ref={ref}
      friction={2}
      overshootLeft
      overshootRight
      leftThreshold={SWIPE_TRIGGER_DISTANCE}
      rightThreshold={SWIPE_TRIGGER_DISTANCE}
      // Fires once a swipe actually clears the threshold and is
      // released (Swipeable snaps "open") -- direction 'left' means
      // the LEFT action panel opened, i.e. the user swiped RIGHT
      // (resolve); 'right' means the RIGHT panel opened, swiped LEFT
      // (delete). Closes immediately after so the row doesn't sit
      // stuck open once the action's already fired.
      onSwipeableOpen={(direction) => {
        ref.current?.close();
        if (direction === "left") onResolve();
        else onDelete();
      }}
      renderLeftActions={(_progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => (
        <Pressable
          onPress={() => {
            ref.current?.close();
            onResolve();
          }}
          accessibilityRole="button"
          accessibilityLabel="Swipe to resolve"
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.success,
            borderTopLeftRadius: cornerRadius,
            borderBottomLeftRadius: cornerRadius,
          }}
        >
          <Animated.View
            style={{
              transform: [
                { scale: dragX.interpolate({ inputRange: [0, SWIPE_TRIGGER_DISTANCE], outputRange: [0.6, 1.15], extrapolate: "clamp" }) },
              ],
            }}
          >
            <Ionicons name="checkmark" size={20} color="#fff" />
          </Animated.View>
        </Pressable>
      )}
      renderRightActions={(_progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => (
        <Pressable
          onPress={() => {
            ref.current?.close();
            onDelete();
          }}
          accessibilityRole="button"
          accessibilityLabel="Swipe to delete"
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.error,
            borderTopRightRadius: cornerRadius,
            borderBottomRightRadius: cornerRadius,
          }}
        >
          <Animated.View
            style={{
              transform: [
                { scale: dragX.interpolate({ inputRange: [-SWIPE_TRIGGER_DISTANCE, 0], outputRange: [1.15, 0.6], extrapolate: "clamp" }) },
              ],
            }}
          >
            <Ionicons name="trash" size={20} color="#fff" />
          </Animated.View>
        </Pressable>
      )}
    >
      {children}
    </Swipeable>
  );
}

function Checkbox({ onPress, colors }: { onPress: () => void; colors: any }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Mark done"
      style={{
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 2,
        // colors.success, not a neutral border -- the same "this
        // resolves something" signal every other resolve-style checkbox
        // in the app now uses (see HomeCategorySection.tsx's own resolve
        // checkbox), so it reads as one consistent control before it's
        // even tapped, not just once DoneRow below fills it in.
        borderColor: colors.success,
        flexShrink: 0,
      }}
    />
  );
}

function TaskRowCard({
  row,
  colors,
  spacing,
  radius,
  onToggle,
  onPress,
  onDelete,
}: {
  row: HomeTaskRow;
  colors: any;
  spacing: any;
  radius: any;
  onToggle: () => void;
  onPress: () => void;
  onDelete: () => void;
}) {
  const color = tierColor(row.tier, colors);

  return (
    <TaskSwipeRow onResolve={onToggle} onDelete={onDelete} cornerRadius={radius.sm} colors={colors}>
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radius.sm,
        backgroundColor: colors.surfaceSecondary,
        borderWidth: 1,
        // Colored for any of the 4 urgency tiers now, not just overdue
        // -- 4 days / 2 days / today / restant all get their own color,
        // same as Restanțe.
        borderColor: row.tier ? color : colors.border,
      }}
    >
      <Checkbox onPress={onToggle} colors={colors} />
      <Pressable onPress={onPress} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        {row.isPurchase ? <Ionicons name="cart-outline" size={15} color={colors.onSurfaceTertiary} /> : null}
        {row.isRecurring ? <Ionicons name="repeat-outline" size={15} color={colors.onSurfaceTertiary} /> : null}
        <Text style={{ flex: 1, fontSize: 14.5, fontWeight: "700", color: colors.onSurface }} numberOfLines={1}>
          {row.title}
        </Text>
        {row.tier === "red" ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: `${color}22` }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 9, fontWeight: "900", color: colors.surface, lineHeight: 11 }}>!</Text>
            </View>
            <Text style={{ fontSize: 11, fontWeight: "800", color }}>{tierLabel(row)}</Text>
          </View>
        ) : (
          <Text style={{ fontSize: 11.5, fontWeight: "800", color }}>{tierLabel(row)}</Text>
        )}
      </Pressable>
      {/* Direct delete, same trash icon/color as HomeCategorySection's
          own row delete -- no longer only reachable via the edit form. */}
      <Pressable onPress={onDelete} hitSlop={14} accessibilityRole="button" accessibilityLabel="Delete task" style={{ padding: 2 }}>
        <Ionicons name="trash-outline" size={16} color={colors.error} />
      </Pressable>
    </View>
    </TaskSwipeRow>
  );
}

function DoneRow({
  row,
  colors,
  spacing,
  last,
  onToggle,
  onPress,
}: {
  row: HomeTaskRow;
  colors: any;
  spacing: any;
  last: boolean;
  onToggle: () => void;
  onPress: () => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      }}
    >
      <Pressable onPress={onToggle} hitSlop={8} accessibilityRole="button" accessibilityLabel="Undo" style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: colors.success, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Ionicons name="checkmark" size={13} color={colors.surface} />
      </Pressable>
      <Pressable onPress={onPress} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Text style={{ flex: 1, fontSize: 14.5, fontWeight: "600", color: colors.onSurfaceTertiary, textDecorationLine: "line-through" }} numberOfLines={1}>
          {row.title}
        </Text>
        {row.isPurchase && row.price ? (
          <Text style={{ fontSize: 12.5, fontWeight: "700", color: colors.onSurfaceTertiary }}>
            {row.price.toLocaleString("en-US")} RON
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}

function UpcomingRow({
  row,
  colors,
  spacing,
  last,
  onToggle,
  onPress,
  onDelete,
}: {
  row: HomeTaskRow;
  colors: any;
  spacing: any;
  last: boolean;
  onToggle: () => void;
  onPress: () => void;
  onDelete: () => void;
}) {
  return (
    <TaskSwipeRow onResolve={onToggle} onDelete={onDelete} cornerRadius={0} colors={colors}>
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
        backgroundColor: colors.surfaceSecondary,
      }}
    >
      <Checkbox onPress={onToggle} colors={colors} />
      <Pressable onPress={onPress} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        {row.isPurchase ? <Ionicons name="cart-outline" size={14} color={colors.onSurfaceTertiary} /> : null}
        {row.isRecurring ? <Ionicons name="repeat-outline" size={14} color={colors.onSurfaceTertiary} /> : null}
        <Text style={{ flex: 1, fontSize: 14.5, fontWeight: "600", color: colors.onSurface }} numberOfLines={1}>
          {row.title}
        </Text>
        <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>{row.dueDate ? formatDate(row.dueDate) : "Fără dată"}</Text>
        <Ionicons name="chevron-forward" size={15} color={colors.onSurfaceTertiary} />
      </Pressable>
      <Pressable onPress={onDelete} hitSlop={14} accessibilityRole="button" accessibilityLabel="Delete task" style={{ padding: 2 }}>
        <Ionicons name="trash-outline" size={16} color={colors.error} />
      </Pressable>
    </View>
    </TaskSwipeRow>
  );
}
