import { Alert, Platform } from "react-native";
import { showConfirmDialog, showNotifyDialog } from "./confirmHost";

/**
 * react-native-web's Alert.alert is a total no-op --
 * node_modules/react-native-web/dist/exports/Alert literally reads
 * `class Alert { static alert() {} }`. Every existing Alert.alert() call
 * in this app silently did nothing when running on web (confirmed: the
 * delete-space confirmation button "did nothing" for exactly this reason,
 * not a button-wiring bug).
 *
 * These used to fix that by calling window.confirm/window.alert
 * directly on web instead -- which works in a plain browser tab, but is
 * ALSO a silent no-op in some contexts a page can be opened in on a
 * phone (most notably: added to the Home Screen and launched standalone
 * on iOS Safari, but some in-app/embedded browsers block it too). That
 * reproduced the exact same symptom one level up: a destructive
 * confirmation (delete a list, delete a product...) that looked like it
 * did nothing at all, with no error -- the dialog itself just never
 * appeared, so the confirm's promise never resolved true.
 *
 * Now both render through ConfirmHost (lib/confirmHost.tsx, mounted
 * once at the app root) -- our own Modal, not a browser-native dialog,
 * so it actually shows regardless of how the page was opened. Native
 * (iOS/Android app builds, not the web preview) still uses the real
 * Alert.alert, which doesn't have this problem there.
 */

export function confirmAction(
  title: string,
  message: string,
  options?: { confirmLabel?: string; cancelLabel?: string; destructive?: boolean },
): Promise<boolean> {
  if (Platform.OS === "web") {
    return showConfirmDialog({
      title,
      message,
      confirmLabel: options?.confirmLabel,
      cancelLabel: options?.cancelLabel,
      destructive: options?.destructive,
    });
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      {
        text: options?.cancelLabel ?? "Anulează",
        style: "cancel",
        onPress: () => resolve(false),
      },
      {
        text: options?.confirmLabel ?? "Confirmă",
        style: options?.destructive ? "destructive" : "default",
        onPress: () => resolve(true),
      },
    ]);
  });
}

export function notifyAction(title: string, message: string): void {
  if (Platform.OS === "web") {
    showNotifyDialog(title, message);
    return;
  }

  Alert.alert(title, message);
}
