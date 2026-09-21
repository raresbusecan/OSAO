import React, { useEffect, useState } from "react";
import { Modal, Pressable, View, Text } from "react-native";
import { useTheme } from "@/lib/theme";

type DialogRequest = {
  kind: "confirm" | "notify";
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  resolve: (value: boolean) => void;
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

/** confirm.ts's web path for a plain info notice -- no resolve value
 * anyone reads, just an OK button that dismisses it. */
export function showNotifyDialog(title: string, message: string): void {
  if (!currentHandler) return;
  currentHandler({ kind: "notify", title, message, resolve: () => {} });
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
  const { colors, spacing, radius } = useTheme();
  const [request, setRequest] = useState<DialogRequest | null>(null);

  useEffect(() => {
    currentHandler = (req) => setRequest(req);
    return () => {
      currentHandler = null;
    };
  }, []);

  if (!request) return null;

  const close = (value: boolean) => {
    request.resolve(value);
    setRequest(null);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => close(false)}>
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: spacing.xl,
          backgroundColor: "rgba(0,0,0,0.4)",
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 360,
            borderRadius: radius.lg,
            backgroundColor: colors.surface,
            padding: spacing.xl,
          }}
        >
          <Text style={{ fontSize: 17, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.sm }}>
            {request.title}
          </Text>
          <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary, marginBottom: spacing.lg, lineHeight: 20 }}>
            {request.message}
          </Text>

          {request.kind === "confirm" ? (
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Pressable
                testID="confirm-host-cancel"
                onPress={() => close(false)}
                style={{
                  flex: 1,
                  minHeight: 48,
                  borderRadius: radius.sm,
                  backgroundColor: "transparent",
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.onSurface }}>
                  {request.cancelLabel ?? "Cancel"}
                </Text>
              </Pressable>

              <Pressable
                testID="confirm-host-confirm"
                onPress={() => close(true)}
                style={{
                  flex: 1,
                  minHeight: 48,
                  borderRadius: radius.sm,
                  backgroundColor: request.destructive ? colors.error : colors.onSurface,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "800", color: colors.surface }}>
                  {request.confirmLabel ?? "Confirm"}
                </Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              testID="confirm-host-ok"
              onPress={() => close(true)}
              style={{
                minHeight: 48,
                borderRadius: radius.sm,
                backgroundColor: colors.onSurface,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "800", color: colors.surface }}>OK</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}
