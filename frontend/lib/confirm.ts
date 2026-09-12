import { Alert, Platform } from "react-native";

/**
 * react-native-web's Alert.alert is a total no-op --
 * node_modules/react-native-web/dist/exports/Alert literally reads
 * `class Alert { static alert() {} }`. Every existing Alert.alert() call
 * in this app silently did nothing when running on web (confirmed: the
 * delete-space confirmation button "did nothing" for exactly this reason,
 * not a button-wiring bug). These wrap a confirm/info dialog that actually
 * works on both -- window.confirm/alert on web, the real native
 * Alert.alert everywhere else.
 */

export function confirmAction(
  title: string,
  message: string,
  options?: { confirmLabel?: string; cancelLabel?: string; destructive?: boolean },
): Promise<boolean> {
  if (Platform.OS === "web") {
    return Promise.resolve(
      typeof window !== "undefined" ? window.confirm(`${title}\n\n${message}`) : false,
    );
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
    if (typeof window !== "undefined") window.alert(`${title}\n\n${message}`);
    return;
  }

  Alert.alert(title, message);
}
