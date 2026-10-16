import React, { useMemo, useState } from "react";
import { DeviceEventEmitter } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { lei, roCount, roDate, roRelativeDays } from "@/lib/format";
import { resolveFromSummary, type ActionItem } from "@/lib/dashboard/itemActions";
import {
  getHomeDueList,
  getThisMonthHomeExpenses,
  monthlyBillsTotal,
  nextTaskOccurrence,
  type HomeDueRow,
} from "@/lib/spaces/home/calculations/dashboard.calculations";
import { filterSpendByPeriod, getHomeSpendRecords } from "@/lib/spaces/home/calculations/spend.calculations";
import { taskEntryToItemBody } from "@/lib/spaces/home/homeItems";
import type { HomeTaskEntry } from "@/lib/spaces/home/home.types";
import { notifyAction } from "@/lib/confirm";
import { HomeTaskResolveSheet } from "@/components/spaces/home/HomeTaskResolveSheet";
import { TeaserCard } from "@/components/simple/Teaser";
import { openEditRecord } from "@/lib/simpleSheets";
import { REFRESH_EVENT } from "@/app/(tabs)/_layout";
import type { SimpleSpaceProps } from "./SimpleSpaceScreen";
import { CalmLine, DotLine, ShowAllLine, SimpleCard, SimpleHero, SimplePage, SpendLine, deleteRecordWithConfirm, useShowAll, useSimpleSpaceColors, useSpaceAccent, weekdayDate } from "./SimpleSpaceParts";

const ITEM_TYPE: Record<Exclude<HomeDueRow["kind"], "supply">, string> = {
  task: "home_task",
  maintenance: "home_maintenance",
  recurring: "home_recurring",
  document: "home_document",
};

/** "restant de 3 zile" / "azi" / "mâine" / "în 5 zile". */
function whenText(days: number): string {
  if (days < 0) return `restant de ${roCount(-days, "zi", "zile")}`;
  return roRelativeDays(days).toLowerCase();
}

function dateIn(days: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
}

/**
 * Casă in orgOS Simplu (same pattern as Mașină): the most urgent open
 * record (task / bill / maintenance / document, the full Casă dashboard's
 * day rule -- getHomeDueList) with "Am rezolvat", what comes after it,
 * this month's spend, and one Complet teaser. Supplies stay in Complet.
 */
export function SimpleHomeSpace({ space, homeData, onChanged, onBack }: SimpleSpaceProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const c = useSimpleSpaceColors(space, "home");
  useSpaceAccent(space, c);
  const [busy, setBusy] = useState(false);

  // Every dated open record, most urgent first (no horizon: the hero is
  // "the next thing", however far it is).
  const due = useMemo(() => getHomeDueList(homeData, Number.MAX_SAFE_INTEGER).filter((r) => r.kind !== "supply"), [homeData]);
  const hero = due[0] ?? null;
  const after = due.slice(1, 5);

  const bills = monthlyBillsTotal(homeData);
  const subtitle = bills > 0 ? `Facturi de ${lei(Math.round(bills))} pe lună` : null;

  /** The ActionItem resolveFromSummary needs. The dashboard's lists carry
   * the server-projected due date (recurring bills/tasks, a visit's next
   * date), so an entry from there wins; the raw item is the fallback for
   * anything further out than its 7-day window. */
  const buildActionItem = async (row: HomeDueRow): Promise<ActionItem | null> => {
    const type = ITEM_TYPE[row.kind as keyof typeof ITEM_TYPE];
    if (!type) return null;
    try {
      const d = await api.dashboard();
      const hit = [...d.overdue, ...d.today, ...d.upcoming].find(
        (x: any) => String(x.id) === row.id && x.type === type && String(x.space?.id) === String(space.id),
      );
      if (hit) return { ...hit, space: { id: space.id } } as ActionItem;
    } catch {
      // fall through to the raw item
    }
    const raw: any = await api.getItem(row.id);
    const meta = raw.metadata ?? {};
    const dueAt =
      type === "home_document" ? meta.expiryDate : type === "home_maintenance" ? meta.nextDueDate ?? raw.due_at : raw.due_at;
    return {
      id: raw.id,
      type,
      title: raw.title,
      due_at: dueAt ?? dateIn(row.daysRemaining).toISOString(),
      amount: raw.amount,
      recurrence: raw.recurrence ?? null,
      metadata: meta,
      space: { id: space.id },
    };
  };

  // A purchase task asks for its price first (Complet's HomeTaskResolveSheet),
  // so what was bought lands in "Luna asta" and in Acasă's month total.
  const [priceTask, setPriceTask] = useState<HomeTaskEntry | null>(null);

  /** Complet's HomeDashboard.resolveTask, same saved shape: a price logs a
   * spendHistory event dated now. */
  const resolvePurchase = async (entry: HomeTaskEntry, price: number | undefined, explicitNextDue?: string, guiltFree?: boolean) => {
    setPriceTask(null);
    const now = new Date().toISOString();
    const nextDue = entry.isRecurring ? (explicitNextDue ?? nextTaskOccurrence(entry.dueDate, entry.recurrenceFrequency)) : entry.dueDate;
    const updated: HomeTaskEntry = {
      ...entry,
      completed: !entry.isRecurring,
      completedAt: now,
      dueDate: nextDue,
      price: price ?? entry.price,
      guiltFree: guiltFree ?? entry.guiltFree,
      spendHistory: price ? [...(entry.spendHistory ?? []), { date: now, amount: price }] : entry.spendHistory,
    };
    setBusy(true);
    try {
      await api.updateItem(entry.id, taskEntryToItemBody(space.id, updated));
      if (entry.isRecurring && nextDue) notifyAction("Rezolvată", `Următoarea dată: ${roDate(nextDue)}.`);
      DeviceEventEmitter.emit(REFRESH_EVENT);
    } catch (error: any) {
      notifyAction("Nu am putut marca drept rezolvat", error?.message || "A apărut o eroare.");
    } finally {
      setBusy(false);
    }
  };

  const resolve = async () => {
    if (!hero || busy) return;
    if (hero.kind === "task") {
      const task = homeData.taskEntries.find((t) => t.id === hero.id);
      if (task?.isPurchase) {
        setPriceTask(task);
        return;
      }
    }
    setBusy(true);
    try {
      const item = await buildActionItem(hero);
      if (!item) return;
      const changed = await resolveFromSummary(item, (href) => router.push(href as any));
      // [id].tsx reloads on REFRESH_EVENT (= onChanged), and so do Acasă/Calendar.
      if (changed) DeviceEventEmitter.emit(REFRESH_EVENT);
    } catch {
      // resolveFromSummary reports its own errors; a failed fetch just leaves things as they were.
    } finally {
      setBusy(false);
    }
  };

  // This month's spend: the full Casă dashboard's total and records.
  const monthTotal = getThisMonthHomeExpenses(homeData);
  const recentSpend = useMemo(
    () => filterSpendByPeriod(getHomeSpendRecords(homeData), { kind: "thisMonth" }).filter((r) => r.amount > 0),
    [homeData],
  );
  const spendRows = useShowAll(recentSpend, 3);

  const tone = (r: HomeDueRow) => (r.urgency === "late" ? colors.error : r.urgency === "today" ? colors.warning : c.color);

  return (
    <SimplePage title={space.name} subtitle={subtitle} onBack={onBack} onRefresh={onChanged} testID="simple-home-space">
      {hero ? (
        <SimpleHero
          c={c}
          kicker="Următorul lucru important"
          title={hero.title}
          detail={[
            hero.daysRemaining < 0 ? `Restant de ${roCount(-hero.daysRemaining, "zi", "zile")}` : weekdayDate(dateIn(hero.daysRemaining)),
            hero.amount ? lei(hero.amount) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          onAction={resolve}
          onPress={() => openEditRecord(hero.id)}
          busy={busy}
          testID="simple-home-hero"
        />
      ) : (
        <SimpleHero c={c} kicker="Următorul lucru important" title="Totul e la zi" detail="Nimic programat deocamdată." testID="simple-home-hero" />
      )}

      <SimpleCard title="Urmează" testID="simple-home-next">
        {after.length === 0 ? (
          <CalmLine text={hero ? "Nimic altceva programat." : "Adaugă cu + de jos."} />
        ) : (
          after.map((r) => (
            <DotLine
              key={`${r.kind}-${r.id}`}
              dot={tone(r)}
              name={r.title}
              right={r.daysRemaining > 7 ? roDate(dateIn(r.daysRemaining), { short: true }) : whenText(r.daysRemaining)}
              rightColor={r.urgency === "later" ? colors.onSurfaceTertiary : tone(r)}
              onPress={() => openEditRecord(r.id)}
            />
          ))
        )}
      </SimpleCard>

      <SimpleCard title="Luna asta" right={monthTotal > 0 ? lei(monthTotal) : null} testID="simple-home-month">
        {recentSpend.length === 0 ? (
          <CalmLine text="Nimic cheltuit luna asta." />
        ) : (
          spendRows.visible.map((r) => (
            <SpendLine
              key={r.id}
              what={r.title}
              when={roDate(r.date, { short: true })}
              amount={lei(r.amount)}
              onPress={() => openEditRecord(r.entryId)}
              // Only a plain expense is one record = one row. A bill / task /
              // visit row is ONE payment of it -- swiping it must never
              // delete the whole bill (that stays in its editor).
              onDelete={r.category === "expense" ? () => deleteRecordWithConfirm(r.entryId, r.title, onChanged) : undefined}
            />
          ))
        )}
        <ShowAllLine more={spendRows.more} testID="simple-home-month-all" />
      </SimpleCard>

      <TeaserCard testID="simple-home-teaser" title="Provizii care se termină" subtitle="Îți spunem din timp ce trebuie cumpărat, în Complet." />

      {priceTask ? (
        <HomeTaskResolveSheet
          entry={priceTask}
          onCancel={() => setPriceTask(null)}
          onResolve={(price, nextDue, guiltFree) => resolvePurchase(priceTask, price, nextDue, guiltFree)}
        />
      ) : null}
    </SimplePage>
  );
}
