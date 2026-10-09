import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

/**
 * The light tap felt when a long press opens something (the record
 * actions sheet, edit mode). Casă only for now -- see BACKLOG for
 * rolling it out to every long press in the app. Never throws: no
 * haptics on web, and a device without a motor just does nothing.
 */
export function longPressFeedback(): void {
  if (Platform.OS === "web") return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}
