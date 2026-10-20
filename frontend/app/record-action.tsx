import React, { useCallback, useEffect, useRef } from "react";
import { Pressable, Text, View, DeviceEventEmitter } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useNavigation, useRootNavigationState, useRouter } from "expo-router";
import SpaceDetail from "./(tabs)/[id]";
import { RecordActionContext } from "@/lib/navigation/recordAction";
import { actionOriginSpaceHref, validRecordAction } from "@/lib/navigation/recordActionRoute";
import { markTrailReturn } from "@/lib/navigation/returnTrail";
import { REFRESH_EVENT } from "@/lib/refresh";
import { refreshBudgetPlan } from "@/lib/budget/plan";
import { useTheme } from "@/lib/theme";

export default function RecordActionScreen() {
  const router = useRouter();
  const originSpace = actionOriginSpaceHref(useRootNavigationState());
  const navigation = useNavigation();
  useEffect(() => navigation.addListener("beforeRemove", () => {
    if (originSpace) markTrailReturn(originSpace);
  }), [navigation, originSpace]);
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string; itemId?: string; itemType?: string }>();
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
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/home");
  }, [router]);

  const complete = useCallback(() => {
    // Leaving prevents a delayed navigation, not invalidation of a real save.
    if (refreshed.current) return;
    refreshed.current = true;
    DeviceEventEmitter.emit(REFRESH_EVENT);
    void refreshBudgetPlan();
    if (active.current && !leaving.current) cancel();
  }, [cancel]);

  return (
    <RecordActionContext.Provider value={{ complete, cancel }}>
      <Stack.Screen options={{
        headerShown: true, title: "Înregistrare",
        headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.onSurface,
        headerLeft: () => <Pressable onPress={cancel} accessibilityRole="button" accessibilityLabel="Înapoi la ecranul anterior" hitSlop={12}><Text style={{ color: colors.onSurface }}>Înapoi</Text></Pressable>,
      }} />
      {validRecordAction(params.id, params.itemId, params.itemType) ? <SpaceDetail /> : (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
          <Text style={{ color: colors.onSurface }}>Înregistrarea nu poate fi deschisă.</Text>
        </View>
      )}
    </RecordActionContext.Provider>
  );
}
