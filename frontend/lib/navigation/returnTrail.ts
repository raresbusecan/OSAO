import { useEffect, useSyncExternalStore } from "react";

/**
 * The "return trail" (2026-10, explicit user request): when the user taps
 * the tab bar to leave a tab that is NOT at its root (a Buget sub-page, or
 * inside a Space -- which counts as being "in Spații"), remember where they
 * were for 60 s. While it's valid, on the tab they tapped TO (the landing
 * tab; a Space screen counts as Spații here too) the edge swipe that
 * points back toward the origin's position in the tab bar returns there
 * instead of moving to the neighbour, and a small tappable pill
 * ("Înapoi la Buget") shows above the tab bar. See TabSwipeEdges.tsx /
 * ReturnTrailHint.tsx and frontend/CLAUDE.md's navigation notes.
 *
 * Because tabs are lazy:false (screens stay mounted), navigating back to
 * the origin route restores its internal sub-page state as-is -- the trail
 * only has to remember the route, not the sub-page.
 *
 * Plain module state + useSyncExternalStore (same recipe as lib/motion.ts);
 * expiry is by wall clock (Date.now()), so a backgrounded app that comes
 * back after a minute finds the trail expired even if no timer fired.
 */

export const TAB_ORDER = ["home", "spaces", "calendar", "budget"] as const;
export type MainTab = (typeof TAB_ORDER)[number];
export const TAB_LABELS: Record<MainTab, string> = { home: "Acasă", spaces: "Spații", calendar: "Calendar", budget: "Buget" };

export const TRAIL_TTL_MS = 60_000;

export type ReturnTrail = {
  /** Tab the user left (a Space screen = "spaces"). */
  originTab: MainTab;
  /** Exact route to go back to -- "/budget", or "/12" for a Space. */
  originHref: string;
  /** Tab the user tapped to; the trail only applies there. */
  landingTab: MainTab;
  leftAt: number;
};

let trail: ReturnTrail | null = null;
let tabBarHeight = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/* Which tabs are currently "deep" (not at their root). A tab with
 * sub-pages registers via useTabDepth; Spații's depth (inside a Space) is
 * derived from the route by the caller instead. */
const deepTabs = new Set<MainTab>();

export function isTabDeep(tab: MainTab): boolean {
  return deepTabs.has(tab);
}

/** A tab screen reports whether it is showing a sub-page. */
export function useTabDepth(tab: MainTab, deep: boolean) {
  useEffect(() => {
    if (deep) deepTabs.add(tab);
    else deepTabs.delete(tab);
    return () => {
      deepTabs.delete(tab);
    };
  }, [tab, deep]);
}

export function isTrailValid(t: ReturnTrail | null, now = Date.now()): t is ReturnTrail {
  return !!t && now - t.leftAt <= TRAIL_TTL_MS && t.originTab !== t.landingTab;
}

/** Called by MainTabBar on a tab-bar tap that leaves a tab. Only a deep
 * origin is remembered; a tap from a root tab leaves an existing trail
 * alone (it is still bound to its own landing tab, and still expires). */
export function recordTabLeave(originTab: MainTab, originHref: string, landingTab: MainTab, originDeep: boolean) {
  if (originTab === landingTab || !originDeep) return;
  trail = { originTab, originHref, landingTab, leftAt: Date.now() };
  emit();
}

/* One-shot "this arrival is a trail return" flag. A Space screen
 * (app/(tabs)/[id].tsx) remounts its dashboard on every focus to reset
 * sub-pages -- except when the user is coming back along the trail, where
 * the whole point is to land on the exact sub-page they left. Short-lived
 * so a navigation that never lands can't suppress a later normal visit. */
let pendingReturn: { href: string; at: number } | null = null;

/** Navigate-along-the-trail callers mark the href right before navigating. */
export function markTrailReturn(href: string) {
  pendingReturn = { href, at: Date.now() };
}

/** True (once) when the screen at `href` is being focused by a trail return. */
export function consumeTrailReturn(href: string): boolean {
  const p = pendingReturn;
  pendingReturn = null;
  return !!p && p.href === href && Date.now() - p.at < 3000;
}

export function clearTrail() {
  if (!trail) return;
  trail = null;
  emit();
}

export function getTrail(): ReturnTrail | null {
  return isTrailValid(trail) ? trail : null;
}

/** The trail if it applies on `currentTab` right now, else null. */
export function trailFor(currentTab: MainTab | null | undefined): ReturnTrail | null {
  const t = getTrail();
  return t && currentTab && t.landingTab === currentTab ? t : null;
}

/** Direction rule: origin to the RIGHT of the current tab in the tab bar
 * => the "next" swipe (drag left from the right edge, direction 1)
 * returns; origin to the LEFT => the "previous" swipe (drag right from
 * the left edge, direction -1). The opposite swipe stays normal. */
export function trailDirection(t: ReturnTrail, currentTab: MainTab): 1 | -1 {
  return TAB_ORDER.indexOf(t.originTab) > TAB_ORDER.indexOf(currentTab) ? 1 : -1;
}

export function useReturnTrail(): ReturnTrail | null {
  return useSyncExternalStore(subscribe, () => trail, () => null);
}

/* MainTabBar publishes its measured height so the hint can sit right
 * above it (the hint lives in the tabs layout's overlay, outside the bar,
 * because a touchable outside its parent's bounds gets no touches on
 * Android). */
export function setTabBarHeight(h: number) {
  if (Math.abs(h - tabBarHeight) < 0.5) return;
  tabBarHeight = h;
  emit();
}

export function useTabBarHeight(): number {
  return useSyncExternalStore(subscribe, () => tabBarHeight, () => 0);
}
