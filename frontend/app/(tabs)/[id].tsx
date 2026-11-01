import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { consumeTrailReturn } from "@/lib/navigation/returnTrail";
import { useRecordAction } from "@/lib/navigation/recordAction";
import {
  View,
  ActivityIndicator,
  DeviceEventEmitter,
} from "react-native";
import {
  useLocalSearchParams,
  useRouter,
  useFocusEffect,
} from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { confirmAction, notifyAction } from "@/lib/confirm";
import CarDashboard from "@/components/spaces/car/CarDashboard";

import { initialCarData } from "@/components/spaces/car/car.mock";
import type { CarData } from "@/components/spaces/car/car.data.types";

import type {
  CarDocumentEntry,
  CarExpenseEntry,
  CarFuelEntry,
  CarMaintenanceEntry,
} from "@/lib/spaces/car/car.types";

import HomeDashboard from "@/components/spaces/home/HomeDashboard";
import { initialHomeData } from "@/components/spaces/home/home.mock";
import type { HomeData } from "@/components/spaces/home/home.data.types";
import type {
  HomeDocumentEntry,
  HomeExpenseEntry,
  HomeMaintenanceEntry,
  HomeRecurringEntry,
  HomeSupplyEntry,
  HomeTaskEntry,
} from "@/lib/spaces/home/home.types";
import {
  loadHomeItems,
  documentEntryToItemBody as homeDocumentEntryToItemBody,
  expenseEntryToItemBody as homeExpenseEntryToItemBody,
  maintenanceEntryToItemBody as homeMaintenanceEntryToItemBody,
  recurringEntryToItemBody,
  supplyEntryToItemBody,
  taskEntryToItemBody,
} from "@/lib/spaces/home/homeItems";

import GroceryDashboard from "@/components/spaces/grocery/GroceryDashboard";

import ExpensesDashboard from "@/components/spaces/expenses/ExpensesDashboard";
import { initialExpensesData } from "@/components/spaces/expenses/expenses.mock";
import type { ExpensesData } from "@/components/spaces/expenses/expenses.data.types";
import type { ExpenseEntry } from "@/lib/spaces/expenses/expenses.types";
import { expenseEntryToItemBody as expensesSpaceEntryToItemBody, loadExpenseItems } from "@/lib/spaces/expenses/expensesItems";

import { EditSpaceModal } from "@/components/spaces/EditSpaceModal";
import { CarProfileForm } from "@/components/spaces/car/CarProfileForm";
import { HomeProfileForm } from "@/components/spaces/home/HomeProfileForm";
import { SpaceThemeProvider } from "@/lib/spaces/spaceTheme";
import { useAppMode } from "@/lib/appMode";
import { SimpleSpaceScreen } from "@/components/simple/space/SimpleSpaceScreen";
import { ScreenBackground } from "@/components/ui/ScreenBackground";
import {
  profileFromSpace,
  detectSpaceType,
  type SpaceProfile,
  type CarProfile,
  type HomeProfile,
} from "@/lib/spaces/spaceProfile";
import {
  loadCarItems,
  isSavedItemId,
  fuelEntryToItemBody,
  maintenanceEntryToItemBody,
  documentEntryToItemBody,
  expenseEntryToItemBody,
  archiveDocumentEntry,
  archiveMaintenanceEntry,
} from "@/lib/spaces/car/carItems";
import {
  getCurrentOdometer,
  getDocumentStatus,
  getMaintenanceUrgency,
  isDocumentSuperseded,
  isMaintenanceSuperseded,
} from "@/lib/spaces/car/calculations/dashboard.calculations";

export default function SpaceDetail() {
  const { id, itemId, itemType, action, section } = useLocalSearchParams<{ id: string; itemId?: string; itemType?: string; action?: string; section?: string }>();

  const { spacing, colors } = useTheme();
  const router = useRouter();
  const { isSimple } = useAppMode();
  const recordAction = useRecordAction();

  const [carData, setCarData] = useState<CarData>(initialCarData);
  const [homeData, setHomeData] = useState<HomeData>(initialHomeData);
  const [expensesData, setExpensesData] = useState<ExpensesData>(initialExpensesData);
  // Calendar purchases the Cheltuieli space lists read-only (spent and,
  // this month, planned) -- see api.calendarPurchases.
  const [calendarPurchases, setCalendarPurchases] = useState<ExpenseEntry[]>([]);
  const [space, setSpace] = useState<any>(null);
  const [profile, setProfile] = useState<SpaceProfile | null>(null);
  const [loading, setLoading] = useState(true);
  // Bumped every time this screen regains focus (see the existing
  // "RELOAD WHEN SCREEN GETS FOCUS" useFocusEffect below) -- folded
  // into each Dashboard's own `key` prop further down so navigating
  // away (Spaces tab, another tab, anywhere) and back always remounts
  // it fresh. Without this, re-selecting the SAME space from Spaces
  // left every internal "which sub-view am I on" flag (activeCategory,
  // tasksPageVisible, ...) exactly as the user left it instead of
  // resetting to the main dashboard -- this screen never unmounts
  // between visits, so nothing else ever cleared that state. Also
  // fixes the same gap for switching between two DIFFERENT spaces of
  // the same kind (two Car spaces, ...): only GroceryDashboard had any
  // remount protection before (`key={space.id}`), and even that alone
  // doesn't help re-entering the identical space, since `space.id`
  // doesn't change then.
  const [visitId, setVisitId] = useState(0);

  // Reset synchronously, during render, the moment the route's `id`
  // changes to a DIFFERENT space -- not in an effect, which would still
  // let one stale frame (the previous space's data, now paired with the
  // new id) paint before the reset caught up. This is what made
  // switching between two spaces of the same kind (two Car spaces, two
  // Expenses spaces, ...) briefly show the space you came FROM: this
  // screen never unmounts between them, so carData/homeData/expensesData
  // kept whatever they last held until load() below finished refetching.
  // Setting `loading` back to true routes through the existing spinner
  // branch below instead of ever rendering a dashboard with mismatched
  // data.
  const [loadedForId, setLoadedForId] = useState(id);
  if (id !== loadedForId) {
    setLoadedForId(id);
    setLoading(true);
    setSpace(null);
    setProfile(null);
    setCarData(initialCarData);
    setHomeData(initialHomeData);
    setExpensesData(initialExpensesData);
    setCalendarPurchases([]);
  }

  /*
   * The 4 handlers below used to be pure local-state updates (setCarData),
   * which is exactly why nothing survived a refresh -- there was no API
   * call anywhere in here. Each now: (1) applies the change to carData
   * immediately so the UI doesn't wait on the network, (2) saves it via
   * the generic Items API (see lib/spaces/car/carItems.ts -- create for a
   * fresh client-generated id like "fuel-171...", update for an id that's
   * already a real saved item's numeric id), (3) swaps the client-side
   * entry for the server-confirmed one (real id) once the request returns,
   * so editing it again in the same session updates instead of duplicating.
   * On failure the optimistic entry is rolled back and the user is told --
   * silently pretending it saved would be worse than the bug this fixes.
   */

  const handleFuelSave = async (entry: CarFuelEntry) => {
    const previous = carData.fuelEntries.find((e) => e.id === entry.id);
    const isExisting = !!previous;

    setCarData((current) => ({
      ...current,
      fuelEntries: isExisting
        ? current.fuelEntries.map((e) => (e.id === entry.id ? entry : e))
        : [entry, ...current.fuelEntries],
    }));

    try {
      const body = fuelEntryToItemBody(space.id, entry);
      const saved = isSavedItemId(entry.id)
        ? await api.updateItem(entry.id, body)
        : await api.createItem(body);

      const savedEntry: CarFuelEntry = { ...entry, id: String(saved.id) };
      setCarData((current) => ({
        ...current,
        fuelEntries: current.fuelEntries.map((e) =>
          e.id === entry.id ? savedEntry : e,
        ),
      }));
      recordAction?.complete();
    } catch (error: any) {
      setCarData((current) => ({
        ...current,
        fuelEntries: isExisting
          ? current.fuelEntries.map((e) => (e.id === entry.id ? previous! : e))
          : current.fuelEntries.filter((e) => e.id !== entry.id),
      }));
      notifyAction("Nu am putut salva alimentarea", error?.message || "A apărut o eroare.");
      if (recordAction) throw error;
    }
  };

  const handleMaintenanceSave = async (entry: CarMaintenanceEntry) => {
    const previous = carData.maintenanceEntries.find((e) => e.id === entry.id);
    const isExisting = !!previous;

    setCarData((current) => ({
      ...current,
      maintenanceEntries: isExisting
        ? current.maintenanceEntries.map((e) => (e.id === entry.id ? entry : e))
        : [entry, ...current.maintenanceEntries],
    }));

    try {
      const body = maintenanceEntryToItemBody(space.id, entry);
      const saved = isSavedItemId(entry.id)
        ? await api.updateItem(entry.id, body)
        : await api.createItem(body);

      const savedEntry: CarMaintenanceEntry = { ...entry, id: String(saved.id) };
      setCarData((current) => ({
        ...current,
        maintenanceEntries: current.maintenanceEntries.map((e) =>
          e.id === entry.id ? savedEntry : e,
        ),
      }));

      // A brand-new entry with renewedFromId set came from the "renew"
      // flow (see CarDashboard.tsx's handleNextItemPress). Same reasoning
      // as handleDocumentSave's matching block below: don't yank the old
      // entry out of the dashboard while it's still genuinely due later
      // (by km AND by date, whichever applies) -- only archive right away
      // if it had already passed its own trigger by the time this
      // renewal was saved. Otherwise leave it active; the sweep effect
      // near the bottom of this component archives it for real once it
      // actually becomes overdue. Only on create: an edit of an already-
      // renewed entry shouldn't re-trigger this.
      if (!isExisting && entry.renewedFromId) {
        const oldId = entry.renewedFromId;
        const oldEntry = carData.maintenanceEntries.find((e) => e.id === oldId);
        const alreadyOverdue =
          !!oldEntry && getMaintenanceUrgency(oldEntry, getCurrentOdometer(carData)).overdue;

        if (alreadyOverdue) {
          setCarData((current) => ({
            ...current,
            maintenanceEntries: current.maintenanceEntries.map((e) =>
              e.id === oldId ? { ...e, archived: true } : e,
            ),
          }));
          archiveMaintenanceEntry(oldId).catch((error: any) => {
            // The new entry is already saved -- worth surfacing, but not
            // worth rolling anything back over.
            notifyAction(
              "Renewed, dar arhivarea a eșuat",
              error?.message || "Vechea intervenție tot apare ca activă.",
            );
          });
        }
      }
      recordAction?.complete();
    } catch (error: any) {
      setCarData((current) => ({
        ...current,
        maintenanceEntries: isExisting
          ? current.maintenanceEntries.map((e) => (e.id === entry.id ? previous! : e))
          : current.maintenanceEntries.filter((e) => e.id !== entry.id),
      }));
      if (recordAction) throw error;
      notifyAction("Nu am putut salva intervenția", error?.message || "A apărut o eroare.");
    }
  };

  const handleDocumentSave = async (entry: CarDocumentEntry) => {
    const previous = carData.documentEntries.find((e) => e.id === entry.id);
    const isExisting = !!previous;

    setCarData((current) => ({
      ...current,
      documentEntries: isExisting
        ? current.documentEntries.map((e) => (e.id === entry.id ? entry : e))
        : [entry, ...current.documentEntries],
    }));

    try {
      const body = documentEntryToItemBody(space.id, entry);
      const saved = isSavedItemId(entry.id)
        ? await api.updateItem(entry.id, body)
        : await api.createItem(body);

      const savedEntry: CarDocumentEntry = { ...entry, id: String(saved.id) };
      setCarData((current) => ({
        ...current,
        documentEntries: current.documentEntries.map((e) =>
          e.id === entry.id ? savedEntry : e,
        ),
      }));

      // Unlike maintenance, a document renewal shouldn't yank the old
      // entry out of the dashboard the instant it's replaced -- an RCA
      // renewed 10 days early is still genuinely valid for those 10 days.
      // Only archive right away if it had *already* expired by the time
      // this renewal was saved (a late renewal); otherwise leave it
      // active -- it already drops off the NEXT alert via
      // isDocumentSuperseded (date-based, see dashboard.calculations.ts)
      // -- and let the sweep effect below archive it for real once its
      // own expiryDate actually passes.
      if (!isExisting && entry.renewedFromId) {
        const oldId = entry.renewedFromId;
        const oldEntry = carData.documentEntries.find((e) => e.id === oldId);
        const alreadyExpired =
          !!oldEntry && getDocumentStatus(oldEntry).status === "expired";

        if (alreadyExpired) {
          setCarData((current) => ({
            ...current,
            documentEntries: current.documentEntries.map((e) =>
              e.id === oldId ? { ...e, archived: true } : e,
            ),
          }));
          archiveDocumentEntry(oldId).catch((error: any) => {
            notifyAction(
              "Renewed, dar arhivarea a eșuat",
              error?.message || "Vechiul document tot apare ca activ.",
            );
          });
        }
      }
      recordAction?.complete();
    } catch (error: any) {
      setCarData((current) => ({
        ...current,
        documentEntries: isExisting
          ? current.documentEntries.map((e) => (e.id === entry.id ? previous! : e))
          : current.documentEntries.filter((e) => e.id !== entry.id),
      }));
      throw error;
    }
  };

  const handleExpenseSave = async (entry: CarExpenseEntry) => {
    const previous = carData.expenseEntries.find((e) => e.id === entry.id);
    const isExisting = !!previous;

    setCarData((current) => ({
      ...current,
      expenseEntries: isExisting
        ? current.expenseEntries.map((e) => (e.id === entry.id ? entry : e))
        : [entry, ...current.expenseEntries],
    }));

    try {
      const body = expenseEntryToItemBody(space.id, entry);
      const saved = isSavedItemId(entry.id)
        ? await api.updateItem(entry.id, body)
        : await api.createItem(body);

      const savedEntry: CarExpenseEntry = { ...entry, id: String(saved.id) };
      setCarData((current) => ({
        ...current,
        expenseEntries: current.expenseEntries.map((e) =>
          e.id === entry.id ? savedEntry : e,
        ),
      }));
      recordAction?.complete();
    } catch (error: any) {
      setCarData((current) => ({
        ...current,
        expenseEntries: isExisting
          ? current.expenseEntries.map((e) => (e.id === entry.id ? previous! : e))
          : current.expenseEntries.filter((e) => e.id !== entry.id),
      }));
      notifyAction("Nu am putut salva cheltuiala", error?.message || "A apărut o eroare.");
      if (recordAction) throw error;
    }
  };

  /*
   * Any of the 4 categories can be deleted now -- each just removes its
   * own entry from carData optimistically, then deletes the matching
   * item on the server (skipped for a client-only id that was never
   * actually saved, e.g. the user opened a fresh form and deleted before
   * the create request finished -- isSavedItemId guards that). On failure
   * the entry is restored so a network hiccup can't silently make
   * something vanish from the UI while still sitting in the database.
   */

  const handleFuelDelete = async (id: string) => {
    const removed = carData.fuelEntries.find((e) => e.id === id);
    setCarData((current) => ({
      ...current,
      fuelEntries: current.fuelEntries.filter((e) => e.id !== id),
    }));

    if (!isSavedItemId(id)) return;

    try {
      await api.deleteItem(id);
      recordAction?.complete();
    } catch (error: any) {
      if (removed) {
        setCarData((current) => ({
          ...current,
          fuelEntries: [removed, ...current.fuelEntries],
        }));
      }
      notifyAction("Nu am putut șterge alimentarea", error?.message || "A apărut o eroare.");
      if (recordAction) throw error;
    }
  };

  const handleMaintenanceDelete = async (id: string) => {
    const removed = carData.maintenanceEntries.find((e) => e.id === id);
    setCarData((current) => ({
      ...current,
      maintenanceEntries: current.maintenanceEntries.filter((e) => e.id !== id),
    }));

    if (!isSavedItemId(id)) return;

    try {
      await api.deleteItem(id);
      recordAction?.complete();
    } catch (error: any) {
      if (removed) {
        setCarData((current) => ({
          ...current,
          maintenanceEntries: [removed, ...current.maintenanceEntries],
        }));
      }
      if (recordAction) throw error;
      notifyAction("Nu am putut șterge intervenția", error?.message || "A apărut o eroare.");
    }
  };

  const handleDocumentDelete = async (id: string) => {
    const removed = carData.documentEntries.find((e) => e.id === id);
    setCarData((current) => ({
      ...current,
      documentEntries: current.documentEntries.filter((e) => e.id !== id),
    }));

    if (!isSavedItemId(id)) return;

    try {
      await api.deleteItem(id);
      recordAction?.complete();
    } catch (error: any) {
      if (removed) {
        setCarData((current) => ({
          ...current,
          documentEntries: [removed, ...current.documentEntries],
        }));
      }
      if (recordAction) throw error;
      notifyAction("Nu am putut șterge documentul", error?.message || "A apărut o eroare.");
    }
  };

  const handleExpenseDelete = async (id: string) => {
    const removed = carData.expenseEntries.find((e) => e.id === id);
    setCarData((current) => ({
      ...current,
      expenseEntries: current.expenseEntries.filter((e) => e.id !== id),
    }));

    if (!isSavedItemId(id)) return;

    try {
      await api.deleteItem(id);
      recordAction?.complete();
    } catch (error: any) {
      if (removed) {
        setCarData((current) => ({
          ...current,
          expenseEntries: [removed, ...current.expenseEntries],
        }));
      }
      notifyAction("Nu am putut șterge cheltuiala", error?.message || "A apărut o eroare.");
      if (recordAction) throw error;
    }
  };

  /*
   * Home's 5 categories, same optimistic-update -> API call -> reconcile
   * real id pattern as Car's handlers above (no renewal/archive sweep --
   * Home's entries don't have that concept). One save + one delete
   * function per category, passed down to HomeDashboard as props.
   */

  const handleHomeDocumentSave = async (entry: HomeDocumentEntry) => {
    const previous = homeData.documentEntries.find((e) => e.id === entry.id);
    const isExisting = !!previous;
    setHomeData((current) => ({
      ...current,
      documentEntries: isExisting
        ? current.documentEntries.map((e) => (e.id === entry.id ? entry : e))
        : [entry, ...current.documentEntries],
    }));

    try {
      const body = homeDocumentEntryToItemBody(space.id, entry);
      const saved = isSavedItemId(entry.id)
        ? await api.updateItem(entry.id, body)
        : await api.createItem(body);
      const savedEntry: HomeDocumentEntry = { ...entry, id: String(saved.id) };
      setHomeData((current) => ({
        ...current,
        documentEntries: current.documentEntries.map((e) => (e.id === entry.id ? savedEntry : e)),
      }));
      recordAction?.complete();
    } catch (error: any) {
      setHomeData((current) => ({
        ...current,
        documentEntries: isExisting
          ? current.documentEntries.map((e) => (e.id === entry.id ? previous! : e))
          : current.documentEntries.filter((e) => e.id !== entry.id),
      }));
      if (recordAction) throw error;
      notifyAction("Nu am putut salva documentul", error?.message || "A apărut o eroare.");
    }
  };

  const handleHomeDocumentDelete = async (id: string) => {
    const removed = homeData.documentEntries.find((e) => e.id === id);
    setHomeData((current) => ({
      ...current,
      documentEntries: current.documentEntries.filter((e) => e.id !== id),
    }));
    if (!isSavedItemId(id)) return;
    try {
      await api.deleteItem(id);
      recordAction?.complete();
    } catch (error: any) {
      if (removed) {
        setHomeData((current) => ({ ...current, documentEntries: [removed, ...current.documentEntries] }));
      }
      if (recordAction) throw error;
      notifyAction("Nu am putut șterge documentul", error?.message || "A apărut o eroare.");
    }
  };

  const handleHomeExpenseSave = async (entry: HomeExpenseEntry) => {
    const previous = homeData.expenseEntries.find((e) => e.id === entry.id);
    const isExisting = !!previous;
    setHomeData((current) => ({
      ...current,
      expenseEntries: isExisting
        ? current.expenseEntries.map((e) => (e.id === entry.id ? entry : e))
        : [entry, ...current.expenseEntries],
    }));

    try {
      const body = homeExpenseEntryToItemBody(space.id, entry);
      const saved = isSavedItemId(entry.id)
        ? await api.updateItem(entry.id, body)
        : await api.createItem(body);
      const savedEntry: HomeExpenseEntry = { ...entry, id: String(saved.id) };
      setHomeData((current) => ({
        ...current,
        expenseEntries: current.expenseEntries.map((e) => (e.id === entry.id ? savedEntry : e)),
      }));
      recordAction?.complete();
    } catch (error: any) {
      setHomeData((current) => ({
        ...current,
        expenseEntries: isExisting
          ? current.expenseEntries.map((e) => (e.id === entry.id ? previous! : e))
          : current.expenseEntries.filter((e) => e.id !== entry.id),
      }));
      notifyAction("Nu am putut salva cheltuiala", error?.message || "A apărut o eroare.");
      if (recordAction) throw error;
    }
  };

  const handleHomeExpenseDelete = async (id: string) => {
    const removed = homeData.expenseEntries.find((e) => e.id === id);
    setHomeData((current) => ({
      ...current,
      expenseEntries: current.expenseEntries.filter((e) => e.id !== id),
    }));
    if (!isSavedItemId(id)) return;
    try {
      await api.deleteItem(id);
      recordAction?.complete();
    } catch (error: any) {
      if (removed) {
        setHomeData((current) => ({ ...current, expenseEntries: [removed, ...current.expenseEntries] }));
      }
      notifyAction("Nu am putut șterge cheltuiala", error?.message || "A apărut o eroare.");
      if (recordAction) throw error;
    }
  };

  // The dedicated Expenses space's own entries -- same optimistic
  // save/rollback shape as every handler above, just against
  // expensesData instead of homeData/carData.
  const handleExpenseEntrySave = async (entry: ExpenseEntry) => {
    const previous = expensesData.entries.find((e) => e.id === entry.id);
    const isExisting = !!previous;
    setExpensesData((current) => ({
      entries: isExisting
        ? current.entries.map((e) => (e.id === entry.id ? entry : e))
        : [entry, ...current.entries],
    }));

    try {
      const body = expensesSpaceEntryToItemBody(space.id, entry);
      const saved = isSavedItemId(entry.id)
        ? await api.updateItem(entry.id, body)
        : await api.createItem(body);
      const savedEntry: ExpenseEntry = { ...entry, id: String(saved.id) };
      setExpensesData((current) => ({
        entries: current.entries.map((e) => (e.id === entry.id ? savedEntry : e)),
      }));
      recordAction?.complete();
    } catch (error: any) {
      setExpensesData((current) => ({
        entries: isExisting
          ? current.entries.map((e) => (e.id === entry.id ? previous! : e))
          : current.entries.filter((e) => e.id !== entry.id),
      }));
      notifyAction("Nu am putut salva cheltuiala", error?.message || "A apărut o eroare.");
      // A new entry comes from ExpensesAddBar, which keeps the typed fields only if this rejects.
      if (recordAction || !isExisting) throw error;
    }
  };

  const handleExpenseEntryDelete = async (id: string) => {
    const removed = expensesData.entries.find((e) => e.id === id);
    setExpensesData((current) => ({ entries: current.entries.filter((e) => e.id !== id) }));

    if (!isSavedItemId(id)) return;
    try {
      await api.deleteItem(id);
      recordAction?.complete();
    } catch (error: any) {
      if (removed) {
        setExpensesData((current) => ({ entries: [removed, ...current.entries] }));
      }
      notifyAction("Nu am putut șterge cheltuiala", error?.message || "A apărut o eroare.");
      if (recordAction) throw error;
    }
  };

  const handleHomeMaintenanceSave = async (entry: HomeMaintenanceEntry) => {
    const previous = homeData.maintenanceEntries.find((e) => e.id === entry.id);
    const isExisting = !!previous;
    setHomeData((current) => ({
      ...current,
      maintenanceEntries: isExisting
        ? current.maintenanceEntries.map((e) => (e.id === entry.id ? entry : e))
        : [entry, ...current.maintenanceEntries],
    }));

    try {
      const body = homeMaintenanceEntryToItemBody(space.id, entry);
      const saved = isSavedItemId(entry.id)
        ? await api.updateItem(entry.id, body)
        : await api.createItem(body);
      const savedEntry: HomeMaintenanceEntry = { ...entry, id: String(saved.id) };
      setHomeData((current) => ({
        ...current,
        maintenanceEntries: current.maintenanceEntries.map((e) => (e.id === entry.id ? savedEntry : e)),
      }));
      recordAction?.complete();
    } catch (error: any) {
      setHomeData((current) => ({
        ...current,
        maintenanceEntries: isExisting
          ? current.maintenanceEntries.map((e) => (e.id === entry.id ? previous! : e))
          : current.maintenanceEntries.filter((e) => e.id !== entry.id),
      }));
      if (recordAction) throw error;
      notifyAction("Nu am putut salva intervenția", error?.message || "A apărut o eroare.");
    }
  };

  const handleHomeMaintenanceDelete = async (id: string) => {
    const removed = homeData.maintenanceEntries.find((e) => e.id === id);
    setHomeData((current) => ({
      ...current,
      maintenanceEntries: current.maintenanceEntries.filter((e) => e.id !== id),
    }));
    if (!isSavedItemId(id)) return;
    try {
      await api.deleteItem(id);
      recordAction?.complete();
    } catch (error: any) {
      if (removed) {
        setHomeData((current) => ({ ...current, maintenanceEntries: [removed, ...current.maintenanceEntries] }));
      }
      if (recordAction) throw error;
      notifyAction("Nu am putut șterge intervenția", error?.message || "A apărut o eroare.");
    }
  };

  const handleHomeRecurringSave = async (entry: HomeRecurringEntry) => {
    const previous = homeData.recurringEntries.find((e) => e.id === entry.id);
    const isExisting = !!previous;
    setHomeData((current) => ({
      ...current,
      recurringEntries: isExisting
        ? current.recurringEntries.map((e) => (e.id === entry.id ? entry : e))
        : [entry, ...current.recurringEntries],
    }));

    try {
      const body = recurringEntryToItemBody(space.id, entry);
      const saved = isSavedItemId(entry.id)
        ? await api.updateItem(entry.id, body)
        : await api.createItem(body);
      const savedEntry: HomeRecurringEntry = { ...entry, id: String(saved.id) };
      setHomeData((current) => ({
        ...current,
        recurringEntries: current.recurringEntries.map((e) => (e.id === entry.id ? savedEntry : e)),
      }));
      recordAction?.complete();
    } catch (error: any) {
      setHomeData((current) => ({
        ...current,
        recurringEntries: isExisting
          ? current.recurringEntries.map((e) => (e.id === entry.id ? previous! : e))
          : current.recurringEntries.filter((e) => e.id !== entry.id),
      }));
      if (recordAction) throw error;
      notifyAction("Nu am putut salva plata recurentă", error?.message || "A apărut o eroare.");
    }
  };

  const handleHomeRecurringDelete = async (id: string) => {
    const removed = homeData.recurringEntries.find((e) => e.id === id);
    setHomeData((current) => ({
      ...current,
      recurringEntries: current.recurringEntries.filter((e) => e.id !== id),
    }));
    if (!isSavedItemId(id)) return;
    try {
      await api.deleteItem(id);
      recordAction?.complete();
    } catch (error: any) {
      if (removed) {
        setHomeData((current) => ({ ...current, recurringEntries: [removed, ...current.recurringEntries] }));
      }
      if (recordAction) throw error;
      notifyAction("Nu am putut șterge plata recurentă", error?.message || "A apărut o eroare.");
    }
  };

  const handleHomeSupplySave = async (entry: HomeSupplyEntry) => {
    const previous = homeData.supplyEntries.find((e) => e.id === entry.id);
    const isExisting = !!previous;
    setHomeData((current) => ({
      ...current,
      supplyEntries: isExisting
        ? current.supplyEntries.map((e) => (e.id === entry.id ? entry : e))
        : [entry, ...current.supplyEntries],
    }));

    try {
      const body = supplyEntryToItemBody(space.id, entry);
      const saved = isSavedItemId(entry.id)
        ? await api.updateItem(entry.id, body)
        : await api.createItem(body);
      const savedEntry: HomeSupplyEntry = { ...entry, id: String(saved.id) };
      setHomeData((current) => ({
        ...current,
        supplyEntries: current.supplyEntries.map((e) => (e.id === entry.id ? savedEntry : e)),
      }));
      recordAction?.complete();
    } catch (error: any) {
      setHomeData((current) => ({
        ...current,
        supplyEntries: isExisting
          ? current.supplyEntries.map((e) => (e.id === entry.id ? previous! : e))
          : current.supplyEntries.filter((e) => e.id !== entry.id),
      }));
      notifyAction("Nu am putut salva proviziile", error?.message || "A apărut o eroare.");
      if (recordAction) throw error;
    }
  };

  const handleHomeSupplyDelete = async (id: string) => {
    const removed = homeData.supplyEntries.find((e) => e.id === id);
    setHomeData((current) => ({
      ...current,
      supplyEntries: current.supplyEntries.filter((e) => e.id !== id),
    }));
    if (!isSavedItemId(id)) return;
    try {
      await api.deleteItem(id);
      recordAction?.complete();
    } catch (error: any) {
      if (removed) {
        setHomeData((current) => ({ ...current, supplyEntries: [removed, ...current.supplyEntries] }));
      }
      notifyAction("Nu am putut șterge proviziile", error?.message || "A apărut o eroare.");
      if (recordAction) throw error;
    }
  };

  const handleHomeTaskSave = async (entry: HomeTaskEntry) => {
    // Snapshotted BEFORE the optimistic update -- on a failed save, an
    // existing entry (e.g. a checkbox resolve) needs to revert to
    // exactly this, not silently keep showing the optimistic (never
    // actually persisted) version. A failure here was previously
    // invisible beyond an easy-to-miss toast: the checkbox would look
    // resolved for the rest of this session, then quietly go back to
    // unresolved the next time this space's data reloads from the
    // server, which still has the old value.
    const previous = homeData.taskEntries.find((e) => e.id === entry.id);
    const isExisting = !!previous;
    setHomeData((current) => ({
      ...current,
      taskEntries: isExisting
        ? current.taskEntries.map((e) => (e.id === entry.id ? entry : e))
        : [entry, ...current.taskEntries],
    }));

    try {
      const body = taskEntryToItemBody(space.id, entry);
      const saved = isSavedItemId(entry.id)
        ? await api.updateItem(entry.id, body)
        : await api.createItem(body);
      const savedEntry: HomeTaskEntry = { ...entry, id: String(saved.id) };
      setHomeData((current) => ({
        ...current,
        taskEntries: current.taskEntries.map((e) => (e.id === entry.id ? savedEntry : e)),
      }));
      recordAction?.complete();
    } catch (error: any) {
      setHomeData((current) => ({
        ...current,
        taskEntries: isExisting
          ? current.taskEntries.map((e) => (e.id === entry.id ? previous! : e))
          : current.taskEntries.filter((e) => e.id !== entry.id),
      }));
      if (recordAction) throw error;
      notifyAction("Nu am putut salva sarcina", error?.message || "A apărut o eroare.");
    }
  };

  const handleHomeTaskDelete = async (id: string) => {
    const removed = homeData.taskEntries.find((e) => e.id === id);
    setHomeData((current) => ({
      ...current,
      taskEntries: current.taskEntries.filter((e) => e.id !== id),
    }));
    if (!isSavedItemId(id)) return;
    try {
      await api.deleteItem(id);
      recordAction?.complete();
    } catch (error: any) {
      if (removed) {
        setHomeData((current) => ({ ...current, taskEntries: [removed, ...current.taskEntries] }));
      }
      if (recordAction) throw error;
      notifyAction("Nu am putut șterge sarcina", error?.message || "A apărut o eroare.");
    }
  };

  // Drag-reorder on HomeTasksPage's ALL section -- orderedIds is that
  // section's full set of ids in their new display order (see
  // getHomeTasksView's own manuallyOrdered/dateOrdered split, which
  // reads this same sortOrder back). Same snapshot-then-revert shape as
  // every other save/delete handler here.
  const handleHomeTaskReorder = async (orderedIds: string[]) => {
    const previous = homeData.taskEntries;
    const position = new Map(orderedIds.map((id, index) => [id, index]));
    setHomeData((current) => ({
      ...current,
      taskEntries: current.taskEntries.map((e) =>
        position.has(e.id) ? { ...e, sortOrder: position.get(e.id)! } : e,
      ),
    }));
    try {
      await api.reorderItems(orderedIds);
    } catch (error: any) {
      setHomeData((current) => ({ ...current, taskEntries: previous }));
      notifyAction("Nu am putut salva ordinea", error?.message || "A apărut o eroare.");
    }
  };

  /*
   * ==========================================================
   * LOAD SPACE
   * ==========================================================
   *
   * Important:
   *
   * Nu schimbăm API-ul existent.
   *
   * Continuăm să folosim:
   *
   *   api.getSpace(id)
   *
   * Exact ca înainte.
   */

  const load = useCallback(async () => {
    if (!id) return false;

    // A record link names its type (car_* / home_*), so that kind's items
    // can load alongside the space instead of after it -- one round trip
    // less before a resolve form opens (record-action overlay).
    const hint = itemType?.startsWith("car_") ? "car" : itemType?.startsWith("home_") ? "home" : null;
    const earlyCar = hint === "car" ? loadCarItems(id) : null;
    const earlyHome = hint === "home" ? loadHomeItems(id) : null;
    earlyCar?.catch(() => {});
    earlyHome?.catch(() => {});

    try {
      const result = await api.getSpace(id);

      console.log("================================");
      console.log("[SPACE DATA]");
      console.log("ID:", id);
      console.log("RESULT:", result);
      console.log("TYPE:", result?.type);
      console.log("SLUG:", result?.slug);
      console.log("KIND:", result?.kind);
      console.log("NAME:", result?.name);
      console.log("ICON:", result?.icon);
      console.log("================================");

      const loadedProfile = profileFromSpace(result);
      setSpace(result);
      setProfile(loadedProfile);

      // Fuel/Maintenance/Documents/Expenses entries live in the generic
      // `items` table now (see lib/spaces/car/carItems.ts for why) --
      // pull whatever's actually saved for this space instead of leaving
      // carData on its initial mock seed.
      if (detectSpaceType(result, loadedProfile) === "car") {
        try {
          const entries = await (earlyCar ?? loadCarItems(result.id));
          // The vehicle comes from THIS space's profile (no demo values):
          // mileage = the km typed on the top card (0 if never set), so
          // getCurrentOdometer = max(that, logged readings), and the
          // consumption math uses the real tank capacity.
          setCarData((current) => ({
            ...current,
            ...entries,
            vehicle: {
              ...initialCarData.vehicle,
              make: loadedProfile && "make" in loadedProfile ? loadedProfile.make : "",
              model: loadedProfile && "model" in loadedProfile ? loadedProfile.model : "",
              year: loadedProfile && "year" in loadedProfile ? Number(loadedProfile.year) || 0 : 0,
              tank_capacity_liters: loadedProfile && "tankCapacity" in loadedProfile ? Number(loadedProfile.tankCapacity) || 0 : 0,
              mileage: loadedProfile && "odometer" in loadedProfile ? Number(loadedProfile.odometer) || 0 : 0,
            },
          }));
        } catch (error) {
          console.error("[CAR ITEMS] failed to load:", error);
        }
      }

      // Same as Car above -- Home's 5 categories live in the generic
      // `items` table now too (see lib/spaces/home/homeItems.ts).
      if (detectSpaceType(result, loadedProfile) === "home") {
        try {
          const entries = await (earlyHome ?? loadHomeItems(result.id));
          setHomeData((current) => ({ ...current, ...entries }));
        } catch (error) {
          console.error("[HOME ITEMS] failed to load:", error);
        }
      }

      // Same as Car/Home above -- the Expenses space's entries live in
      // the generic `items` table now too (see
      // lib/spaces/expenses/expensesItems.ts). Used to be pure local
      // mock state that never left ExpensesDashboard's own useState.
      if (detectSpaceType(result, loadedProfile) === "expenses") {
        try {
          const entries = await loadExpenseItems(result.id);
          setExpensesData({ entries });
        } catch (error) {
          console.error("[EXPENSES ITEMS] failed to load:", error);
        }
        try {
          const r = await api.calendarPurchases();
          setCalendarPurchases(
            (r.purchases || []).map((p) => ({
              id: `ev-${p.id}-${p.due_at.slice(0, 10)}`,
              name: p.title,
              price: Number(p.amount) || 0,
              date: p.due_at,
              source: "calendar" as const,
              planned: p.planned,
            })),
          );
        } catch (error) {
          console.error("[EXPENSES CALENDAR] failed to load:", error);
        }
      }
    } catch (error) {
      console.error("[SPACE] failed to load:", error);
      return false;
    }
    return true;
  }, [id, itemType]);

  console.log("[SPACE DETAIL] space:", space);
  console.log("[SPACE DETAIL] space name:", space?.name);
  console.log("[SPACE DETAIL] space icon:", space?.icon);

  /*
   * ==========================================================
   * INITIAL LOAD + REFRESH EVENT
   * ==========================================================
   */

  useEffect(() => {
    let mounted = true;

    const initialLoad = async () => {
      if (!mounted) return;

      setLoading(true);

      const ok = await load();

      if (mounted) {
        setLoading(false);
        recordAction?.loaded?.(ok);
      }
    };

    initialLoad();

    const sub = DeviceEventEmitter.addListener(
      "lifeos.refresh",
      () => {
        load();
      },
    );

    return () => {
      mounted = false;
      sub.remove();
    };
  }, [load]);

  /*
   * ==========================================================
   * RELOAD WHEN SCREEN GETS FOCUS
   * ==========================================================
   */

  // The first focus comes right with the mount, whose effect above already
  // loads: loading again then only doubled the requests and a render.
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) load();
      focusedOnce.current = true;
      // See visitId's own declaration above -- forces every Dashboard
      // below to remount on each fresh visit to this screen. Skipped when
      // coming back along the tab-bar return trail (lib/navigation/
      // returnTrail.ts): that must land on the exact sub-page left.
      if (!consumeTrailReturn(`/${id}`)) setVisitId((v) => v + 1);
    }, [load, id]),
  );

  /*
   * ==========================================================
   * AUTO-ARCHIVE DOCUMENTS ONCE THEY ACTUALLY EXPIRE
   * ==========================================================
   * A renewed-but-not-yet-expired document is intentionally left
   * unarchived by handleDocumentSave above (see comment there) so it
   * doesn't disappear from the dashboard while still valid. This effect
   * is what eventually archives it "for real" -- it runs whenever
   * documentEntries changes (including on every load/focus) and archives
   * any entry that's both superseded by a newer one of the same type and
   * has now genuinely expired. Checking `!e.archived` keeps this a no-op
   * once it's done its job, so it never loops.
   */

  useEffect(() => {
    const toArchive = carData.documentEntries.filter(
      (e) =>
        !e.archived &&
        isDocumentSuperseded(e, carData.documentEntries) &&
        getDocumentStatus(e).status === "expired",
    );

    if (toArchive.length === 0) return;

    const idsToArchive = new Set(toArchive.map((e) => e.id));

    setCarData((current) => ({
      ...current,
      documentEntries: current.documentEntries.map((e) =>
        idsToArchive.has(e.id) ? { ...e, archived: true } : e,
      ),
    }));

    toArchive.forEach((e) => {
      archiveDocumentEntry(e.id).catch((error: any) => {
        notifyAction(
          "Arhivare automată eșuată",
          error?.message || `"${e.title}" a expirat dar tot apare ca activ.`,
        );
      });
    });
  }, [carData.documentEntries]);

  /*
   * ==========================================================
   * AUTO-ARCHIVE MAINTENANCE ONCE IT ACTUALLY BECOMES OVERDUE
   * ==========================================================
   * Same reasoning as the document sweep above, for maintenance's own
   * km-or-date "whichever comes first" rule (see getMaintenanceUrgency):
   * a renewed-but-not-yet-due entry stays active until it truly becomes
   * overdue, on whichever axis gets there first -- this effect is what
   * archives it "for real" at that point. Depends on the whole carData
   * (not just maintenanceEntries) because currentOdometer can change from
   * a new fuel/expense entry alone, without maintenanceEntries itself
   * changing.
   */

  useEffect(() => {
    const currentOdometer = getCurrentOdometer(carData);

    const toArchive = carData.maintenanceEntries.filter(
      (e) =>
        !e.archived &&
        isMaintenanceSuperseded(e, carData.maintenanceEntries) &&
        getMaintenanceUrgency(e, currentOdometer).overdue,
    );

    if (toArchive.length === 0) return;

    const idsToArchive = new Set(toArchive.map((e) => e.id));

    setCarData((current) => ({
      ...current,
      maintenanceEntries: current.maintenanceEntries.map((e) =>
        idsToArchive.has(e.id) ? { ...e, archived: true } : e,
      ),
    }));

    toArchive.forEach((e) => {
      archiveMaintenanceEntry(e.id).catch((error: any) => {
        notifyAction(
          "Arhivare automată eșuată",
          error?.message || `"${e.service}" a devenit restant dar tot apare ca activ.`,
        );
      });
    });
  }, [carData]);

  /*
   * ==========================================================
   * DELETE SPACE
   * ==========================================================
   *
   * Momentan păstrăm comportamentul existent.
   *
   * Mai târziu putem muta această logică într-un menu
   * dedicat Space-ului.
   */

  const deleteSpace = useCallback(async () => {
    if (!id) return;

    // Alert.alert is a no-op on react-native-web (see lib/confirm.ts) --
    // this used it directly instead of confirmAction/notifyAction like
    // every other confirmation in the app, so wiring this up to a real
    // button would have silently done nothing on web. Not currently
    // called from anywhere (see the comment above this function) --
    // fixed in place so it's correct whenever it does get wired up.
    const confirmed = await confirmAction(
      "Ștergi spațiul?",
      `„${space?.name || "Spațiul"}” și tot ce e în el se șterg definitiv.`,
      { confirmLabel: "Șterge", destructive: true },
    );
    if (!confirmed) return;

    try {
      await api.deleteSpace(id);
      router.back();
    } catch (error: any) {
      notifyAction("Nu am putut șterge spațiul", error?.message || "A apărut o eroare.");
    }
  }, [id, router, space]);

  /*
   * ==========================================================
   * EDIT (rename the space -- e.g. "Car" -> "BMW 340D", so two
   * spaces of the same type stay distinguishable)
   * ==========================================================
   */

  const [editModalVisible, setEditModalVisible] = useState(false);

  const handleEdit = useCallback(() => {
    setEditModalVisible(true);
  }, []);

  /*
   * ==========================================================
   * LOADING
   * ==========================================================
   */

  if (loading) {
    return (
      <SafeAreaView
        edges={["top"]}
        style={{
          flex: 1,
          backgroundColor: colors.surface,
          alignItems: "center",
          justifyContent: "center",
        }}
        testID="space-detail-loading"
      >
        <ActivityIndicator
          color={colors.onSurfaceTertiary}
        />
      </SafeAreaView>
    );
  }

  /*
   * ==========================================================
   * SPACE NOT FOUND
   * ==========================================================
   */

  if (!space) {
    return (
      <SafeAreaView
        edges={["top"]}
        style={{
          flex: 1,
          backgroundColor: colors.surface,
        }}
        testID="space-detail-error"
      >
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons
            name="alert-circle-outline"
            size={32}
            color={colors.onSurfaceTertiary}
          />
        </View>
      </SafeAreaView>
    );
  }

  /*
   * ==========================================================
   * SPACE TYPE
   * ==========================================================
   *
   * Momentan tratăm CAR separat.
   *
   * IMPORTANT:
   *
   * Nu presupunem încă exact ce câmp folosește backend-ul
   * pentru tipul Space-ului.
   *
   * Pentru moment încercăm mai multe variante:
   *
   *   space.type
   *   space.slug
   *   space.kind
   *
   * și, pentru dezvoltare, verificăm și numele.
   */

  // Real type detection: a saved profile's `kind` first (survives a
  // rename -- "Car" -> "BMW 340D" must still open CarDashboard), falling
  // back to the old type/slug/name heuristic only for spaces with no
  // saved profile yet. See lib/spaces/spaceProfile.ts's own doc comment
  // for why the name alone can no longer be trusted here.
  const detectedKind = detectSpaceType(space, profile);

  /*
   * orgOS Simplu (lib/appMode.tsx): one simple screen per space. A deep
   * link to one record (?itemId=, e.g. "Modifică informațiile" from a
   * resolve dialog) still opens the full dashboard below, because that
   * record's own resolve/renew step lives there.
   */
  if (isSimple && !itemId && !section) {
    return (
      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }} testID="space-detail-screen">
        <SpaceThemeProvider color={space.color} kind={detectedKind}><ScreenBackground />
          <SimpleSpaceScreen
            key={`${space.id}-${visitId}`}
            space={space}
            kind={detectedKind}
            profile={profile}
            carData={carData}
            homeData={homeData}
            expensesData={expensesData}
            calendarPurchases={calendarPurchases}
            onChanged={load}
            onBack={() => (router.canGoBack() ? router.back() : router.navigate("/(tabs)/home" as any))}
          />
        </SpaceThemeProvider>
      </SafeAreaView>
    );
  }

  const isCar = detectedKind === "car";
  const isHome = detectedKind === "home";
  const isGrocery = detectedKind === "grocery";
  const isExpenses = detectedKind === "expenses";

  /*
   * ==========================================================
   * CAR
   * ==========================================================
   */

  if (isCar) {
    return (
      <SafeAreaView
        edges={["top"]}
        style={{
          flex: 1,
          backgroundColor: colors.surface,
        }}
        testID="space-detail-screen"
      >
        <SpaceThemeProvider color={space.color} kind={detectedKind}><ScreenBackground />
        <CarDashboard
          key={`${space.id}-${visitId}`}
          space={space}
          carData={carData}
          profile={profile as CarProfile | null}
          onOdometerSaved={(saved) => {
            // Top card "Actualizează kilometrajul": the profile keeps the
            // date for the caption, vehicle.mileage feeds getCurrentOdometer
            // so "Urmează" (km-based services) recalculates right away.
            setProfile(saved);
            setCarData((current) => ({
              ...current,
              vehicle: { ...current.vehicle, mileage: saved.odometer ?? 0 },
            }));
          }}
          onEdit={handleEdit}
          onFuelSave={handleFuelSave}
          onMaintenanceSave={handleMaintenanceSave}
          onDocumentSave={handleDocumentSave}
          onExpenseSave={handleExpenseSave}
          onFuelDelete={handleFuelDelete}
          onMaintenanceDelete={handleMaintenanceDelete}
          onDocumentDelete={handleDocumentDelete}
          onExpenseDelete={handleExpenseDelete}
          tourBlocked={editModalVisible || !!recordAction}
          initialOpenEntry={
            itemId && itemType === "car_document"
              ? { type: "document", id: itemId, renew: action === "renew" }
              : itemId && itemType === "car_maintenance"
                ? { type: "maintenance", id: itemId, renew: action === "renew" }
                : itemId && itemType === "car_fuel"
                  ? { type: "fuel", id: itemId }
                  : itemId && itemType === "car_expense"
                    ? { type: "expense", id: itemId }
                : null
          }
        />

        <CarProfileForm
          visible={editModalVisible}
          mode="edit"
          space={space}
          initialProfile={profile as CarProfile | null}
          onClose={() => setEditModalVisible(false)}
          onSaved={(updatedSpace, updatedProfile) => {
            setSpace(updatedSpace);
            setProfile(updatedProfile);
          }}
        />
      </SpaceThemeProvider>
      </SafeAreaView>
    );
  }

  /*
   * ==========================================================
   * HOME
   * ==========================================================
   */

  if (isHome) {
    return (
      <SafeAreaView
        edges={["top"]}
        style={{
          flex: 1,
          backgroundColor: colors.surface,
        }}
        testID="space-detail-screen"
      >
        <SpaceThemeProvider color={space.color} kind={detectedKind}><ScreenBackground />
        <HomeDashboard
          key={`${space.id}-${visitId}`}
          space={space}
          homeData={homeData}
          initialSection={section}
          profile={profile as HomeProfile | null}
          onEdit={handleEdit}
          onDocumentSave={handleHomeDocumentSave}
          onDocumentDelete={handleHomeDocumentDelete}
          onExpenseSave={handleHomeExpenseSave}
          onExpenseDelete={handleHomeExpenseDelete}
          onMaintenanceSave={handleHomeMaintenanceSave}
          onMaintenanceDelete={handleHomeMaintenanceDelete}
          onRecurringSave={handleHomeRecurringSave}
          onRecurringDelete={handleHomeRecurringDelete}
          onSupplySave={handleHomeSupplySave}
          onSupplyDelete={handleHomeSupplyDelete}
          onTaskSave={handleHomeTaskSave}
          onTaskDelete={handleHomeTaskDelete}
          onTaskReorder={handleHomeTaskReorder}
          initialOpenItem={
            (itemType === "home_task" || itemType === "home_recurring" || itemType === "home_maintenance" || itemType === "home_document" || itemType === "home_expense" || itemType === "home_supply") && itemId
              ? { type: itemType, id: itemId, resolve: action === "resolve" }
              : null
          }
        />

        <HomeProfileForm
          visible={editModalVisible}
          mode="edit"
          space={space}
          initialProfile={profile as HomeProfile | null}
          onClose={() => setEditModalVisible(false)}
          onSaved={(updatedSpace, updatedProfile) => {
            setSpace(updatedSpace);
            setProfile(updatedProfile);
          }}
        />
      </SpaceThemeProvider>
      </SafeAreaView>
    );
  }

  /*
   * ==========================================================
   * GROCERY & FOOD
   * ==========================================================
   */

  if (isGrocery) {
    return (
      <SafeAreaView
        edges={["top"]}
        style={{
          flex: 1,
          backgroundColor: colors.surface,
        }}
        testID="space-detail-screen"
      >
        {/* key includes visitId (see its own declaration above), not just
            space.id -- space.id alone forces a remount on switching
            BETWEEN spaces (originally added so GroceryDashboard's own
            local-state lists/items didn't briefly show the PREVIOUS
            Grocery space's data while switching), but does nothing when
            re-entering the SAME space, since space.id never changes
            then. visitId covers that case too, for all 4 dashboards. */}
        <SpaceThemeProvider color={space.color} kind={detectedKind}><ScreenBackground />
        <GroceryDashboard
          key={`${space.id}-${visitId}`}
          space={space}
          onEdit={handleEdit}
          initialOpenItem={itemId && itemType ? { id: itemId, type: itemType } : null}
        />

        <EditSpaceModal
          visible={editModalVisible}
          space={space}
          onClose={() => setEditModalVisible(false)}
          onSaved={(updated) => setSpace(updated)}
        />
      </SpaceThemeProvider>
      </SafeAreaView>
    );
  }

  /*
   * ==========================================================
   * EXPENSES
   * ==========================================================
   */

  if (isExpenses) {
    return (
      <SafeAreaView
        edges={["top"]}
        style={{
          flex: 1,
          backgroundColor: colors.surface,
        }}
        testID="space-detail-screen"
      >
        <SpaceThemeProvider color={space.color} kind={detectedKind}><ScreenBackground />
        <ExpensesDashboard
          key={`${space.id}-${visitId}`}
          space={space}
          expensesData={expensesData}
          calendarEntries={calendarPurchases}
          onEdit={handleEdit}
          onEntrySave={handleExpenseEntrySave}
          onEntryDelete={handleExpenseEntryDelete}
          initialOpenItem={itemId && itemType ? { id: itemId, type: itemType } : null}
        />

        <EditSpaceModal
          visible={editModalVisible}
          space={space}
          onClose={() => setEditModalVisible(false)}
          onSaved={(updated) => setSpace(updated)}
        />
      </SpaceThemeProvider>
      </SafeAreaView>
    );
  }

  /*
   * ==========================================================
   * DEFAULT SPACE
   * ==========================================================
   *
   * Până construim dashboard-urile pentru celelalte Space-uri,
   * păstrăm un fallback simplu.
   *
   * Nu pierdem funcționalitatea existentă.
   */

  return (
    <SafeAreaView
      edges={["top"]}
      style={{
        flex: 1,
        backgroundColor: colors.surface,
      }}
      testID="space-detail-screen"
    >
      <View
        style={{
          flex: 1,
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.gutter,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Ionicons
            name={(space.icon || "folder-outline") as any}
            size={26}
            color={colors.onSurface}
          />

          <Ionicons
            name="ellipsis-horizontal"
            size={22}
            color={colors.onSurfaceTertiary}
          />
        </View>

        <View
          style={{
            marginTop: 28,
          }}
        >
          <Ionicons
            name={(space.icon || "folder-outline") as any}
            size={42}
            color={colors.onSurface}
          />

          <View
            style={{
              marginTop: 16,
            }}
          >
            {/* We intentionally keep this fallback minimal. */}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
