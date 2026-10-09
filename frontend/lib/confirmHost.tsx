import React, { useEffect, useRef, useState } from "react";
import { Animated, Modal, Pressable, View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { useReducedMotion } from "@/lib/motion";
import { Button } from "@/components/ui/primitives";

export type DialogChoice = { key: string; label: string; secondary?: boolean };

type DialogRequest = {
  kind: "confirm" | "notify" | "choice";
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** kind "choice": stacked full-width buttons, then "Renunță". */
  choices?: DialogChoice[];
  resolve: (value: any) => void;
};

// Set by the one <ConfirmHost /> mounted at the app root (see
// app/_layout.tsx) for as long as it's alive -- which, mounted at the
// root, is the app's entire lifetime. Module-level rather than a
// context because confirmAction/notifyAction (lib/confirm.ts) are
// plain functions called from all over the app, not hooks -- there's
// no component tree position they could read a context from.
let currentHandler: ((req: DialogRequest) => void) | null = null;

/** confirm.ts's web path -- resolves false with no dialog at all if
 * the host somehow isn't mounted yet (defensive; it's mounted at the
 * app root before any screen that could call this renders). */
export function showConfirmDialog(req: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!currentHandler) {
      resolve(false);
      return;
    }
    currentHandler({ ...req, kind: "confirm", resolve });
  });
}

/** Several answers to one question (e.g. "Rezolvă cu datele salvate" /
 * "Modifică informațiile"); resolves the picked key, or null if dismissed. */
export function showChoiceDialog(req: { title: string; message: string; choices: DialogChoice[] }): Promise<string | null> {
  return new Promise((resolve) => {
    if (!currentHandler) {
      resolve(null);
      return;
    }
    currentHandler({ ...req, kind: "choice", resolve });
  });
}

/** confirm.ts's web path for a plain info notice -- no resolve value
 * anyone reads, just an OK button that dismisses it. */
export function showNotifyDialog(title: string, message: string): void {
  if (!currentHandler) return;
  currentHandler({ kind: "notify", title, message, resolve: () => {} });
}

/* Whether a dialog is on screen right now -- lib/useAutoTour.ts waits for
 * it to close before starting a first-use tour (never two Modals at once). */
let dialogOpen = false;
const dialogListeners = new Set<() => void>();
export function isDialogOpen(): boolean {
  return dialogOpen;
}
export function subscribeDialog(listener: () => void): () => void {
  dialogListeners.add(listener);
  return () => {
    dialogListeners.delete(listener);
  };
}

/**
 * Mounted once at the app root. Replaces window.confirm/window.alert
 * on web (see lib/confirm.ts) -- both are silently no-ops in some
 * contexts a page can be opened in on a phone (most notably: added to
 * the Home Screen and launched standalone on iOS Safari), which made
 * every destructive confirmation (delete a list, delete a product...)
 * appear to just do nothing at all, with no error -- not a
 * button-wiring bug, the dialog itself never showed. Rendering the
 * confirmation as our own Modal instead of asking the browser for one
 * means it always actually appears, regardless of how the page was
 * opened.
 */
export function ConfirmHost() {
  const [request, setRequest] = useState<DialogRequest | null>(null);

  useEffect(() => {
    currentHandler = (req) => setRequest(req);
    return () => {
      currentHandler = null;
    };
  }, []);

  const open = !!request;
  useEffect(() => {
    dialogOpen = open;
    dialogListeners.forEach((l) => l());
  }, [open]);

  if (!request) return null;

  const close = (value: any) => {
    // A dismissed choice dialog answers null, not false.
    request.resolve(request.kind === "choice" && value === false ? null : value);
    setRequest(null);
  };

  return (
    <Modal visible transparent animationType="none" onRequestClose={() => close(false)} statusBarTranslucent>
      <Dialog request={request} close={close} />
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
              <Button key={c.key} testID={`confirm-host-choice-${c.key}`} compact variant={c.secondary ? "secondary" : "primary"} label={c.label} onPress={() => close(c.key)} />
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
