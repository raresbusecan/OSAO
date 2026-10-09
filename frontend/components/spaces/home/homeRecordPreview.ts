import type { Ionicons } from "@expo/vector-icons";
import type { HomeData } from "./home.data.types";
import { HOME_CATEGORIES } from "./homeCategoryConfig";
import { lei, roCount, roDate, roUnit, daysFromToday } from "@/lib/format";
import { parseDocDate } from "@/lib/dashboard/documentRenewal";
import { supplyStatus } from "@/lib/spaces/home/calculations/dashboard.calculations";

/**
 * What the Casă record sheet shows for one record (design-lead spec v2,
 * "Tap = preview"): its title, type, a timing/status line for dated
 * records, and read-only fields -- only the ones that have a value
 * (never "—"). Built from homeData alone so every Casă screen (the
 * dashboard's "De rezolvat", Sarcini, Facturi, Mentenanță, Documente,
 * Provizii, Cheltuieli) previews a record the same way.
 */

export type HomeRecordKind = "task" | "recurring" | "maintenance" | "document" | "supply" | "expense";
type IconName = keyof typeof Ionicons.glyphMap;

export type HomeRecordPreview = {
  kind: HomeRecordKind;
  id: string;
  title: string;
  typeLabel: string;
  icon: IconName;
  /** Overdue / today / upcoming, in words; null for undated records. */
  status: { text: string; tone: "error" | "warning" | "muted" } | null;
  /** Short field rows (label left, value right). */
  fields: { label: string; value: string }[];
  /** Long text (note, description) shown stacked under the rows. */
  longFields: { label: string; value: string }[];
};

export const RECORD_KIND: Record<HomeRecordKind, { label: string; icon: IconName }> = {
  task: { label: "Sarcină", icon: "checkmark-circle-outline" },
  recurring: { label: "Factură", icon: HOME_CATEGORIES.find((c) => c.key === "recurring")!.icon as IconName },
  maintenance: { label: "Mentenanță", icon: HOME_CATEGORIES.find((c) => c.key === "maintenance")!.icon as IconName },
  document: { label: "Document", icon: "document-text-outline" },
  supply: { label: "Provizie", icon: "basket-outline" },
  expense: { label: "Cheltuială", icon: HOME_CATEGORIES.find((c) => c.key === "expenses")!.icon as IconName },
};

const FREQ: Record<string, string> = { daily: "Zilnic", weekly: "Săptămânal", monthly: "Lunar", yearly: "Anual" };

/** "Restantă de 5 zile" / "Azi" / "Mâine" / "În 3 zile" -- the wording
 * every Casă row and preview uses for a due date. */
export function dueText(days: number): { text: string; tone: "error" | "warning" | "muted" } {
  if (days < 0) return { text: `Restantă de ${roCount(-days, "zi", "zile")}`, tone: "error" };
  if (days === 0) return { text: "Azi", tone: "warning" };
  if (days === 1) return { text: "Mâine", tone: "muted" };
  return { text: `În ${roCount(days, "zi", "zile")}`, tone: "muted" };
}

/** Same for a document's validity end. */
export function expiryText(days: number): { text: string; tone: "error" | "warning" | "muted" } {
  if (days < 0) return { text: `Expirat de ${roCount(-days, "zi", "zile")}`, tone: "error" };
  if (days === 0) return { text: "Expiră azi", tone: "warning" };
  return { text: `Expiră în ${roCount(days, "zi", "zile")}`, tone: "muted" };
}

const lastSpend = (history?: { date: string; amount: number }[]) =>
  history && history.length > 0 ? [...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] : null;

const docDate = (v?: string) => {
  const d = parseDocDate(v);
  return d ? `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}` : null;
};

export function buildHomeRecordPreview(homeData: HomeData, kind: HomeRecordKind, id: string): HomeRecordPreview | null {
  const base = (title: string) => ({ kind, id, title, typeLabel: RECORD_KIND[kind].label, icon: RECORD_KIND[kind].icon });
  const rows = (pairs: [string, string | null | undefined | false][]) =>
    pairs.filter(([, v]) => !!v).map(([label, value]) => ({ label, value: value as string }));

  if (kind === "task") {
    const t = homeData.taskEntries.find((e) => e.id === id);
    if (!t) return null;
    const last = lastSpend(t.spendHistory);
    return {
      ...base(t.title),
      status: !t.completed && t.dueDate ? dueText(daysFromToday(t.dueDate)) : null,
      fields: rows([
        ["Scadentă pe", t.dueDate ? roDate(t.dueDate) : "Fără dată"],
        ["Se repetă", t.isRecurring && t.recurrenceFrequency ? FREQ[t.recurrenceFrequency] : null],
        ["Cumpărare", t.isPurchase ? "Da, prețul îl treci la rezolvare" : null],
        ["Ultimul preț", last ? `${lei(last.amount)}, ${roDate(last.date)}` : null],
        ["Rezolvată", t.completed && t.completedAt ? roDate(t.completedAt) : null],
      ]),
      longFields: rows([["Notă", t.notes]]),
    };
  }

  if (kind === "recurring") {
    const r = homeData.recurringEntries.find((e) => e.id === id);
    if (!r) return null;
    const last = lastSpend(r.spendHistory);
    return {
      ...base(r.title),
      status: dueText(daysFromToday(r.nextDueDate)),
      fields: rows([
        ["Sumă", r.amount ? lei(r.amount) : null],
        ["Se repetă", FREQ[r.frequency] ?? null],
        ["Scadentă pe", roDate(r.nextDueDate)],
        ["Ultima plată", last ? `${lei(last.amount)}, ${roDate(last.date)}` : null],
      ]),
      longFields: rows([["Notă", r.notes]]),
    };
  }

  if (kind === "maintenance") {
    const m = homeData.maintenanceEntries.find((e) => e.id === id);
    if (!m) return null;
    const every =
      m.isRecurring && m.recurrenceFrequency
        ? (m.recurrenceInterval ?? 1) > 1
          ? `La fiecare ${roCount(m.recurrenceInterval!, m.recurrenceFrequency === "weekly" ? "săptămână" : m.recurrenceFrequency === "monthly" ? "lună" : "an", m.recurrenceFrequency === "weekly" ? "săptămâni" : m.recurrenceFrequency === "monthly" ? "luni" : "ani")}`
          : FREQ[m.recurrenceFrequency]
        : null;
    return {
      ...base(m.service),
      status: !m.completed && m.nextDueDate ? dueText(daysFromToday(m.nextDueDate)) : null,
      fields: rows([
        ["Preț", m.price ? lei(m.price) : null],
        ["Furnizor", m.provider],
        ["Următoarea dată", m.nextDueDate ? roDate(m.nextDueDate) : null],
        ["Se repetă", every],
        ["Ultima dată", m.date ? roDate(m.date) : null],
      ]),
      longFields: rows([["Descriere", m.description]]),
    };
  }

  if (kind === "document") {
    const d = homeData.documentEntries.find((e) => e.id === id);
    if (!d) return null;
    const issue = docDate(d.issueDate);
    const expiry = docDate(d.expiryDate);
    const expiryParsed = parseDocDate(d.expiryDate);
    return {
      ...base(d.title),
      status: expiryParsed ? expiryText(daysFromToday(expiryParsed.toISOString())) : null,
      fields: rows([
        ["Tip", d.documentType && d.documentType !== "Other" ? d.documentType : null],
        ["Valabil", issue && expiry ? `${issue} – ${expiry}` : expiry ? `până pe ${expiry}` : null],
        ["Emis de", d.issuer],
      ]),
      longFields: [],
    };
  }

  if (kind === "supply") {
    const s = homeData.supplyEntries.find((e) => e.id === id);
    if (!s) return null;
    const st = supplyStatus(s);
    return {
      ...base(s.name),
      status: st.daysLeft !== null ? { text: st.label, tone: st.tone } : null,
      fields: rows([
        ["Cantitate", `${s.quantity} ${roUnit(s.unit)}`.trim()],
        ["Estimare", st.daysLeft === null ? st.label : null],
        ["Ultima cumpărare", s.lastRestockedDate ? roDate(s.lastRestockedDate) : null],
        ["Categorie", s.category && s.category !== "Other" ? s.category : null],
      ]),
      longFields: rows([["Notă", s.notes]]),
    };
  }

  const e = homeData.expenseEntries.find((x) => x.id === id);
  if (!e) return null;
  return {
    ...base(e.title),
    status: null,
    fields: rows([
      ["Sumă", lei(e.amount)],
      ["Data", e.date ? roDate(e.date) : null],
    ]),
    longFields: rows([["Notă", e.notes]]),
  };
}
