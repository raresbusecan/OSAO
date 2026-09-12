import React, {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  View,
  ActivityIndicator,
  DeviceEventEmitter,
  Alert,
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
import { notifyAction } from "@/lib/confirm";
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

import GroceryDashboard from "@/components/spaces/grocery/GroceryDashboard";
import { initialGroceryData } from "@/components/spaces/grocery/grocery.mock";
import type { GroceryData } from "@/components/spaces/grocery/grocery.data.types";

import ExpensesDashboard from "@/components/spaces/expenses/ExpensesDashboard";
import { initialExpensesData } from "@/components/spaces/expenses/expenses.mock";
import type { ExpensesData } from "@/components/spaces/expenses/expenses.data.types";

import { EditSpaceModal } from "@/components/spaces/EditSpaceModal";
import { CarProfileForm } from "@/components/spaces/car/CarProfileForm";
import { HomeProfileForm } from "@/components/spaces/home/HomeProfileForm";
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

export default function SpaceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const { colors } = useTheme();
  const router = useRouter();

  const [carData, setCarData] = useState<CarData>(initialCarData);
  // No setter yet -- Home has no save flow until its forms are built
  // (mirrors Car's own gradual rollout: carData's setter only exists
  // because handleFuelSave etc. already need it).
  const [homeData] = useState<HomeData>(initialHomeData);
  // GroceryDashboard owns its own add/toggle state internally and persists
  // across re-renders on its own (it doesn't unmount when `space` reloads)
  // -- this is just the seed, same reasoning as homeData above.
  const [groceryData] = useState<GroceryData>(initialGroceryData);
  const [expensesData] = useState<ExpensesData>(initialExpensesData);
  const [space, setSpace] = useState<any>(null);
  const [profile, setProfile] = useState<SpaceProfile | null>(null);
  const [loading, setLoading] = useState(true);

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
    const isExisting = carData.fuelEntries.some((e) => e.id === entry.id);

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
    } catch (error: any) {
      setCarData((current) => ({
        ...current,
        fuelEntries: isExisting
          ? current.fuelEntries
          : current.fuelEntries.filter((e) => e.id !== entry.id),
      }));
      notifyAction("Nu am putut salva alimentarea", error?.message || "A apărut o eroare.");
    }
  };

  const handleMaintenanceSave = async (entry: CarMaintenanceEntry) => {
    const isExisting = carData.maintenanceEntries.some((e) => e.id === entry.id);

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
      // flow (see CarDashboard.tsx's handleNextItemPress) -- archive the
      // entry it replaced so it drops out of RECENT/NEXT but stays in
      // Expenses history, tagged. Only on create: an edit of an already-
      // renewed entry shouldn't re-trigger this.
      if (!isExisting && entry.renewedFromId) {
        const oldId = entry.renewedFromId;
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
    } catch (error: any) {
      setCarData((current) => ({
        ...current,
        maintenanceEntries: isExisting
          ? current.maintenanceEntries
          : current.maintenanceEntries.filter((e) => e.id !== entry.id),
      }));
      notifyAction("Nu am putut salva intervenția", error?.message || "A apărut o eroare.");
    }
  };

  const handleDocumentSave = async (entry: CarDocumentEntry) => {
    const isExisting = carData.documentEntries.some((e) => e.id === entry.id);

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

      // See the matching block in handleMaintenanceSave above.
      if (!isExisting && entry.renewedFromId) {
        const oldId = entry.renewedFromId;
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
    } catch (error: any) {
      setCarData((current) => ({
        ...current,
        documentEntries: isExisting
          ? current.documentEntries
          : current.documentEntries.filter((e) => e.id !== entry.id),
      }));
      notifyAction("Nu am putut salva documentul", error?.message || "A apărut o eroare.");
    }
  };

  const handleExpenseSave = async (entry: CarExpenseEntry) => {
    const isExisting = carData.expenseEntries.some((e) => e.id === entry.id);

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
    } catch (error: any) {
      setCarData((current) => ({
        ...current,
        expenseEntries: isExisting
          ? current.expenseEntries
          : current.expenseEntries.filter((e) => e.id !== entry.id),
      }));
      notifyAction("Nu am putut salva cheltuiala", error?.message || "A apărut o eroare.");
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
    } catch (error: any) {
      if (removed) {
        setCarData((current) => ({
          ...current,
          fuelEntries: [removed, ...current.fuelEntries],
        }));
      }
      notifyAction("Nu am putut șterge alimentarea", error?.message || "A apărut o eroare.");
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
    } catch (error: any) {
      if (removed) {
        setCarData((current) => ({
          ...current,
          maintenanceEntries: [removed, ...current.maintenanceEntries],
        }));
      }
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
    } catch (error: any) {
      if (removed) {
        setCarData((current) => ({
          ...current,
          documentEntries: [removed, ...current.documentEntries],
        }));
      }
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
    } catch (error: any) {
      if (removed) {
        setCarData((current) => ({
          ...current,
          expenseEntries: [removed, ...current.expenseEntries],
        }));
      }
      notifyAction("Nu am putut șterge cheltuiala", error?.message || "A apărut o eroare.");
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
    if (!id) return;

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
          const entries = await loadCarItems(result.id);
          setCarData((current) => ({ ...current, ...entries }));
        } catch (error) {
          console.error("[CAR ITEMS] failed to load:", error);
        }
      }
    } catch (error) {
      console.error("[SPACE] failed to load:", error);
    }
  }, [id]);

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

      await load();

      if (mounted) {
        setLoading(false);
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

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

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

  const deleteSpace = useCallback(() => {
    if (!id) return;

    Alert.alert(
      "Delete space",
      `Are you sure you want to delete "${space?.name || "this space"}"?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await api.deleteSpace(id);
              router.back();
            } catch (error: any) {
              Alert.alert(
                "Could not delete space",
                error?.message || "Something went wrong.",
              );
            }
          },
        },
      ],
    );
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
        <CarDashboard
          space={space}
          carData={carData}
          profile={profile as CarProfile | null}
          onEdit={handleEdit}
          onFuelSave={handleFuelSave}
          onMaintenanceSave={handleMaintenanceSave}
          onDocumentSave={handleDocumentSave}
          onExpenseSave={handleExpenseSave}
          onFuelDelete={handleFuelDelete}
          onMaintenanceDelete={handleMaintenanceDelete}
          onDocumentDelete={handleDocumentDelete}
          onExpenseDelete={handleExpenseDelete}
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
        <HomeDashboard
          space={space}
          homeData={homeData}
          profile={profile as HomeProfile | null}
          onEdit={handleEdit}
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
        <GroceryDashboard
          space={space}
          groceryData={groceryData}
          onEdit={handleEdit}
        />

        <EditSpaceModal
          visible={editModalVisible}
          space={space}
          onClose={() => setEditModalVisible(false)}
          onSaved={(updated) => setSpace(updated)}
        />
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
        <ExpensesDashboard
          space={space}
          expensesData={expensesData}
          onEdit={handleEdit}
        />

        <EditSpaceModal
          visible={editModalVisible}
          space={space}
          onClose={() => setEditModalVisible(false)}
          onSaved={(updated) => setSpace(updated)}
        />
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
          paddingHorizontal: 24,
          paddingTop: 20,
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