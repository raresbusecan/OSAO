import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, Text, View, DeviceEventEmitter } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useNavigation, useRootNavigationState, useRouter } from "expo-router";
import SpaceDetail from "./(tabs)/[id]";
import { RecordActionContext } from "@/lib/navigation/recordAction";
import { actionOriginSpaceHref, validRecordAction } from "@/lib/navigation/recordActionRoute";
import { markTrailReturn } from "@/lib/navigation/returnTrail";
import { REFRESH_EVENT } from "@/lib/refresh";
import { refreshBudgetPlan } from "@/lib/budget/plan";
import { isDialogOpen, subscribeDialog, subscribeSheets, visibleSheetCount } from "@/lib/dialogCoordinator";
import { useTheme } from "@/lib/theme";
import { useReducedMotion } from "@/lib/motion";
import { SHEET_BACKDROP } from "@/components/ui/Sheet";

/** How long the overlay waits after the Space has loaded for a form or
 * dialog to show before revealing the Space page instead. */
const OVERLAY_REVEAL_MS = 1500;
/** After the form/dialog closed: a chained one (dialog -> form) gets this
 * long to show before the overlay goes back to its origin screen. */
const OVERLAY_CLOSE_MS = 350;
/** After the last Sheet/dialog closed: time for its native window to finish
 * dismissing before this modal screen dismisses too. */
const OVERLAY_DISMISS_MS = 50;
/** The Space never reported its load: reveal the page anyway. */
const OVERLAY_LOAD_TIMEOUT_MS = 10000;

export default function RecordActionScreen() {
  const router = useRouter();
  const originSpace = actionOriginSpaceHref(useRootNavigationState());
  const navigation = useNavigation();
  useEffect(() => {
    const unsubscribe = navigation.addListener("removed", () => {
      if (originSpace) markTrailReturn(originSpace);
    });
    // Router emits removal after unmount; retain the listener through this commit.
    return () => queueMicrotask(unsubscribe);
  }, [navigation, originSpace]);
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string; itemId?: string; itemType?: string; action?: string; overlay?: string }>();
  const overlay = params.overlay === "1" && validRecordAction(params.id, params.itemId, params.itemType);
  const active = useRef(false);
  const leaving = useRef(false);
  const refreshed = useRef(false);
  useFocusEffect(useCallback(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []));

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/home");
  }, [router]);

  /** Leave once the form's own native window is gone. Dismissing this
   * (transparent modal) screen in the same moment as the Sheet's Modal made
   * iOS drop one of the two dismissals: the Sheet's empty, invisible window
   * stayed up and swallowed every touch on Acasă (seen on the phone,
   * 2026-11-02). So wait for no open Sheet/dialog, then a beat more. */
  const leaveAfterForms = useCallback(() => {
    const started = Date.now();
    const attempt = () => {
      const busy = visibleSheetCount() > 0 || isDialogOpen();
      if (busy && Date.now() - started < 3000) { setTimeout(attempt, 100); return; }
      setTimeout(goBack, OVERLAY_DISMISS_MS);
    };
    attempt();
  }, [goBack]);

  const cancel = useCallback(() => {
    if (!active.current || leaving.current) return;
    leaving.current = true;
    if (originSpace) markTrailReturn(originSpace);
    if (overlay) leaveAfterForms();
    else goBack();
  }, [router, originSpace, overlay, leaveAfterForms, goBack]);

  const complete = useCallback(() => {
    // Leaving prevents a delayed navigation, not invalidation of a real save.
    if (refreshed.current) return;
    refreshed.current = true;
    DeviceEventEmitter.emit(REFRESH_EVENT);
    void refreshBudgetPlan();
    if (active.current && !leaving.current) cancel();
  }, [cancel]);

  /* ---------------- overlay (?overlay=1, a resolve from another screen) ----------------
   * The screen is a transparent modal (app/_layout.tsx) over the screen the
   * resolve came from. The Space page still mounts -- its dashboard owns
   * every resolve flow (confirmations, renewals, the forms) -- but stays
   * invisible: only its Sheets and dialogs, which live in their own native
   * windows, show. Once one has shown, closing the last one = go back to
   * the origin (even if that form doesn't call cancel itself). Nothing
   * shown OVERLAY_REVEAL_MS after the load = this flow ends on a page: the
   * page is revealed in place (never a navigation, so cancel keeps working).
   * The invisible modal blocks touches on the screen below, so it must
   * always end in one of those two ways. */
  const [phase, setPhaseState] = useState<"waiting" | "form" | "page">("waiting");
  // Read by the sheet/dialog listeners between renders, so it's set at once.
  const phaseRef = useRef(phase);
  const setPhase = useCallback((next: "waiting" | "form" | "page") => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);
  const spaceLoaded = useRef(false);
  const checkRef = useRef<() => void>(() => {});

  const leaveOverlay = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    if (originSpace) markTrailReturn(originSpace);
    leaveAfterForms();
  }, [router, originSpace, leaveAfterForms]);

  useEffect(() => {
    if (!overlay) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => { if (timer) clearTimeout(timer); timer = undefined; };
    const somethingShown = () => visibleSheetCount() > 0 || isDialogOpen();
    const check = () => {
      if (phaseRef.current === "page" || leaving.current) return;
      stop();
      if (somethingShown()) {
        setPhase("form");
      } else if (phaseRef.current === "form") {
        timer = setTimeout(() => { if (!somethingShown()) leaveOverlay(); }, OVERLAY_CLOSE_MS);
      } else if (spaceLoaded.current) {
        timer = setTimeout(() => { if (!somethingShown() && phaseRef.current === "waiting") setPhase("page"); }, OVERLAY_REVEAL_MS);
      }
    };
    checkRef.current = check;
    const offSheets = subscribeSheets(check);
    const offDialogs = subscribeDialog(check);
    const hard = setTimeout(() => { if (!spaceLoaded.current && phaseRef.current === "waiting") setPhase("page"); }, OVERLAY_LOAD_TIMEOUT_MS);
    return () => {
      offSheets();
      offDialogs();
      clearTimeout(hard);
      stop();
    };
  }, [overlay, leaveOverlay, setPhase]);

  const loaded = useCallback(() => {
    spaceLoaded.current = true;
    checkRef.current();
  }, []);

  // While the form loads, the origin screen dims at once with the Sheet's
  // own backdrop (instead of a spinner), so the tap reads as "a form is
  // opening". When the form shows, this dim fades out as the Sheet's fades
  // in, so the screen never flashes light in between.
  const reduced = useReducedMotion();
  const [dim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!overlay) return;
    const to = phase === "waiting" ? 1 : 0;
    if (reduced) dim.setValue(to);
    else Animated.timing(dim, { toValue: to, duration: phase === "waiting" ? 120 : 260, useNativeDriver: true }).start();
  }, [overlay, phase, reduced, dim]);

  const valid = validRecordAction(params.id, params.itemId, params.itemType);

  return (
    <RecordActionContext.Provider value={{ complete, cancel, loaded }}>
      <Stack.Screen options={overlay ? { headerShown: false } : {
        headerShown: true, title: "Înregistrare",
        headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.onSurface,
        headerLeft: () => <Pressable onPress={cancel} accessibilityRole="button" accessibilityLabel="Înapoi la ecranul anterior" hitSlop={12}><Text style={{ color: colors.onSurface }}>Înapoi</Text></Pressable>,
      }} />
      {overlay ? (
        // ONE tree for every phase, so revealing the page never remounts it.
        <View style={{ flex: 1, backgroundColor: phase === "page" ? colors.surface : "transparent" }} pointerEvents="box-none">
          {/* Hidden, the page is there for its logic only; its Sheets/dialogs
              are native windows, so they show regardless of this opacity.
              Revealed, its own back button closes this modal. */}
          <View
            style={{ flex: 1, opacity: phase === "page" ? 1 : 0 }}
            pointerEvents={phase === "page" ? "auto" : "none"}
            accessibilityElementsHidden={phase !== "page"}
            importantForAccessibility={phase === "page" ? "auto" : "no-hide-descendants"}
          >
            <SpaceDetail />
          </View>
          {phase !== "page" ? (
            <Animated.View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, backgroundColor: SHEET_BACKDROP, opacity: dim }} />
          ) : null}
        </View>
      ) : valid ? <SpaceDetail /> : (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
          <Text style={{ color: colors.onSurface }}>Înregistrarea nu poate fi deschisă.</Text>
        </View>
      )}
    </RecordActionContext.Provider>
  );
}
