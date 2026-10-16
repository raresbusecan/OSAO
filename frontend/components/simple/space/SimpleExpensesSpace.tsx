import React, { useMemo } from "react";
import { lei, roDate } from "@/lib/format";
import { getThisMonthExpensesTotal } from "@/lib/spaces/expenses/calculations/dashboard.calculations";
import { TeaserCard } from "@/components/simple/Teaser";
import { openEditRecord } from "@/lib/simpleSheets";
import type { SimpleSpaceProps } from "./SimpleSpaceScreen";
import { CalmLine, HistoryMonthBadge, ShowAllLine, SimpleCard, SimpleHero, SimplePage, SpendLine, deleteRecordWithConfirm, isThisMonth, useHistoryMonth, useShowAll, useSimpleSpaceColors, useSpaceAccent } from "./SimpleSpaceParts";

/**
 * Cheltuieli in orgOS Simplu: this month's total in the hero (nothing to
 * resolve here), the latest entries, and one Complet teaser. "Spent" is
 * the full Cheltuieli dashboard's rule: this space's own expenses + the
 * Calendar purchases whose day has come (a planned one is mentioned, not
 * counted). Credits are not expenses and never appear here.
 */
export function SimpleExpensesSpace({ space, expensesData, calendarPurchases, onChanged, onBack }: SimpleSpaceProps) {
  const c = useSimpleSpaceColors(space, "expenses");
  useSpaceAccent(space, c);

  const entries = useMemo(
    () => [...expensesData.entries, ...calendarPurchases.filter((e) => !e.planned)],
    [expensesData.entries, calendarPurchases],
  );
  const monthTotal = useMemo(() => getThisMonthExpensesTotal({ entries }), [entries]);
  const plannedTotal = useMemo(
    () => calendarPurchases.filter((e) => e.planned && isThisMonth(e.date)).reduce((sum, e) => sum + e.price, 0),
    [calendarPurchases],
  );
  // The list card: this month and the 2 before it, stepped with ‹ › (same
  // as Mașină -- user decision 2026-10-15). Spent only: a Calendar purchase
  // still ahead stays out (the hero mentions it).
  const history = useHistoryMonth();
  const latest = useMemo(
    () =>
      entries
        .filter((e) => history.inMonth(e.date))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    // history.inMonth changes with the month shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, history.month],
  );
  const shownTotal = latest.reduce((sum, e) => sum + (Number(e.price) || 0), 0);
  const latestRows = useShowAll(latest, 5, history.offset);

  const month = new Date().toLocaleDateString("ro-RO", { month: "long" });
  const monthLabel = month.charAt(0).toUpperCase() + month.slice(1);

  return (
    <SimplePage title={space.name} subtitle={monthLabel} onBack={onBack} onRefresh={onChanged} testID="simple-expenses-space">
      <SimpleHero
        c={c}
        kicker="Cheltuit luna asta"
        title={lei(monthTotal)}
        detail={plannedTotal > 0 ? `Încă ${lei(plannedTotal)} planificat în Calendar` : null}
        testID="simple-expenses-hero"
      />

      <SimpleCard
        title={history.title}
        // This month's total is the hero right above -- the card repeats it
        // only for a past month.
        badge={<HistoryMonthBadge history={history} total={history.offset !== 0 && shownTotal > 0 ? lei(shownTotal) : null} testIDPrefix="simple-expenses-month" />}
        testID="simple-expenses-latest"
      >
        {latest.length === 0 ? (
          <CalmLine text={history.offset === 0 ? "Nimic cheltuit luna asta. Adaugă cu + de jos." : history.emptyText} />
        ) : (
          latestRows.visible.map((e) => (
            <SpendLine
              key={e.id}
              what={e.name}
              when={roDate(e.date, { short: true })}
              amount={lei(e.price)}
              // A Calendar purchase is a custom event, id "ev-<item id>-<day>".
              onPress={() => openEditRecord(/^ev-(\d+)-/.exec(e.id)?.[1] ?? e.id)}
              // Not a Calendar purchase: that row is one occurrence of an
              // event (it's deleted from the event itself).
              onDelete={e.id.startsWith("ev-") ? undefined : () => deleteRecordWithConfirm(e.id, e.name, onChanged)}
            />
          ))
        )}
        <ShowAllLine more={latestRows.more} testID="simple-expenses-latest-all" />
      </SimpleCard>

      <TeaserCard testID="simple-expenses-teaser" title="Cât îți rămâne din venit" subtitle="Spui cât câștigi și vezi cât mai poți cheltui, în Complet." />
    </SimplePage>
  );
}
