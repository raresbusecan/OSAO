import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  NestableScrollContainer,
  NestableDraggableFlatList,
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import { useTheme } from "@/lib/theme";
import { SwipeRow } from "@/components/spaces/SwipeRow";
import { SwipeBackView } from "@/components/spaces/SwipeBackView";
import { PressableScale } from "@/components/ui/PressableScale";
import { TopBar, CircleButton, Identity, SectionHeader, Chip, EmptyState } from "@/components/ui/primitives";
import { roCount, roDate, lei } from "@/lib/format";

import type { HomeData } from "./home.data.types";
import type { HomeTaskEntry } from "@/lib/spaces/home/home.types";
import {
  getHomeTasksView,
  recurringWarningTierColor,
  type HomeTaskRow,
} from "@/lib/spaces/home/calculations/dashboard.calculations";
import { useSpaceColors } from "@/lib/spaces/spaceTheme";

export type HomeTasksPageProps = {
  homeData: HomeData;
  onBack: () => void;
  onAdd: () => void;
  /** Tap on a row: the record preview (HomeRecordSheet). */
  onPreview: (entry: HomeTaskEntry) => void;
  /** Long press on a row: the record's action sheet. */
  onActions: (entry: HomeTaskEntry) => void;
  /** Checkbox tap -- the caller decides what happens: a purchase task
   * opens HomeTaskResolveSheet for the price, everything else completes
   * instantly. Not named onToggleComplete because it isn't always one. */
  onCheckboxPress: (entry: HomeTaskEntry) => void;
  /** Swipe-left delete. Caller is expected to confirm before actually
   * deleting (see HomeDashboard's handleTaskRowDelete). */
  onDelete: (entry: HomeTaskEntry) => void;
  /** Drag-reorder in "Toate" ("Ordonează" mode, ☰ handle) -- fires with
   * that section's full id list in its new order every time a drag ends. */
  onReorder: (orderedIds: string[]) => void;
};


/** The urgency chip for a task: Restant / Azi / în N zile. */
function TaskChip({ row }: { row: HomeTaskRow }) {
  const { colors } = useTheme();
  if (!row.tier && row.daysRemaining == null) return null;
  const color = row.tier ? recurringWarningTierColor(row.tier, colors) : colors.onSurfaceTertiary;
  if (row.tier === "red") {
    const late = Math.max(1, Math.abs(row.daysRemaining ?? 1));
    return <Chip label={`Restant ${roCount(late, "zi", "zile")}`} color={colors.error} icon="alert-circle" />;
  }
  if (row.tier === "orangeToday") return <Chip label="Azi" color={colors.warning} />;
  if (row.daysRemaining != null) {
    const label = row.daysRemaining === 1 ? "Mâine" : `în ${roCount(row.daysRemaining, "zi", "zile")}`;
    return row.tier ? <Chip label={label} color={color} /> : <Chip label={label} color={colors.onSurfaceTertiary} filled={false} />;
  }
  return null;
}

/**
 * Home -> Sarcini, 2026-10 redesign. "+" in the top bar adds; the round
 * check completes (a purchase task asks for the price); tap a row = its
 * preview, long press = its actions, swipe right = resolve, left =
 * delete. Reordering "Toate" is its own mode ("Ordonează" -> ☰ handles ->
 * "Gata"), so a long press always means "actions" in Casă.
 */
export function HomeTasksPage({ homeData, onBack, onAdd, onPreview, onActions, onCheckboxPress, onDelete, onReorder }: HomeTasksPageProps) {
  const { colors, spacing, radius } = useTheme();
  const homeColors = useSpaceColors("home");
  const HOME = homeColors.color;
  const [reordering, setReordering] = useState(false);

  const { dueSoon, upcoming, recentDone } = getHomeTasksView(homeData);
  const findEntry = (id: string) => homeData.taskEntries.find((t) => t.id === id)!;
  const openCount = dueSoon.length + upcoming.length;

  const groupStyle = { backgroundColor: colors.surfaceSecondary, borderRadius: radius.card, overflow: "hidden" as const };

  return (
    <SwipeBackView onBack={onBack} style={{ backgroundColor: colors.surface }}>
      <NestableScrollContainer
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: 100, gap: spacing.section }}
      >
        <TopBar onBack={onBack}>
          <CircleButton testID="home-task-add" icon="add" label="Sarcină nouă" tone={HOME} onPress={onAdd} />
        </TopBar>

        <Identity
          color={HOME}
          kicker="Casă"
          title="Sarcini"
          info="home.tasks"
          subtitle={
            openCount === 0 && recentDone.length === 0
              ? null
              : [openCount > 0 ? `${openCount} de făcut` : null, recentDone.length > 0 ? `${recentDone.length} rezolvat${recentDone.length === 1 ? "" : "e"} azi` : null]
                  .filter(Boolean)
                  .join(", ")
          }
        />

        {dueSoon.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <SectionHeader title="În curând" />
            <View style={groupStyle}>
              {dueSoon.map((row, i) => (
                <TaskRow
                  key={row.id}
                  row={row}
                  first={i === 0}
                  onToggle={() => onCheckboxPress(findEntry(row.id))}
                  onPress={() => onPreview(findEntry(row.id))}
                  onLongPress={() => onActions(findEntry(row.id))}
                  onDelete={() => onDelete(findEntry(row.id))}
                />
              ))}
            </View>
          </View>
        ) : null}

        {recentDone.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <SectionHeader title="Rezolvate azi" />
            <View style={groupStyle}>
              {recentDone.map((row, i) => (
                <TaskRow
                  key={row.id}
                  row={row}
                  first={i === 0}
                  done
                  onToggle={() => onCheckboxPress(findEntry(row.id))}
                  onPress={() => onPreview(findEntry(row.id))}
                  onLongPress={() => onActions(findEntry(row.id))}
                />
              ))}
            </View>
          </View>
        ) : null}

        {/* "Toate" -- everything else not yet done. "Ordonează" shows a ☰
            handle per row (NestableDraggableFlatList because this list
            lives inside the page's own outer scroll). */}
        <View style={{ gap: spacing.sm }}>
          <SectionHeader
            title="Toate"
            action={
              reordering
                ? { label: "Gata", onPress: () => setReordering(false), testID: "home-tasks-reorder-done", tone: homeColors.tint }
                : upcoming.length > 1
                  ? { label: "Ordonează", onPress: () => setReordering(true), testID: "home-tasks-reorder" }
                  : undefined
            }
          />
          {upcoming.length > 0 ? (
            <View style={groupStyle}>
              <NestableDraggableFlatList
                data={upcoming}
                keyExtractor={(row) => row.id}
                onDragEnd={({ data }) => onReorder(data.map((row) => row.id))}
                renderItem={({ item: row, drag, isActive, getIndex }: RenderItemParams<HomeTaskRow>) => (
                  <TaskRow
                    row={row}
                    first={getIndex() === 0}
                    onToggle={() => onCheckboxPress(findEntry(row.id))}
                    onPress={() => onPreview(findEntry(row.id))}
                    onLongPress={() => onActions(findEntry(row.id))}
                    onDelete={() => onDelete(findEntry(row.id))}
                    onDrag={reordering ? drag : undefined}
                    isActive={isActive}
                    showDate
                  />
                )}
              />
            </View>
          ) : (
            <EmptyState icon="checkmark-done-outline" message={dueSoon.length > 0 ? "Nimic altceva de făcut." : "Niciun task. Adaugă unul cu „+”."} />
          )}
        </View>

      </NestableScrollContainer>
    </SwipeBackView>
  );
}

/** One task: round check, title (+ purchase/recurring marks and date),
 * urgency chip. `done` = completed today (filled check, struck title,
 * tap the check to undo). */
function TaskRow({
  row,
  first,
  done,
  onToggle,
  onPress,
  onLongPress,
  onDelete,
  onDrag,
  isActive,
  showDate,
}: {
  row: HomeTaskRow;
  first: boolean;
  done?: boolean;
  onToggle: () => void;
  onPress: () => void;
  onLongPress?: () => void;
  onDelete?: () => void;
  /** Set only in "Ordonează" mode: the row shows a ☰ handle instead of
   * its check, and takes no taps/swipes. */
  onDrag?: () => void;
  isActive?: boolean;
  showDate?: boolean;
}) {
  const { colors, spacing } = useTheme();
  const homeColors = useSpaceColors("home");
  const HOME = homeColors.color;

  const meta = [
    row.isPurchase && done && row.price ? lei(row.price) : null,
    showDate && !row.tier ? (row.dueDate ? roDate(row.dueDate) : "Fără dată") : null,
  ].filter(Boolean).join(", ");

  const body = (
    <View>
      {!first ? <View style={{ height: 1, marginLeft: onDrag ? 16 : 54, backgroundColor: colors.border }} /> : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
          paddingLeft: spacing.md + 2,
          paddingRight: spacing.lg,
          minHeight: 58,
          backgroundColor: isActive ? colors.surfaceTertiary : colors.surfaceSecondary,
        }}
      >
        {onDrag ? null : (
        <Pressable
          onPress={onToggle}
          hitSlop={10}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: !!done }}
          accessibilityLabel={done ? `Anulează: ${row.title}` : `Rezolvă: ${row.title}`}
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            borderWidth: done ? 0 : 2,
            borderColor: colors.control,
            backgroundColor: done ? HOME : "transparent",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {done ? <Ionicons name="checkmark" size={15} color={homeColors.ink} /> : null}
        </Pressable>
        )}
        <PressableScale
          onPress={onDrag ? undefined : onPress}
          onLongPress={onDrag ? undefined : onLongPress}
          delayLongPress={350}
          disabled={isActive || !!onDrag}
          scaleTo={1}
          accessibilityRole="button"
          accessibilityLabel={row.title}
          style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm + 2, opacity: done ? 0.5 : 1 }}
        >
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {row.isPurchase ? <Ionicons name="cart-outline" size={14} color={colors.onSurfaceTertiary} /> : null}
              {row.isRecurring ? <Ionicons name="repeat-outline" size={14} color={colors.onSurfaceTertiary} /> : null}
              <Text
                style={{ flex: 1, fontSize: 15, fontWeight: "500", color: colors.onSurface, textDecorationLine: done ? "line-through" : "none" }}
                numberOfLines={2}
              >
                {row.title}
              </Text>
            </View>
            {meta ? <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, marginTop: 2 }}>{meta}</Text> : null}
          </View>
          {!done ? <TaskChip row={row} /> : null}
        </PressableScale>
        {onDrag ? (
          <Pressable
            testID={`home-task-drag-${row.id}`}
            onPressIn={onDrag}
            disabled={isActive}
            accessibilityRole="button"
            accessibilityLabel={`Mută ${row.title}`}
            hitSlop={6}
            style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: -spacing.sm }}
          >
            <Ionicons name="reorder-three" size={24} color={isActive ? colors.onSurface : colors.onSurfaceTertiary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  if (!onDelete || onDrag) return body;
  return (
    <SwipeRow onResolve={onToggle} onDelete={onDelete} cornerRadius={0} colors={colors}>
      {body}
    </SwipeRow>
  );
}
