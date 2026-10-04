import React, { useEffect, useRef, useState } from "react";
import { ScrollView, View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "@/lib/theme";
import { confirmAction, notifyAction } from "@/lib/confirm";
import { severityColor, type SeverityTier } from "@/lib/statusColors";
import { SPACE_IDENTITY_COLORS, spaceTextColor } from "@/lib/spaces/spaceProfile";
import { PressableScale } from "@/components/ui/PressableScale";
import { IconWell } from "@/components/ui/primitives";
import { SwipeBackView } from "@/components/spaces/SwipeBackView";

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
import { HomeSpendPage } from "./HomeSpendPage";
import { HomeNextSection } from "./HomeNextSection";
import { HomeCategoryPage } from "./HomeCategoryPage";
import { HomeArchivePage } from "./HomeArchivePage";
import { HomeTasksPage } from "./HomeTasksPage";
import { HomeRecurringWarningsPage } from "./HomeRecurringWarningsPage";
import { HomeTaskResolveSheet } from "./HomeTaskResolveSheet";
import { HomeMaintenanceResolveSheet } from "./HomeMaintenanceResolveSheet";
import { HomeSuppliesPage } from "./HomeSuppliesPage";
import { HomeSupplyRestockSheet } from "./HomeSupplyRestockSheet";
import HomeTaskForm from "./forms/HomeTaskForm";
import HomeSupplyForm from "./forms/HomeSupplyForm";
import { HOME_CATEGORIES, type HomeCategoryKey } from "./homeCategoryConfig";
import { HomeRestanteCard } from "./HomeRestanteCard";
import {
  getThisMonthHomeExpenses,
  getUpcomingHomeItems,
  getTaskTierCounts,
  getMaintenanceTierCounts,
  getRecurringTierCounts,
  getRecurringTaskWarnings,
  recurringWarningTierColor,
  getSupplyRestockEstimate,
  nextTaskOccurrence,
  type RecurringWarningTier,
} from "@/lib/spaces/home/calculations/dashboard.calculations";
import type { HomeProfile } from "@/lib/spaces/spaceProfile";

type CategoryBadge = { count: number; severity: SeverityTier } | null;
/** One dot per urgency tier instead of a single combined number -- per
 * explicit user request, every category tile that has a due-date-based
 * urgency concept (Task-uri/Mentenanță/Recurente -- Cheltuieli has no
 * due date, Provizii uses a different rate-based restock model, see
 * getSupplyRestockEstimate) gets its OWN dots from its OWN entries only,
 * never a combined cross-category total -- a dot always traces back to
 * exactly one tile. Each tier has its own distinct color (see
 * recurringWarningTierColor), so no two dots on the same tile ever look
 * identical either. */
type TierDots = { tier: RecurringWarningTier; count: number }[];

/** A small filled count on a category tile -- urgency tier or badge
 * color, with black/white ink picked for contrast (readableTextOn). */
function CountDot({ count, color }: { count: number; color: string }) {
  return (
    <View style={{ minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 11, fontWeight: "600", color: readableTextOn(color) }}>{count}</Text>
    </View>
  );
}

/** Black or white, whichever contrasts more with a dot's hex background --
 * a fixed white failed on caution yellow (#FFD600, ~1.4:1) and on dark
 * mode's light-gray "yellow" tier. WCAG relative-luminance formula. */
function readableTextOn(hex: string): string {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
  return 1.05 / (lum + 0.05) >= (lum + 0.05) / 0.05 ? "#FFFFFF" : "#000000";
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
  /** Drag-reorder on HomeTasksPage's ALL section -- see its own
   * onReorder prop for what `orderedIds` represents. */
  onTaskReorder: (orderedIds: string[]) => void;
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
  onTaskReorder,
  initialOpenItem,
}: HomeDashboardProps) {
  const { colors, spacing, radius, isDark } = useTheme();
  const homeTint = spaceTextColor("home", isDark) ?? SPACE_IDENTITY_COLORS.home!;
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
  const [warningsPageVisible, setWarningsPageVisible] = useState(false);
  // One space-level archive (Tasks + Maintenance combined) reachable
  // from a single always-visible pill on the main dashboard, mirroring
  // Car's own Archive pattern -- see HomeArchivePage.tsx.
  const [homeArchivePageVisible, setHomeArchivePageVisible] = useState(false);
  // "This month" stat card tap -- HomeSpendPage, the whole space's
  // spend (Expenses + Maintenance + resolved purchase Tasks) in one
  // place, mirroring Car's own CarExpensesPage.
  const [spendPageVisible, setSpendPageVisible] = useState(false);
  // Set only for a purchase-flagged task's checkbox tap -- renders
  // HomeTaskResolveSheet on top of HomeTasksPage asking for the price.
  const [resolveSheetEntry, setResolveSheetEntry] = useState<HomeTaskEntry | null>(null);
  // Set only when resolving a RECURRING Maintenance entry -- renders
  // HomeMaintenanceResolveSheet asking for this cycle's price (see
  // resolveCategoryEntry). A non-recurring one skips this entirely and
  // goes straight through the generic confirm dialog below.
  const [maintenanceResolveEntry, setMaintenanceResolveEntry] = useState<HomeMaintenanceEntry | null>(null);

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

  // One dot per urgency tier per tile -- each tile's dots come only from
  // its OWN entries (getXTierCounts), never a cross-category total, so a
  // dot always traces back to exactly one category.
  const toTierDots = (counts: Record<RecurringWarningTier, number>): TierDots =>
    (["red", "orangeToday", "orangeDays", "yellow"] as const)
      .filter((tier) => counts[tier] > 0)
      .map((tier) => ({ tier, count: counts[tier] }));

  const taskTierDots = toTierDots(getTaskTierCounts(homeData));
  const maintenanceTierDots = toTierDots(getMaintenanceTierCounts(homeData));
  const recurringTierDots = toTierDots(getRecurringTierCounts(homeData));

  // Restanțe (the itemized, cross-category breakdown/drill-down) lives
  // on this main page now, not buried inside Tasks -- per explicit user
  // request, since it combines all 3 sources and reading it from inside
  // "Task-uri" made its counts look like they disagreed with the Task
  // tile's own (tasks-only) dots.
  const { counts: restanteCounts } = getRecurringTaskWarnings(homeData);

  const lowSupplyCount = homeData.supplyEntries.filter(
    (entry) => getSupplyRestockEstimate(entry)?.isLow,
  ).length;
  const supplyBadge: CategoryBadge = lowSupplyCount > 0 ? { count: lowSupplyCount, severity: "critical" } : null;

  // Documents deliberately excluded here too -- no tile for it until it
  // has real utility (file upload).
  const categoryTiles = [
    { key: "expenses" as const, label: "Cheltuieli", icon: HOME_CATEGORIES.find((c) => c.key === "expenses")!.icon, badge: null as CategoryBadge, dots: [] as TierDots },
    { key: "maintenance" as const, label: "Mentenanță", icon: HOME_CATEGORIES.find((c) => c.key === "maintenance")!.icon, badge: null as CategoryBadge, dots: maintenanceTierDots },
    { key: "recurring" as const, label: "Recurente", icon: HOME_CATEGORIES.find((c) => c.key === "recurring")!.icon, badge: null as CategoryBadge, dots: recurringTierDots },
    { key: "supplies" as const, label: "Provizii", icon: "basket-outline" as const, badge: supplyBadge, dots: [] as TierDots },
    { key: "task" as const, label: "Task-uri", icon: "checkmark-circle-outline" as const, badge: null as CategoryBadge, dots: taskTierDots },
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
    setWarningsPageVisible(false);
    setHomeArchivePageVisible(false);
    setSpendPageVisible(false);
    setResolveSheetEntry(null);
    setMaintenanceResolveEntry(null);
    setSuppliesPageVisible(false);
    setSupplyFormVisible(false);
    setEditingSupplyEntry(null);
    setRestockSheetEntry(null);
  };

  // The on-screen "CATEGORII" tile grid's own onPress (see the "home"
  // view's return block) routes through this one function instead of
  // duplicating the Task/Supplies special-casing per call site.
  const selectCategory = (key: string) => {
    if (key === "task") {
      // First tap opens the dedicated Tasks page (DUE SOON/RECENT/ALL).
      // Tapping "Task" again while already there opens the add form on
      // top of it instead of no-op'ing back to the same page. Re-entering
      // Tasks this way should still drop any leftover archive/warnings/
      // resolve sub-view from a previous visit, so only tasksPageVisible
      // (or taskFormVisible, on a second tap) ends up true.
      const wasOnTasksPage = tasksPageVisible;
      setActiveCategory(null);
      closeAllSubViews();
      // taskFormVisible now renders nested inside the tasksPageVisible
      // block (a bottom sheet over the list, not its own full-page
      // replacement) -- both need to end up true together, or the sheet
      // has nowhere to mount.
      setTasksPageVisible(true);
      if (wasOnTasksPage) {
        setTaskFormVisible(true);
      }
      return;
    }
    if (key === "supplies") {
      // Same pattern as Task above.
      const wasOnSuppliesPage = suppliesPageVisible;
      setActiveCategory(null);
      closeAllSubViews();
      // The supply form is a sheet over the Supplies page, so the page
      // stays open underneath either way.
      setSuppliesPageVisible(true);
      if (wasOnSuppliesPage) setSupplyFormVisible(true);
      return;
    }
    // A different category entirely -- close every Task/Supplies
    // sub-view so none of them keep winning the render-order check
    // above activeCategory (see closeAllSubViews).
    closeAllSubViews();
    setActiveCategory(key as HomeCategoryKey);
  };

  // "NEXT" row tap (HomeNextSection) -- item.id is always
  // "<prefix>-<entry id>" (see getUpcomingHomeItems), opens that entry
  // for editing in its own category page, same deep-link mechanism the
  // TodoCarousel/initialOpenItem effect below already uses.
  // Shared by press/resolve/delete below -- item.id is always
  // "<prefix>-<entry id>" (doc-/maint-/rec-, see getUpcomingHomeItems),
  // the one place that knows how to turn that back into a real
  // category + entry id.
  const decodeNextItem = (item: HomeNextItem): { categoryKey: HomeCategoryKey; entryId: string } | null => {
    const id = String(item.id);
    if (id.startsWith("doc-")) return { categoryKey: "documents", entryId: id.slice(4) };
    if (id.startsWith("maint-")) return { categoryKey: "maintenance", entryId: id.slice(6) };
    if (id.startsWith("rec-")) return { categoryKey: "recurring", entryId: id.slice(4) };
    return null;
  };

  const handleNextItemPress = (item: HomeNextItem) => {
    const decoded = decodeNextItem(item);
    if (!decoded) return;

    closeAllSubViews();
    setActiveCategory(decoded.categoryKey);
    setInitialCategoryEditId(decoded.entryId);
  };

  // Swipe-right on a NEXT row -- reuses resolveCategoryEntry as-is (its
  // own confirm dialog, the recurring-Maintenance price-sheet special
  // case, all of it), same action the category page's own row swipe
  // already fires, just reachable one level up without opening that
  // page first.
  const handleNextItemResolve = (item: HomeNextItem) => {
    const decoded = decodeNextItem(item);
    if (!decoded) return;
    resolveCategoryEntry(decoded.categoryKey, decoded.entryId);
  };

  // Swipe-left on a NEXT row -- same confirm copy as HomeCategoryPage's
  // own row-delete (this reaches the exact same permanent delete,
  // deleteHandlers itself has no confirm built in).
  const handleNextItemDelete = async (item: HomeNextItem) => {
    const decoded = decodeNextItem(item);
    if (!decoded) return;

    const confirmed = await confirmAction(
      "Delete entry",
      "Are you sure you want to delete this? This can't be undone.",
      { confirmLabel: "Delete", destructive: true },
    );
    if (!confirmed) return;
    deleteHandlers[decoded.categoryKey](decoded.entryId);
  };

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
      // A real price logs a NEW spend event every time, instead of just
      // overwriting the single `price` field above -- a recurring
      // purchase task resolved 3 times this month should count 3 times,
      // not 1 (see getHomeSpendRecords). Not touched at all when
      // resolved with no price (undefined stays undefined).
      spendHistory: price
        ? [...(entry.spendHistory ?? []), { date: now, amount: price }]
        : entry.spendHistory,
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

    // Recurring Maintenance is the one category that needs a price
    // BEFORE resolving -- nothing else prompts for one at resolve time
    // (Recurring bills reuse their own fixed `amount`; a one-off
    // Maintenance entry's price was already set at creation/edit).
    // HomeMaintenanceResolveSheet's own Confirm/Cancel doubles as this
    // action's confirm step, so the generic dialog below is skipped
    // entirely for this branch -- see handleMaintenanceResolveConfirm.
    if (categoryKey === "maintenance" && (existing as HomeMaintenanceEntry).isRecurring) {
      setMaintenanceResolveEntry(existing as HomeMaintenanceEntry);
      return;
    }

    // Preview the outcome before asking -- a mis-tap here isn't
    // recoverable afterward (a resolved non-recurring entry vanishes
    // from the list; a recurring one's nextDueDate only ever advances
    // via this same action, nothing lets you set it back by hand -- see
    // homeCategoryConfig.ts's buildEntry). Whether it stays active is
    // read off the RESOLVED entry's own nextDueDate, not an
    // `isRecurring` field -- Recurring entries always recur but have no
    // such field at all (every one of them resolves by advancing, never
    // retiring), while Maintenance's optional toggle does set it.
    const resolved = category.resolveEntry(existing);
    const staysActive = !!resolved.nextDueDate;
    const nextDueLabel = staysActive
      ? new Date(resolved.nextDueDate).toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" })
      : null;

    const confirmed = await confirmAction(
      "Marchezi ca rezolvat?",
      staysActive && nextDueLabel
        ? `Data următoare se mută la ${nextDueLabel} și rămâne activă.`
        : "Intrarea devine inactivă și dispare din listă.",
      { confirmLabel: "Rezolvă", destructive: !staysActive },
    );
    if (!confirmed) return;

    // Recurring bills' own fixed `amount` counts as this cycle's
    // payment -- logs a new spend event every resolve instead of the
    // total silently staying flat, same reasoning as Tasks' own
    // resolveTask (see above). Every other category's resolveEntry
    // doesn't touch money at resolve time.
    const finalEntry =
      categoryKey === "recurring"
        ? {
            ...resolved,
            spendHistory: [
              ...((existing as HomeRecurringEntry).spendHistory ?? []),
              { date: new Date().toISOString(), amount: (existing as HomeRecurringEntry).amount },
            ],
          }
        : resolved;

    saveHandlers[categoryKey](finalEntry);
    notifyAction(
      "Rezolvat",
      staysActive && nextDueLabel
        ? `Rămâne activ — următoarea dată: ${nextDueLabel}.`
        : "Mutat la inactiv.",
    );
  };

  // Confirm step for HomeMaintenanceResolveSheet -- advances nextDueDate
  // (same pure resolveEntry Maintenance always used) AND logs the
  // confirmed price as a new spend event, mirroring resolveTask's own
  // accumulation for Tasks.
  const handleMaintenanceResolveConfirm = (price: number) => {
    if (!maintenanceResolveEntry) return;
    const category = HOME_CATEGORIES.find((c) => c.key === "maintenance")!;
    const resolved = category.resolveEntry!(maintenanceResolveEntry) as HomeMaintenanceEntry;
    const now = new Date().toISOString();

    saveHandlers.maintenance({
      ...resolved,
      price,
      spendHistory: [...(maintenanceResolveEntry.spendHistory ?? []), { date: now, amount: price }],
    });

    const label = resolved.nextDueDate
      ? new Date(resolved.nextDueDate).toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" })
      : null;
    notifyAction("Rezolvat", label ? `Rămâne activ — următoarea dată: ${label}.` : "Rezolvat.");
    setMaintenanceResolveEntry(null);
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

  // The supply row's own swipe-to-delete -- same confirm copy as
  // handleTaskRowDelete, since this reaches the exact same permanent
  // delete without going through the edit form first (unlike
  // handleSupplyFormDelete, which confirms inside the form itself).
  const handleSupplyRowDelete = async (entry: HomeSupplyEntry) => {
    const confirmed = await confirmAction(
      "Delete entry",
      "This entry will be permanently deleted.",
      { confirmLabel: "Delete", destructive: true },
    );
    if (!confirmed) return;
    onSupplyDelete(entry.id);
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
          onDelete={handleSupplyRowDelete}
        />
        {supplyFormVisible ? (
          <HomeSupplyForm
            entry={editingSupplyEntry ?? undefined}
            onCancel={() => {
              setSupplyFormVisible(false);
              setEditingSupplyEntry(null);
            }}
            onSave={handleSupplyFormSave}
            onDelete={editingSupplyEntry ? handleSupplyFormDelete : undefined}
          />
        ) : null}
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

  if (homeArchivePageVisible) {
    return <HomeArchivePage homeData={homeData} onBack={() => setHomeArchivePageVisible(false)} />;
  }

  if (spendPageVisible) {
    return (
      <HomeSpendPage
        homeData={homeData}
        profile={profile}
        onBack={() => setSpendPageVisible(false)}
        onRecordPress={(category, id) => {
          setSpendPageVisible(false);
          if (category === "task") {
            const entry = homeData.taskEntries.find((t) => t.id === id);
            if (!entry) return;
            setTasksPageVisible(true);
            setEditingTaskEntry(entry);
            setTaskFormVisible(true);
            return;
          }
          const categoryKey =
            category === "expense" ? "expenses" : category === "recurring" ? "recurring" : "maintenance";
          setActiveCategory(categoryKey);
          setInitialCategoryEditId(id);
        }}
      />
    );
  }

  if (warningsPageVisible) {
    return (
      <>
        <HomeRecurringWarningsPage
          homeData={homeData}
          onBack={() => setWarningsPageVisible(false)}
          // A task row opens the resolve sheet directly (details
          // unchanged, only the price/next-date fields are editable) --
          // not the full edit form. A maintenance or recurring row goes
          // through the exact same confirm-then-advance flow as its own
          // category page's checkbox/button (resolveCategoryEntry).
          onResolvePress={(row) => {
            if (row.kind === "task") {
              const entry = homeData.taskEntries.find((t) => t.id === row.id);
              if (entry) setResolveSheetEntry(entry);
              return;
            }
            resolveCategoryEntry(row.kind, row.id);
          }}
        />
        {resolveSheetEntry ? (
          <HomeTaskResolveSheet
            entry={resolveSheetEntry}
            onCancel={() => setResolveSheetEntry(null)}
            onResolve={handleResolveConfirm}
          />
        ) : null}
        {maintenanceResolveEntry ? (
          <HomeMaintenanceResolveSheet
            entry={maintenanceResolveEntry}
            onCancel={() => setMaintenanceResolveEntry(null)}
            onResolve={handleMaintenanceResolveConfirm}
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
          onReorder={onTaskReorder}
        />
        {resolveSheetEntry ? (
          <HomeTaskResolveSheet
            entry={resolveSheetEntry}
            onCancel={() => setResolveSheetEntry(null)}
            onResolve={handleResolveConfirm}
          />
        ) : null}
        {taskFormVisible ? (
          <HomeTaskForm
            entry={editingTaskEntry ?? undefined}
            onCancel={() => {
              setTaskFormVisible(false);
              setEditingTaskEntry(null);
            }}
            onSave={handleTaskSave}
            onDelete={editingTaskEntry ? handleTaskDelete : undefined}
          />
        ) : null}
      </>
    );
  }

  if (activeCategory) {
    const category = HOME_CATEGORIES.find((c) => c.key === activeCategory)!;

    return (
      <>
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
        {maintenanceResolveEntry ? (
          <HomeMaintenanceResolveSheet
            entry={maintenanceResolveEntry}
            onCancel={() => setMaintenanceResolveEntry(null)}
            onResolve={handleMaintenanceResolveConfirm}
          />
        ) : null}
      </>
    );
  }

  return (
    <SwipeBackView onBack={() => router.push("/spaces")}>
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: spacing.gutter,
        paddingTop: spacing.md,
        paddingBottom: 100,
        gap: spacing.section,
      }}
    >
      <HomeHeader
        space={space}
        subtitle={profile?.county ? `Județul ${profile.county}` : undefined}
        onBack={() => router.push("/spaces")}
        onEdit={onEdit}
        onHistoryPress={() => setHomeArchivePageVisible(true)}
      />

      <HomeStats
        thisMonthExpenses={thisMonthExpenses}
        upcomingCount={upcomingItems.length}
        onSpendPress={() => setSpendPageVisible(true)}
      />

      <HomeRestanteCard
        counts={restanteCounts}
        onPress={() => {
          closeAllSubViews();
          setWarningsPageVisible(true);
        }}
        colors={colors}
        spacing={spacing}
        radius={radius}
      />

      {/* Categories -- a 2-column grid of tiles; each tile's own
          urgency dots (one per tier, its own entries only) or badge
          sits top-right, opposite the icon. */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md - 2 }}>
        {categoryTiles.map((tile, index) => {
          const isAlone = index === categoryTiles.length - 1 && categoryTiles.length % 2 !== 0;
          return (
            <PressableScale
              key={tile.key}
              testID={`home-category-tile-${tile.key}`}
              onPress={() => selectCategory(tile.key)}
              accessibilityRole="button"
              accessibilityLabel={
                tile.badge
                  ? `${tile.label}, ${tile.badge.count}`
                  : tile.dots.length > 0
                    ? `${tile.label}, ${tile.dots.reduce((sum, d) => sum + d.count, 0)}`
                    : tile.label
              }
              style={{
                flexGrow: 1,
                flexBasis: isAlone ? "100%" : "46%",
                minHeight: 96,
                padding: spacing.md + 2,
                backgroundColor: colors.surfaceSecondary,
                borderRadius: radius.card,
                gap: spacing.md,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <IconWell icon={tile.icon} color={SPACE_IDENTITY_COLORS.home!} tint={homeTint} size={34} />
                <View style={{ flexDirection: "row", gap: 4 }}>
                  {tile.badge ? (
                    <CountDot count={tile.badge.count} color={severityColor(tile.badge.severity, colors)} />
                  ) : null}
                  {tile.dots.map(({ tier, count }) => (
                    <CountDot key={tier} count={count} color={recurringWarningTierColor(tier, colors)} />
                  ))}
                </View>
              </View>
              <Text style={{ fontSize: 15, fontWeight: "500", color: colors.onSurface }} numberOfLines={1}>
                {tile.label}
              </Text>
            </PressableScale>
          );
        })}
      </View>

      <HomeNextSection
        items={upcomingItems.slice(0, 3)}
        onItemPress={handleNextItemPress}
        onItemResolve={handleNextItemResolve}
        onItemDelete={handleNextItemDelete}
      />
    </ScrollView>
    {/* NEXT's swipe-resolve on a recurring maintenance row lands here
        (handleNextItemResolve -> resolveCategoryEntry -> price prompt),
        so the main dashboard needs its own copy of this sheet too. */}
    {maintenanceResolveEntry ? (
      <HomeMaintenanceResolveSheet
        entry={maintenanceResolveEntry}
        onCancel={() => setMaintenanceResolveEntry(null)}
        onResolve={handleMaintenanceResolveConfirm}
      />
    ) : null}
    </SwipeBackView>
  );
}
