/**
 * Buget "Ritmul lunii" (direction C, 2026-11): every pace formula, pure
 * (no React, no imports) so tests/budget-pace.test.cjs can run it in node.
 *
 * Data: GET /budget's `pace` key (BudgetController) -- per space label a
 * `daily` array of RECORDED spend per local day (index 0 = day 1, days
 * after `today` are 0) and every Calendar-purchase occurrence of the month
 * (`events`, planned or not). `today` / `days_in_month` are in the USER's
 * timezone -- never use the device date for pace. The server always sends
 * all 4 labels; `events` are only non-empty under Expenses (custom_event
 * maps there); numbers may arrive as ints. A record dated LATER this month
 * already counts in this_month, so the server puts it in TODAY's bucket --
 * Σ daily stays = this_month − recurring − planned and the solid line never
 * runs past today.
 *
 * Symbols (spec §0): E = the envelope (Necesități, or Σ limits without a
 * plan), R = recurring bills (flat, never "Cheltuit"), P_ahead = Calendar
 * purchases still ahead, S = recorded spend, Pm = ALL this month's Calendar
 * purchases, t = today, D = days in month.
 *
 *   flex    = E − R − Pm                (money for day-to-day spending)
 *   ritm(d) = flex × d / D + ev(≤d)     (the expected cumulative spend)
 *   Δ       = S − ritm(t)
 *   band    = max(5% × (E − R), 50)     (20 for one space)
 *   Liber   = E − (S + R + P_ahead)
 *   Y       = floor(Liber / daysLeft)   (daysLeft counts today)
 *
 * Pace is always shown in LEI, never as a percent.
 */

export type PaceEvent = { day: number; amount: number; planned: boolean; title?: string };
export type PaceLabel = { daily: number[]; events: PaceEvent[] };
export type BudgetPace = { month: string; today: number; days_in_month: number; labels: Record<string, PaceLabel> };

/** First N days after which a big single expense would distort the picture:
 * no over/under verdict, no row chips, no ticks. */
export const EARLY_DAYS = 5;

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Cumulative spend: c[0] = 0, c[d] = Σ daily[0..d-1] (end of day d). */
export function cumulative(daily: number[]): number[] {
  const out = [0];
  let s = 0;
  for (const v of daily) {
    s += num(v);
    out.push(s);
  }
  return out;
}

/** Σ event amounts whose day is in [from, to]. */
export function eventsBetween(events: PaceEvent[], from: number, to: number): number {
  return events.reduce((s, e) => (e.day >= from && e.day <= to ? s + num(e.amount) : s), 0);
}

/** ev(≤d). */
export function eventsUpTo(events: PaceEvent[], d: number): number {
  return eventsBetween(events, -Infinity, d);
}

/** Σ of every event amount (Pm). */
export function eventsTotal(events: PaceEvent[]): number {
  return events.reduce((s, e) => s + num(e.amount), 0);
}

/** ritm(d) = flex × d / D + ev(≤d). */
export function ritmAt(d: number, flex: number, D: number, events: PaceEvent[]): number {
  return D > 0 ? (flex * d) / D + eventsUpTo(events, d) : 0;
}

/** "cel mult Y lei pe zi": floor(liber / daysLeft), never negative. */
export function perDay(liber: number, daysLeft: number): number {
  if (!(daysLeft > 0) || liber <= 0) return 0;
  return Math.floor(liber / daysLeft);
}

/** Merge several labels' pace into one (the total card): daily summed
 * day by day, events concatenated and sorted by day. */
export function mergeLabels(labels: (PaceLabel | undefined)[], D: number): PaceLabel {
  const daily = Array.from({ length: D }, () => 0);
  const events: PaceEvent[] = [];
  labels.forEach((l) => {
    if (!l) return;
    (l.daily || []).forEach((v, i) => {
      if (i < D) daily[i] += num(v);
    });
    (l.events || []).forEach((e) => events.push({ ...e, day: num(e.day), amount: num(e.amount) }));
  });
  events.sort((a, b) => a.day - b.day);
  return { daily, events };
}

export type PaceState = 1 | 2 | 3 | 4 | 5 | 6;
export type PaceTone = "warning" | "error" | "success" | "neutral";
export type PaceInput = {
  /** Envelope. */
  E: number;
  /** Recurring bills, flat monthly. */
  R: number;
  /** Calendar purchases still ahead. */
  pAhead: number;
  /** Recorded spend (Cheltuit). */
  S: number;
  /** Today's day of month, user tz. */
  t: number;
  /** Days in the month. */
  D: number;
  /** All the month's Calendar purchases (planned or not). */
  events: PaceEvent[];
};
export type PaceResult = {
  state: PaceState;
  tone: PaceTone;
  flex: number;
  ritm: number;
  delta: number;
  band: number;
  committed: number;
  liber: number;
  daysLeft: number;
  perDay: number;
  pm: number;
};

/** The total card's status (spec §2.1), checked in order 1..6. */
export function paceStatus({ E, R, pAhead, S, t, D, events }: PaceInput): PaceResult {
  const pm = eventsTotal(events);
  const flex = E - R - pm;
  const ritm = ritmAt(t, flex, D, events);
  const delta = S - ritm;
  const band = Math.max(0.05 * (E - R), 50);
  const committed = S + R + pAhead;
  const liber = E - committed;
  const daysLeft = Math.max(1, D - t + 1);
  const y = perDay(liber, daysLeft);
  let state: PaceState;
  if (E - R <= 0) state = 1;
  else if (liber < 0) state = 2;
  else if (t <= EARLY_DAYS) state = 3;
  else if (delta > band) state = 4;
  else if (delta < -band) state = 5;
  else state = 6;
  const tone: PaceTone = state === 1 || state === 4 ? "warning" : state === 2 ? "error" : state === 5 ? "success" : "neutral";
  return { state, tone, flex, ritm, delta, band, committed, liber, daysLeft, perDay: y, pm };
}

/** Whole lei, Romanian grouping ("1.365"). */
export function fmtLei(n: number): string {
  return Math.round(n).toLocaleString("ro-RO");
}

/** A sentence split into plain and emphasised (600, onSurface) runs. */
export type Run = { text: string; strong?: boolean };

export function paceChip(r: PaceResult): string {
  switch (r.state) {
    case 1:
      return "Facturile trec de necesități";
    case 2:
      return "Ai depășit necesitățile";
    case 3:
      return "Început de lună";
    case 4:
      return `Cu ${fmtLei(r.delta)} lei peste ritm`;
    case 5:
      return `Cu ${fmtLei(Math.abs(r.delta))} lei sub ritm`;
    default:
      return "În ritm";
  }
}

/** The sentence under the chip (spec §2.1 table), as runs. */
export function paceSentence(r: PaceResult, input: Pick<PaceInput, "E" | "R" | "S">): Run[] {
  const b = (n: number): Run => ({ text: fmtLei(n), strong: true });
  const p = (text: string): Run => ({ text });
  // "Mai ai {Liber} lei: cel mult {Y} lei pe zi." -- or, when Y < 1, just
  // what's left (a 0-lei-a-day promise reads as broken).
  const tail = (lead: Run[]): Run[] =>
    r.perDay < 1 && r.liber >= 0
      ? [p("Mai ai "), b(r.liber), p(" lei până la final de lună.")]
      : [...lead, b(r.perDay), p(" lei pe zi.")];
  const maiAi = [p("Mai ai "), b(r.liber), p(" lei: cel mult ")];
  switch (r.state) {
    case 1:
      return [p("Facturile recurente ("), b(input.R), p(" lei) iau toate necesitățile ("), b(input.E), p(" lei).")];
    case 2:
      return [p("Ai cheltuit "), b(input.S), p(" lei. Cu facturile și ce ai planificat, treci de necesități cu "), b(-r.liber), p(" lei.")];
    case 3:
      return input.S > 0
        ? [p("Ai cheltuit "), b(input.S), p(" lei. "), ...tail(maiAi)]
        : [p("Nimic cheltuit încă luna asta. "), ...tail(maiAi)];
    case 4:
      return [p("Până azi, normal ar fi fost ~"), b(r.ritm), p(" lei. Ai cheltuit "), b(input.S), p(". "), ...tail([p("Ca să rămâi în necesități: cel mult ")])];
    case 5:
      return [p("Ai cheltuit "), b(input.S), p(" lei, cu "), b(Math.abs(r.delta)), p(" mai puțin decât era normal până azi. "), ...tail(maiAi)];
    default:
      return [p("Ai cheltuit "), b(input.S), p(" lei, cam cât era normal până azi. "), ...tail(maiAi)];
  }
}

export const runsText = (runs: Run[]) => runs.map((r) => r.text).join("");

/* ---------------- Chart geometry ---------------- */

/** The ritm line as [day, value] points, with a vertical step at every
 * event day (the purchase lands on its day, not spread over the month). */
export function ritmPoints(flex: number, D: number, events: PaceEvent[]): [number, number][] {
  const pts: [number, number][] = [[0, 0]];
  for (let d = 1; d <= D; d++) {
    const v = ritmAt(d, flex, D, events);
    const onDay = eventsBetween(events, d, d);
    if (onDay !== 0) pts.push([d, v - onDay]);
    pts.push([d, v]);
  }
  return pts;
}

/** The dotted "facturi și planificate" line: flat from (t, S) to the end
 * of the month, stepping up on each planned purchase's day. */
export function aheadPoints(S: number, t: number, D: number, events: PaceEvent[]): [number, number][] {
  const pts: [number, number][] = [[t, S]];
  let v = S;
  events
    .filter((e) => e.planned && e.day > t && e.day <= D)
    .sort((a, b) => a.day - b.day)
    .forEach((e) => {
      pts.push([e.day, v]);
      v += num(e.amount);
      pts.push([e.day, v]);
    });
  pts.push([D, v]);
  return pts;
}

/* ---------------- Weeks (space drill-down) ---------------- */

export type WeekSegment = { start: number; end: number };

/** Monday-start weeks clipped to the month; a first or last piece shorter
 * than 4 days merges into its neighbour. `firstWeekday` = JS getDay() of
 * day 1 (0 = Sunday). Nov 2026 (starts Sunday) -> 1–8, 9–15, 16–22, 23–30. */
export function weekSegments(D: number, firstWeekday: number): WeekSegment[] {
  const segs: WeekSegment[] = [];
  // Days until the first Sunday, inclusive: Monday (1) -> 7, Sunday (0) -> 1.
  let start = 1;
  let end = Math.min(D, ((7 - firstWeekday) % 7) + 1);
  while (start <= D) {
    segs.push({ start, end });
    start = end + 1;
    end = Math.min(D, start + 6);
  }
  if (segs.length > 1 && segs[0].end - segs[0].start + 1 < 4) {
    segs[1] = { start: 1, end: segs[1].end };
    segs.shift();
  }
  const last = segs[segs.length - 1];
  if (segs.length > 1 && last.end - last.start + 1 < 4) {
    segs[segs.length - 2] = { start: segs[segs.length - 2].start, end: last.end };
    segs.pop();
  }
  return segs;
}

export type WeekBar = WeekSegment & { value: number; normal: number; when: "past" | "current" | "future" };

/** One bar per week: recorded spend in it, and what was normal (for the
 * current week: normal up to today). */
export function weekBars(daily: number[], events: PaceEvent[], flex: number, D: number, t: number, firstWeekday: number): WeekBar[] {
  return weekSegments(D, firstWeekday).map((s) => {
    const when: WeekBar["when"] = s.end < t ? "past" : s.start > t ? "future" : "current";
    const lastDay = when === "current" ? t : s.end;
    let value = 0;
    for (let d = s.start; d <= Math.min(lastDay, s.end); d++) value += num(daily[d - 1]);
    const days = lastDay - s.start + 1;
    const normal = (flex / D) * days + eventsBetween(events, s.start, lastDay);
    return { ...s, value, normal, when };
  });
}

/* ---------------- One space (row + drill-down) ---------------- */

export type SpacePaceStatus = "over" | "fast" | "on" | "under" | "early";
export type SpacePace = {
  /** The space's monthly limit L. */
  limit: number;
  rec: number;
  flex: number;
  ritm: number;
  delta: number;
  band: number;
  left: number;
  status: SpacePaceStatus;
  /** Where the "today" tick goes on BudgetSplitBar (0..1), null = none. */
  todayAt: number | null;
};

/** A space with a limit L (spec §2.2). `spent` = the limit's `spent` from
 * /budget (recorded + bills + planned), r = recurring, pa = planned ahead.
 * `hideTicks` = the total card is in state 1 (bills take everything). */
export function spacePace({
  L,
  spent,
  r,
  pa,
  events,
  t,
  D,
  hideTicks = false,
}: {
  L: number;
  spent: number;
  r: number;
  pa: number;
  events: PaceEvent[];
  t: number;
  D: number;
  hideTicks?: boolean;
}): SpacePace {
  const rec = Math.max(0, spent - r - pa);
  const flex = L - r - eventsTotal(events);
  const ritm = ritmAt(t, flex, D, events);
  const delta = rec - ritm;
  const band = Math.max(0.05 * (L - r), 20);
  const left = L - (rec + r + pa);
  let status: SpacePaceStatus;
  if (rec > L) status = "over";
  else if (t <= EARLY_DAYS) status = "early";
  else if (delta > band) status = "fast";
  else if (delta < -band) status = "under";
  else status = "on";
  const todayAt = t <= EARLY_DAYS || hideTicks ? null : clamp01(ritm / Math.max(L, rec + r + pa, 1));
  return { limit: L, rec, flex, ritm, delta, band, left, status, todayAt };
}

export const SPACE_STATUS_CHIP: Record<SpacePaceStatus, { text: string; tone: PaceTone } | null> = {
  over: { text: "Depășit", tone: "error" },
  fast: { text: "Prea repede", tone: "warning" },
  on: { text: "În ritm", tone: "neutral" },
  under: { text: "Sub ritm", tone: "success" },
  early: null,
};

const KIND_ORDER = ["car", "home", "grocery", "expenses"];
const STATUS_RANK: Record<SpacePaceStatus, number> = { over: 0, fast: 1, on: 2, under: 3, early: 4 };

/** Rows sorted by pace: Depășit (most over first), Prea repede (largest Δ
 * first), În ritm, Sub ritm, no chip, then spaces without a limit. Ties by
 * kind order car, home, grocery, expenses. */
export function sortSpaceRows<T extends { kind: string; pace: SpacePace | null }>(rows: T[]): T[] {
  const rank = (p: SpacePace | null) => (p ? STATUS_RANK[p.status] : 5);
  const kindIdx = (k: string) => {
    const i = KIND_ORDER.indexOf(k);
    return i < 0 ? KIND_ORDER.length : i;
  };
  return [...rows].sort((a, b) => {
    const ra = rank(a.pace);
    const rb = rank(b.pace);
    if (ra !== rb) return ra - rb;
    let byAmount = 0;
    if (a.pace && b.pace && a.pace.status === "over") byAmount = (b.pace.rec - b.pace.limit) - (a.pace.rec - a.pace.limit);
    else if (a.pace && b.pace && a.pace.status === "fast") byAmount = b.pace.delta - a.pace.delta;
    if (byAmount !== 0) return byAmount;
    return kindIdx(a.kind) - kindIdx(b.kind);
  });
}
