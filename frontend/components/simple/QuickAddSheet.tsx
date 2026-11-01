import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, DeviceEventEmitter } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { roDate, roNumber } from "@/lib/format";
import { refreshBudgetPlan } from "@/lib/budget/plan";
import { useRouter } from "expo-router";
import { closeQuickAdd, useSimpleSheets } from "@/lib/simpleSheets";
import { REFRESH_EVENT } from "@/lib/refresh";
import { Sheet } from "@/components/ui/Sheet";
import { DatePickerSheet } from "@/components/ui/DatePickerSheet";
import { PressableScale } from "@/components/ui/PressableScale";
import { Button, Field, FieldButton, Segmented, ToggleRow, hexToRgba } from "@/components/ui/primitives";
import { SPACE_KIND_LABEL, spaceColors } from "@/lib/spaces/spaceProfile";
import { motion } from "@/lib/motion";
import {
  cachedGroceryLists,
  cachedQuickSpaces,
  prefetchQuickAdd,
  rememberGroceryLists,
  rememberQuickSpaces,
  toQuickSpaces,
  type QuickSpace,
} from "@/lib/quickAddCache";
import { loadCarItems } from "@/lib/spaces/car/carItems";
import { loadMyGroceryData } from "@/lib/spaces/grocery/groceryItems";
import { matchIngredientCategory, useIngredientReferences } from "@/lib/spaces/grocery/ingredientLookup";
import { maintenanceLabel } from "@/lib/spaces/car/maintenanceLabels";
import type { CarFuelEntry } from "@/lib/spaces/car/car.types";
import type { GroceryList } from "@/lib/spaces/grocery/grocery.types";
import {
  AMOUNT_MODE,
  CAR_EXPENSE_CATEGORIES,
  DATE_MODE,
  DETAILS_LABEL,
  DOCUMENT_TYPES, DOC_TYPE_LABEL,
  KINDS_BY_SPACE,
  MAINTENANCE_TYPES,
  OIL_CHANGE_KM_INTERVAL,
  SPENDS,
  buildQuickBody,
  canSave,
  emptyForm,
  maintenanceHasNextKm,
  type QuickForm,
  type QuickKind,
} from "./quickAdd/kinds";

/** One-tap names for "Listă nouă" (taken ones are hidden). */
const LIST_NAME_IDEAS = ["Cumpărături săptămânale", "Weekend", "Piață", "Petrecere", "Grătar", "Bricolaj"];

/**
 * orgOS Simplu's "Adaugă" (mockup Adauga.dc.html): pick a space, pick
 * what, type the amount, save. Opened from the tab bar's "+" (preselects
 * the space screen you're on via lib/simpleSheets). Mounted only while
 * open, so every open starts from a clean form.
 */
export function QuickAddHost() {
  const { quickAdd } = useSimpleSheets();
  const open = !!quickAdd;

  // Keep lib/quickAddCache warm so the next "+" opens instantly: on mount,
  // after any save elsewhere, and after this sheet closes.
  useEffect(() => {
    prefetchQuickAdd();
    const sub = DeviceEventEmitter.addListener(REFRESH_EVENT, () => prefetchQuickAdd());
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!open) prefetchQuickAdd();
  }, [open]);

  if (!quickAdd) return null;
  return <QuickAddSheet preselect={quickAdd.spaceId ?? null} />;
}

/** The first frame from lib/quickAddCache, or null when the cache can't
 * draw it complete (nothing prefetched yet, a space created since, or a
 * grocery space whose lists aren't in) -- then the sheet waits for its own
 * load instead. */
function bootFromCache(preselect: string | null) {
  const cached = cachedQuickSpaces();
  if (!cached) return null;
  const initial = cached.find((s) => preselect != null && s.id === String(preselect)) ?? cached[0] ?? null;
  if (preselect != null && initial?.id !== String(preselect)) return null;
  const lists = initial?.kind === "grocery" ? cachedGroceryLists(initial.id) : null;
  if (initial?.kind === "grocery" && !lists) return null;
  return { spaces: cached, initial, lists };
}

/** The newest list of this space (else any) -- the default target list. */
function defaultListId(lists: GroceryList[], spaceId: string): string {
  const own = lists.filter((l) => l.spaceId === spaceId);
  return (own[own.length - 1] ?? lists[lists.length - 1])?.id ?? "";
}

function QuickAddSheet({ preselect }: { preselect: string | null }) {
  const { colors, spacing, radius, isDark } = useTheme();
  const router = useRouter();

  // Computed once per open: start complete from the cache when possible.
  const [boot] = useState(() => bootFromCache(preselect));
  const bootKind = boot?.initial ? KINDS_BY_SPACE[boot.initial.kind][0].key : null;

  const [spaces, setSpaces] = useState<QuickSpace[] | null>(boot?.spaces ?? null);
  const [loadError, setLoadError] = useState(false);
  const [spaceId, setSpaceId] = useState<string | null>(boot?.initial?.id ?? null);
  // Opened from inside a space: only THAT space's form -- no "Pentru" picker.
  const [locked, setLocked] = useState(preselect != null && boot?.initial?.id === String(preselect));
  // Step 1 from Acasă (user decision 2026-10-15): the spaces as a 2-column
  // grid of coloured squares; a tap opens that space's form. Skipped inside
  // a space and when there's only one space.
  const [picking, setPicking] = useState(() => !!boot && !(preselect != null && boot.initial?.id === String(preselect)) && boot.spaces.length > 1);
  const [kind, setKind] = useState<QuickKind | null>(bootKind);
  const [form, setForm] = useState<QuickForm>(() => ({
    ...emptyForm(),
    listId: boot?.lists && boot.initial ? defaultListId(boot.lists, boot.initial.id) : "",
  }));
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [picker, setPicker] = useState<"date" | "issue" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Grocery products: the sheet stays open after a save so several go in
  // back to back; this is the quiet "it worked" line.
  const [justAdded, setJustAdded] = useState<string | null>(null);

  // Per-space context the full forms read: previous fuel entries (the
  // odometer check) and the grocery lists (target list, duplicates).
  const [fuelEntries, setFuelEntries] = useState<CarFuelEntry[]>([]);
  const [groceryLists, setGroceryLists] = useState<GroceryList[]>(boot?.lists ?? []);
  const [listsLoading, setListsLoading] = useState(false);
  // Which space's grocery lists have finished loading (success or not).
  const [listsLoadedFor, setListsLoadedFor] = useState<string | null>(boot?.lists ? boot.initial?.id ?? null : null);
  // The sheet slides up only with its content complete, so it opens in one
  // smooth move instead of growing in steps mid-spring (user report
  // 2026-10-15). Usually instant: the cache draws the first frame. Without
  // a cache it waits for its own load (0.8 s fallback). Latched.
  const [shown, setShown] = useState(!!boot);
  const ingredientRefs = useIngredientReferences();

  const set = (patch: Partial<QuickForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    if (error) setError("");
    if (justAdded) setJustAdded(null);
  };

  const space = spaces?.find((s) => s.id === spaceId) ?? null;
  const sc = space ? spaceColors(space.raw, isDark) : null;
  const tone = sc?.color;
  const kinds = space ? KINDS_BY_SPACE[space.kind] : [];

  const selectSpace = (s: QuickSpace) => {
    setSpaceId(s.id);
    const first = KINDS_BY_SPACE[s.kind][0].key;
    setKind(first);
    setForm((f) => emptyForm(AMOUNT_MODE[first] !== "none" ? f.amount : ""));
    setDetailsOpen(false);
    setNextKmTouched(false);
    setError("");
    setFuelEntries([]);
    // Cached lists keep the grocery form from changing height when picked.
    setGroceryLists(cachedGroceryLists(s.id) ?? []);
  };

  const selectKind = (k: QuickKind) => {
    if (k === kind) return;
    setKind(k);
    // Keep the amount (and grocery target list) when they still apply.
    setForm((f) => ({ ...emptyForm(AMOUNT_MODE[k] !== "none" ? f.amount : ""), listId: f.listId }));
    setDetailsOpen(false);
    setNextKmTouched(false);
    setError("");
  };

  useEffect(() => {
    let alive = true;
    api
      .listSpaces()
      .then((r) => {
        if (!alive) return;
        const list = toQuickSpaces(r?.spaces ?? []);
        rememberQuickSpaces(list);
        setSpaces(list);
        // Opened from the cache: the user may already be typing -- only
        // fall back to a fresh pick if their space is gone.
        if (boot && list.some((s) => s.id === boot.initial?.id)) return;
        const initial = list.find((s) => preselect != null && s.id === String(preselect)) ?? list[0];
        if (initial) selectSpace(initial);
        const isLocked = preselect != null && initial?.id === String(preselect);
        setLocked(isLocked);
        setPicking(!isLocked && list.length > 1);
      })
      .catch(() => {
        if (!alive) return;
        if (boot) return; // keep the cached spaces
        setLoadError(true);
        setSpaces([]);
      });
    return () => {
      alive = false;
    };
    // Once per open (the sheet mounts per open).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Space-level context, (re)loaded when the space changes.
  useEffect(() => {
    if (!space) return;
    let alive = true;
    if (space.kind === "car") {
      loadCarItems(space.id)
        .then((d) => alive && setFuelEntries(d.fuelEntries))
        .catch(() => {});
    } else if (space.kind === "grocery") {
      setListsLoading(true);
      loadMyGroceryData(space.id)
        .then(({ lists }) => {
          if (!alive) return;
          rememberGroceryLists(space.id, lists);
          setGroceryLists(lists);
          // Default target: the newest list of this space (else any).
          const pick = defaultListId(lists, space.id);
          if (pick) setForm((f) => (f.listId ? f : { ...f, listId: pick }));
        })
        .catch(() => {})
        .finally(() => {
          if (!alive) return;
          setListsLoading(false);
          setListsLoadedFor(space.id);
        });
    }
    return () => {
      alive = false;
    };
  }, [space?.id, space?.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Următorul schimb la" follows Kilometraj + 10.000 until the user types
  // in it themselves.
  const [nextKmTouched, setNextKmTouched] = useState(false);
  const suggestedNextKm = (odometerText: string) => {
    const v = Number(odometerText.trim().replace(/\./g, "").replace(",", "."));
    return odometerText.trim() && Number.isFinite(v) && v > 0 ? String(Math.round(v) + OIL_CHANGE_KM_INTERVAL) : "";
  };

  // The car's current km (GET /spaces: max of the manual reading and the
  // logged ones) -- the floor for a new record + the grey hint under
  // every Kilometraj field.
  const currentOdometer = space?.kind === "car" ? Math.max(0, Number(space.raw?.odometer) || 0) : 0;
  const kmHint = currentOdometer > 0 ? `Acum: ${roNumber(currentOdometer)} km` : null;

  const firstContentReady = spaces !== null && (!space || space.kind !== "grocery" || listsLoadedFor === space.id);
  useEffect(() => {
    if (firstContentReady) setShown(true);
  }, [firstContentReady]);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 800);
    return () => clearTimeout(t);
  }, []);

  const ctx = useMemo(
    () => ({
      spaceId: space?.id ?? "",
      fuelEntries,
      groceryLists,
      groceryCategory: (name: string) => matchIngredientCategory(ingredientRefs, name) ?? "Other",
      currentOdometer,
    }),
    [space?.id, fuelEntries, groceryLists, ingredientRefs, currentOdometer],
  );

  const valid = !!space && !!kind && canSave(kind, form, ctx);

  const save = async () => {
    if (!space || !kind || saving || !valid) return;
    const res = buildQuickBody(kind, form, ctx);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setSaving(true);
    try {
      await api.createItem(res.body);
    } catch (e: any) {
      setSaving(false);
      // Inline, in the sheet's own error box: a ConfirmHost dialog is a
      // second Modal on top of this one, which froze the app on iOS.
      setError(`Nu am putut salva. ${e?.message || "A apărut o eroare."}`);
      return;
    }
    if (SPENDS[kind]) refreshBudgetPlan();
    DeviceEventEmitter.emit(REFRESH_EVENT);
    if (kind === "grocery_list") {
      // Straight to the new list: from Acasă, open the space; inside it,
      // SimpleGrocerySpace switches to a list that just appeared.
      closeQuickAdd();
      if (!locked) router.push(`/${space.id}` as any);
      return;
    }
    if (kind === "grocery_item") {
      // Stay in the form: clear the product, keep the list, say it's on.
      setJustAdded(form.title.trim());
      setForm((f) => ({ ...emptyForm(), listId: f.listId }));
      setSaving(false);
      return;
    }
    closeQuickAdd();
  };

  const dateMode = kind ? DATE_MODE[kind] : null;
  const amountMode = kind ? AMOUNT_MODE[kind] : "none";
  const detailsLabel = kind ? DETAILS_LABEL[kind] : null;

  const dateText = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    const now = new Date();
    return d.toDateString() === now.toDateString() ? "Azi" : roDate(d, { withYear: d.getFullYear() !== now.getFullYear() });
  };

  const label = (text: string) => <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>{text}</Text>;

  /** Sub-choice chips (service type, document type, category, list). */
  const optionChips = (title: string, options: { key: string; label: string }[], value: string, onPick: (k: string) => void, testPrefix: string) => (
    <View style={{ gap: spacing.sm }}>
      {label(title)}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {options.map((o) => {
          const on = o.key === value;
          return (
            <PressableScale
              key={o.key}
              testID={`${testPrefix}-${o.key}`}
              onPress={() => onPick(on ? "" : o.key)}
              scaleTo={0.97}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={o.label}
              style={{
                height: 40,
                paddingHorizontal: 14,
                borderRadius: radius.pill,
                justifyContent: "center",
                backgroundColor: on ? sc?.fill ?? colors.onSurface : colors.surfaceTertiary,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "500", color: on ? sc?.ink ?? colors.surface : colors.onSurface }} numberOfLines={1}>
                {o.label}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );

  const listChips = () => {
    if (listsLoading && groceryLists.length === 0) return <ActivityIndicator color={colors.onSurfaceTertiary} style={{ alignSelf: "flex-start" }} />;
    if (groceryLists.length === 0) {
      return (
        <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary, lineHeight: 20 }}>
          Nu ai nicio listă încă. Alege „Listă nouă” ca să creezi una.
        </Text>
      );
    }
    return optionChips(
      "Lista",
      groceryLists.map((l) => ({ key: l.id, label: l.name })),
      form.listId,
      (k) => set({ listId: k || form.listId }),
      "quick-add-list",
    );
  };

  /** "Listă nouă": the name, one-tap name ideas (the ones not taken yet),
   * and the lists that already exist -- so a duplicate is visible before
   * Save. */
  const groceryListFields = () => {
    const taken = new Set(groceryLists.map((l) => l.name.trim().toLowerCase()));
    const ideas = LIST_NAME_IDEAS.filter((n) => !taken.has(n.toLowerCase()));
    return (
      <>
        <Field
          testID="quick-add-title"
          label="Nume listă"
          value={form.title}
          onChangeText={(t) => set({ title: t })}
          placeholder="ex. Cumpărături de weekend"
          returnKeyType="done"
          onSubmitEditing={save}
          tone={tone}
        />
        {ideas.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            {label("Idei")}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {ideas.map((name) => {
                const on = form.title.trim().toLowerCase() === name.toLowerCase();
                return (
                  <PressableScale
                    key={name}
                    testID={`quick-add-list-idea-${name}`}
                    onPress={() => set({ title: on ? "" : name })}
                    scaleTo={0.97}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={name}
                    style={{
                      height: 40,
                      paddingHorizontal: 14,
                      borderRadius: radius.pill,
                      justifyContent: "center",
                      backgroundColor: on ? sc?.fill ?? colors.onSurface : colors.surfaceTertiary,
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "500", color: on ? sc?.ink ?? colors.surface : colors.onSurface }} numberOfLines={1}>
                      {name}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
          </View>
        ) : null}
        {groceryLists.length > 0 ? (
          <View
            testID="quick-add-existing-lists"
            style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, padding: spacing.md, borderRadius: radius.control, backgroundColor: colors.surfaceTertiary }}
          >
            <Ionicons name="list-outline" size={18} color={sc?.tint ?? colors.onSurfaceTertiary} style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: colors.onSurfaceSecondary }} numberOfLines={3}>
              {groceryLists.length === 1 ? "Ai deja lista " : "Ai deja listele "}
              <Text style={{ color: colors.onSurface, fontWeight: "500" }}>{groceryLists.map((l) => l.name).join(", ")}</Text>.
            </Text>
          </View>
        ) : null}
      </>
    );
  };

  // ---- Fields above the amount/date row -------------------------------
  const leadFields = () => {
    switch (kind) {
      case "car_service":
        return (
          <>
            {optionChips(
              "Ce s-a făcut",
              MAINTENANCE_TYPES.map((t) => ({ key: t, label: maintenanceLabel(t) })),
              form.choice,
              (k) => {
                // Picking "Schimb ulei" after typing the km fills the suggestion too.
                set({ choice: k, ...(k === "Oil Change" && !nextKmTouched ? { nextKm: suggestedNextKm(form.odometer) } : {}) });
              },
              "quick-add-service",
            )}
            {form.choice === "Oil Change" ? (
              <>
                <Field
                  label="Kilometraj"
                  value={form.odometer}
                  onChangeText={(t) => set({ odometer: t, ...(nextKmTouched ? {} : { nextKm: suggestedNextKm(t) }) })}
                  placeholder="ex. 124580"
                  keyboardType="number-pad"
                  suffix="km"
                  tone={tone}
                  hint={kmHint ? `Necesar pentru schimbul de ulei · ${kmHint.toLowerCase()}` : "Necesar pentru schimbul de ulei."}
                />
                {/* Out of "Detalii" on purpose: without it the reminder only
                    comes at 12 months (user decision 2026-10-15). */}
                <Field
                  testID="quick-add-next-oil-km"
                  label="Următorul schimb la"
                  value={form.nextKm}
                  onChangeText={(t) => {
                    setNextKmTouched(true);
                    set({ nextKm: t });
                  }}
                  placeholder={`ex. ${roNumber(124580 + OIL_CHANGE_KM_INTERVAL)}`}
                  keyboardType="number-pad"
                  suffix="km"
                  tone={tone}
                  hint={
                    form.nextKm.trim()
                      ? "Te anunțăm cu 2.000 km înainte sau la 12 luni, ce vine primul."
                      : "Fără km: te anunțăm doar la 12 luni."
                  }
                />
              </>
            ) : null}
          </>
        );
      case "car_document":
        return optionChips("Tip document", DOCUMENT_TYPES.map((t) => ({ key: t, label: DOC_TYPE_LABEL[t] ?? t })), form.choice, (k) => set({ choice: k }), "quick-add-doc");
      case "car_expense":
        return optionChips("Categorie", CAR_EXPENSE_CATEGORIES.map((t) => ({ key: t, label: t })), form.choice, (k) => set({ choice: k }), "quick-add-category");
      case "home_bill":
        return <Field testID="quick-add-title" label="Nume" value={form.title} onChangeText={(t) => set({ title: t })} placeholder="ex. Abonament internet" tone={tone} />;
      case "home_task":
        return <Field testID="quick-add-title" label="Ce trebuie făcut" value={form.title} onChangeText={(t) => set({ title: t })} placeholder="ex. Scoate gunoiul" tone={tone} />;
      case "home_supply":
        return <Field testID="quick-add-title" label="Nume" value={form.title} onChangeText={(t) => set({ title: t })} placeholder="ex. Hârtie igienică" tone={tone} />;
      case "home_expense":
        return <Field testID="quick-add-title" label="Pe ce" value={form.title} onChangeText={(t) => set({ title: t })} placeholder="ex. Reparație acoperiș" tone={tone} />;
      case "expense":
        return <Field testID="quick-add-title" label="Pe ce" value={form.title} onChangeText={(t) => set({ title: t })} placeholder="ex. Cadou" tone={tone} />;
      case "grocery_list":
        return groceryListFields();
      case "grocery_item":
        return (
          <>
            {listChips()}
            <Field testID="quick-add-title" label="Produs" value={form.title} onChangeText={(t) => set({ title: t })} placeholder="ex. Lapte" tone={tone} />
          </>
        );
      case "grocery_trip":
        return listChips();
      default:
        return null;
    }
  };

  // ---- Amount + date row ----------------------------------------------
  const amountLabel = kind === "car_document" ? "Preț (opțional)" : kind === "home_bill" ? "Cât costă" : "Cât ai plătit";
  const amountDateRow = () => {
    if (kind === "home_supply") {
      return (
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label="Cantitate" value={form.quantity} onChangeText={(t) => set({ quantity: t })} placeholder="1" keyboardType="decimal-pad" tone={tone} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Unitate" value={form.unit} onChangeText={(t) => set({ unit: t })} placeholder="ex. role" tone={tone} />
          </View>
        </View>
      );
    }
    if (amountMode === "none" && !dateMode) return null;
    return (
      <View style={{ flexDirection: "row", gap: 10 }}>
        {amountMode !== "none" ? (
          <View style={{ flex: 1.3 }}>
            <Field
              testID="quick-add-amount"
              label={amountLabel}
              accessibilityLabel="Suma"
              value={form.amount}
              onChangeText={(t) => set({ amount: t })}
              placeholder="0"
              keyboardType="decimal-pad"
              big
              suffix="lei"
              tone={tone}
            />
          </View>
        ) : null}
        {dateMode ? (
          <View style={{ flex: 1 }}>
            <FieldButton
              testID="quick-add-date"
              label={dateMode.label}
              value={dateText(form.date) ?? (dateMode.empty === "today" ? "Azi" : null)}
              placeholder={dateMode.empty === "none" ? "Fără dată" : "Alege"}
              onPress={() => setPicker("date")}
            />
          </View>
        ) : null}
      </View>
    );
  };

  // ---- "Detalii" fields -------------------------------------------------
  const details = () => {
    switch (kind) {
      case "car_fuel":
        return (
          <>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Field label="Litri" value={form.liters} onChangeText={(t) => set({ liters: t })} placeholder="ex. 42" keyboardType="decimal-pad" suffix="l" tone={tone} />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Kilometraj" value={form.odometer} onChangeText={(t) => set({ odometer: t })} placeholder="ex. 124580" keyboardType="number-pad" suffix="km" tone={tone} hint={kmHint} />
              </View>
            </View>
            <Field label="Benzinărie" value={form.station} onChangeText={(t) => set({ station: t })} placeholder="ex. OMV" tone={tone} />
          </>
        );
      case "car_service":
        return (
          <>
            {form.choice !== "Oil Change" ? (
              <Field label="Kilometraj" value={form.odometer} onChangeText={(t) => set({ odometer: t })} placeholder="ex. 124580" keyboardType="number-pad" suffix="km" tone={tone} hint={kmHint} />
            ) : null}
            {maintenanceHasNextKm(form.choice) && form.choice !== "Oil Change" ? (
              <Field label="Următorul service la" value={form.nextKm} onChangeText={(t) => set({ nextKm: t })} placeholder="ex. 139580" keyboardType="number-pad" suffix="km" tone={tone} />
            ) : null}
            <Field label="Service" value={form.provider} onChangeText={(t) => set({ provider: t })} placeholder="ex. Service Auto Popescu" tone={tone} />
            <Field label="Notă" value={form.notes} onChangeText={(t) => set({ notes: t })} placeholder="Ce s-a schimbat, ce mai e de făcut" multiline tone={tone} />
            <ToggleRow icon="shield-checkmark-outline" label="În garanție" hint="Gratuit, fără preț." value={form.underWarranty} onChange={(v) => set({ underWarranty: v })} tone={tone} />
          </>
        );
      case "car_document":
        return (
          <>
            <Field label="Titlu" value={form.title} onChangeText={(t) => set({ title: t })} placeholder={form.choice || "ex. RCA 2026"} tone={tone} />
            <Field label="Emitent" value={form.issuer} onChangeText={(t) => set({ issuer: t })} placeholder="ex. Allianz" tone={tone} />
            <FieldButton label="Emis pe" value={dateText(form.issueDate)} placeholder="Opțional" onPress={() => setPicker("issue")} />
            <Field label="Notă" value={form.notes} onChangeText={(t) => set({ notes: t })} placeholder="Orice detaliu util" multiline tone={tone} />
          </>
        );
      case "car_expense":
        return (
          <>
            <Field label="Titlu" value={form.title} onChangeText={(t) => set({ title: t })} placeholder={form.choice || "ex. Parcare aeroport"} tone={tone} />
            <Field label="Kilometraj" value={form.odometer} onChangeText={(t) => set({ odometer: t })} placeholder="ex. 124580" keyboardType="number-pad" suffix="km" tone={tone} hint={kmHint} />
            <Field label="Furnizor" value={form.provider} onChangeText={(t) => set({ provider: t })} placeholder="ex. Parcările Cluj" tone={tone} />
            <Field label="Notă" value={form.notes} onChangeText={(t) => set({ notes: t })} placeholder="Orice detaliu util" multiline tone={tone} />
          </>
        );
      case "home_bill":
        return (
          <View style={{ gap: spacing.sm }}>
            {label("Frecvență")}
            <Segmented
              options={[
                { key: "weekly", label: "Săptămânal" },
                { key: "monthly", label: "Lunar" },
                { key: "yearly", label: "Anual" },
              ]}
              value={form.billFrequency}
              onChange={(k) => set({ billFrequency: k })}
            />
          </View>
        );
      case "home_task":
        return (
          <>
            <ToggleRow icon="cart-outline" label="Implică o cumpărare" hint="Prețul îl introduci când îl marchezi ca rezolvat." value={form.isPurchase} onChange={(v) => set({ isPurchase: v })} tone={tone} />
            <ToggleRow
              icon="repeat-outline"
              label="Se repetă"
              hint={form.isRecurring ? "Rămâne activ după rezolvare, gata pentru data următoare." : "Se arhivează când îl rezolvi."}
              value={form.isRecurring}
              onChange={(v) => set({ isRecurring: v })}
              tone={tone}
            >
              <Segmented
                options={[
                  { key: "daily", label: "Zilnic" },
                  { key: "weekly", label: "Săptămânal" },
                  { key: "monthly", label: "Lunar" },
                ]}
                value={(form.taskFrequency ?? "") as "daily" | "weekly" | "monthly"}
                onChange={(k) => set({ taskFrequency: k })}
              />
            </ToggleRow>
            <Field label="Notă" value={form.notes} onChangeText={(t) => set({ notes: t })} placeholder="Orice detaliu util" multiline tone={tone} />
          </>
        );
      case "home_supply":
        return (
          <>
            <Field label="Categorie" value={form.category} onChangeText={(t) => set({ category: t })} placeholder="ex. Baie" tone={tone} />
            <Field label="Notă" value={form.notes} onChangeText={(t) => set({ notes: t })} placeholder="Orice detaliu util" multiline tone={tone} />
          </>
        );
      case "expense":
        return <Field label="Notă" value={form.notes} onChangeText={(t) => set({ notes: t })} placeholder="Orice detaliu util" multiline tone={tone} />;
      case "grocery_item":
        return <Field label="Cantitate" value={form.groceryQuantity} onChangeText={(t) => set({ groceryQuantity: t })} placeholder="ex. 1 kg" tone={tone} />;
      default:
        return null;
    }
  };

  const noSpaces = spaces !== null && spaces.length === 0;

  return (
    <Sheet
      visible={shown}
      onClose={closeQuickAdd}
      title={picking || !space ? "Adaugă" : space.kind === "grocery" && locked ? "Listă nouă" : `Adaugă la ${space.name}`}
      subtitle={picking ? "Alege spațiul" : undefined}
      // Step 2 from Acasă: ‹ back to the space grid (not inside a space,
      // not with a single space -- there's no grid then).
      onBack={!picking && !locked && (spaces?.length ?? 0) > 1 ? () => setPicking(true) : undefined}
      testID="quick-add-sheet"
      footer={
        space && kind && !picking ? (
          <Button testID="quick-add-save" label={kind === "grocery_item" ? "Adaugă produsul" : kind === "grocery_list" ? "Creează lista" : "Salvează"} tone={sc?.fill} onPress={save} disabled={!valid} loading={saving} />
        ) : null
      }
    >
      {spaces === null ? (
        <ActivityIndicator color={colors.onSurfaceTertiary} style={{ paddingVertical: spacing.xl }} />
      ) : noSpaces ? (
        <Text style={{ fontSize: 15, color: colors.onSurfaceTertiary, lineHeight: 22, paddingBottom: spacing.lg }}>
          {loadError ? "Nu am putut încărca spațiile. Încearcă din nou." : "Creează mai întâi un spațiu pe Acasă."}
        </Text>
      ) : picking ? (
        <SpacePickGrid
          spaces={spaces}
          onPick={(s) => {
            if (s.id !== spaceId) selectSpace(s);
            setPicking(false);
          }}
        />
      ) : (
        <>

          {/* Ce -- hidden for a single-kind space (Cheltuieli) */}
          {kinds.length > 1 ? (
            <View style={{ gap: spacing.sm }}>
              {label("Ce")}
              {Array.from({ length: Math.ceil(kinds.length / 2) }, (_, row) => (
                <View key={row} style={{ flexDirection: "row", gap: spacing.sm }}>
                  {[0, 1].map((col) => {
                    const k = kinds[row * 2 + col];
                    if (!k) return <View key={col} style={{ flex: 1 }} />;
                    const on = k.key === kind;
                    return (
                      <PressableScale
                        key={k.key}
                        testID={`quick-add-kind-${k.key}`}
                        onPress={() => selectKind(k.key)}
                        scaleTo={0.97}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        accessibilityLabel={k.label}
                        style={{
                          flex: 1,
                          height: 48,
                          borderRadius: radius.control,
                          borderWidth: 2,
                          // The picked kind wears the space's colour
                          // (user decision 2026-10-15): border = its base,
                          // a light wash of it inside, text in its tint.
                          borderColor: on ? tone ?? colors.onSurface : colors.surfaceTertiary,
                          backgroundColor: on ? (tone ? hexToRgba(tone, isDark ? 0.18 : 0.12) : colors.surfaceSecondary) : colors.surfaceTertiary,
                          alignItems: "center",
                          justifyContent: "center",
                          paddingHorizontal: spacing.sm,
                        }}
                      >
                        <Text style={{ fontSize: 15, fontWeight: on ? "600" : "500", color: on ? sc?.tint ?? colors.onSurface : colors.onSurface }} numberOfLines={1}>
                          {k.label}
                        </Text>
                      </PressableScale>
                    );
                  })}
                </View>
              ))}
            </View>
          ) : null}

          {leadFields()}
          {amountDateRow()}

          {detailsLabel ? (
            <>
              <Pressable
                testID="quick-add-details"
                onPress={() => setDetailsOpen((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: detailsOpen }}
                style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", minHeight: 44 }}
              >
                <Ionicons name={detailsOpen ? "remove" : "add"} size={18} color={colors.onSurfaceSecondary} />
                <Text style={{ fontSize: 14, fontWeight: "500", color: colors.onSurfaceSecondary }}>{detailsOpen ? "Mai puține detalii" : detailsLabel}</Text>
              </Pressable>
              {detailsOpen ? <View style={{ gap: spacing.lg, marginTop: -spacing.sm }}>{details()}</View> : null}
            </>
          ) : null}

          {justAdded ? (
            <View testID="quick-add-added" style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.control, backgroundColor: `${colors.success}18` }}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={{ flex: 1, fontSize: 14, color: colors.onSurface }} numberOfLines={2}>
                „{justAdded}” e pe listă. Scrie următorul produs sau închide.
              </Text>
            </View>
          ) : null}

          {error ? (
            <View style={{ padding: spacing.md, borderRadius: radius.control, backgroundColor: `${colors.error}14` }}>
              <Text style={{ fontSize: 14, color: colors.error }}>{error}</Text>
            </View>
          ) : null}
        </>
      )}

      {picker && dateMode ? (
        <DatePickerSheet
          value={(picker === "issue" ? form.issueDate : form.date) ?? undefined}
          range={picker === "issue" ? "any" : dateMode.range}
          clearable={picker === "date" && dateMode.empty === "none"}
          title={picker === "issue" ? "Emis pe" : dateMode.label === "Când" ? "Alege data" : dateMode.label}
          onCancel={() => setPicker(null)}
          onSelect={(iso) => {
            if (picker === "issue") set({ issueDate: iso ?? null });
            else set({ date: iso ?? null });
            setPicker(null);
          }}
        />
      ) : null}
    </Sheet>
  );
}

/**
 * Step 1 of "Adaugă" from Acasă (user decision 2026-10-15): the user's
 * spaces as a 2-column grid of squares, each filled with its own colour
 * (the space's `fill`, ink text -- like the hero cards inside a space),
 * same order as the Acasă grid. A tap picks it.
 */
function SpacePickGrid({ spaces, onPick }: { spaces: QuickSpace[]; onPick: (s: QuickSpace) => void }) {
  const { colors, spacing, radius, isDark } = useTheme();
  const rows: QuickSpace[][] = [];
  for (let i = 0; i < spaces.length; i += 2) rows.push(spaces.slice(i, i + 2));
  return (
    <View testID="quick-add-space-grid" style={{ gap: spacing.md }}>
      {rows.map((row, i) => (
        <View key={i} style={{ flexDirection: "row", gap: spacing.md }}>
          {row.map((s) => {
            const c = spaceColors(s.raw, isDark);
            const fill = c?.fill ?? colors.surfaceTertiary;
            const ink = c?.ink ?? colors.onSurface;
            return (
              <PressableScale
                key={s.id}
                testID={`quick-add-space-${s.id}`}
                onPress={() => onPick(s)}
                scaleTo={motion.scale.tile}
                accessibilityRole="button"
                accessibilityLabel={`Adaugă la ${s.name}`}
                style={{ flex: 1, aspectRatio: 1, borderRadius: radius.card, padding: spacing.lg, backgroundColor: fill, justifyContent: "space-between" }}
              >
                <Ionicons name={(s.raw?.icon || KIND_ICON[s.kind]) as any} size={28} color={ink} />
                <View style={{ gap: 2 }}>
                  <Text style={{ fontSize: 17, fontWeight: "600", color: ink }} numberOfLines={2}>
                    {s.name}
                  </Text>
                  <Text style={{ fontSize: 13, color: ink, opacity: 0.8 }} numberOfLines={1}>
                    {SPACE_KIND_LABEL[s.kind] ?? ""}
                  </Text>
                </View>
              </PressableScale>
            );
          })}
          {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  );
}

const KIND_ICON: Record<QuickSpace["kind"], string> = {
  car: "car-outline",
  home: "home-outline",
  grocery: "cart-outline",
  expenses: "receipt-outline",
};
