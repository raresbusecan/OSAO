import React, { useEffect, useRef, useState } from "react";
import { useRecordAction } from "@/lib/navigation/recordAction";
import { askRenewal, renewalPeriod, toIsoDate } from "@/lib/dashboard/documentRenewal";
import { roDate } from "@/lib/format";
import { ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "@/lib/theme";
import type { HelpKey } from "@/lib/help";
import { confirmAction, notifyAction } from "@/lib/confirm";
import { nextDateAfterResolve } from "@/lib/dashboard/itemActions";
import { SwipeBackView } from "@/components/spaces/SwipeBackView";

import type { HomeData } from "./home.data.types";
import type {
  HomeDocumentEntry,
  HomeExpenseEntry,
  HomeMaintenanceEntry,
  HomeRecurringEntry,
  HomeSupplyEntry,
  HomeTaskEntry,
} from "@/lib/spaces/home/home.types";
import { HomeHeader } from "./HomeHeader";
import { HomeSpendPage } from "./HomeSpendPage";
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
import { HOME_CATEGORIES, addRecurrenceInterval, type HomeCategoryKey } from "./homeCategoryConfig";
import { HomeOverviewCard, HomeDueSection, type DueTabKind } from "./HomeOverview";
import { HomeRecordSheet, type HomeRecordResolve } from "./HomeRecordSheet";
import { buildHomeRecordPreview, type HomeRecordKind } from "./homeRecordPreview";
import { longPressFeedback } from "@/lib/haptics";
import { SpaceQuickActions } from "@/components/spaces/SpaceQuickActions";
import {
  getThisMonthHomeExpenses,
  getSupplyRestockEstimate,
  nextTaskOccurrence,
  getHomeDueList,
  getHomeKindRows,
  monthlyBillsTotal,
  daysUntil,
  type HomeDueRow,
} from "@/lib/spaces/home/calculations/dashboard.calculations";
import type { HomeProfile } from "@/lib/spaces/spaceProfile";

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
  /** `resolve`: open the item's resolve step (a swipe-right from another
   * screen) instead of its edit form. */
  initialOpenItem?: { type: "home_task" | "home_recurring" | "home_maintenance" | "home_document" | "home_expense" | "home_supply"; id: string; resolve?: boolean } | null;
  initialSection?: string;
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
  initialSection,
}: HomeDashboardProps) {
  const { spacing } = useTheme();
  const router = useRouter();
  const recordAction = useRecordAction();

  const [activeCategory, setActiveCategory] = useState<HomeCategoryKey | null>(null);
  // "De rezolvat"'s type tab -- Sarcini every time the dashboard opens
  // (user's choice); each pill carries its own urgency count.
  const [dueTab, setDueTab] = useState<DueTabKind>("task");
  // The one record sheet for every Casă screen: a tap previews, a long
  // press shows only the actions (HomeRecordSheet).
  const [recordSheet, setRecordSheet] = useState<{ kind: HomeRecordKind; id: string; mode: "preview" | "actions" } | null>(null);
  // "Editează" from that sheet while a category page is open: reopen
  // that page's own form for the row (a fresh nonce each time).
  const [categoryEditRequest, setCategoryEditRequest] = useState<{ id: string; n: number } | null>(null);
  const editNonce = useRef(0);
  // A category's add/edit form opened over the main Casă screen (quick-add
  // buttons, "Editează" from a preview there) -- the screen behind stays.
  const [formOverlay, setFormOverlay] = useState<{ category: HomeCategoryKey; editId?: string } | null>(null);
  const [categoryStartsWithForm, setCategoryStartsWithForm] = useState(false);
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
  // The dashboard's state, in words (2026-10 redesign, variant A --
  // components/spaces/home/HomeOverview.tsx). Same day rule everywhere
  // (daysUntil); counts per category come only from that category.
  const dueRows = getHomeDueList(homeData, 7);
  const monthlyBills = monthlyBillsTotal(homeData);
  const lowSupplyCount = homeData.supplyEntries.filter((entry) => getSupplyRestockEstimate(entry)?.isLow).length;

  // No Categorii section any more (user, 2026-10-05): each "De rezolvat"
  // tab ends in "Toate ... (N)", unfolding every open record in place; Documente
  // and Provizii are pills under Istoric, carrying their red counts;
  // Cheltuieli opens from the "Cheltuit luna asta" half of the top card.
  const now = new Date();
  const expiredDocs = homeData.documentEntries.filter((d) => d.expiryDate && daysUntil(d.expiryDate, now) < 0).length;
  const allRows = {
    task: getHomeKindRows(homeData, "task"),
    recurring: getHomeKindRows(homeData, "recurring"),
    maintenance: getHomeKindRows(homeData, "maintenance"),
  };

  const quickActions = [
    { key: "task", label: "Sarcină", icon: "checkmark-circle-outline" },
    { key: "recurring", label: "Factură", icon: HOME_CATEGORIES.find((c) => c.key === "recurring")!.icon as string },
    { key: "maintenance", label: "Mentenanță", icon: HOME_CATEGORIES.find((c) => c.key === "maintenance")!.icon as string },
    { key: "expenses", label: "Cheltuială", icon: HOME_CATEGORIES.find((c) => c.key === "expenses")!.icon as string },
    { key: "supplies", label: "Provizie", icon: "basket-outline" },
  ];

  // Quick-add: the form opens as a sheet OVER the Casă main screen -- the
  // screen behind doesn't change (user, 2026-10-05).
  const addNew = (key: string) => {
    if (key === "task") {
      setEditingTaskEntry(null);
      setTaskFormVisible(true);
      return;
    }
    if (key === "supplies") {
      setEditingSupplyEntry(null);
      setSupplyFormVisible(true);
      return;
    }
    setFormOverlay({ category: key as HomeCategoryKey });
  };

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
    setCategoryStartsWithForm(false);
    setActiveCategory(key as HomeCategoryKey);
  };

  // One set of actions per Casă record, shared by "De rezolvat", every
  // category page and the record sheet (tap = preview, long press =
  // actions, swipe right = resolve, swipe left = delete).
  const RECORD_CATEGORY = { recurring: "recurring", maintenance: "maintenance", document: "documents", expense: "expenses" } as const;
  const openRecord = (kind: HomeRecordKind, id: string, mode: "preview" | "actions") => {
    if (mode === "actions") longPressFeedback();
    setRecordSheet({ kind, id, mode });
  };
  const recordResolve = (kind: HomeRecordKind, id: string): HomeRecordResolve | null => {
    if (kind === "task") {
      const entry = homeData.taskEntries.find((t) => t.id === id);
      if (!entry || entry.completed) return null;
      return { label: "Rezolvă", icon: "checkmark-circle-outline", run: () => setResolveSheetEntry(entry) };
    }
    if (kind === "supply") {
      const entry = homeData.supplyEntries.find((e) => e.id === id);
      return entry ? { label: "Am cumpărat", icon: "refresh-outline", run: () => setRestockSheetEntry(entry) } : null;
    }
    if (kind === "document") return { label: "Reînnoiește", icon: "refresh", run: () => handleDocumentRenew(id) };
    if (kind === "recurring" || kind === "maintenance") {
      const entry = (kind === "recurring" ? homeData.recurringEntries : homeData.maintenanceEntries).find((e) => e.id === id) as any;
      if (!entry || entry.completed) return null;
      return { label: "Rezolvă", icon: "checkmark-circle-outline", run: () => resolveCategoryEntry(kind, id) };
    }
    return null;
  };
  const recordEdit = (kind: HomeRecordKind, id: string) => {
    // Every edit opens over the screen it was asked from.
    if (kind === "task") {
      const entry = homeData.taskEntries.find((t) => t.id === id);
      if (!entry) return;
      setEditingTaskEntry(entry);
      setTaskFormVisible(true);
      return;
    }
    if (kind === "supply") {
      const entry = homeData.supplyEntries.find((e) => e.id === id);
      if (!entry) return;
      setEditingSupplyEntry(entry);
      setSupplyFormVisible(true);
      return;
    }
    const category = RECORD_CATEGORY[kind];
    if (activeCategory === category) {
      editNonce.current += 1;
      setCategoryEditRequest({ id, n: editNonce.current });
      return;
    }
    setFormOverlay({ category, editId: id });
  };
  const recordDelete = async (kind: HomeRecordKind, id: string) => {
    if (kind === "task") {
      const entry = homeData.taskEntries.find((t) => t.id === id);
      if (entry) handleTaskRowDelete(entry);
      return;
    }
    if (kind === "supply") {
      const entry = homeData.supplyEntries.find((e) => e.id === id);
      if (entry) handleSupplyRowDelete(entry);
      return;
    }
    const title = buildHomeRecordPreview(homeData, kind, id)?.title ?? "Înregistrarea";
    const ok = await confirmAction("Ștergi?", `„${title}” se șterge definitiv.`, { confirmLabel: "Șterge", destructive: true });
    if (!ok) return;
    deleteHandlers[RECORD_CATEGORY[kind]](id);
  };

  // A document's swipe-right (category page, "De rezolvat"): the
  // renewal pop-up. "Cu datele vechi" moves the VALIDITY dates forward
  // by the same period (lib/dashboard/documentRenewal.ts) -- a Casă
  // document has no history, so it's updated in place. "Modifică"
  // opens it for editing.
  const handleDocumentRenew = async (id: string) => {
    const doc = homeData.documentEntries.find((e) => e.id === id);
    if (!doc) return;
    const period = renewalPeriod(doc.issueDate, doc.expiryDate);
    const pick = await askRenewal(doc.title, period);
    if (pick === "edit") {
      closeAllSubViews();
      setActiveCategory("documents");
      setInitialCategoryEditId(id);
      return;
    }
    if (pick !== "saved" || !period) return;
    onDocumentSave({ ...doc, issueDate: toIsoDate(period.issue), expiryDate: toIsoDate(period.expiry) });
    notifyAction("Reînnoit", `${doc.title} e valabil până pe ${roDate(period.expiry, { withYear: true })}.`);
  };

  const handleTaskSave = async (entry: HomeTaskEntry) => {
    await onTaskSave(entry);
    setTaskFormVisible(false);
    setEditingTaskEntry(null);
  };

  const handleTaskDelete = async () => {
    if (editingTaskEntry) await onTaskDelete(editingTaskEntry.id);
    setTaskFormVisible(false);
    setEditingTaskEntry(null);
  };

  // The task row's own trash icon (HomeTasksPage) -- same confirm copy
  // as HomeTaskForm's own delete button, since this reaches the exact
  // same permanent delete without going through that form first.
  const handleTaskRowDelete = async (entry: HomeTaskEntry) => {
    const confirmed = await confirmAction(
      "Ștergi sarcina?",
      `„${entry.title}” se șterge definitiv.`,
      { confirmLabel: "Șterge", destructive: true },
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
  const resolveTask = async (entry: HomeTaskEntry, price: number | undefined, explicitNextDue?: string, guiltFree?: boolean) => {
    const now = new Date().toISOString();
    const nextDue = entry.isRecurring
      ? (explicitNextDue ?? nextTaskOccurrence(entry.dueDate, entry.recurrenceFrequency))
      : entry.dueDate;

    await onTaskSave({
      ...entry,
      completed: !entry.isRecurring,
      completedAt: now,
      dueDate: nextDue,
      price: price ?? entry.price,
      // "Bani fără vină" from HomeTaskResolveSheet's purchase step; kept as-is otherwise.
      guiltFree: guiltFree ?? entry.guiltFree,
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
      const label = roDate(nextDue!);
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

  const handleResolveConfirm = async (price: number | undefined, nextDueDate: string | undefined, guiltFree?: boolean) => {
    if (!resolveSheetEntry) return;
    await resolveTask(resolveSheetEntry, price, nextDueDate, guiltFree);
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
      ? roDate(resolved.nextDueDate)
      : null;

    const confirmed = await confirmAction(
      "Marchezi ca rezolvat?",
      staysActive && nextDueLabel
        ? `Data următoare se mută la ${nextDueLabel} și rămâne activă.`
        : "Intrarea devine inactivă și dispare din listă.",
      { confirmLabel: "Rezolvă", destructive: !staysActive },
    );
    if (!confirmed) { recordAction?.cancel(); return; }

    // Paid early: ask whether the next date counts from today or keeps
    // the usual rhythm (same question as a swipe from any other screen).
    if (categoryKey === "recurring") {
      const entry = existing as HomeRecurringEntry;
      resolved.nextDueDate = await nextDateAfterResolve(entry.nextDueDate, (base) => addRecurrenceInterval(base, entry.frequency, 1));
    }

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

    await saveHandlers[categoryKey](finalEntry);
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
  const handleMaintenanceResolveConfirm = async (price: number | null) => {
    if (!maintenanceResolveEntry) return;
    const category = HOME_CATEGORIES.find((c) => c.key === "maintenance")!;
    const resolved = category.resolveEntry!(maintenanceResolveEntry) as HomeMaintenanceEntry;
    const now = new Date().toISOString();

    // "Fără cost" (null): advance the schedule only -- no spend logged,
    // the usual price stays for next time.
    await saveHandlers.maintenance(
      price === null
        ? resolved
        : {
            ...resolved,
            price,
            spendHistory: [...(maintenanceResolveEntry.spendHistory ?? []), { date: now, amount: price }],
          },
    );

    const label = resolved.nextDueDate
      ? roDate(resolved.nextDueDate)
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
  const resolveInitialAction = async (categoryKey: HomeCategoryKey, id: string) => {
    let retry = true;
    while (retry) {
      try {
        await resolveCategoryEntry(categoryKey, id);
        return;
      } catch (error: any) {
        retry = await confirmAction(
          "Nu am putut rezolva",
          error?.message || "A apărut o eroare. Înregistrarea nu a fost modificată.",
          { confirmLabel: "Reîncearcă", cancelLabel: "Înapoi" },
        );
        if (!retry) recordAction?.cancel();
      }
    }
  };
  const openedInitialItemRef = useRef<string | null>(null);
  useEffect(() => {
    if (initialSection === "supplies") setSuppliesPageVisible(true);
  }, [initialSection]);
  useEffect(() => {
    if (!initialOpenItem) return;
    const key = `${initialOpenItem.type}:${initialOpenItem.id}`;
    if (openedInitialItemRef.current === key) return;

    if (initialOpenItem.type === "home_task") {
      const entry = homeData.taskEntries.find((e) => e.id === initialOpenItem.id);
      if (!entry) return;
      openedInitialItemRef.current = key;
      setTasksPageVisible(true);
      if (entry.completed) {
        setEditingTaskEntry(entry);
        setTaskFormVisible(true);
      } else if (entry.isPurchase || recordAction) setResolveSheetEntry(entry);
      return;
    }

    if (initialOpenItem.type === "home_supply") {
      const entry = homeData.supplyEntries.find((e) => e.id === initialOpenItem.id);
      if (!entry) return;
      openedInitialItemRef.current = key;
      setSuppliesPageVisible(true);
      setEditingSupplyEntry(entry);
      setSupplyFormVisible(true);
      return;
    }
    const categoryKey =
      initialOpenItem.type === "home_recurring" ? "recurring" : initialOpenItem.type === "home_document" ? "documents" : initialOpenItem.type === "home_expense" ? "expenses" : "maintenance";
    const category = HOME_CATEGORIES.find((c) => c.key === categoryKey);
    const exists = category?.entries(homeData).some((e) => e.id === initialOpenItem.id);
    if (!exists) return;
    openedInitialItemRef.current = key;
    if (initialOpenItem.resolve && categoryKey !== "documents") {
      // Same resolve as the category page's own swipe/checkbox: a
      // recurring maintenance visit asks for this cycle's cost.
      void resolveInitialAction(categoryKey, initialOpenItem.id);
      return;
    }
    setActiveCategory(categoryKey);
    setInitialCategoryEditId(initialOpenItem.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpenItem, homeData]);

  const handleSupplyFormSave = async (entry: HomeSupplyEntry) => {
    await onSupplySave(entry);
    setSupplyFormVisible(false);
    setEditingSupplyEntry(null);
  };

  const handleSupplyFormDelete = async () => {
    if (editingSupplyEntry) await onSupplyDelete(editingSupplyEntry.id);
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
      "Ștergi produsul?",
      `„${entry.name}” se șterge definitiv din provizii.`,
      { confirmLabel: "Șterge", destructive: true },
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

  const recordSheetEl = (
    <HomeRecordSheet
      record={recordSheet ? buildHomeRecordPreview(homeData, recordSheet.kind, recordSheet.id) : null}
      mode={recordSheet?.mode ?? "preview"}
      onClose={() => setRecordSheet(null)}
      resolve={recordSheet ? recordResolve(recordSheet.kind, recordSheet.id) : null}
      onEdit={() => recordSheet && recordEdit(recordSheet.kind, recordSheet.id)}
      onDelete={() => recordSheet && recordDelete(recordSheet.kind, recordSheet.id)}
    />
  );

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
          onPreview={(entry) => openRecord("supply", entry.id, "preview")}
          onActions={(entry) => openRecord("supply", entry.id, "actions")}
          onRestock={handleSupplyRestock}
          onDelete={handleSupplyRowDelete}
        />
        {recordSheetEl}
        {supplyFormVisible ? (
          <HomeSupplyForm
            entry={editingSupplyEntry ?? undefined}
            onCancel={() => {
              setSupplyFormVisible(false);
              setEditingSupplyEntry(null);
              recordAction?.cancel();
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
            if (row.kind === "document") {
              // A document is renewed, not "resolved" -- same pop-up as
              // everywhere else ("cu datele vechi" / "modifică").
              handleDocumentRenew(row.id);
              return;
            }
            resolveCategoryEntry(row.kind, row.id);
          }}
          onDeletePress={async (row) => {
            const ok = await confirmAction("Ștergi?", `„${row.title}” se șterge definitiv.`, { confirmLabel: "Șterge", destructive: true });
            if (!ok) return;
            if (row.kind === "task") onTaskDelete(row.id);
            else if (row.kind === "document") onDocumentDelete(row.id);
            else deleteHandlers[row.kind](row.id);
          }}
        />
        {resolveSheetEntry ? (
          <HomeTaskResolveSheet
            entry={resolveSheetEntry}
            onCancel={() => { setResolveSheetEntry(null); recordAction?.cancel(); }}
            onResolve={handleResolveConfirm}
          />
        ) : null}
        {maintenanceResolveEntry ? (
          <HomeMaintenanceResolveSheet
            entry={maintenanceResolveEntry}
            onCancel={() => { setMaintenanceResolveEntry(null); recordAction?.cancel(); }}
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
          onPreview={(entry) => openRecord("task", entry.id, "preview")}
          onActions={(entry) => openRecord("task", entry.id, "actions")}
          onCheckboxPress={handleCheckboxPress}
          onDelete={handleTaskRowDelete}
          onReorder={onTaskReorder}
        />
        {recordSheetEl}
        {resolveSheetEntry ? (
          <HomeTaskResolveSheet
            entry={resolveSheetEntry}
            onCancel={() => { setResolveSheetEntry(null); recordAction?.cancel(); }}
            onResolve={handleResolveConfirm}
          />
        ) : null}
        {taskFormVisible ? (
          <HomeTaskForm
            entry={editingTaskEntry ?? undefined}
            onCancel={() => {
              setTaskFormVisible(false);
              setEditingTaskEntry(null);
              recordAction?.cancel();
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
    const CATEGORY_RECORD: Record<HomeCategoryKey, HomeRecordKind> = { recurring: "recurring", maintenance: "maintenance", documents: "document", expenses: "expense", supplies: "supply" };

    return (
      <>
        <HomeCategoryPage
          key={activeCategory}
          info={(activeCategory === "supplies" ? "home.supplies" : `home.category.${activeCategory}`) as HelpKey}
          startWithForm={categoryStartsWithForm}
          onRenew={activeCategory === "documents" ? handleDocumentRenew : undefined}
          title={category.label}
          icon={category.icon}
          fields={category.fields}
          submitLabel={category.submitLabel}
          emptyLabel={category.emptyLabel}
          rows={category.rows(homeData)}
          onBack={() => {
            setCategoryStartsWithForm(false);
            setActiveCategory(null);
          }}
          onSubmit={(values, editingId) => {
            const existing = editingId
              ? category.entries(homeData).find((e) => e.id === editingId)
              : undefined;
            return saveHandlers[activeCategory](category.buildEntry(values, existing));
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
          editRequest={categoryEditRequest}
          onRowPreview={(id) => openRecord(CATEGORY_RECORD[activeCategory], id, "preview")}
          onRowActions={(id) => openRecord(CATEGORY_RECORD[activeCategory], id, "actions")}
        />
        {recordSheetEl}
        {maintenanceResolveEntry ? (
          <HomeMaintenanceResolveSheet
            entry={maintenanceResolveEntry}
            onCancel={() => { setMaintenanceResolveEntry(null); recordAction?.cancel(); }}
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
        onDocumentsPress={() => selectCategory("documents")}
        onSuppliesPress={() => selectCategory("supplies")}
        expiredDocuments={expiredDocs}
        lowSupplies={lowSupplyCount}
      />

      <HomeOverviewCard
        spent={thisMonthExpenses}
        monthlyBills={monthlyBills}
        onSpendPress={() => setSpendPageVisible(true)}
        onBillsPress={() => selectCategory("recurring")}
        spaceId={space?.id != null ? String(space.id) : undefined}
      />

      <SpaceQuickActions kind="home" actions={quickActions} onAction={addNew} />

      <HomeDueSection
        rows={dueRows}
        tab={dueTab}
        onTabChange={setDueTab}
        allRows={allRows}
        onRowPress={(row: HomeDueRow) => openRecord(row.kind, row.id, "preview")}
        onRowLongPress={(row: HomeDueRow) => openRecord(row.kind, row.id, "actions")}
        onResolve={(row: HomeDueRow) => recordResolve(row.kind, row.id)?.run()}
        onDelete={(row: HomeDueRow) => recordDelete(row.kind, row.id)}
      />
    </ScrollView>
    {recordSheetEl}
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
    {formOverlay ? (() => {
      const overlayCategory = HOME_CATEGORIES.find((c) => c.key === formOverlay.category)!;
      return (
        <HomeCategoryPage
          key={`${formOverlay.category}-${formOverlay.editId ?? "new"}`}
          formOnly
          info={(formOverlay.category === "supplies" ? "home.supplies" : `home.category.${formOverlay.category}`) as HelpKey}
          title={overlayCategory.label}
          icon={overlayCategory.icon}
          fields={overlayCategory.fields}
          submitLabel={overlayCategory.submitLabel}
          emptyLabel={overlayCategory.emptyLabel}
          rows={[]}
          onBack={() => setFormOverlay(null)}
          onSubmit={(values, editingId) => {
            const existing = editingId ? overlayCategory.entries(homeData).find((e) => e.id === editingId) : undefined;
            return saveHandlers[formOverlay.category](overlayCategory.buildEntry(values, existing));
          }}
          onDelete={(id) => deleteHandlers[formOverlay.category](id)}
          onResolve={overlayCategory.resolveEntry ? (id) => resolveCategoryEntry(formOverlay.category, id) : undefined}
          getEditValues={(id) => {
            const existing = overlayCategory.entries(homeData).find((e) => e.id === id);
            return existing ? overlayCategory.valuesFromEntry(existing) : {};
          }}
          initialEditId={formOverlay.editId ?? null}
        />
      );
    })() : null}
    {restockSheetEntry ? (
      <HomeSupplyRestockSheet
        entry={restockSheetEntry}
        onCancel={() => setRestockSheetEntry(null)}
        onConfirm={handleRestockConfirm}
      />
    ) : null}
    {/* "De rezolvat"'s swipe-right lands here: a task asks for its
        price / next date, a recurring maintenance visit for this
        cycle's cost. */}
    {resolveSheetEntry ? (
      <HomeTaskResolveSheet
        entry={resolveSheetEntry}
        onCancel={() => { setResolveSheetEntry(null); recordAction?.cancel(); }}
        onResolve={handleResolveConfirm}
      />
    ) : null}
    {maintenanceResolveEntry ? (
      <HomeMaintenanceResolveSheet
        entry={maintenanceResolveEntry}
        onCancel={() => { setMaintenanceResolveEntry(null); recordAction?.cancel(); }}
        onResolve={handleMaintenanceResolveConfirm}
      />
    ) : null}
    </SwipeBackView>
  );
}
