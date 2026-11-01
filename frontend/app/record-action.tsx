import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View, DeviceEventEmitter } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useNavigation, useRootNavigationState, useRouter } from "expo-router";
import SpaceDetail from "./(tabs)/[id]";
import { RecordActionContext } from "@/lib/navigation/recordAction";
import { actionOriginSpaceHref, validRecordAction } from "@/lib/navigation/recordActionRoute";
import { markTrailReturn } from "@/lib/navigation/returnTrail";
import { REFRESH_EVENT } from "@/lib/refresh";
import { refreshBudgetPlan } from "@/lib/budget/plan";
import { isDialogOpen, subscribeDialog, subscribeSheets, visibleSheetCount } from "@/lib/dialogCoordinator";
import { useTheme } from "@/lib/theme";

/** How long the overlay waits after the Space has loaded for a form or
 * dialog to show before revealing the Space page instead. */
const OVERLAY_REVEAL_MS = 1500;
/** After the form/dialog closed: a chained one (dialog -> form) gets this
 * long to show before the overlay goes back to its origin screen. */
const OVERLAY_CLOSE_MS = 350;
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
  const active = useRef(false);
  const leaving = useRef(false);
  const refreshed = useRef(false);
  useFocusEffect(useCallback(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []));

  const cancel = useCallback(() => {
    if (!active.current || leaving.current) return;
    leaving.current = true;
    if (originSpace) markTrailReturn(originSpace);
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/home");
  }, [router, originSpace]);

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
  const overlay = params.overlay === "1" && validRecordAction(params.id, params.itemId, params.itemType);
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
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/home");
  }, [router, originSpace]);

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
          {phase === "waiting" ? (
            <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator color={colors.onSurfaceTertiary} />
            </View>
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
