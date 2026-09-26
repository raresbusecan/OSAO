import React, { useEffect, useRef, useState } from "react";
import { ScrollView, View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "@/lib/theme";
import { confirmAction, notifyAction } from "@/lib/confirm";
import { severityColor, type SeverityTier } from "@/lib/statusColors";
import { SPACE_IDENTITY_COLORS } from "@/lib/spaces/spaceProfile";

import type { HomeData } from "./home.data.types";
import type { HomeNextItem } from "./home.ui.types";
import type {
  HomeDocumentEntry,
  HomeExpenseEntry,
  HomeMaintenanceEntry,
  HomeRecurringEntry,
  HomeSupplyEntry,
  HomeTaskEntry,
} from "@/lib/spaces/home/home.types";
import { HomeHeader } from "./HomeHeader";
import { HomeStats } from "./HomeStats";
import { HomeNextSection } from "./HomeNextSection";
import { HomeCategoryPage } from "./HomeCategoryPage";
import { HomeTasksPage } from "./HomeTasksPage";
import { HomeTaskArchivePage } from "./HomeTaskArchivePage";
import { HomeRecurringWarningsPage } from "./HomeRecurringWarningsPage";
import { HomeTaskResolveSheet } from "./HomeTaskResolveSheet";
import { HomeSuppliesPage } from "./HomeSuppliesPage";
import { HomeSupplyRestockSheet } from "./HomeSupplyRestockSheet";
import HomeTaskForm from "./forms/HomeTaskForm";
import HomeSupplyForm from "./forms/HomeSupplyForm";
import { HOME_CATEGORIES, type HomeCategoryKey } from "./homeCategoryConfig";
import { useRegisterSpaceCategories, type SpaceCategory } from "@/lib/spaceCategoryFab";
import {
  getThisMonthHomeExpenses,
  getUpcomingHomeItems,
  getHomeTaskStats,
  getSupplyRestockEstimate,
  nextTaskOccurrence,
} from "@/lib/spaces/home/calculations/dashboard.calculations";
import type { HomeProfile } from "@/lib/spaces/spaceProfile";

type CategoryBadge = { count: number; severity: SeverityTier } | null;

/** How many of `items` (getUpcomingHomeItems's full, unsliced list)
 * belong to one category -- its id is always "<prefix>-<entry id>" (see
 * that function) -- and how urgent the worst of them is. `urgency` is
 * days-until-due, so the minimum across matches is the closest one;
 * negative means already overdue ("critical"), 0+ means coming up
 * ("warning"). Null (no badge) when the category has nothing upcoming
 * at all, same as the tile showing no number today. */
function categoryBadge(items: HomeNextItem[], prefix: string): CategoryBadge {
  const matches = items.filter((item) => String(item.id).startsWith(prefix));
  if (matches.length === 0) return null;
  const worst = Math.min(...matches.map((item) => item.urgency));
  return { count: matches.length, severity: worst < 0 ? "critical" : "warning" };
}

export type HomeDashboardProps = {
  space: any;
  homeData: HomeData;
  /** From the dedicated Home form (Edit -> County/City/...) -- null for a Home space created before this existed. */
  profile?: HomeProfile | null;
  onEdit?: () => void;
  // homeData now lives in app/(tabs)/[id].tsx and is persisted through the
  // generic Items API (see lib/spaces/home/homeItems.ts) -- these 10
  // handlers are how this dashboard actually saves/deletes anything,
  // mirroring CarDashboard's onFuelSave/onFuelDelete etc. exactly.
  onDocumentSave: (entry: HomeDocumentEntry) => void;
  onDocumentDelete: (id: string) => void;
  onExpenseSave: (entry: HomeExpenseEntry) => void;
  onExpenseDelete: (id: string) => void;
  onMaintenanceSave: (entry: HomeMaintenanceEntry) => void;
  onMaintenanceDelete: (id: string) => void;
  onRecurringSave: (entry: HomeRecurringEntry) => void;
  onRecurringDelete: (id: string) => void;
  onSupplySave: (entry: HomeSupplyEntry) => void;
  onSupplyDelete: (id: string) => void;
  onTaskSave: (entry: HomeTaskEntry) => void;
  onTaskDelete: (id: string) => void;
  /** Deep-link from TodoCarouselSheet's "Deschide" -- jumps straight
   * into the sub-view where that specific to-do actually gets resolved
   * instead of just landing on this dashboard's own category grid. */
  initialOpenItem?: { type: "home_task" | "home_recurring" | "home_maintenance"; id: string } | null;
};

export default function HomeDashboard({
  space,
  homeData,
  profile,
  onEdit,
  onDocumentSave,
  onDocumentDelete,
  onExpenseSave,
  onExpenseDelete,
  onMaintenanceSave,
  onMaintenanceDelete,
  onRecurringSave,
  onRecurringDelete,
  onSupplySave,
  onSupplyDelete,
  onTaskSave,
  onTaskDelete,
  initialOpenItem,
}: HomeDashboardProps) {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();

  const [activeCategory, setActiveCategory] = useState<HomeCategoryKey | null>(null);
  // Set alongside activeCategory only by the initialOpenItem deep-link
  // below -- HomeCategoryPage pre-opens this row for edit on mount, same
  // as tapping it (see its own initialEditId prop).
  const [initialCategoryEditId, setInitialCategoryEditId] = useState<string | null>(null);

  // Task has its own dedicated view (HomeTasksPage, DUE SOON/RECENT/ALL --
  // see PLAN.md) instead of the generic HOME_CATEGORIES form+list, so it's
  // tracked separately from activeCategory rather than folded into it.
  const [tasksPageVisible, setTasksPageVisible] = useState(false);
  const [taskFormVisible, setTaskFormVisible] = useState(false);
  const [editingTaskEntry, setEditingTaskEntry] = useState<HomeTaskEntry | null>(null);
  const [archivePageVisible, setArchivePageVisible] = useState(false);
  const [warningsPageVisible, setWarningsPageVisible] = useState(false);
  // Set only for a purchase-flagged task's checkbox tap -- renders
  // HomeTaskResolveSheet on top of HomeTasksPage asking for the price.
  const [resolveSheetEntry, setResolveSheetEntry] = useState<HomeTaskEntry | null>(null);

  // Supplies has the same "dedicated view, not the generic HOME_CATEGORIES
  // form+list" treatment as Task, for the same reason -- the restock
  // history/estimate (HomeSuppliesPage) needs its own layout.
  const [suppliesPageVisible, setSuppliesPageVisible] = useState(false);
  const [supplyFormVisible, setSupplyFormVisible] = useState(false);
  const [editingSupplyEntry, setEditingSupplyEntry] = useState<HomeSupplyEntry | null>(null);
  // Set from "Restocked" on HomeSuppliesPage -- renders
  // HomeSupplyRestockSheet on top asking how much was just bought.
  const [restockSheetEntry, setRestockSheetEntry] = useState<HomeSupplyEntry | null>(null);

  const thisMonthExpenses = getThisMonthHomeExpenses(homeData);
  // Unsliced -- the category grid's badges below need the REAL count per
  // category, not just whichever 3 items happen to be the soonest
  // overall (a category with nothing in the top 3 would wrongly show no
  // badge at all). HomeNextSection still only ever sees the first 3.
  const upcomingItems = getUpcomingHomeItems(homeData);

  const taskStats = getHomeTaskStats(homeData);
  const taskBadge: CategoryBadge =
    taskStats.overdue + taskStats.dueToday > 0
      ? { count: taskStats.overdue + taskStats.dueToday, severity: taskStats.overdue > 0 ? "critical" : "warning" }
      : null;

  const lowSupplyCount = homeData.supplyEntries.filter(
    (entry) => getSupplyRestockEstimate(entry)?.isLow,
  ).length;
  const supplyBadge: CategoryBadge = lowSupplyCount > 0 ? { count: lowSupplyCount, severity: "critical" } : null;

  const maintenanceBadge = categoryBadge(upcomingItems, "maint-");
  const recurringBadge = categoryBadge(upcomingItems, "rec-");

  // Documents deliberately excluded here too (see fabCategories below) --
  // no tile for it until it has real utility (file upload).
  const categoryTiles = [
    { key: "expenses" as const, label: "Cheltuieli", icon: HOME_CATEGORIES.find((c) => c.key === "expenses")!.icon, badge: null as CategoryBadge },
    { key: "maintenance" as const, label: "Mentenanță", icon: HOME_CATEGORIES.find((c) => c.key === "maintenance")!.icon, badge: maintenanceBadge },
    { key: "recurring" as const, label: "Recurente", icon: HOME_CATEGORIES.find((c) => c.key === "recurring")!.icon, badge: recurringBadge },
    { key: "supplies" as const, label: "Provizii", icon: "basket-outline" as const, badge: supplyBadge },
    { key: "task" as const, label: "Task-uri", icon: "checkmark-circle-outline" as const, badge: taskBadge },
  ];

  // Every Task/Supplies sub-view (page, form, archive, warnings, resolve
  // sheet) is its own boolean instead of one shared enum, so switching
  // to a DIFFERENT top-level destination (another category via the FAB,
  // or back to the main dashboard) has to explicitly clear all of them
  // -- otherwise whichever one was true keeps winning the render-order
  // check above activeCategory, and the screen looks stuck on the old
  // one while the state underneath has actually already moved on.
  const closeAllSubViews = () => {
    setTasksPageVisible(false);
    setTaskFormVisible(false);
    setEditingTaskEntry(null);
    setArchivePageVisible(false);
    setWarningsPageVisible(false);
    setResolveSheetEntry(null);
    setSuppliesPageVisible(false);
    setSupplyFormVisible(false);
    setEditingSupplyEntry(null);
    setRestockSheetEntry(null);
  };

  // Claims the shared "+" FAB (app/(tabs)/_layout.tsx) for as long as this
  // dashboard is on screen -- pressing it fans out Home's categories
  // instead of opening Quick Add. Task/Supplies are appended after the
  // generic HOME_CATEGORIES ones since they have their own dedicated
  // views now, not the generic form+list. Documents is left out on
  // purpose (2026-09-17): real utility there needs file upload, which
  // needs stable hosting -- see PLAN.md's Home Space section. The
  // category config itself isn't deleted, just not offered here yet.
  const fabCategories: SpaceCategory[] = [
    ...HOME_CATEGORIES.filter((c) => c.key !== "documents" && c.key !== "supplies").map((c) => ({
      key: c.key,
      label: c.label,
      icon: c.icon,
    })),
    { key: "supplies", label: "Supplies", icon: "basket-outline" },
    { key: "task", label: "Task", icon: "checkmark-circle-outline" },
  ];

  // Shared by the FAB fan below AND the on-screen category grid (see the
  // "home" view's return block) -- both are just different ways to pick
  // the same destination, so they go through one routing function
  // instead of two copies of this Task/Supplies special-casing.
  const selectCategory = (key: string) => {
    if (key === "task") {
      // First tap opens the dedicated Tasks page (DUE SOON/RECENT/ALL).
      // The shared FAB stays the only floating button on that page too
      // (same as Car's CarExpensesPage) -- tapping "Task" again while
      // already there opens the add form on top of it instead of
      // no-op'ing back to the same page, so there's no second, local
      // "+" button duplicating the shared one. Re-entering Tasks this
      // way should still drop any leftover archive/warnings/resolve
      // sub-view from a previous visit, so only tasksPageVisible (or
      // taskFormVisible, on a second tap) ends up true.
      const wasOnTasksPage = tasksPageVisible;
      setActiveCategory(null);
      closeAllSubViews();
      if (wasOnTasksPage) {
        setTaskFormVisible(true);
      } else {
        setTasksPageVisible(true);
      }
      return;
    }
    if (key === "supplies") {
      // Same pattern as Task above.
      const wasOnSuppliesPage = suppliesPageVisible;
      setActiveCategory(null);
      closeAllSubViews();
      if (wasOnSuppliesPage) {
        setSupplyFormVisible(true);
      } else {
        setSuppliesPageVisible(true);
      }
      return;
    }
    // A different category entirely -- close every Task/Supplies
    // sub-view so none of them keep winning the render-order check
    // above activeCategory (see closeAllSubViews).
    closeAllSubViews();
    setActiveCategory(key as HomeCategoryKey);
  };

  useRegisterSpaceCategories({
    spaceLabel: "Home",
    categories: fabCategories,
    onSelect: selectCategory,
  });

  const handleTaskSave = (entry: HomeTaskEntry) => {
    onTaskSave(entry);
    setTaskFormVisible(false);
    setEditingTaskEntry(null);
  };

  const handleTaskDelete = () => {
    if (editingTaskEntry) onTaskDelete(editingTaskEntry.id);
    setTaskFormVisible(false);
    setEditingTaskEntry(null);
  };

  // The task row's own trash icon (HomeTasksPage) -- same confirm copy
  // as HomeTaskForm's own delete button, since this reaches the exact
  // same permanent delete without going through that form first.
  const handleTaskRowDelete = async (entry: HomeTaskEntry) => {
    const confirmed = await confirmAction(
      "Delete task",
      "This entry will be permanently deleted.",
      { confirmLabel: "Delete", destructive: true },
    );
    if (!confirmed) return;
    onTaskDelete(entry.id);
  };

  // Shared by a direct checkbox tap and the resolve sheet's confirm --
  // price is undefined for a non-purchase task, or when "Rezolvă fără
  // preț" was tapped (still resolves, just never counts as spend; see
  // getThisMonthHomeExpenses/getHomeTaskArchive, both gated on
  // isPurchase && price and keyed off completedAt, not dueDate).
  //
  // A recurring task never sets completed:true -- it logs completedAt
  // (when it was last done) and stays active, so it's still in DUE
  // SOON/ALL for next time instead of archiving (getHomeTasksView/
  // getHomeTaskArchive both key off `completed`, so this alone is
  // enough to keep it out of RECENT/Archive). Its dueDate advances to
  // the next occurrence per recurrenceFrequency (nextTaskOccurrence) by
  // default, but the resolve sheet lets the user override that computed
  // date -- explicitNextDue, when passed, wins. A plain task's dueDate
  // stays put; it completes and archives normally.
  const resolveTask = (entry: HomeTaskEntry, price: number | undefined, explicitNextDue?: string) => {
    const now = new Date().toISOString();
    const nextDue = entry.isRecurring
      ? (explicitNextDue ?? nextTaskOccurrence(entry.dueDate, entry.recurrenceFrequency))
      : entry.dueDate;

    onTaskSave({
      ...entry,
      completed: !entry.isRecurring,
      completedAt: now,
      dueDate: nextDue,
      price: price ?? entry.price,
    });

    if (entry.isRecurring) {
      const label = new Date(nextDue!).toLocaleDateString("ro-RO", { day: "numeric", month: "short" });
      notifyAction("Bifat", `${entry.title} rămâne activ — următoarea dată: ${label}.`);
    }
  };

  // Checkbox tap on HomeTasksPage. Undo (only reachable for an already
  // completed, non-recurring task -- see above) just flips it back.
  // A purchase task being resolved (not undone) asks for the price
  // first instead of resolving right away.
  const handleCheckboxPress = (entry: HomeTaskEntry) => {
    if (entry.completed) {
      onTaskSave({ ...entry, completed: false, completedAt: undefined });
      return;
    }
    if (entry.isPurchase) {
      setResolveSheetEntry(entry);
      return;
    }
    resolveTask(entry, undefined);
  };

  const handleResolveConfirm = (price: number | undefined, nextDueDate: string | undefined) => {
    if (!resolveSheetEntry) return;
    resolveTask(resolveSheetEntry, price, nextDueDate);
    setResolveSheetEntry(null);
  };

  // Shared by the generic category page's own resolve checkbox/button
  // (Maintenance today) AND a Restanțe row tap for a maintenance-kind
  // row -- same preview-before-confirm behavior either way, instead of
  // two copies of this dialog.
  const resolveCategoryEntry = async (categoryKey: HomeCategoryKey, id: string) => {
    const category = HOME_CATEGORIES.find((c) => c.key === categoryKey)!;
    if (!category.resolveEntry) return;

    const existing = category.entries(homeData).find((e) => e.id === id);
    if (!existing) return;

    // Preview the outcome before asking -- a mis-tap here isn't
    // recoverable afterward (a resolved non-recurring entry vanishes
    // from the list; a recurring one's nextDueDate only ever advances
    // via this same action, nothing lets you set it back by hand -- see
    // homeCategoryConfig.ts's buildEntry).
    const resolved = category.resolveEntry(existing);
    const isRecurring = !!(existing as { isRecurring?: boolean }).isRecurring;
    const nextDueLabel = resolved.nextDueDate
      ? new Date(resolved.nextDueDate).toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" })
      : null;

    const confirmed = await confirmAction(
      "Marchezi ca rezolvat?",
      isRecurring && nextDueLabel
        ? `Data următoare se mută la ${nextDueLabel} și rămâne activă.`
        : "Intrarea devine inactivă și dispare din listă.",
      { confirmLabel: "Rezolvă", destructive: !isRecurring },
    );
    if (!confirmed) return;

    saveHandlers[categoryKey](resolved);
    notifyAction(
      "Rezolvat",
      isRecurring && nextDueLabel
        ? `Rămâne activ — următoarea dată: ${nextDueLabel}.`
        : "Mutat la inactiv.",
    );
  };

  // Runs the deep-link from TodoCarouselSheet's "Deschide" once homeData
  // has actually loaded -- guarded by a ref (not by clearing
  // initialOpenItem, which is owned by [id].tsx) so it only fires once
  // per item even though homeData keeps changing identity on every
  // refetch. home_task lands on the Tasks page with that entry's own
  // resolve step (the price sheet for a purchase task, same as tapping
  // its checkbox); home_recurring/home_maintenance land on the matching
  // category page with that row already open for edit.
  const openedInitialItemRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialOpenItem) return;
    const key = `${initialOpenItem.type}:${initialOpenItem.id}`;
    if (openedInitialItemRef.current === key) return;

    if (initialOpenItem.type === "home_task") {
      const entry = homeData.taskEntries.find((e) => e.id === initialOpenItem.id);
      if (!entry) return;
      openedInitialItemRef.current = key;
      setTasksPageVisible(true);
      if (entry.isPurchase && !entry.completed) setResolveSheetEntry(entry);
      return;
    }

    const categoryKey = initialOpenItem.type === "home_recurring" ? "recurring" : "maintenance";
    const category = HOME_CATEGORIES.find((c) => c.key === categoryKey);
    const exists = category?.entries(homeData).some((e) => e.id === initialOpenItem.id);
    if (!exists) return;
    openedInitialItemRef.current = key;
    setActiveCategory(categoryKey);
    setInitialCategoryEditId(initialOpenItem.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpenItem, homeData]);

  const handleSupplyFormSave = (entry: HomeSupplyEntry) => {
    onSupplySave(entry);
    setSupplyFormVisible(false);
    setEditingSupplyEntry(null);
  };

  const handleSupplyFormDelete = () => {
    if (editingSupplyEntry) onSupplyDelete(editingSupplyEntry.id);
    setSupplyFormVisible(false);
    setEditingSupplyEntry(null);
  };

  // "Restocked" tap on HomeSuppliesPage -- opens HomeSupplyRestockSheet
  // to ask how much was bought (see handleRestockConfirm) instead of
  // opening the full edit form.
  const handleSupplyRestock = (entry: HomeSupplyEntry) => {
    setRestockSheetEntry(entry);
  };

  // Logs the new restock event with its quantity. getSupplyRestockEstimate
  // only starts predicting once restockHistory has 2+ entries (1 real
  // interval to learn a rate from), so the estimate only kicks in from
  // this entry's *second* confirmed restock on, per the user's own
  // "starts after the second purchase" rule -- and keeps refining with
  // every restock after that, since there's no cap on history length.
  const handleRestockConfirm = (quantity: number) => {
    if (!restockSheetEntry) return;
    const now = new Date().toISOString();
    onSupplySave({
      ...restockSheetEntry,
      quantity,
      lastRestockedDate: now,
      restockHistory: [...(restockSheetEntry.restockHistory ?? []), { date: now, quantity }],
    });
    setRestockSheetEntry(null);
  };

  // One save/delete pair per category, keyed the same way HOME_CATEGORIES
  // is -- keeps HomeCategoryPage generic (it just calls whichever pair
  // matches the open category) instead of a growing if/else per key.
  const saveHandlers: Record<HomeCategoryKey, (entry: any) => void> = {
    documents: onDocumentSave,
    expenses: onExpenseSave,
    maintenance: onMaintenanceSave,
    recurring: onRecurringSave,
    supplies: onSupplySave,
  };
  const deleteHandlers: Record<HomeCategoryKey, (id: string) => void> = {
    documents: onDocumentDelete,
    expenses: onExpenseDelete,
    maintenance: onMaintenanceDelete,
    recurring: onRecurringDelete,
    supplies: onSupplyDelete,
  };

  if (taskFormVisible) {
    return (
      <HomeTaskForm
        entry={editingTaskEntry ?? undefined}
        onCancel={() => {
          setTaskFormVisible(false);
          setEditingTaskEntry(null);
        }}
        onSave={handleTaskSave}
        onDelete={editingTaskEntry ? handleTaskDelete : undefined}
      />
    );
  }

  if (supplyFormVisible) {
    return (
      <HomeSupplyForm
        entry={editingSupplyEntry ?? undefined}
        onCancel={() => {
          setSupplyFormVisible(false);
          setEditingSupplyEntry(null);
        }}
        onSave={handleSupplyFormSave}
        onDelete={editingSupplyEntry ? handleSupplyFormDelete : undefined}
      />
    );
  }

  if (suppliesPageVisible) {
    return (
      <>
        <HomeSuppliesPage
          homeData={homeData}
          onBack={() => setSuppliesPageVisible(false)}
          onAdd={() => {
            setEditingSupplyEntry(null);
            setSupplyFormVisible(true);
          }}
          onEdit={(entry) => {
            setEditingSupplyEntry(entry);
            setSupplyFormVisible(true);
          }}
          onRestock={handleSupplyRestock}
        />
        {restockSheetEntry ? (
          <HomeSupplyRestockSheet
            entry={restockSheetEntry}
            onCancel={() => setRestockSheetEntry(null)}
            onConfirm={handleRestockConfirm}
          />
        ) : null}
      </>
    );
  }

  if (archivePageVisible) {
    return <HomeTaskArchivePage homeData={homeData} onBack={() => setArchivePageVisible(false)} />;
  }

  if (warningsPageVisible) {
    return (
      <>
        <HomeRecurringWarningsPage
          homeData={homeData}
          onBack={() => setWarningsPageVisible(false)}
          // A task row opens the resolve sheet directly (details
          // unchanged, only the price/next-date fields are editable) --
          // not the full edit form. A maintenance row goes through the
          // exact same confirm-then-advance flow as its own category
          // page's checkbox/button (resolveCategoryEntry).
          onResolvePress={(row) => {
            if (row.kind === "task") {
              const entry = homeData.taskEntries.find((t) => t.id === row.id);
              if (entry) setResolveSheetEntry(entry);
              return;
            }
            resolveCategoryEntry("maintenance", row.id);
          }}
        />
        {resolveSheetEntry ? (
          <HomeTaskResolveSheet
            entry={resolveSheetEntry}
            onCancel={() => setResolveSheetEntry(null)}
            onResolve={handleResolveConfirm}
          />
        ) : null}
      </>
    );
  }

  if (tasksPageVisible) {
    return (
      <>
        <HomeTasksPage
          homeData={homeData}
          onBack={() => setTasksPageVisible(false)}
          onArchivePress={() => setArchivePageVisible(true)}
          onWarningsPress={() => setWarningsPageVisible(true)}
          onAdd={() => {
            setEditingTaskEntry(null);
            setTaskFormVisible(true);
          }}
          onEdit={(entry) => {
            setEditingTaskEntry(entry);
            setTaskFormVisible(true);
          }}
          onCheckboxPress={handleCheckboxPress}
          onDelete={handleTaskRowDelete}
        />
        {resolveSheetEntry ? (
          <HomeTaskResolveSheet
            entry={resolveSheetEntry}
            onCancel={() => setResolveSheetEntry(null)}
            onResolve={handleResolveConfirm}
          />
        ) : null}
      </>
    );
  }

  if (activeCategory) {
    const category = HOME_CATEGORIES.find((c) => c.key === activeCategory)!;

    return (
      <HomeCategoryPage
        title={category.label}
        icon={category.icon}
        fields={category.fields}
        submitLabel={category.submitLabel}
        emptyLabel={category.emptyLabel}
        rows={category.rows(homeData)}
        onBack={() => setActiveCategory(null)}
        onSubmit={(values, editingId) => {
          const existing = editingId
            ? category.entries(homeData).find((e) => e.id === editingId)
            : undefined;
          saveHandlers[activeCategory](category.buildEntry(values, existing));
        }}
        onDelete={(id) => deleteHandlers[activeCategory](id)}
        onResolve={
          category.resolveEntry
            ? (id) => resolveCategoryEntry(activeCategory, id)
            : undefined
        }
        getEditValues={(id) => {
          const existing = category.entries(homeData).find((e) => e.id === id);
          return existing ? category.valuesFromEntry(existing) : {};
        }}
        initialEditId={initialCategoryEditId}
      />
    );
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: spacing.xl,
        // Clears the floating Quick Add / category FAB in the bottom-right
        // corner.
        paddingBottom: 100,
      }}
    >
      <HomeHeader
        space={space}
        subtitle={profile?.county}
        onBack={() => router.push("/spaces")}
        onEdit={onEdit}
      />

      <HomeStats
        thisMonthExpenses={thisMonthExpenses}
        upcomingCount={upcomingItems.length}
      />

      <Text
        style={{
          fontSize: 11,
          fontWeight: "800",
          letterSpacing: 0.5,
          color: colors.onSurfaceTertiary,
          marginBottom: 10,
        }}
      >
        CATEGORII
      </Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: spacing.xl }}>
        {categoryTiles.map((tile, index) => {
          // The last tile is alone on its own row only when the total
          // count is odd (2-per-row wrapping) -- when that happens, the
          // icon+label+badge group centers as a unit instead of hugging
          // the left edge with dead space stretching out to the right.
          const isAlone = index === categoryTiles.length - 1 && categoryTiles.length % 2 !== 0;

          return (
            <Pressable
              key={tile.key}
              testID={`home-category-tile-${tile.key}`}
              onPress={() => selectCategory(tile.key)}
              accessibilityRole="button"
              accessibilityLabel={
                tile.badge ? `${tile.label}, ${tile.badge.count}` : tile.label
              }
              style={{
                // flexGrow (not a fixed width) so a lone tile wrapping onto
                // its own row -- 5 tiles into 2 columns always leaves one
                // odd one out -- stretches to fill that whole row instead
                // of sitting stuck at half-width with empty space beside
                // it. Same fix already applied at Car's QuickActions row.
                flexGrow: 1,
                flexBasis: "46%",
                minHeight: 56,
                paddingHorizontal: 12,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: radius.md,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: isAlone ? "center" : "flex-start",
                gap: 10,
              }}
            >
              {/* Tinted chip (identity color at 1A alpha, matching the same
                  recipe HomeHeader's own avatar already uses) instead of a
                  bare colored icon on white -- one hue per Space, just given
                  real visual weight instead of a thin outline. */}
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: radius.sm,
                  backgroundColor: `${SPACE_IDENTITY_COLORS.home}1A`,
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Ionicons name={tile.icon} size={16} color={SPACE_IDENTITY_COLORS.home!} />
              </View>
              <Text
                style={{ fontSize: 12.5, fontWeight: "600", color: colors.onSurface, flexGrow: isAlone ? 0 : 1 }}
                numberOfLines={1}
              >
                {tile.label}
              </Text>
              {tile.badge ? (
                <View
                  style={{
                    minWidth: 18,
                    height: 18,
                    paddingHorizontal: 5,
                    borderRadius: 9,
                    backgroundColor: severityColor(tile.badge.severity, colors),
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Text style={{ fontSize: 10, fontWeight: "800", color: colors.onBrandPrimary }}>
                    {tile.badge.count}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <HomeNextSection items={upcomingItems.slice(0, 3)} />
    </ScrollView>
  );
}
