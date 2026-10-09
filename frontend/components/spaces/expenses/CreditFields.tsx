import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useTheme } from "@/lib/theme";
import { capitalize, lei, roCount, roDate } from "@/lib/format";
import { SPACE_IDENTITY_COLORS, SPACE_ON_FILL } from "@/lib/spaces/spaceProfile";
import { creditEndAsDate, remainingRates } from "@/lib/spaces/expenses/credits";
import { Sheet } from "@/components/ui/Sheet";
import { CircleButton, Field, FieldButton } from "@/components/ui/primitives";

/**
 * The credit fields shared by CreditSheet (Cheltuieli › Credite) and the
 * car/home create forms' "În rate" toggle: Nume, Rata lunară, Ziua plății,
 * Ultima rată (month picker) + the "Mai sunt N rate" caption. Same copy and
 * rules in both places -- `creditDraftError` mirrors the backend's
 * App\Support\ItemBudgetRules.
 */

/** What the user typed; `amount` is the raw text ("1450,50"). */
export type CreditDraft = {
  title: string;
  amount: string;
  dayOfMonth: number;
  /** "YYYY-MM-DD", the last instalment; "" until picked. */
  endDate: string;
};

export function emptyCreditDraft(title = ""): CreditDraft {
  return { title, amount: "", dayOfMonth: new Date().getDate(), endDate: "" };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** The last instalment's date in `year`/`month`, the day clamped to the
 * month's length (31 -> 30 in April). */
export function endDateFor(year: number, month: number, dayOfMonth: number): string {
  const daysIn = new Date(year, month + 1, 0).getDate();
  return `${year}-${pad(month + 1)}-${pad(Math.min(dayOfMonth, daysIn))}`;
}

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseCreditAmount(amount: string): number {
  return Number(amount.replace(",", "."));
}

/** The first problem with a draft (Romanian, shown as-is), or null. A new
 * credit's last instalment can't be in the past. */
export function creditDraftError(d: CreditDraft, isNew = true): string | null {
  const amount = parseCreditAmount(d.amount);
  if (!d.title.trim()) return "Scrie un nume pentru credit.";
  if (!d.amount.trim() || Number.isNaN(amount) || amount <= 0) return "Rata lunară trebuie să fie mai mare decât 0.";
  if (!d.endDate) return "Alege luna ultimei rate.";
  if (isNew && d.endDate < todayYmd()) return "Ultima rată nu poate fi în trecut.";
  return null;
}

/** Body for the API: POST /spaces' `credit` (snake_case, amount parsed). */
export function creditDraftToApi(d: CreditDraft) {
  return {
    title: d.title.trim(),
    amount: parseCreditAmount(d.amount),
    day_of_month: d.dayOfMonth,
    end_date: d.endDate,
  };
}

export function CreditFields({
  draft,
  onChange,
  tone = SPACE_IDENTITY_COLORS.expenses!,
  onTone = SPACE_ON_FILL.expenses!,
  allowPastEnd = false,
  testIDPrefix = "credit",
  namePlaceholder = "ex. Leasing mașină",
}: {
  draft: CreditDraft;
  onChange: (next: CreditDraft) => void;
  /** Fill color of the selected day/month (the Space's identity color). */
  tone?: string;
  /** Ink on `tone`. */
  onTone?: string;
  /** Editing an existing credit may keep a past end month. */
  allowPastEnd?: boolean;
  testIDPrefix?: string;
  namePlaceholder?: string;
}) {
  const { colors, spacing } = useTheme();
  const [dayPickerOpen, setDayPickerOpen] = useState(false);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);

  const parsedAmount = parseCreditAmount(draft.amount);
  const end = draft.endDate ? creditEndAsDate(draft.endDate) : null;
  const rates = end ? remainingRates({ dayOfMonth: draft.dayOfMonth, endDate: draft.endDate }) : 0;
  const set = (patch: Partial<CreditDraft>) => onChange({ ...draft, ...patch });

  const changeDay = (day: number) => {
    // The last instalment falls on the payment day too.
    set({ dayOfMonth: day, ...(end ? { endDate: endDateFor(end.getFullYear(), end.getMonth(), day) } : {}) });
    setDayPickerOpen(false);
  };

  return (
    <>
      <Field testID={`${testIDPrefix}-name`} label="Nume" value={draft.title} onChangeText={(title) => set({ title })} placeholder={namePlaceholder} tone={tone} />
      <Field
        testID={`${testIDPrefix}-amount`}
        label="Rata lunară"
        value={draft.amount}
        onChangeText={(amount) => set({ amount })}
        keyboardType="decimal-pad"
        big
        suffix="lei"
        tone={tone}
        placeholder="0"
      />
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <FieldButton testID={`${testIDPrefix}-day`} label="Ziua plății" value={`${draft.dayOfMonth} ale lunii`} icon="chevron-down" onPress={() => setDayPickerOpen(true)} />
        </View>
        <View style={{ flex: 1 }}>
          <FieldButton
            testID={`${testIDPrefix}-end`}
            label="Ultima rată"
            value={end ? roDate(end, { withYear: true }) : null}
            placeholder="Alege luna"
            onPress={() => setMonthPickerOpen(true)}
          />
        </View>
      </View>
      {end ? (
        <Text testID={`${testIDPrefix}-remaining`} style={{ fontSize: 13, color: colors.onSurfaceTertiary, marginTop: -spacing.sm }}>
          {rates > 0
            ? `Mai sunt ${roCount(rates, "rată", "rate")}, ${lei(Math.round(rates * (parsedAmount > 0 ? parsedAmount : 0) * 100) / 100)} în total.`
            : "Nu mai e nicio rată de plătit."}
        </Text>
      ) : null}

      {dayPickerOpen ? (
        <DayPickerSheet value={draft.dayOfMonth} tone={tone} onTone={onTone} testIDPrefix={testIDPrefix} onSelect={changeDay} onClose={() => setDayPickerOpen(false)} />
      ) : null}
      {monthPickerOpen ? (
        <MonthPickerSheet
          value={end}
          allowPast={allowPastEnd}
          tone={tone}
          onTone={onTone}
          testIDPrefix={testIDPrefix}
          onClose={() => setMonthPickerOpen(false)}
          onSelect={(year, month) => {
            set({ endDate: endDateFor(year, month, draft.dayOfMonth) });
            setMonthPickerOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

type PickerTone = { tone: string; onTone: string; testIDPrefix: string };

/** "Ziua plății": a plain grid of 1-31 (29-31 fall back to the month's
 * last day in shorter months). */
function DayPickerSheet({ value, onSelect, onClose, tone, onTone, testIDPrefix }: PickerTone & { value: number; onSelect: (day: number) => void; onClose: () => void }) {
  const { colors } = useTheme();
  return (
    <Sheet visible onClose={onClose} title="Ziua plății" subtitle="În lunile mai scurte, ultima zi a lunii.">
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => {
          const on = d === value;
          return (
            <Pressable
              key={d}
              testID={`${testIDPrefix}-day-${d}`}
              onPress={() => onSelect(d)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={{ width: `${100 / 7}%`, height: 46, alignItems: "center", justifyContent: "center" }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: on ? tone : "transparent" }}>
                <Text style={{ fontSize: 15, fontWeight: on ? "600" : "400", color: on ? onTone : colors.onSurface }}>{d}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

/** "Ultima rată": month + year. DatePickerSheet only reaches 24 months
 * ahead, and a credit often runs 5+ years; the day itself is always the
 * payment day, so only the month is picked here. */
function MonthPickerSheet({
  value,
  allowPast,
  onSelect,
  onClose,
  tone,
  onTone,
  testIDPrefix,
}: PickerTone & {
  value: Date | null;
  allowPast: boolean;
  onSelect: (year: number, month: number) => void;
  onClose: () => void;
}) {
  const { colors, radius } = useTheme();
  const now = new Date();
  const minYear = allowPast ? Math.min(now.getFullYear(), value?.getFullYear() ?? now.getFullYear()) - 5 : now.getFullYear();
  const maxYear = now.getFullYear() + 40;
  const [year, setYear] = useState(value?.getFullYear() ?? now.getFullYear());

  return (
    <Sheet visible onClose={onClose} title="Ultima rată">
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <CircleButton icon="chevron-back" label="Anul trecut" onPress={() => setYear((y) => Math.max(minYear, y - 1))} disabled={year <= minYear} />
        <Text style={{ fontSize: 17, fontWeight: "600", color: colors.onSurface }}>{year}</Text>
        <CircleButton icon="chevron-forward" label="Anul următor" onPress={() => setYear((y) => Math.min(maxYear, y + 1))} disabled={year >= maxYear} />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 8 }}>
        {Array.from({ length: 12 }, (_, m) => {
          const disabled = !allowPast && (year < now.getFullYear() || (year === now.getFullYear() && m < now.getMonth()));
          const on = !!value && value.getFullYear() === year && value.getMonth() === m;
          const label = capitalize(new Date(year, m, 1).toLocaleDateString("ro-RO", { month: "short" }).replace(".", ""));
          return (
            <View key={m} style={{ width: "33.333%", paddingHorizontal: 4 }}>
              <Pressable
                testID={`${testIDPrefix}-end-month-${m + 1}`}
                disabled={disabled}
                onPress={() => onSelect(year, m)}
                accessibilityRole="button"
                accessibilityState={{ selected: on, disabled }}
                style={{
                  height: 48,
                  borderRadius: radius.control,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: on ? tone : colors.surfaceTertiary,
                  opacity: disabled ? 0.35 : 1,
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: on ? "600" : "400", color: on ? onTone : colors.onSurface }}>{label}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </Sheet>
  );
}
