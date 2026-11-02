import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { lei } from "@/lib/format";
import { localDay, reminderDays, type Cadence } from "@/lib/budget/goal";

/**
 * Obiectiv de economii's phone reminders (2026-11): local notifications,
 * "Nu uita să pui deoparte X lei", at 20:00 on the rhythm's next days.
 * Only once 3 periods in a row were confirmed (the server's
 * `reminders_since`); the rhythm's day/week/month decides the days
 * (lib/budget/goal.ts reminderDays). Local, not push: nothing leaves the
 * phone, and it works in Expo Go.
 *
 * Re-synced on every Buget load and after each tap: everything this
 * module scheduled is cancelled and the next few days are scheduled again
 * (a confirmed period drops its reminder). Never throws -- a phone that
 * refuses notifications just gets none.
 */

const KIND = "savings-goal";
const HOUR = 20;
// How far ahead (re-synced on every Buget visit): a month of days, two of weeks.
const AHEAD: Record<Cadence, number> = { day: 30, week: 8, month: 4 };

let handlerSet = false;

export type ReminderGoal = {
  name?: string | null;
  target_date?: string | null;
  cadence?: Cadence | null;
  cadence_amount?: number | string | null;
  cadence_since?: string | null;
  reminders_since?: string | null;
  period_done?: boolean;
};

async function cancelOurs(): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    all.filter((n) => n.content.data?.kind === KIND).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

async function allowed(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** `active` = the goal still has a target ahead (goalPace status "ok"). */
export async function syncSavingsReminders(goal: ReminderGoal | null, active: boolean): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    if (!handlerSet) {
      handlerSet = true;
      Notifications.setNotificationHandler({
        handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
      });
    }
    await cancelOurs();
    const cadence = goal?.cadence;
    const amount = Number(goal?.cadence_amount ?? 0);
    if (!active || !cadence || !goal?.cadence_since || !goal.reminders_since || !(amount > 0)) return;
    if (!(await allowed())) return;

    const now = new Date();
    const days = reminderDays(cadence, goal.cadence_since, localDay(now), !!goal.period_done, AHEAD[cadence] + 1);
    const body = `Nu uita să pui deoparte ${lei(Math.ceil(amount))}${goal.name ? ` pentru ${goal.name}` : ""}.`;
    const lastDay = goal.target_date ? goal.target_date.slice(0, 10) : null;
    for (const day of days.slice(0, AHEAD[cadence] + 1)) {
      // Never after the goal's date (like its Calendar rows).
      if (lastDay && day > lastDay) break;
      const [y, m, d] = day.split("-").map(Number);
      const at = new Date(y, m - 1, d, HOUR, 0, 0);
      if (at <= now) continue;
      await Notifications.scheduleNotificationAsync({
        content: { title: "Economii", body, data: { kind: KIND } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
      });
    }
  } catch {
    // Notifications unavailable (web, Expo Go limits, denied): no reminders.
  }
}
