import React, { useEffect, useRef, useState } from "react";
import { Animated, Modal, Pressable, View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { useReducedMotion } from "@/lib/motion";
import { Button } from "@/components/ui/primitives";
import { registerDialogHost, settleDialog, type DialogRequest } from "./dialogCoordinator";

export { showConfirmDialog, showChoiceDialog, showNotifyDialog, isDialogOpen, subscribeDialog, type DialogChoice } from "./dialogCoordinator";

/** Sheet nesting depth; effects mount children before parents on native. */
export const DialogLayerContext = React.createContext(0);

/** The root uses a Modal. A Sheet hosts its dialog in its own native
 * window, above the form, avoiding sibling native Modal presentations. */
export function ConfirmHost({ inline = false }: { inline?: boolean }) {
  const priority = React.useContext(DialogLayerContext);
  const [request, setRequest] = useState<DialogRequest | null>(null);
  useEffect(() => registerDialogHost(priority, setRequest), [priority]);
  if (!request) return null;
  const close = (value: any) => settleDialog(request, value);
  const dialog = <Dialog request={request} close={close} />;
  return inline ? (
    <View testID="confirm-host-inline" accessibilityViewIsModal style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, zIndex: 1000 }}>
      {dialog}
    </View>
  ) : (
    <Modal visible transparent animationType="none" onRequestClose={() => close(false)} statusBarTranslucent>
      {dialog}
    </Modal>
  );
}

/** 2026-10 redesign: a centered card with a tinted icon (trash for a
 * destructive confirm), the question, then Cancel / Confirm side by
 * side. Fades and lifts in; skipped under reduced motion. */
function Dialog({ request, close }: { request: DialogRequest; close: (value: any) => void }) {
  const { colors, spacing, radius } = useTheme();
  const reduced = useReducedMotion();
  const appear = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) return;
    Animated.spring(appear, { toValue: 1, useNativeDriver: true, damping: 20, stiffness: 260 }).start();
  }, [appear, reduced]);

  const tone = request.destructive ? colors.error : colors.onSurface;
  const icon: keyof typeof Ionicons.glyphMap =
    request.kind === "notify" ? "information-circle-outline" : request.destructive ? "trash-outline" : "help-circle-outline";

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl }}>
      <Animated.View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "rgba(5,7,10,0.62)", opacity: appear }}>
        <Pressable style={{ flex: 1 }} onPress={() => close(false)} accessibilityLabel="Închide" />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        style={{
          width: "100%",
          maxWidth: 340,
          borderRadius: radius.lg + 2,
          backgroundColor: colors.surfaceSecondary,
          padding: spacing.xl,
          paddingBottom: spacing.gutter,
          gap: spacing.lg + 2,
          opacity: appear,
          transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }, { scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
        }}
      >
        <View style={{ alignItems: "center", gap: spacing.sm }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: `${tone}24`, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name={icon} size={22} color={tone} />
          </View>
          <Text style={{ fontSize: 18, fontWeight: "600", color: colors.onSurface, textAlign: "center" }}>{request.title}</Text>
          {request.message ? (
            <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary, textAlign: "center", lineHeight: 20 }}>{request.message}</Text>
          ) : null}
        </View>

        {request.kind === "choice" ? (
          <View style={{ gap: spacing.sm }}>
            {(request.choices ?? []).map((c) => (
              <Button key={c.key} testID={`confirm-host-choice-${c.key}`} compact variant={c.destructive ? "primary" : c.secondary ? "secondary" : "primary"} tone={c.destructive ? colors.error : undefined} label={c.label} onPress={() => close(c.key)} />
            ))}
            <Button testID="confirm-host-cancel" compact variant="ghost" label={request.cancelLabel ?? "Renunță"} onPress={() => close(null)} />
          </View>
        ) : request.kind === "confirm" ? (
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Button testID="confirm-host-cancel" compact variant="secondary" label={request.cancelLabel ?? "Renunță"} onPress={() => close(false)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                testID="confirm-host-confirm"
                compact
                label={request.confirmLabel ?? "Confirmă"}
                tone={request.destructive ? colors.error : undefined}
                onPress={() => close(true)}
              />
            </View>
          </View>
        ) : (
          <Button testID="confirm-host-ok" compact label="OK" onPress={() => close(true)} />
        )}
      </Animated.View>
    </View>
  );
}
