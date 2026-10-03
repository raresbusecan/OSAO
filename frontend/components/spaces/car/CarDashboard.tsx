import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { buildCarRecentItems } from "./utils/carEntries";
import type { CarRecentItem } from "./utils/carEntries.types";
import { isRecentToday } from "@/lib/spaces/car/utils/recency";
import { isDocumentLocked } from "@/lib/spaces/car/utils/documentLock";
import { notifyAction } from "@/lib/confirm";
import { severityColor } from "@/lib/statusColors";
import { SwipeBackView } from "@/components/spaces/SwipeBackView";
import { PressableScale } from "@/components/ui/PressableScale";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { CircleButton, Pill, Segmented, SectionHeader, Group, Chip, IconWell, TopBar, Identity } from "@/components/ui/primitives";
import { formatCarDate } from "./utils/carFormatters";

import {
    View,
    Text,
    ScrollView,
    Pressable,
} from "react-native";

import type { SpaceCategory } from "@/lib/spaceCategoryFab";

import { CarQuickActions } from "./CarQuickActions";
import CarFuelForm from "./forms/CarFuelForm";
import CarMaintenanceForm from "./forms/CarMaintenanceForm";
import CarDocumentForm from "./forms/CarDocumentForm";
import CarExpenseForm from "./forms/CarExpenseForm";
import { CarExpensesPage } from "./CarExpensesPage";
import { CarDocsPage } from "./CarDocsPage";
import { CarArchivePage } from "./CarArchivePage";
import { CarHistoryPage } from "./CarHistoryPage";

import type {
    CarDocumentEntry,
    CarExpenseEntry,
    CarFuelEntry,
    CarMaintenanceEntry,
    CarVehicle,
} from "@/lib/spaces/car/car.types";


import type {
    CarIcon,
    CarNextItem,
} from "./car.ui.types";

import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";

import type { CarData } from "./car.data.types";
import {
    getAverageFuelConsumption,
    getCurrentOdometer,
    getThisMonthExpenses,
    getUpcomingItems,
} from "@/lib/spaces/car/calculations/dashboard.calculations";
import { filterRecordsByPeriod } from "@/lib/spaces/car/calculations/expenses.calculations";
import type { CarProfile } from "@/lib/spaces/spaceProfile";
import { SPACE_IDENTITY_COLORS, spaceTextColor } from "@/lib/spaces/spaceProfile";

export type CarDashboardProps = {
    space: any;
    carData: CarData;
    /** From the dedicated Car form (Edit -> Make/Model/Color/Year/Price) -- null for a Car space created before this existed. */
    profile?: CarProfile | null;
    onEdit?: () => void;
    onFuelSave?: (entry: CarFuelEntry) => void;
    onMaintenanceSave?: (entry: CarMaintenanceEntry) => void;
    onDocumentSave?: (entry: CarDocumentEntry) => void;
    onExpenseSave?: (entry: CarExpenseEntry) => void;
    onFuelDelete?: (id: string) => void;
    onMaintenanceDelete?: (id: string) => void;
    onDocumentDelete?: (id: string) => void;
    onExpenseDelete?: (id: string) => void;
    /** Deep-link from TodoCarouselSheet's "Deschide" -- a document-type
     * to-do jumps straight into CarDocumentForm for that record instead
     * of landing on the dashboard and making the user find it themselves.
     * Only "document" ever reaches here (fuel/maintenance/expense aren't
     * actionable to-dos, see Item::ACTIONABLE_TYPES on the backend). */
    initialOpenEntry?: { type: "document"; id: string } | null;
};

export default function CarDashboard({
    space,
    carData,
    profile,
    onEdit,
    onFuelSave,
    onMaintenanceSave,
    onDocumentSave,
    onExpenseSave,
    onFuelDelete,
    onMaintenanceDelete,
    onDocumentDelete,
    onExpenseDelete,
    initialOpenEntry,
}: CarDashboardProps) {
    const { colors, spacing, radius, isDark, typography } = useTheme();
    const router = useRouter();

    // Make is the space's actual name (big title, above); Model sits here
    // as the gray subtitle -- same pattern Home uses (city / county).
    const vehicleSubtitle = profile?.model ?? "";

    // The Fuel form's "tank level before/after" sliders convert their %
    // into real liters using this -- it must come from the real profile
    // (Edit -> Tank capacity), never carData.vehicle's own mock value,
    // or every Car space would share one fake capacity regardless of
    // what the user actually set.
    const vehicleForForms = {
        ...carData.vehicle,
        tank_capacity_liters: profile?.tankCapacity ?? carData.vehicle.tank_capacity_liters,
    };

    const [fuelFormVisible, setFuelFormVisible] = useState(false);
    const [editingFuelEntry, setEditingFuelEntry] =
        useState<CarFuelEntry | null>(null);


    const [maintenanceFormVisible, setMaintenanceFormVisible] =
        useState(false);
    const [editingMaintenanceEntry, setEditingMaintenanceEntry] =
        useState<CarMaintenanceEntry | null>(null);


    const [documentFormVisible, setDocumentFormVisible] =
        useState(false);
    const [editingDocumentEntry, setEditingDocumentEntry] =
        useState<CarDocumentEntry | null>(null);
    // Documents only -- true when the entry being opened is archived or
    // has fallen out of the dashboard's 7-day window (see
    // lib/spaces/car/utils/documentLock.ts), set right before
    // setDocumentFormVisible(true) and never on its own. Renewing (see
    // documentRenewFrom below) always creates a brand-new, unlocked
    // record, so it never sets this.
    const [documentReadOnly, setDocumentReadOnly] = useState(false);
    // Set instead of editingDocumentEntry when a NEXT alert ("Expires
    // soon") is tapped -- pre-fills the form but still creates a new
    // record (a renewal), see handleNextItemPress below.
    const [documentRenewFrom, setDocumentRenewFrom] =
        useState<
            (Pick<CarDocumentEntry, "documentType" | "title" | "issuer"> & { sourceId: string })
            | null
        >(null);

    const [expenseFormVisible, setExpenseFormVisible] =
        useState(false);
    const [editingExpenseEntry, setEditingExpenseEntry] =
        useState<CarExpenseEntry | null>(null);

    const [maintenanceRenewFrom, setMaintenanceRenewFrom] =
        useState<
            (Pick<CarMaintenanceEntry, "service" | "provider"> & { sourceId: string })
            | null
        >(null);

    // The 4 category forms are meant to be mutually exclusive -- but
    // CarQuickActions' own row stays visible and tappable the whole
    // time this dashboard is mounted, including while a form is already
    // open on screen. Without this, picking a different category (or
    // tapping a RECENT/NEXT item) while e.g. Fuel is open set that
    // category's own Visible flag true without ever clearing
    // fuelFormVisible -- both stayed true, so closing Fuel immediately
    // revealed the other form underneath instead of switching to it
    // cleanly. Every entry point that opens a form (handleCarAction,
    // openEntryForEdit, handleNextItemPress) calls this first so only
    // one is ever visible at a time.
    const closeAllForms = () => {
        setFuelFormVisible(false);
        setEditingFuelEntry(null);
        setMaintenanceFormVisible(false);
        setEditingMaintenanceEntry(null);
        setMaintenanceRenewFrom(null);
        setDocumentFormVisible(false);
        setEditingDocumentEntry(null);
        setDocumentRenewFrom(null);
        setDocumentReadOnly(false);
        setExpenseFormVisible(false);
        setEditingExpenseEntry(null);
    };

    // Opened from the "This month" wallet stat card below -- the one
    // place that shows every Fuel/Maintenance/Document/Expense record
    // that actually cost money, combined and totaled. See
    // lib/spaces/car/calculations/expenses.calculations.ts.
    const [expensesPageVisible, setExpensesPageVisible] = useState(false);

    // Opened from the Docs/Archive/History split pill below the name.
    const [docsPageVisible, setDocsPageVisible] = useState(false);
    const [archivePageVisible, setArchivePageVisible] = useState(false);
    const [historyPageVisible, setHistoryPageVisible] = useState(false);
    // Which tab History opens on -- "all" from the pill, or a specific
    // category when the empty state's "See History" link sends you there.
    const [historyInitialTab, setHistoryInitialTab] = useState<CarRecentItem["type"] | "all">("all");
    // "Show more"/"Show less" on RECENT/ALL expands that section in
    // place (toggled from both the button next to the section title and
    // the one below the list) instead of navigating anywhere -- same
    // wording and toggle-back behavior now also used by
    // CarExpensesPage's own Recent/All sections.
    const [recentExpanded, setRecentExpanded] = useState(false);
    const [allExpanded, setAllExpanded] = useState(false);

    // The category tabs below Mileage/This month -- "all" or one of the 4
    // categories. Filters both RECENT and the list below it.
    const [activeTab, setActiveTab] = useState<CarRecentItem["type"] | "all">("all");

    // Both RECENT and ALL stay capped at 5, always -- on a busy day (or
    // the "all" tab combining every category) either could otherwise grow
    // as tall as the user's whole history. "Show more" doesn't expand
    // these inline anymore -- it opens History (see historyInitialTab),
    // which is built for exactly that, unbounded, tabbed the same way.
    const openHistoryFor = (tab: CarRecentItem["type"] | "all") => {
        setHistoryInitialTab(tab);
        setHistoryPageVisible(true);
    };


    /*
     * =========================================================
     * CALCULATED CAR DATA
     * =========================================================
     */

    const currentOdometer = getCurrentOdometer(carData);
    const thisMonthExpenses = getThisMonthExpenses(carData);

    // Hero's second stat -- null until there are 2+ fuel fill-ups and a
    // tank capacity to compare (see getAverageFuelConsumption).
    const averageConsumption = getAverageFuelConsumption(carData);

    const nextItems: CarNextItem[] = getUpcomingItems(carData, currentOdometer, 3);

    // Archived entries (superseded by a renewal -- see
    // handleDocumentSave/handleMaintenanceSave) are left out here so the
    // dashboard stays a list of what's current, not a growing history.
    // They're never deleted, and still count toward Expenses totals --
    // just find them there, tagged "Archived", not here.
    //
    // Documents don't feed into RECENT/ALL at all any more -- they live
    // permanently in their own Docs page (see CarDocsPage.tsx) instead
    // of aging in and out of a 7-day window the way fuel/maintenance/
    // expenses do, since a document doesn't "happen" the way those do.
    const allEntries = buildCarRecentItems({
        fuelEntries: carData.fuelEntries,
        maintenanceEntries: carData.maintenanceEntries.filter((e) => !e.archived),
        documentEntries: [],
        expenseEntries: carData.expenseEntries,
        currentOdometer,
    });

    const tabFilteredEntries =
        activeTab === "all" ? allEntries : allEntries.filter((e) => e.type === activeTab);

    const sortedEntries = [...tabFilteredEntries].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    // The dashboard only ever shows the last 7 days -- RECENT (today) and
    // ALL (the rest of the week) both draw from this window, same period
    // system as the Expenses page (see expenses.calculations.ts). Once a
    // record falls out of the window it isn't trimmed or deleted, it just
    // stops appearing here -- it's still one tap away in History, which
    // has its own period filter for looking further back.
    const withinWeekEntries = filterRecordsByPeriod(sortedEntries, { kind: "weeks", count: 1 });

    // "Recent" means recorded today, full stop -- once the day changes an
    // entry just quietly becomes a normal row below, no tag, no special
    // section. See lib/spaces/car/utils/recency.ts.
    const recentItems = withinWeekEntries.filter((e) => isRecentToday(e.date));
    const olderItems = withinWeekEntries.filter((e) => !isRecentToday(e.date));

    // Whether the current tab has records that exist but are simply older
    // than the 7-day window -- drives the empty-state hint pointing at
    // History instead of implying nothing was ever recorded.
    const hasOlderThanWeek = sortedEntries.length > withinWeekEntries.length;

    // No "Documents" tab -- documents no longer flow through
    // RECENT/ALL at all (see the allEntries comment above), so a tab
    // for them here would just always be empty.
    const CATEGORY_TABS: { key: CarRecentItem["type"] | "all"; label: string }[] = [
        { key: "all", label: "Toate" },
        { key: "fuel", label: "Alimentări" },
        { key: "maintenance", label: "Service" },
        { key: "expense", label: "Cheltuieli" },
    ];

    // Feeds CarQuickActions' own row below (the shared "+" FAB was
    // removed from this Space entirely -- see app/(tabs)/_layout.tsx).
    const carCategories: SpaceCategory[] = [
        {
            key: "fuel",
            icon: "water-outline",
            label: "Alimentare",
        },
        {
            key: "maintenance",
            icon: "construct-outline",
            label: "Service",
        },
        {
            key: "document",
            icon: "document-text-outline",
            label: "Document",
        },
        {
            key: "expense",
            icon: "card-outline",
            label: "Cheltuială",
        },
    ];

    /*
     * =========================================================
     * CAR ACTION
     * =========================================================
     */

    const handleCarAction = (action: string) => {
        if (action === "fuel") {
            closeAllForms();
            setFuelFormVisible(true);
            return;
        }

        if (action === "maintenance") {
            closeAllForms();
            setMaintenanceFormVisible(true);
            return;
        }

        if (action === "document") {
            closeAllForms();
            setDocumentFormVisible(true);
            return;
        }

        if (action === "expense") {
            closeAllForms();
            setExpenseFormVisible(true);
            return;
        }

        /*
         * Celelalte acțiuni vor primi formularele lor ulterior:
         *
         * maintenance
         * expense
         * document
         * mileage
         */
    };

    /*
     * =========================================================
     * SAVE FUEL
     * =========================================================
     */

    const handleFuelSave = (entry: CarFuelEntry) => {
        onFuelSave?.(entry);
        setFuelFormVisible(false);
        setEditingFuelEntry(null);
    };

    const handleMaintenanceSave = (entry: CarMaintenanceEntry) => {
        // Captured before the reset below clears it -- this save came from
        // tapping a "Due soon"/"Overdue" NEXT alert, not the regular Add
        // Maintenance flow, so the old alert needs an explicit "handled"
        // confirmation (isMaintenanceSuperseded already makes it disappear
        // from NEXT once this saves, but that's silent -- easy to miss).
        const wasRenewal = maintenanceRenewFrom !== null;

        onMaintenanceSave?.(entry);
        setMaintenanceFormVisible(false);
        setEditingMaintenanceEntry(null);
        setMaintenanceRenewFrom(null);

        if (wasRenewal) {
            notifyAction(
                "Salvat",
                `${entry.service} a fost salvat. Mementoul pentru cel anterior a dispărut și rămâne în istoric.`,
            );
        }
    };


    const handleDocumentSave = (entry: CarDocumentEntry) => {
        const wasRenewal = documentRenewFrom !== null;
        const previousType = documentRenewFrom?.documentType;

        onDocumentSave?.(entry);
        setDocumentFormVisible(false);
        setEditingDocumentEntry(null);
        setDocumentRenewFrom(null);

        if (wasRenewal) {
            notifyAction(
                "Reînnoit",
                entry.expiryDate
                    ? `${entry.title} e valabil până la ${formatCarDate(entry.expiryDate)}. ${previousType || "Documentul"} vechi rămâne în istoric.`
                    : `${entry.title} a fost salvat. ${previousType || "Documentul"} vechi rămâne în istoric.`,
            );
        }
    };


    const handleExpenseSave = (entry: CarExpenseEntry) => {
        onExpenseSave?.(entry);
        setExpenseFormVisible(false);
        setEditingExpenseEntry(null);
    };

    /*
     * =========================================================
     * DELETE (any of the 4 categories -- only reachable while
     * editing an existing entry, from inside that entry's own form)
     * =========================================================
     */

    const handleFuelDelete = () => {
        if (editingFuelEntry) onFuelDelete?.(editingFuelEntry.id);
        setFuelFormVisible(false);
        setEditingFuelEntry(null);
    };

    const handleMaintenanceDelete = () => {
        if (editingMaintenanceEntry) onMaintenanceDelete?.(editingMaintenanceEntry.id);
        setMaintenanceFormVisible(false);
        setEditingMaintenanceEntry(null);
    };

    const handleDocumentDelete = () => {
        if (editingDocumentEntry) onDocumentDelete?.(editingDocumentEntry.id);
        setDocumentFormVisible(false);
        setEditingDocumentEntry(null);
    };

    const handleExpenseDelete = () => {
        if (editingExpenseEntry) onExpenseDelete?.(editingExpenseEntry.id);
        setExpenseFormVisible(false);
        setEditingExpenseEntry(null);
    };

    /*
     * =========================================================
     * OPEN AN ENTRY FOR EDIT -- shared by RECENT (dashboard) and
     * the Expenses page (both hand it a {type, id} pair to look up).
     * =========================================================
     */

    const openEntryForEdit = (
        type: CarRecentItem["type"],
        id: string | number,
    ) => {
        const idStr = String(id);

        if (type === "fuel") {
            const target = carData.fuelEntries.find((e) => e.id === idStr);
            if (target) {
                closeAllForms();
                setEditingFuelEntry(target);
                setFuelFormVisible(true);
            }
            return;
        }

        if (type === "maintenance") {
            const target = carData.maintenanceEntries.find((e) => e.id === idStr);
            if (target) {
                closeAllForms();
                setEditingMaintenanceEntry(target);
                setMaintenanceFormVisible(true);
            }
            return;
        }

        if (type === "document") {
            const target = carData.documentEntries.find((e) => e.id === idStr);
            if (target) {
                closeAllForms();
                setEditingDocumentEntry(target);
                setDocumentReadOnly(isDocumentLocked(target));
                setDocumentFormVisible(true);
            }
            return;
        }

        if (type === "expense") {
            const target = carData.expenseEntries.find((e) => e.id === idStr);
            if (target) {
                closeAllForms();
                setEditingExpenseEntry(target);
                setExpenseFormVisible(true);
            }
            return;
        }
    };

    // Runs the deep-link from TodoCarouselSheet's "Deschide" once carData
    // has actually loaded (openEntryForEdit needs it to find the entry) --
    // guarded by a ref, not by clearing initialOpenEntry itself, since
    // that prop is owned by [id].tsx and this component has no way to
    // tell it "consumed, stop passing this."
    const openedInitialEntryRef = useRef<string | null>(null);
    useEffect(() => {
        if (!initialOpenEntry) return;
        const key = `${initialOpenEntry.type}:${initialOpenEntry.id}`;
        if (openedInitialEntryRef.current === key) return;
        if (carData.documentEntries.length === 0) return;
        openedInitialEntryRef.current = key;
        openEntryForEdit(initialOpenEntry.type, initialOpenEntry.id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialOpenEntry, carData.documentEntries]);

    /*
     * =========================================================
     * NEXT ITEM PRESS (RENEW) -- a "Document expiring" or "Maintenance
     * due" alert opens a NEW entry pre-filled from the one it's about,
     * never edits it in place. Keeping the old record intact is the
     * point: RCA 2026, RCA 2027, ... stay as their own dated rows
     * instead of one row endlessly overwritten with the latest date.
     * =========================================================
     */

    const handleNextItemPress = (item: CarNextItem) => {
        if (item.sourceType === "document") {
            const source = carData.documentEntries.find((e) => e.id === item.sourceId);
            if (source) {
                closeAllForms();
                setDocumentRenewFrom({
                    documentType: source.documentType,
                    title: source.title,
                    issuer: source.issuer,
                    sourceId: source.id,
                });
                setDocumentFormVisible(true);
            }
            return;
        }

        if (item.sourceType === "maintenance") {
            const source = carData.maintenanceEntries.find((e) => e.id === item.sourceId);
            if (source) {
                closeAllForms();
                setMaintenanceRenewFrom({
                    service: source.service,
                    provider: source.provider,
                    sourceId: source.id,
                });
                setMaintenanceFormVisible(true);
            }
            return;
        }
    };

    const handleRecentItemPress = (item: CarRecentItem) =>
        openEntryForEdit(item.type, item.id);

    /*
     * =========================================================
     * EDIT CAR
     * =========================================================
     */

    const handleEdit = () => {
        onEdit?.();
    };

    /*
     * =========================================================
     * FUEL FORM
     * =========================================================
     */

    if (fuelFormVisible) {
        return (
            <View
                style={{
                    flex: 1,
                    backgroundColor: colors.surface,
                }}
            >
                <CarFuelForm
                    vehicle={vehicleForForms}
                    fuelEntries={carData.fuelEntries}
                    entry={editingFuelEntry ?? undefined}
                    onCancel={() => {
                        setFuelFormVisible(false);
                        setEditingFuelEntry(null);
                    }}
                    onSave={handleFuelSave}
                    onDelete={editingFuelEntry ? handleFuelDelete : undefined}
                />
            </View>
        );
    }

    if (maintenanceFormVisible) {
        return (
            <View
                style={{
                    flex: 1,
                    backgroundColor: colors.surface,
                }}
            >
                <CarMaintenanceForm
                    entry={editingMaintenanceEntry ?? undefined}
                    renewFrom={maintenanceRenewFrom ?? undefined}
                    onCancel={() => {
                        setMaintenanceFormVisible(false);
                        setEditingMaintenanceEntry(null);
                        setMaintenanceRenewFrom(null);
                    }}
                    onSave={handleMaintenanceSave}
                    onDelete={editingMaintenanceEntry ? handleMaintenanceDelete : undefined}
                />
            </View>
        );
    }

    if (documentFormVisible) {
        return (
            <View
                style={{
                    flex: 1,
                    backgroundColor: colors.surface,
                }}
            >
                <CarDocumentForm
                    entry={editingDocumentEntry ?? undefined}
                    renewFrom={documentRenewFrom ?? undefined}
                    readOnly={documentReadOnly}
                    onCancel={() => {
                        setDocumentFormVisible(false);
                        setEditingDocumentEntry(null);
                        setDocumentRenewFrom(null);
                        setDocumentReadOnly(false);
                    }}
                    onSave={handleDocumentSave}
                    onDelete={editingDocumentEntry ? handleDocumentDelete : undefined}
                />
            </View>
        );
    }


    if (expenseFormVisible) {
        return (
            <View
                style={{
                    flex: 1,
                    backgroundColor: colors.surface,
                }}
            >
                <CarExpenseForm
                    entry={editingExpenseEntry ?? undefined}
                    onCancel={() => {
                        setExpenseFormVisible(false);
                        setEditingExpenseEntry(null);
                    }}
                    onSave={handleExpenseSave}
                    onDelete={editingExpenseEntry ? handleExpenseDelete : undefined}
                />
            </View>
        );
    }

    if (expensesPageVisible) {
        return (
            <View
                style={{
                    flex: 1,
                    backgroundColor: colors.surface,
                }}
            >
                <CarExpensesPage
                    carData={carData}
                    profile={profile}
                    onBack={() => setExpensesPageVisible(false)}
                    onRecordPress={(category, id) => openEntryForEdit(category, id)}
                />
            </View>
        );
    }

    if (docsPageVisible) {
        return (
            <View
                style={{
                    flex: 1,
                    backgroundColor: colors.surface,
                }}
            >
                <CarDocsPage
                    carData={carData}
                    onBack={() => setDocsPageVisible(false)}
                    onRecordPress={(id) => openEntryForEdit("document", id)}
                />
            </View>
        );
    }

    if (archivePageVisible) {
        return (
            <View
                style={{
                    flex: 1,
                    backgroundColor: colors.surface,
                }}
            >
                <CarArchivePage
                    carData={carData}
                    onBack={() => setArchivePageVisible(false)}
                    onRecordPress={(category, id) => openEntryForEdit(category, id)}
                />
            </View>
        );
    }

    if (historyPageVisible) {
        return (
            <View
                style={{
                    flex: 1,
                    backgroundColor: colors.surface,
                }}
            >
                <CarHistoryPage
                    carData={carData}
                    initialTab={historyInitialTab}
                    onBack={() => setHistoryPageVisible(false)}
                    onRecordPress={(type, id) => openEntryForEdit(type, id)}
                />
            </View>
        );
    }

    /*
     * =========================================================
     * DASHBOARD
     * =========================================================
     */

    const carTint = spaceTextColor("car", isDark) ?? SPACE_IDENTITY_COLORS.car!;
    const carFill = SPACE_IDENTITY_COLORS.car!;
    const muted = colors.onSurfaceTertiary;
    const tabLabel = CATEGORY_TABS.find((t) => t.key === activeTab)?.label.toLowerCase();

    return (
        <>
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
                {/* TOP BAR -- back to Spaces, edit this car. */}
                <TopBar onBack={() => router.push("/spaces")}>
                    <CircleButton testID="space-edit" icon="create-outline" label="Editează mașina" onPress={handleEdit} />
                </TopBar>

                {/* IDENTITY -- kind dot + label, the car's own name, then
                    its model from the saved profile (never a hardcoded
                    example car). Docs/Archive/History sit right under it:
                    one destination each, always visible. */}
                <View style={{ gap: spacing.md }}>
                    <Identity color={carFill} kicker="Mașină" title={space?.name || "Mașina mea"} subtitle={vehicleSubtitle || null} />
                    <View style={{ flexDirection: "row", gap: spacing.sm }}>
                        <Pill testID="car-docs-open" icon="document-text-outline" label="Documente" onPress={() => setDocsPageVisible(true)} />
                        <Pill testID="car-archive-open" icon="archive-outline" label="Arhivă" onPress={() => setArchivePageVisible(true)} />
                        <Pill
                            testID="car-history-open"
                            icon="time-outline"
                            label="Istoric"
                            onPress={() => {
                                setHistoryInitialTab("all");
                                setHistoryPageVisible(true);
                            }}
                        />
                    </View>
                </View>

                {/* HERO -- odometer as the headline number; this month's
                    spend (tap -> Expenses page, the one place for "what
                    this car has cost") and average consumption under it. */}
                <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.gutter, gap: spacing.lg }}>
                    <View style={{ gap: 2 }}>
                        <Text style={{ fontSize: 13, color: muted }}>Kilometraj</Text>
                        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                            <AnimatedNumber value={currentOdometer} style={{ ...typography.display, color: colors.onSurface }} />
                            <Text style={{ fontSize: 16, color: muted }}>km</Text>
                        </View>
                    </View>
                    <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md + 2 }}>
                        <PressableScale
                            testID="car-expenses-stat"
                            onPress={() => setExpensesPageVisible(true)}
                            accessibilityRole="button"
                            accessibilityLabel={`Luna asta: ${thisMonthExpenses} lei. Vezi cheltuielile`}
                            style={{ flex: 1, gap: 2 }}
                        >
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                                <Text style={{ fontSize: 13, color: muted }}>Luna asta</Text>
                                <Ionicons name="chevron-forward" size={13} color={muted} />
                            </View>
                            <Text style={{ fontSize: 18, fontWeight: "600", color: colors.onSurface }}>
                                {thisMonthExpenses.toLocaleString("ro-RO")} lei
                            </Text>
                        </PressableScale>
                        <View style={{ flex: 1, gap: 2 }}>
                            <Text style={{ fontSize: 13, color: muted }}>Consum mediu</Text>
                            <Text style={{ fontSize: 18, fontWeight: "600", color: colors.onSurface }}>
                                {averageConsumption != null
                                    ? `${averageConsumption.toLocaleString("ro-RO", { maximumFractionDigits: 1 })} l/100`
                                    : "—"}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* QUICK ACTIONS -- the one way into each form. */}
                <CarQuickActions actions={carCategories} onAction={handleCarAction} />

                {/* DUE SOON -- documents/maintenance coming up, each with
                    its urgency chip (see InfoRow / getDocumentUrgencyTier). */}
                {nextItems.length > 0 && (
                    <View style={{ gap: spacing.sm }}>
                        <SectionHeader title="Urmează" />
                        <Group inset={68}>
                            {nextItems.map((item) => (
                                <InfoRow key={item.id} {...item} tint={carTint} onPress={() => handleNextItemPress(item)} />
                            ))}
                        </Group>
                    </View>
                )}

                {/* CATEGORY FILTER + RECENT (today) / last 7 days. Older
                    entries aren't gone -- they're in History. */}
                <View style={{ gap: spacing.md }}>
                    <Segmented options={CATEGORY_TABS} value={activeTab} onChange={setActiveTab} testIDPrefix="car-tab" />

                    {recentItems.length > 0 && (
                        <EntryGroup
                            title="Azi"
                            items={recentItems}
                            expanded={recentExpanded}
                            onToggle={() => setRecentExpanded((v) => !v)}
                            onItemPress={handleRecentItemPress}
                            testID="car-recent-show-more"
                        />
                    )}

                    {olderItems.length > 0 ? (
                        <EntryGroup
                            title="Ultimele 7 zile"
                            items={olderItems}
                            expanded={allExpanded}
                            onToggle={() => setAllExpanded((v) => !v)}
                            onItemPress={handleRecentItemPress}
                            testID="car-all-show-more"
                        />
                    ) : recentItems.length === 0 ? (
                        <View style={{ alignItems: "center", paddingVertical: spacing.xl, gap: spacing.sm }}>
                            <Ionicons name={hasOlderThanWeek ? "time-outline" : "file-tray-outline"} size={26} color={muted} />
                            <Text style={{ fontSize: 14, color: muted, textAlign: "center" }}>
                                {hasOlderThanWeek
                                    ? `Nimic în ultimele 7 zile${activeTab === "all" ? "" : ` la ${tabLabel}`}.`
                                    : activeTab === "all"
                                        ? "Nimic înregistrat încă. Adaugă o alimentare sau un service de mai sus."
                                        : `Nicio înregistrare la ${tabLabel} încă.`}
                            </Text>
                            {hasOlderThanWeek ? (
                                <PressableScale
                                    testID="car-empty-see-history"
                                    onPress={() => openHistoryFor(activeTab)}
                                    accessibilityRole="button"
                                    style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.lg }}
                                >
                                    <Text style={{ fontSize: 14, fontWeight: "600", color: colors.onSurface }}>Vezi istoricul</Text>
                                </PressableScale>
                            ) : null}
                        </View>
                    ) : null}
                </View>
            </ScrollView>
            </SwipeBackView>
        </>
    );
}

/* ============================================================
   SMALL PIECES
   ============================================================ */

/** A date-labelled group of entry rows on one card, collapsed to 5. */
function EntryGroup({
    title,
    items,
    expanded,
    onToggle,
    onItemPress,
    testID,
}: {
    title: string;
    items: CarRecentItem[];
    expanded: boolean;
    onToggle: () => void;
    onItemPress: (item: CarRecentItem) => void;
    testID?: string;
}) {
    const { colors, spacing } = useTheme();
    const visible = expanded ? items : items.slice(0, 5);
    return (
        <View style={{ gap: spacing.xs }}>
            <SectionHeader
                title={title}
                muted
                action={items.length > 5 ? { label: expanded ? "Arată mai puțin" : `Arată tot (${items.length})`, onPress: onToggle, testID } : undefined}
            />
            <Group inset={68}>
                {visible.map((item) => (
                    <RecentRow key={item.id} {...item} colors={colors} spacing={spacing} onPress={() => onItemPress(item)} />
                ))}
            </Group>
        </View>
    );
}

/* ============================================================
   NEXT / INFO ROW
   ============================================================ */

// Documents only -- maps a severity tier to the app's theme tokens (see
// lib/theme.tsx): 45-31 days left = caution (yellow), 30-16 = warning
// (orange), 15-0 = error (red).
function tierColor(tier: "light" | "medium" | "critical", colors: any) {
    if (tier === "critical") return severityColor("critical", colors);
    if (tier === "medium") return severityColor("warning", colors);
    return severityColor("caution", colors);
}

// Same 3 colors as tierColor, plus "safe" for the status dot shown
// everywhere a document or maintenance entry appears OUTSIDE of DUE SOON
// (RECENT/ALL, History, Expenses) -- see CarRecentItem.statusDot.
function statusDotColor(status: "safe" | "light" | "medium" | "critical", colors: any) {
    if (status === "safe") return severityColor("safe", colors);
    return tierColor(status, colors);
}

function InfoRow({
    icon,
    title,
    subtitle,
    right,
    urgencyTier,
    overdue,
    tint,
    onPress,
}: CarNextItem & {
    tint: string;
    onPress?: () => void;
}) {
    const { colors, spacing } = useTheme();
    const tone = urgencyTier ? tierColor(urgencyTier, colors) : null;
    return (
        <PressableScale
            onPress={onPress}
            scaleTo={1}
            pressedStyle={{ backgroundColor: colors.surfaceTertiary }}
            accessibilityRole="button"
            accessibilityLabel={`${title}, ${right}`}
            style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
                minHeight: 64,
                backgroundColor: colors.surfaceSecondary,
            }}
        >
            <IconWell icon={icon} color={SPACE_IDENTITY_COLORS.car!} tint={tint} />
            <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "500", color: colors.onSurface }} numberOfLines={1}>{title}</Text>
                <Text style={{ marginTop: 2, fontSize: 13, color: colors.onSurfaceTertiary }} numberOfLines={1}>{subtitle}</Text>
            </View>
            {tone ? (
                <Chip label={right ?? ""} color={tone} icon={overdue ? "alert-circle" : undefined} />
            ) : (
                <Chip label={right ?? ""} color={colors.onSurfaceTertiary} filled={false} />
            )}
        </PressableScale>
    );
}

/* ============================================================
   RECENT ROW
   ============================================================ */

export function RecentRow({
    type,
    icon,
    title,
    subtitle,
    amount,
    statusDot,
    overdue,
    colors,
    spacing,
    last,
    onPress,
}: CarRecentItem & {
    colors: any;
    spacing: any;
    last?: boolean;
    onPress?: () => void;
}) {
    const { isDark } = useTheme();
    const tint = spaceTextColor("car", isDark) ?? SPACE_IDENTITY_COLORS.car!;

    return (
        <PressableScale
            onPress={onPress}
            scaleTo={1}
            pressedStyle={{ backgroundColor: colors.surfaceTertiary }}
            accessibilityRole="button"
            accessibilityLabel={`${title}${amount ? `, ${amount}` : ""}`}
            style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
                minHeight: 64,
                gap: spacing.md,
                backgroundColor: colors.surfaceSecondary,
                // Callers that stack rows without a Group pass `last` and
                // get a full-width hairline; Group callers omit it.
                borderBottomWidth: last === undefined || last ? 0 : 1,
                borderBottomColor: colors.border,
            }}
        >
            {/* Icon well = which entry type; the small dot on its corner =
                document/maintenance status (see statusDotColor). */}
            <View>
                <IconWell icon={icon} color={SPACE_IDENTITY_COLORS.car!} tint={tint} />
                {statusDot ? (
                    <View
                        style={{
                            position: "absolute",
                            right: -3,
                            bottom: -3,
                            width: overdue ? 14 : 10,
                            height: overdue ? 14 : 10,
                            borderRadius: 7,
                            backgroundColor: statusDotColor(statusDot, colors),
                            borderWidth: 2,
                            borderColor: colors.surfaceSecondary,
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        {overdue ? <Text style={{ fontSize: 8, fontWeight: "700", color: colors.surfaceSecondary, lineHeight: 10 }}>!</Text> : null}
                    </View>
                ) : null}
            </View>

            <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "500", color: colors.onSurface }} numberOfLines={1}>{title}</Text>
                <Text style={{ marginTop: 2, fontSize: 13, color: colors.onSurfaceTertiary }} numberOfLines={1}>{subtitle}</Text>
            </View>

            {amount ? (
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface, fontVariant: ["tabular-nums"] }}>{amount}</Text>
            ) : null}
        </PressableScale>
    );
}


/* ============================================================
   HELPERS
   ============================================================ */