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
 * so it actually shows regardless of how the page was opened.
 *
 * Since the 2026-10 redesign native goes through ConfirmHost too (it
 * used to fall back to Alert.alert there): the system alert can't take
 * the app's look, so the same delete confirmation looked like two
 * different apps on web and on the phone.
 */

export function confirmAction(
  title: string,
  message: string,
  options?: { confirmLabel?: string; cancelLabel?: string; destructive?: boolean },
): Promise<boolean> {
  return showConfirmDialog({
    title,
    message,
    confirmLabel: options?.confirmLabel,
    cancelLabel: options?.cancelLabel,
    destructive: options?.destructive,
  });
}

export function notifyAction(title: string, message: string): void {
  showNotifyDialog(title, message);
}
