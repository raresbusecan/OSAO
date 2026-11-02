import type { Widget } from "./layout";

/**
 * Acasă hides a card that has nothing to show, so a brand-new account
 * (no spaces, no records) sees only "Cheltuit în luna asta". This is the
 * ONE place that decides it -- pure, no React. Rules:
 *
 * - Only in normal view. Edit mode (the pencil) lists every card in the
 *   layout with its own empty state, so it can still be moved/removed.
 * - Never touches the saved layout: home.tsx filters a copy, BEFORE
 *   toRows(), so a hidden card leaves no half-empty compact row.
 * - Each check mirrors what that card itself renders -- "has content"
 *   is exactly "the card would NOT fall back to its empty/Missing state".
 *   Keep them in sync when a card changes what it reads.
 *
 * `ctx` is a structural subset of HomeCtx (components/home/HomeWidgets.tsx)
 * so this file doesn't import from components/.
 */
export type VisibilityCtx = {
  dashboard: any;
  budget: any;
  spaces: { id: string; kind: string }[];
  todoRows: { space?: { id: number | string } | null; days: number }[];
  reminderRows: { space?: { id: number | string } | null; days: number }[];
  dueRows: { spaceId?: string }[];
  bills: any[];
  goal: { target_amount: number; current_amount: number } | null;
  hasPlan: boolean;
};

export function widgetHasContent(widget: Widget, ctx: VisibilityCtx): boolean {
  const s = widget.settings ?? {};
  switch (widget.type) {
    // Always shown: it's the page's anchor, and at 0 it already reads
    // fine ("0 lei", "Nicio cheltuială...", "Setează un buget lunar").
    case "spend":
      return true;

    // Something to act on: a per-space due row (dated item, low
    // supplies, a shopping list with items) or a credit reminder today.
    // Honors the card's "only this space" setting.
    case "todo": {
      const only = s.spaceId;
      const rows = only ? ctx.dueRows.filter((r) => r.spaceId === only) : ctx.dueRows;
      const reminders = only ? ctx.reminderRows.filter((r) => r.space && String(r.space.id) === only) : ctx.reminderRows;
      return rows.length > 0 || reminders.length > 0;
    }

    // At least one recurring payment (bills + recurring maintenance,
    // already filtered by isRecurringPayment). The card doesn't list
    // credits, so credits alone don't make it appear.
    case "bills":
      return ctx.bills.length > 0;

    // A savings goal the user set (target or amount non-zero), or any
    // goal while an income plan exists -- saving a plan auto-creates the
    // goal (target 0), and Economii then grows from Pui deoparte + what is
    // left of De cheltuit each month.
    case "savings":
      return !!ctx.goal && (ctx.hasPlan || Number(ctx.goal.target_amount) > 0 || Number(ctx.goal.current_amount) !== 0);

    // "Cheltuit pe spații" (2026-11-02: no per-space limits any more): at
    // least one space label with RECORDED spend this month -- the same
    // this_month − recurring − planned the card lists.
    case "budget": {
      const spending = (ctx.budget?.spending ?? {}) as Record<string, { this_month?: number }>;
      return Object.entries(spending).some(
        ([label, v]) => Number(v?.this_month || 0) - Number(ctx.budget?.recurring?.[label] || 0) - Number(ctx.budget?.planned?.[label] || 0) > 0,
      );
    }

    // A car with records (dashboard.cars only lists cars that have
    // fuel/service/expense/document rows). The card falls back to the
    // first car when its own one is gone, so any car counts.
    case "car":
      return (ctx.dashboard?.cars ?? []).length > 0;

    // The card's list still has something to buy (toBuyLists only holds
    // non-empty lists); with no list picked, any non-empty list.
    case "grocery": {
      const lists: any[] = ctx.dashboard?.toBuyLists ?? [];
      return s.listId ? lists.some((l) => String(l.list_id) === s.listId) : lists.length > 0;
    }

    // A Casă space exists. /dashboard only reports LOW supplies per space
    // (no "has any supplies" count), so "Ok, nimic pe terminate" stays
    // visible for a Casă without supplies -- see BACKLOG.
    case "supplies":
      return ctx.spaces.some((sp) => sp.kind === "home");

    // Something dated today or in the next 7 days (to-dos + credit
    // reminders) -- the window /dashboard returns. A car service due by km
    // (km_left) has no real day, so the card leaves it out: so does this.
    case "calendar":
      return [...ctx.todoRows, ...ctx.reminderRows].some((r: any) => r.days >= 0 && r.km_left == null);

    // A Cheltuieli space exists ("0 lei în octombrie" is a real answer).
    case "expenses":
      return ctx.spaces.some((sp) => sp.kind === "expenses");

    default:
      return false;
  }
}

/** The cards normal (non-edit) Acasă renders: not hidden by the user,
 * and with something to show. A new array -- the layout is untouched. */
export function visibleWidgets(layout: Widget[], ctx: VisibilityCtx): Widget[] {
  return layout.filter((w) => !w.hidden && widgetHasContent(w, ctx));
}

/** True when every non-"spend" card the user kept (not hidden by them) is
 * hidden ONLY by the empty-data rule above -- Acasă then shows one quiet
 * hint under the cards ("De făcut, Plăți recurente și Economii apar aici
 * pe măsură ce adaugi date.") instead of a page that looks finished.
 * False when the user hid them all themselves, or when any has content. */
export function onlyEmptyDataHidesOthers(layout: Widget[], ctx: VisibilityCtx): boolean {
  const others = layout.filter((w) => !w.hidden && w.type !== "spend");
  return others.length > 0 && others.every((w) => !widgetHasContent(w, ctx));
}
