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

/** How long the overlay waits, after the Space has loaded (or after its
 * last form closed without leaving), for a form or dialog to show before
 * falling back to the full Space page. */
const OVERLAY_GRACE_MS = 700;
/** The Space never reported its load: show the page anyway. */
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
   * windows, show. Nothing shown OVERLAY_GRACE_MS after the load, or after
   * the last form closed without leaving = this flow ends on a page, so it
   * reopens as the normal full-page action. */
  const overlay = params.overlay === "1" && validRecordAction(params.id, params.itemId, params.itemType);
  const [formShown, setFormShown] = useState(false);
  const spaceLoaded = useRef(false);
  const checkRef = useRef<() => void>(() => {});

  const toPage = useCallback(() => {
    if (!active.current || leaving.current) return;
    leaving.current = true;
    const action = params.action ? `&action=${encodeURIComponent(params.action)}` : "";
    router.replace(`/record-action?id=${encodeURIComponent(params.id!)}&itemId=${encodeURIComponent(params.itemId!)}&itemType=${encodeURIComponent(params.itemType!)}${action}` as any);
  }, [router, params.id, params.itemId, params.itemType, params.action]);

  useEffect(() => {
    if (!overlay) return;
    let grace: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      if (visibleSheetCount() > 0 || isDialogOpen()) {
        if (grace) clearTimeout(grace);
        grace = undefined;
        setFormShown(true);
      } else if (spaceLoaded.current) {
        if (grace) clearTimeout(grace);
        grace = setTimeout(() => {
          if (visibleSheetCount() === 0 && !isDialogOpen()) toPage();
        }, OVERLAY_GRACE_MS);
      }
    };
    checkRef.current = check;
    const offSheets = subscribeSheets(check);
    const offDialogs = subscribeDialog(check);
    const hard = setTimeout(() => { if (!spaceLoaded.current) toPage(); }, OVERLAY_LOAD_TIMEOUT_MS);
    return () => {
      offSheets();
      offDialogs();
      clearTimeout(hard);
      if (grace) clearTimeout(grace);
    };
  }, [overlay, toPage]);

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
        <View style={{ flex: 1 }} pointerEvents="box-none">
          {/* The page is there for its logic only; its Sheets/dialogs are
              native windows, so they show regardless of this opacity. */}
          <View style={{ flex: 1, opacity: 0 }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <SpaceDetail />
          </View>
          {!formShown ? (
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
