import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { buildCarRecentItems } from "./utils/carEntries";
import type { CarRecentItem } from "./utils/carEntries.types";
import { isRecentToday } from "@/lib/spaces/car/utils/recency";
import { isDocumentLocked } from "@/lib/spaces/car/utils/documentLock";
import { notifyAction } from "@/lib/confirm";
import { severityColor } from "@/lib/statusColors";

import {
    View,
    Text,
    ScrollView,
    Pressable,
    StyleSheet,
} from "react-native";

import { useRegisterSpaceCategories, type SpaceCategory } from "@/lib/spaceCategoryFab";

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
    getCurrentOdometer,
    getThisMonthExpenses,
    getUpcomingItems,
} from "@/lib/spaces/car/calculations/dashboard.calculations";
import { filterRecordsByPeriod } from "@/lib/spaces/car/calculations/expenses.calculations";
import type { CarProfile } from "@/lib/spaces/spaceProfile";
import { SPACE_IDENTITY_COLORS } from "@/lib/spaces/spaceProfile";

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

type CarStat = {
    icon: keyof typeof Ionicons.glyphMap;
    value: string;
    label: string;
    suffix?: string;
    onPress?: () => void;
    testID?: string;
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
    const { colors, spacing, radius } = useTheme();
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

    // The 4 category forms are meant to be mutually exclusive -- but the
    // shared "+" FAB (useRegisterSpaceCategories below) stays registered,
    // and tappable, the whole time this dashboard is mounted, including
    // while a form is already open on screen. Without this, picking a
    // different category from the FAB (or tapping a RECENT/NEXT item)
    // while e.g. Fuel is open set that category's own Visible flag true
    // without ever clearing fuelFormVisible -- both stayed true, so
    // closing Fuel immediately revealed the other form underneath
    // instead of switching to it cleanly. Every entry point that opens a
    // form (handleCarAction, openEntryForEdit, handleNextItemPress)
    // calls this first so only one is ever visible at a time.
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

    const stats: CarStat[] = [
        {
            icon: "speedometer-outline",
            value: currentOdometer.toLocaleString("en-US"),
            label: "Mileage",
            suffix: "km",
        },
        {
            icon: "wallet-outline",
            value: thisMonthExpenses.toLocaleString("en-US"),
            label: "This month",
            suffix: "RON",
            // Tapping this is the only way in -- Fuel/Maintenance/
            // Documents/Expenses are 4 separate forms, but "money this
            // car has cost" is one clear place, not scattered across
            // 4 category screens the user has to check individually.
            onPress: () => setExpensesPageVisible(true),
            testID: "car-expenses-stat",
        },
    ];

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
        { key: "all", label: "All" },
        { key: "fuel", label: "Fuel" },
        { key: "maintenance", label: "Maintenance" },
        { key: "expense", label: "Expenses" },
    ];

    // Reachable via the shared "+" FAB (registered below, see
    // useRegisterSpaceCategories) rather than a "Quick Actions" row on the
    // dashboard itself -- the row would just duplicate what the FAB offers.
    const carCategories: SpaceCategory[] = [
        {
            key: "fuel",
            icon: "water-outline",
            label: "Fuel",
        },
        {
            key: "maintenance",
            icon: "construct-outline",
            label: "Maintenance",
        },
        {
            key: "document",
            icon: "document-text-outline",
            label: "Document",
        },
        {
            key: "expense",
            icon: "card-outline",
            label: "Expense",
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

    // Claims the shared "+" FAB (app/(tabs)/_layout.tsx) for as long as
    // this dashboard is on screen -- pressing it fans out these four
    // categories instead of opening Quick Add.
    useRegisterSpaceCategories({
        spaceLabel: "Car",
        categories: carCategories,
        onSelect: handleCarAction,
    });

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
                "Logged",
                `${entry.service} recorded. The reminder for your previous one is cleared -- it stays in your history.`,
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
                "Renewed",
                entry.expiryDate
                    ? `${entry.title} now valid until ${entry.expiryDate}. The expiring ${previousType || "document"} is cleared and stays in your history.`
                    : `${entry.title} saved. The expiring ${previousType || "document"} is cleared and stays in your history.`,
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

    return (
        <>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                    paddingHorizontal: spacing.xl,
                    // Clears the floating Quick Add / category FAB in the
                    // bottom-right corner.
                    paddingBottom: 100,
                }}
            >
                {/* =====================================================
            SPACE IDENTITY
            ===================================================== */}

                <View
                    style={{
                        position: "relative",
                        alignItems: "center",
                        paddingTop: spacing.md,
                        paddingBottom: spacing.xl,
                    }}
                >
                    {/* BACK -- the old "+" here opened the exact same
                        sheet as the category menu handle below, so it was
                        just a second button for one action. This is the
                        only way back to Spaces from inside a space now. */}

                    <Pressable
                        testID="space-back"
                        onPress={() => router.push("/spaces")}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel="Back to Spaces"
                        style={{
                            position: "absolute",
                            left: 0,
                            top: spacing.md + 10,
                            width: 40,
                            height: 40,
                            borderRadius: radius.pill,
                            backgroundColor: "transparent",
                            borderWidth: 1,
                            borderColor: colors.border,
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <Ionicons
                            name="chevron-back"
                            size={22}
                            color={colors.onSurface}
                        />
                    </Pressable>

                    {/* EDIT */}

                    <Pressable
                        testID="space-edit"
                        onPress={handleEdit}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel="Edit car"
                        style={{
                            position: "absolute",
                            right: 0,
                            top: spacing.md + 10,
                            width: 40,
                            height: 40,
                            borderRadius: radius.pill,
                            backgroundColor: "transparent",
                            borderWidth: 1,
                            borderColor: colors.caution,
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <Ionicons
                            name="create-outline"
                            size={19}
                            color={colors.caution}
                        />
                    </Pressable>

                    {/* CAR ICON -- back to plain. Archive/History are
                        reachable from the split pill below the name
                        instead (two real destinations now, a corner badge
                        on the icon alone couldn't say which is which). */}

                    <View
                        style={{
                            width: 68,
                            height: 68,
                            borderRadius: radius.lg,
                            backgroundColor: `${SPACE_IDENTITY_COLORS.car}1A`,
                            alignItems: "center",
                            justifyContent: "center",
                            marginBottom: spacing.md,
                        }}
                    >
                        <Ionicons
                            name={(space?.icon || "car-outline") as any}
                            size={32}
                            color={SPACE_IDENTITY_COLORS.car}
                        />
                    </View>

                    {/* NAME */}

                    <Text
                        style={{
                            fontSize: 30,
                            lineHeight: 36,
                            fontWeight: "800",
                            color: colors.onSurface,
                            letterSpacing: -0.7,
                        }}
                    >
                        {space?.name || "Car"}
                    </Text>

                    {/* VEHICLE DESCRIPTION -- from the real saved profile
                        (Edit -> Make/Model/Color/Year/Price), never a
                        hardcoded example car. */}

                    {vehicleSubtitle ? (
                        <Text
                            style={{
                                marginTop: 4,
                                fontSize: 14,
                                color: colors.onSurfaceTertiary,
                            }}
                        >
                            {vehicleSubtitle}
                        </Text>
                    ) : null}

                    {/* DOCS / ARCHIVE / HISTORY -- one destination each,
                        always visible, no menu step. Docs = every CURRENT
                        document, no time limit (documents don't "age out"
                        the way RECENT/ALL's 7-day window works for
                        fuel/maintenance/expenses). Archive = specifically
                        what a renewal replaced (has a "renewed by"
                        reference). History = fuel/maintenance/expenses
                        once they fall out of the 7-day window -- documents
                        no longer pass through it at all, so they're not a
                        History tab any more either. */}

                    <View
                        style={{
                            flexDirection: "row",
                            marginTop: spacing.md,
                            borderRadius: radius.pill,
                            backgroundColor: "transparent",
                            borderWidth: 1,
                            borderColor: colors.border,
                            overflow: "hidden",
                        }}
                    >
                        <Pressable
                            testID="car-docs-open"
                            onPress={() => setDocsPageVisible(true)}
                            accessibilityRole="button"
                            accessibilityLabel="View documents"
                            style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 5,
                                paddingVertical: 7,
                                paddingHorizontal: spacing.md,
                            }}
                        >
                            <Ionicons name="document-text-outline" size={12} color={colors.onSurfaceTertiary} />
                            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.onSurface }}>
                                Docs
                            </Text>
                        </Pressable>

                        <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />

                        <Pressable
                            testID="car-archive-open"
                            onPress={() => setArchivePageVisible(true)}
                            accessibilityRole="button"
                            accessibilityLabel="View archive"
                            style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 5,
                                paddingVertical: 7,
                                paddingHorizontal: spacing.md,
                            }}
                        >
                            <Ionicons name="archive-outline" size={12} color={colors.onSurfaceTertiary} />
                            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.onSurface }}>
                                Archive
                            </Text>
                        </Pressable>

                        <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />

                        <Pressable
                            testID="car-history-open"
                            onPress={() => {
                                setHistoryInitialTab("all");
                                setHistoryPageVisible(true);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel="View history"
                            style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 5,
                                paddingVertical: 7,
                                paddingHorizontal: spacing.md,
                            }}
                        >
                            <Ionicons name="time-outline" size={12} color={colors.onSurfaceTertiary} />
                            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.onSurface }}>
                                History
                            </Text>
                        </Pressable>
                    </View>
                </View>

                {/* =====================================================
            MAIN STATS
            ===================================================== */}

                <View
                    style={{
                        flexDirection: "row",
                        gap: spacing.md,
                        marginBottom: spacing.xl,
                    }}
                >
                    {stats.map((stat) => (
                        <StatCard
                            key={stat.label}
                            {...stat}
                            colors={colors}
                            radius={radius}
                            spacing={spacing}
                        />
                    ))}
                </View>

                {/* =====================================================
            QUICK ACTIONS -- revived, now that the shared FAB is hidden
            for Car (app/(tabs)/_layout.tsx) so this is the one way in,
            not a second one alongside it.
            ===================================================== */}

                <View style={{ marginBottom: spacing.xl }}>
                    <CarQuickActions actions={carCategories} onAction={handleCarAction} />
                </View>

                {/* =====================================================
            CATEGORY TABS -- filters both RECENT and the list below.
            Doesn't touch NEXT (that's alerts, not browsing).
            ===================================================== */}

                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: spacing.sm, marginBottom: spacing.xl }}
                >
                    {CATEGORY_TABS.map((tab) => {
                        const isActive = activeTab === tab.key;

                        return (
                            <Pressable
                                key={tab.key}
                                testID={`car-tab-${tab.key}`}
                                onPress={() => setActiveTab(tab.key)}
                                accessibilityRole="button"
                                accessibilityState={{ selected: isActive }}
                                style={{
                                    paddingHorizontal: spacing.md,
                                    minHeight: 34,
                                    borderRadius: radius.pill,
                                    backgroundColor: isActive ? colors.onSurface : "transparent",
                                    borderWidth: 1,
                                    borderColor: isActive ? colors.onSurface : colors.border,
                                    alignItems: "center",
                                    justifyContent: "center",
                                }}
                            >
                                <Text
                                    style={{
                                        fontSize: 13,
                                        fontWeight: "700",
                                        color: isActive ? colors.surface : colors.onSurface,
                                    }}
                                >
                                    {tab.label}
                                </Text>
                            </Pressable>
                        );
                    })}
                </ScrollView>

                {/* =====================================================
            DUE SOON (was "NEXT") -- documents get a 3-tier colored
            badge (see InfoRow/getDocumentUrgencyTier); maintenance
            keeps its plain "Soon" text, unchanged.
            ===================================================== */}

                {nextItems.length > 0 && (
                    <>
                        <SectionTitle
                            title="DUE SOON"
                            colors={colors}
                        />

                        <View
                            style={{
                                gap: spacing.sm,
                                marginBottom: spacing.xl,
                            }}
                        >
                            {nextItems.map((item) => (
                                <InfoRow
                                    key={item.id}
                                    {...item}
                                    colors={colors}
                                    radius={radius}
                                    spacing={spacing}
                                    onPress={() => handleNextItemPress(item)}
                                />
                            ))}
                        </View>
                    </>
                )}

                {/* =====================================================
            RECENT -- recorded today, nothing else. Same tab filter as
            above; once today ends these rows just reappear below in ALL,
            unlabeled, no special tag to remove.
            ===================================================== */}

                {recentItems.length > 0 && (
                    <>
                        <SectionTitle
                            title="RECENT (Today)"
                            colors={colors}
                            action={
                                recentItems.length > 5
                                    ? {
                                          label: recentExpanded ? "Show less" : "Show more",
                                          onPress: () => setRecentExpanded((v) => !v),
                                      }
                                    : undefined
                            }
                        />

                        <View
                            style={{
                                backgroundColor: "transparent",
                                borderWidth: 1,
                                borderColor: colors.border,
                                borderRadius: radius.sm,
                                overflow: "hidden",
                                marginBottom: spacing.md,
                            }}
                        >
                            {(recentExpanded ? recentItems : recentItems.slice(0, 5)).map((item, index, visible) => (
                                <RecentRow
                                    key={item.id}
                                    {...item}
                                    colors={colors}
                                    spacing={spacing}
                                    last={index === visible.length - 1}
                                    onPress={() => handleRecentItemPress(item)}
                                />
                            ))}
                        </View>

                        {recentItems.length > 5 ? (
                            <Pressable
                                testID="car-recent-show-more"
                                onPress={() => setRecentExpanded((v) => !v)}
                                style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 4,
                                    paddingVertical: spacing.sm,
                                    marginBottom: spacing.xl,
                                }}
                            >
                                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.onSurface }}>
                                    {recentExpanded ? "Show less" : `Show more (${recentItems.length - 5} more)`}
                                </Text>
                                <Ionicons
                                    name={recentExpanded ? "chevron-up" : "chevron-down"}
                                    size={13}
                                    color={colors.onSurfaceTertiary}
                                />
                            </Pressable>
                        ) : (
                            <View style={{ marginBottom: spacing.xl }} />
                        )}
                    </>
                )}

                {/* =====================================================
            ALL -- the rest of the last 7 days (not today), same tab
            filter, newest first. Anything older than a week doesn't
            appear here at all anymore -- it's moved on to History,
            reachable via the pill above; "Show more"/"Show less" below
            expands/collapses this section in place instead of navigating
            anywhere.
            ===================================================== */}

                {olderItems.length > 0 ? (
                    <>
                        <SectionTitle
                            title="ALL (Last week)"
                            colors={colors}
                            action={
                                olderItems.length > 5
                                    ? {
                                          label: allExpanded ? "Show less" : "Show more",
                                          onPress: () => setAllExpanded((v) => !v),
                                      }
                                    : undefined
                            }
                        />

                        <View
                            style={{
                                backgroundColor: "transparent",
                                borderWidth: 1,
                                borderColor: colors.border,
                                borderRadius: radius.sm,
                                overflow: "hidden",
                                marginBottom: spacing.md,
                            }}
                        >
                            {(allExpanded ? olderItems : olderItems.slice(0, 5)).map((item, index, visible) => (
                                <RecentRow
                                    key={item.id}
                                    {...item}
                                    colors={colors}
                                    spacing={spacing}
                                    last={index === visible.length - 1}
                                    onPress={() => handleRecentItemPress(item)}
                                />
                            ))}
                        </View>

                        {olderItems.length > 5 ? (
                            <Pressable
                                testID="car-all-show-more"
                                onPress={() => setAllExpanded((v) => !v)}
                                style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 4,
                                    paddingVertical: spacing.sm,
                                    marginBottom: spacing.xl,
                                }}
                            >
                                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.onSurface }}>
                                    {allExpanded ? "Show less" : `Show more (${olderItems.length - 5} more)`}
                                </Text>
                                <Ionicons
                                    name={allExpanded ? "chevron-up" : "chevron-down"}
                                    size={13}
                                    color={colors.onSurfaceTertiary}
                                />
                            </Pressable>
                        ) : (
                            <View style={{ marginBottom: spacing.xl }} />
                        )}
                    </>
                ) : recentItems.length === 0 ? (
                    <View style={{ alignItems: "center", paddingVertical: spacing.xl, gap: spacing.sm }}>
                        <Ionicons name={hasOlderThanWeek ? "time-outline" : "file-tray-outline"} size={26} color={colors.onSurfaceTertiary} />
                        <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, textAlign: "center" }}>
                            {hasOlderThanWeek
                                ? `Nothing in the last 7 days${activeTab === "all" ? "" : ` for ${CATEGORY_TABS.find((t) => t.key === activeTab)?.label.toLowerCase()}`}.`
                                : activeTab === "all"
                                    ? "Nothing recorded yet."
                                    : `No ${CATEGORY_TABS.find((t) => t.key === activeTab)?.label.toLowerCase()} recorded yet.`}
                        </Text>
                        {hasOlderThanWeek ? (
                            <Pressable testID="car-empty-see-history" onPress={() => openHistoryFor(activeTab)} hitSlop={8}>
                                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.onSurface }}>
                                    See History
                                </Text>
                            </Pressable>
                        ) : null}
                    </View>
                ) : null}

            </ScrollView>
        </>
    );
}

/* ============================================================
   SECTION TITLE
   ============================================================ */

function SectionTitle({
    title,
    colors,
    action,
}: {
    title: string;
    colors: any;
    /** Optional shortcut shown on the opposite side of the title (e.g.
     * "Show more"/"Show less" for RECENT/ALL) -- stays put regardless of
     * expanded state, so collapsing back to 5 never requires scrolling
     * down to find the (expand-only) link at the bottom of the list. */
    action?: { label: string; onPress: () => void };
}) {
    if (!action) {
        return (
            <Text
                style={{
                    fontSize: 12,
                    fontWeight: "800",
                    letterSpacing: 1,
                    color: colors.onSurfaceTertiary,
                    marginBottom: 10,
                }}
            >
                {title}
            </Text>
        );
    }

    return (
        <View
            style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
            }}
        >
            <Text
                style={{
                    fontSize: 12,
                    fontWeight: "800",
                    letterSpacing: 1,
                    color: colors.onSurfaceTertiary,
                }}
            >
                {title}
            </Text>

            <Pressable
                onPress={action.onPress}
                hitSlop={8}
                style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
            >
                <Text style={{ fontSize: 11, fontWeight: "700", color: colors.onSurface }}>
                    {action.label}
                </Text>
                <Ionicons
                    name={action.label === "Show less" ? "chevron-up" : "chevron-down"}
                    size={11}
                    color={colors.onSurfaceTertiary}
                />
            </Pressable>
        </View>
    );
}

/* ============================================================
   STAT CARD
   ============================================================ */

function StatCard({
    icon,
    value,
    label,
    suffix,
    onPress,
    testID,
    colors,
    radius,
    spacing,
}: CarStat & {
    colors: any;
    radius: any;
    spacing: any;
}) {
    const Container = onPress ? Pressable : View;

    return (
        <Container
            testID={testID}
            onPress={onPress}
            accessibilityRole={onPress ? "button" : undefined}
            style={{
                flex: 1,
                minHeight: 110,
                padding: spacing.lg,
                backgroundColor: "transparent",
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: radius.sm,
                justifyContent: "space-between",
            }}
        >
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Ionicons
                    name={icon}
                    size={19}
                    color={colors.onSurfaceTertiary}
                />

                {onPress ? (
                    <Ionicons
                        name="chevron-forward"
                        size={16}
                        color={colors.onSurfaceTertiary}
                    />
                ) : null}
            </View>

            <View>
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "baseline",
                        gap: 4,
                    }}
                >
                    <Text
                        style={{
                            fontSize: 22,
                            fontWeight: "800",
                            color: colors.onSurface,
                            letterSpacing: -0.4,
                        }}
                    >
                        {value}
                    </Text>

                    {suffix ? (
                        <Text
                            style={{
                                fontSize: 11,
                                fontWeight: "600",
                                color: colors.onSurfaceTertiary,
                            }}
                        >
                            {suffix}
                        </Text>
                    ) : null}
                </View>

                <Text
                    style={{
                        marginTop: 2,
                        fontSize: 12,
                        color: colors.onSurfaceTertiary,
                    }}
                >
                    {label}
                </Text>
            </View>
        </Container>
    );
}

/* ============================================================
   NEXT / INFO ROW
   ============================================================ */

// Documents only -- maps a severity tier to the app's theme tokens (see
// lib/theme.tsx): 45-31 days left = caution (yellow), 30-16 = warning
// (orange), 15-0 = error (red). `warning`/`error` are the same tokens
// used everywhere else in the app; `caution` exists only for this tier.
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
    colors,
    radius,
    spacing,
    onPress,
}: CarNextItem & {
    colors: any;
    radius: any;
    spacing: any;
    onPress?: () => void;
}) {
    return (
        <Pressable
            onPress={onPress}
            style={{
                backgroundColor: "transparent",
                borderRadius: radius.sm,
                padding: spacing.lg,
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
                borderWidth: 1,
                borderColor: urgencyTier ? tierColor(urgencyTier, colors) : colors.border,
            }}
        >
            <View
                style={{
                    width: 42,
                    height: 42,
                    borderRadius: radius.md,
                    // Same tinted-chip recipe as Quick Actions/the header
                    // avatar -- this icon identifies which entry TYPE is
                    // due soon, the same signal those already carry in
                    // blue; the urgency itself is conveyed separately by
                    // this row's own border color (tierColor, above), not
                    // by this icon, so the two meanings don't collide.
                    backgroundColor: `${SPACE_IDENTITY_COLORS.car}1A`,
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                <Ionicons
                    name={icon}
                    size={20}
                    color={SPACE_IDENTITY_COLORS.car}
                />
            </View>

            <View style={{ flex: 1 }}>
                <Text
                    style={{
                        fontSize: 15,
                        fontWeight: "700",
                        color: colors.onSurface,
                    }}
                >
                    {title}
                </Text>

                <Text
                    style={{
                        marginTop: 3,
                        fontSize: 12,
                        color: colors.onSurfaceTertiary,
                    }}
                >
                    {subtitle}
                </Text>
            </View>

            {urgencyTier ? (
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 5,
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: radius.pill,
                        backgroundColor: `${tierColor(urgencyTier, colors)}22`,
                    }}
                >
                    {overdue ? (
                        <View
                            style={{
                                width: 12,
                                height: 12,
                                borderRadius: 6,
                                backgroundColor: tierColor(urgencyTier, colors),
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            <Text style={{ fontSize: 9, fontWeight: "900", color: colors.surface, lineHeight: 11 }}>
                                !
                            </Text>
                        </View>
                    ) : (
                        <View
                            style={{
                                width: 6,
                                height: 6,
                                borderRadius: 3,
                                backgroundColor: tierColor(urgencyTier, colors),
                            }}
                        />
                    )}
                    <Text
                        style={{
                            fontSize: 11.5,
                            fontWeight: "800",
                            color: tierColor(urgencyTier, colors),
                        }}
                    >
                        {right}
                    </Text>
                </View>
            ) : (
                <Text
                    style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color: colors.onSurfaceTertiary,
                    }}
                >
                    {right}
                </Text>
            )}

            {onPress ? (
                <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceTertiary} />
            ) : null}
        </Pressable>
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
    last = false,
    onPress,
}: CarRecentItem & {
    colors: any;
    spacing: any;
    last?: boolean;
    onPress?: () => void;
}) {
    // All 4 categories are editable now -- see openEntryForEdit above.
    const isEditable = true;

    return (
        <Pressable
            onPress={isEditable ? onPress : undefined}
            disabled={!isEditable}
            style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
                gap: spacing.md,
                borderBottomWidth: last
                    ? 0
                    : StyleSheet.hairlineWidth,
                borderBottomColor: colors.border,
            }}
        >
            <View style={{ position: "relative" }}>
                {/* This icon means "this row is a Fuel/Maintenance/
                    Document/Expense entry" -- the same identity signal
                    Quick Actions' own icons already carry in this Space's
                    blue, just previously left neutral here instead of
                    matching. Not a state or navigation signal (those stay
                    neutral, see chevron-forward below), so extending
                    identity color here doesn't cross back into the
                    "active state" territory ruled out earlier. */}
                <Ionicons
                    name={icon}
                    size={20}
                    color={SPACE_IDENTITY_COLORS.car}
                />

                {statusDot && overdue ? (
                    <View
                        style={{
                            position: "absolute",
                            right: -4,
                            bottom: -4,
                            width: 13,
                            height: 13,
                            borderRadius: 6.5,
                            backgroundColor: statusDotColor(statusDot, colors),
                            borderWidth: 1.5,
                            borderColor: colors.surface,
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <Text style={{ fontSize: 9, fontWeight: "900", color: colors.surface, lineHeight: 11 }}>
                            !
                        </Text>
                    </View>
                ) : statusDot ? (
                    <View
                        style={{
                            position: "absolute",
                            right: -2,
                            bottom: -2,
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: statusDotColor(statusDot, colors),
                            // Matches this row's actual backdrop (the page
                            // background -- the wrapping RECENT/ALL card
                            // is a hairline-bordered, unfilled section now)
                            // so the dot reads as "cut into" it, not floating.
                            borderWidth: 1.5,
                            borderColor: colors.surface,
                        }}
                    />
                ) : null}
            </View>

            <View style={{ flex: 1 }}>
                <Text
                    style={{
                        fontSize: 14,
                        fontWeight: "600",
                        color: colors.onSurface,
                    }}
                >
                    {title}
                </Text>

                <Text
                    style={{
                        marginTop: 2,
                        fontSize: 12,
                        color: colors.onSurfaceTertiary,
                    }}
                >
                    {subtitle}
                </Text>
            </View>

            {amount ? (
                <Text
                    style={{
                        fontSize: 14,
                        fontWeight: "700",
                        color: colors.onSurface,
                    }}
                >
                    {amount}
                </Text>
            ) : null}

            {isEditable ? (
                <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={colors.onSurfaceTertiary}
                />
            ) : null}
        </Pressable>
    );
}


/* ============================================================
   HELPERS
   ============================================================ */