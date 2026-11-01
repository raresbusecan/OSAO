import React, { useEffect, useState } from "react";
import { ActivityIndicator, DeviceEventEmitter, Text, View } from "react-native";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { roCount, roDate, roNumber, parseLocaleNumber } from "@/lib/format";
import { cachedQuickSpaces } from "@/lib/quickAddCache";
import { refreshBudgetPlan } from "@/lib/budget/plan";
import { closeEditRecord, useSimpleSheets } from "@/lib/simpleSheets";
import { REFRESH_EVENT } from "@/app/(tabs)/_layout";
import { Sheet } from "@/components/ui/Sheet";
import { DatePickerSheet } from "@/components/ui/DatePickerSheet";
import { Button, Field, FieldButton } from "@/components/ui/primitives";
import { CUSTOM_EVENT_COLOR, spaceColors } from "@/lib/spaces/spaceProfile";
import { maintenanceLabel } from "@/lib/spaces/car/maintenanceLabels";
import { formatDateInput, isValidDateInput } from "@/lib/spaces/car/utils/dateInput";
import { parseDocDate } from "@/lib/dashboard/documentRenewal";

/*
 * orgOS Simplu's record editor: tap any record (a row in a space, in
 * Calendar, on Acasă) -> this sheet, pre-filled with the few fields that
 * matter, Salvează / Șterge. One generic sheet for every kind of record,
 * driven by RECORD_SPECS below; the advanced fields (next service km,
 * guilt-free, recurrence ...) are left exactly as saved and stay editable
 * in Complet. A save is a PARTIAL PUT /items/{id} (only the fields shown;
 * `metadata` is the saved one with the shown keys replaced), so nothing the
 * full app stored is lost.
 */

type Extra = { key: string; label: string; suffix?: string; numeric?: boolean; placeholder?: string };

type Spec = {
  label: string;
  title?: { label: string; placeholder?: string };
  /** Fuel: the item's title IS the station (and metadata.station). */
  stationTitle?: boolean;
  amount?: { label: string; optional?: boolean; zeroOk?: boolean };
  /** Only when the saved item already has an amount (an event "cu cumpărare"). */
  amountOnlyIfPresent?: boolean;
  date?: { label: string; clearable?: boolean; expiry?: boolean; range?: "past" | "future" | "any" };
  time?: boolean;
  notes?: "notes" | "meta.notes" | "meta.description";
  extras?: Extra[];
};

const RECORD_SPECS: Record<string, Spec> = {
  car_fuel: {
    label: "Alimentare",
    stationTitle: true,
    amount: { label: "Cât ai plătit" },
    date: { label: "Când", range: "past" },
    extras: [
      { key: "liters", label: "Litri", suffix: "l", numeric: true },
      { key: "odometer", label: "Kilometraj", suffix: "km", numeric: true },
    ],
  },
  car_maintenance: {
    label: "Service",
    amount: { label: "Cât ai plătit", zeroOk: true },
    date: { label: "Când", range: "past" },
    extras: [
      { key: "odometer", label: "Kilometraj", suffix: "km", numeric: true },
      { key: "provider", label: "Service", placeholder: "ex. Service Auto Popescu" },
    ],
    notes: "meta.description",
  },
  car_document: {
    label: "Document",
    title: { label: "Titlu" },
    amount: { label: "Preț (opțional)", optional: true, zeroOk: true },
    date: { label: "Expiră pe", expiry: true, range: "any" },
    extras: [{ key: "issuer", label: "Emitent", placeholder: "ex. Allianz" }],
    notes: "meta.notes",
  },
  car_expense: {
    label: "Cheltuială",
    title: { label: "Titlu" },
    amount: { label: "Cât ai plătit" },
    date: { label: "Când", range: "past" },
    extras: [{ key: "provider", label: "Furnizor" }],
    notes: "meta.notes",
  },
  home_recurring: {
    label: "Factură",
    title: { label: "Nume", placeholder: "ex. Abonament internet" },
    amount: { label: "Cât costă", zeroOk: true },
    date: { label: "Scadență", range: "any" },
    notes: "meta.notes",
  },
  home_task: {
    label: "Sarcină",
    title: { label: "Ce trebuie făcut" },
    date: { label: "Termen", clearable: true, range: "any" },
    notes: "notes",
  },
  home_maintenance: {
    label: "Mentenanță",
    title: { label: "Ce" },
    amount: { label: "Cât a costat", optional: true, zeroOk: true },
    date: { label: "Când", range: "any" },
    extras: [{ key: "provider", label: "Cine o face" }],
    notes: "meta.description",
  },
  home_document: {
    label: "Document",
    title: { label: "Titlu" },
    date: { label: "Expiră pe", expiry: true, range: "any" },
    extras: [{ key: "issuer", label: "Emitent" }],
  },
  home_expense: {
    label: "Cheltuială",
    title: { label: "Pe ce" },
    amount: { label: "Cât ai plătit", zeroOk: true },
    date: { label: "Când", range: "past" },
    notes: "meta.notes",
  },
  expense_item: {
    label: "Cheltuială",
    title: { label: "Pe ce" },
    amount: { label: "Cât ai plătit", zeroOk: true },
    date: { label: "Când", range: "past" },
    notes: "notes",
  },
  custom_event: {
    label: "Eveniment",
    title: { label: "Ce se întâmplă", placeholder: "ex. Ziua Anei" },
    amountOnlyIfPresent: true,
    amount: { label: "Sumă", zeroOk: true },
    date: { label: "Data", range: "any" },
    time: true,
    notes: "notes",
  },
  grocery_list: { label: "Listă", title: { label: "Nume listă" } },
  grocery_item: {
    label: "Produs",
    title: { label: "Produs" },
    extras: [{ key: "quantity", label: "Cantitate", placeholder: "ex. 1 kg" }],
  },
};

/** Whether a record of this item type has an editor here. Callers fall back
 * to their old behaviour (open the space ...) when it doesn't. */
export function canEditRecord(type?: string | null): boolean {
  return !!type && type in RECORD_SPECS;
}

/** The host: mounted once (app/(tabs)/_layout.tsx, simple mode only). */
export function EditRecordHost() {
  const { editRecord } = useSimpleSheets();
  if (!editRecord) return null;
  return <EditRecordSheet key={editRecord.id} id={editRecord.id} />;
}

const toNum = (raw: string) => parseLocaleNumber(raw);
const localKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

function EditRecordSheet({ id }: { id: string }) {
  const { radius, colors, spacing, isDark } = useTheme();
  const [item, setItem] = useState<any | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState("09:00");
  const [notes, setNotes] = useState("");
  const [extras, setExtras] = useState<Record<string, string>>({});
  const [picker, setPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const spec = item ? RECORD_SPECS[item.type] : null;

  useEffect(() => {
    let alive = true;
    api
      .getItem(id)
      .then((raw: any) => {
        if (!alive) return;
        const s = RECORD_SPECS[raw?.type];
        if (!s) {
          setLoadFailed(true);
          return;
        }
        const meta = raw.metadata ?? {};
        setItem(raw);
        setTitle(s.stationTitle ? "" : raw.title ?? "");
        setAmount(raw.amount != null ? String(Number(raw.amount)) : "");
        const d = s.date?.expiry ? parseDocDate(meta.expiryDate) : raw.due_at ? new Date(raw.due_at) : null;
        setDate(d ? d.toISOString() : null);
        setTime(
          d && s.time ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : "09:00",
        );
        setNotes(s.notes === "notes" ? raw.notes ?? "" : s.notes === "meta.notes" ? meta.notes ?? "" : s.notes === "meta.description" ? meta.description ?? "" : "");
        const ex: Record<string, string> = {};
        (s.extras ?? []).forEach((e) => {
          ex[e.key] = meta[e.key] != null ? String(meta[e.key]) : "";
        });
        if (s.stationTitle) ex.station = meta.station != null ? String(meta.station) : "";
        setExtras(ex);
      })
      .catch(() => alive && setLoadFailed(true));
    return () => {
      alive = false;
    };
  }, [id]);

  const sc = item?.space ? spaceColors(item.space, isDark) : null;
  // The car's current km, as a grey hint under Kilometraj (from the "+"
  // sheet's prefetched spaces; no extra request). Not a floor here: an
  // older record can rightly have fewer km than today.
  const carKm = item?.space_id != null ? Number(cachedQuickSpaces()?.find((s) => s.id === String(item.space_id))?.raw?.odometer) || 0 : 0;
  const kmHint = carKm > 0 ? `Acum: ${roNumber(carKm)} km` : null;
  const tone = item?.type === "custom_event" ? CUSTOM_EVENT_COLOR : sc?.color;
  const heading = item?.type === "car_maintenance" ? maintenanceLabel(item.title) : spec?.label ?? "Înregistrare";
  const showAmount = !!spec?.amount && (!spec.amountOnlyIfPresent || item?.amount != null);

  const finish = () => {
    closeEditRecord();
    DeviceEventEmitter.emit(REFRESH_EVENT);
    refreshBudgetPlan();
  };

  const save = async () => {
    if (!item || !spec || saving || deleting) return;
    if (spec.title && !title.trim()) {
      setError("Scrie un nume.");
      return;
    }
    const body: Record<string, any> = {};
    const meta: Record<string, any> = { ...(item.metadata ?? {}) };

    if (spec.stationTitle) {
      const station = (extras.station ?? "").trim();
      body.title = station || "Fuel fill-up";
      meta.station = station || null;
    } else if (spec.title) {
      body.title = title.trim();
    }

    if (showAmount && spec.amount) {
      const raw = amount.trim();
      if (!raw) {
        if (!spec.amount.optional && !spec.amountOnlyIfPresent) {
          setError("Scrie suma.");
          return;
        }
        body.amount = null;
        body.currency = null;
      } else {
        const v = toNum(raw);
        const zeroOk = spec.amount.zeroOk || meta.underWarranty === true;
        if (!Number.isFinite(v) || v < 0 || (v === 0 && !zeroOk)) {
          setError(zeroOk ? "Suma nu e validă." : "Suma trebuie să fie mai mare decât 0.");
          return;
        }
        body.amount = v;
        body.currency = "RON";
      }
    }

    if (spec.date) {
      if (!date) {
        if (!spec.date.clearable) {
          setError("Alege data.");
          return;
        }
        body.due_at = null;
      } else if (spec.date.expiry) {
        const prev = meta.expiryDate;
        // Car documents keep "ZZ.LL.AAAA", Casă ones an ISO string.
        meta.expiryDate = prev && isValidDateInput(String(prev)) ? formatDateInput(date) : date;
      } else {
        let next = new Date(date);
        if (spec.time) {
          const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
          const hh = m ? Math.min(23, Number(m[1])) : 9;
          const mm = m ? Math.min(59, Number(m[2])) : 0;
          // Local wall-clock time -> the right UTC instant.
          next = new Date(next.getFullYear(), next.getMonth(), next.getDate(), hh, mm, 0);
          body.due_at = next.toISOString();
        } else if (!item.due_at || localKey(new Date(item.due_at)) !== localKey(next)) {
          // Only when the DAY changed -- an untouched date keeps its saved time.
          body.due_at = next.toISOString();
        }
      }
    }

    for (const e of spec.extras ?? []) {
      const raw = (extras[e.key] ?? "").trim();
      if (e.numeric && raw) {
        const v = toNum(raw);
        if (!Number.isFinite(v) || v < 0) {
          setError(`${e.label}: număr nevalid.`);
          return;
        }
        meta[e.key] = v;
      } else {
        meta[e.key] = raw || null;
      }
    }

    if (spec.notes === "notes") body.notes = notes.trim() || null;
    else if (spec.notes === "meta.notes") meta.notes = notes.trim() || null;
    else if (spec.notes === "meta.description") meta.description = notes.trim();

    body.metadata = meta;

    setSaving(true);
    try {
      await api.updateItem(item.id, body);
      finish();
    } catch (e: any) {
      setSaving(false);
      // Inline, not a ConfirmHost dialog over this sheet (see confirmDelete).
      setError(`Nu am putut salva. ${e?.message || "A apărut o eroare."}`);
    }
  };

  // "Șterge" asks INSIDE this sheet (the footer turns into the question):
  // a ConfirmHost dialog is a second Modal on top of this one, which on
  // iOS didn't show / froze, so records couldn't be deleted (2026-10-15).
  const [confirmDelete, setConfirmDelete] = useState(false);
  const recordName = item ? (item.type === "car_maintenance" ? maintenanceLabel(item.title) : spec?.stationTitle ? "alimentarea" : item.title) : "";

  // A grocery list goes with its products (Complet's handleDeleteList): the
  // server deletes only the list row, and leftover products would still
  // count as "de cumpărat" on Acasă.
  const [listProductIds, setListProductIds] = useState<string[]>([]);
  useEffect(() => {
    if (!confirmDelete || item?.type !== "grocery_list") return;
    let alive = true;
    api
      .listItems({ space_id: item.space_id })
      .then((rows: any[]) => {
        if (!alive) return;
        setListProductIds(rows.filter((r) => r.type === "grocery_item" && String(r.metadata?.listId) === String(item.id)).map((r) => String(r.id)));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [confirmDelete, item]);

  const remove = async () => {
    if (!item || saving || deleting) return;
    setDeleting(true);
    try {
      // Products first: if the list delete then fails, nothing is left
      // pointing at a list that's gone.
      if (item.type === "grocery_list") await Promise.all(listProductIds.map((pid) => api.deleteItem(pid)));
      await api.deleteItem(item.id);
      finish();
    } catch (e: any) {
      setDeleting(false);
      setConfirmDelete(false);
      setError(`Nu am putut șterge. ${e?.message || "A apărut o eroare."}`);
    }
  };

  const setExtra = (key: string, value: string) => {
    setExtras((cur) => ({ ...cur, [key]: value }));
    setError(null);
  };

  const dateText = date ? roDate(new Date(date), { withYear: true }) : null;

  return (
    <Sheet
      visible
      onClose={closeEditRecord}
      title={`Editează · ${heading}`}
      tone={tone}
      testID="edit-record-sheet"
      footer={
        item && spec ? (
          confirmDelete ? (
            <View style={{ gap: spacing.sm }} testID="edit-record-confirm-delete">
              <Text style={{ fontSize: 15, lineHeight: 21, color: colors.onSurface, textAlign: "center", paddingBottom: spacing.xs }}>
                Ștergi definitiv „{recordName}”?
                {item.type === "grocery_list" && listProductIds.length > 0 ? ` Se șterg și cele ${roCount(listProductIds.length, "produs", "produse")} de pe ea.` : ""} Nu se poate anula.
              </Text>
              <Button testID="edit-record-delete-yes" variant="destructive" icon="trash-outline" label="Da, șterge" onPress={remove} loading={deleting} />
              <Button testID="edit-record-delete-no" variant="ghost" label="Renunță" onPress={() => setConfirmDelete(false)} disabled={deleting} />
            </View>
          ) : (
            <View style={{ gap: spacing.sm }}>
              <Button testID="edit-record-save" label="Salvează" tone={sc?.fill ?? (item.type === "custom_event" ? CUSTOM_EVENT_COLOR : undefined)} onPress={save} loading={saving} disabled={deleting} />
              <Button testID="edit-record-delete" variant="ghost" icon="trash-outline" label="Șterge" onPress={() => setConfirmDelete(true)} disabled={saving} />
            </View>
          )
        ) : null
      }
    >
      {loadFailed ? (
        <Text style={{ fontSize: 15, lineHeight: 22, color: colors.onSurfaceTertiary, paddingBottom: spacing.lg }}>
          Nu am putut deschide înregistrarea. Încearcă din nou.
        </Text>
      ) : !item || !spec ? (
        <ActivityIndicator color={colors.onSurfaceTertiary} style={{ paddingVertical: spacing.xl }} />
      ) : (
        <>
          {spec.title ? (
            <Field
              testID="edit-record-title"
              label={spec.title.label}
              value={title}
              onChangeText={(t) => {
                setTitle(t);
                setError(null);
              }}
              placeholder={spec.title.placeholder}
              tone={tone}
            />
          ) : null}
          {spec.stationTitle ? (
            <Field testID="edit-record-station" label="Benzinărie" value={extras.station ?? ""} onChangeText={(t) => setExtra("station", t)} placeholder="ex. OMV" tone={tone} />
          ) : null}

          {showAmount || spec.date ? (
            <View style={{ flexDirection: "row", gap: spacing.md, alignItems: "flex-end" }}>
              {showAmount && spec.amount ? (
                <View style={{ flex: 1.3 }}>
                  <Field
                    testID="edit-record-amount"
                    label={spec.amount.label}
                    value={amount}
                    onChangeText={(t) => {
                      setAmount(t);
                      setError(null);
                    }}
                    placeholder="0"
                    keyboardType="decimal-pad"
                    suffix="lei"
                    tone={tone}
                  />
                </View>
              ) : null}
              {spec.date ? (
                <View style={{ flex: 1 }}>
                  <FieldButton
                    testID="edit-record-date"
                    label={spec.date.label}
                    value={dateText}
                    placeholder={spec.date.clearable ? "Fără dată" : "Alege"}
                    onPress={() => setPicker(true)}
                  />
                </View>
              ) : null}
            </View>
          ) : null}

          {spec.time ? (
            <Field testID="edit-record-time" label="Ora" value={time} onChangeText={setTime} placeholder="09:00" keyboardType="numbers-and-punctuation" tone={tone} />
          ) : null}

          {(spec.extras ?? []).map((e) => (
            <Field
              key={e.key}
              testID={`edit-record-${e.key}`}
              label={e.label}
              value={extras[e.key] ?? ""}
              onChangeText={(t) => setExtra(e.key, t)}
              placeholder={e.placeholder}
              keyboardType={e.numeric ? "decimal-pad" : undefined}
              suffix={e.suffix}
              hint={e.key === "odometer" ? kmHint : undefined}
              tone={tone}
            />
          ))}

          {spec.notes ? (
            <Field testID="edit-record-notes" label="Notă (opțional)" value={notes} onChangeText={setNotes} placeholder="Orice detaliu util" multiline tone={tone} />
          ) : null}

          {error ? (
            <View style={{ padding: spacing.md, borderRadius: radius.md, backgroundColor: `${colors.error}14` }}>
              <Text style={{ fontSize: 14, color: colors.error }}>{error}</Text>
            </View>
          ) : null}

          {/* Nested inside the form sheet (a sibling Modal can fail to show on iOS). */}
          {picker && spec.date ? (
            <DatePickerSheet
              value={date ?? undefined}
              range={spec.date.range ?? "any"}
              clearable={!!spec.date.clearable}
              title={spec.date.label === "Când" ? "Alege data" : spec.date.label}
              onCancel={() => setPicker(false)}
              onSelect={(iso) => {
                setDate(iso ?? null);
                setError(null);
                setPicker(false);
              }}
            />
          ) : null}
        </>
      )}
    </Sheet>
  );
}
