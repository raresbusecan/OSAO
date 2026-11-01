import React, { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/providers/auth";
import { Button } from "@/components/ui/primitives";

/**
 * Registration email verification, frontend side. Unverified users are
 * NOT blocked (they log in and use everything); this is only a reminder
 * on Acasă and Settings until the link from VerifyEmailNotification is
 * opened (app/verify-email.tsx).
 *
 * Module-level state, shared by every mounted banner and the
 * verify-email screen, alive for the app session only (never persisted):
 * - `dismissed`: the X hides the banner on every screen until the next
 *   app start;
 * - `cooldownUntil`: after a resend (or a 429's retry_after) the button
 *   counts down instead of letting the user hit the 1/min limit again.
 */
type BannerState = { dismissed: boolean; cooldownUntil: number };
// Replaced (never mutated) on every change, so useSyncExternalStore sees
// a new snapshot and the values read in render are reactive.
let state: BannerState = { dismissed: false, cooldownUntil: 0 };
const listeners = new Set<() => void>();
const setState = (patch: Partial<BannerState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const snapshot = () => state;

function startCooldown(seconds: number) {
  setState({ cooldownUntil: Date.now() + Math.max(1, seconds) * 1000 });
}

/** "Retrimite emailul": POST /email/verification-notification with the
 * cooldown, the server's own (Romanian) messages, and already_verified
 * handled by re-reading the user (verified on another device meanwhile). */
export function useResendVerification() {
  const { refreshUser } = useAuth();
  const { cooldownUntil } = useSyncExternalStore(subscribe, snapshot, snapshot);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const secondsLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    setNow(Date.now());
    const t = setInterval(() => {
      setNow(Date.now());
      if (cooldownUntil <= Date.now()) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [cooldownUntil]);

  const resend = useCallback(async () => {
    if (busy || cooldownUntil > Date.now()) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await api.resendVerification();
      if (res.already_verified) {
        // The banner unmounts itself once the refreshed user is verified.
        try {
          await refreshUser();
        } catch {}
        setNote({ text: res.message, ok: true });
      } else {
        setNote({ text: res.message || "Ți-am trimis un nou email de confirmare.", ok: true });
        startCooldown(60);
      }
    } catch (e: any) {
      if (e?.status === 429) startCooldown(Number(e?.body?.retry_after) || 60);
      setNote({ text: apiErrorMessage(e, "Nu am putut trimite emailul. Încearcă din nou."), ok: false });
    } finally {
      setBusy(false);
    }
  }, [busy, cooldownUntil, refreshUser]);

  return { resend, busy, note, secondsLeft };
}

/** The reminder card. Renders nothing for a verified user, a user object
 * without the field at all (an older backend -- never nag on missing
 * data), or after the X was tapped this session. */
export function VerifyEmailBanner({ testID = "verify-email-banner" }: { testID?: string }) {
  const { card, colors, spacing, radius } = useTheme();
  const { user } = useAuth();
  const { dismissed } = useSyncExternalStore(subscribe, snapshot, snapshot);
  const { resend, busy, note, secondsLeft } = useResendVerification();

  if (!user || user.email_verified_at !== null || dismissed) return null;

  return (
    <View testID={testID} style={{ ...card, borderRadius: radius.card, padding: spacing.lg, gap: spacing.md }}>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <Ionicons name="mail-unread-outline" size={22} color={colors.warning} style={{ marginTop: 1 }} />
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface }}>Confirmă-ți adresa de email</Text>
          <Text style={{ fontSize: 14, lineHeight: 20, color: colors.onSurfaceTertiary }}>
            Ți-am trimis un link la {user.email}. Până îl deschizi, contul funcționează normal.
          </Text>
        </View>
        <Pressable
          testID={`${testID}-dismiss`}
          onPress={() => setState({ dismissed: true })}
          accessibilityRole="button"
          accessibilityLabel="Ascunde mementoul"
          hitSlop={8}
          style={{ width: 44, height: 44, marginTop: -12, marginRight: -12, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="close" size={20} color={colors.onSurfaceTertiary} />
        </Pressable>
      </View>
      {note ? (
        <Text testID={`${testID}-note`} style={{ fontSize: 13, lineHeight: 18, color: note.ok ? colors.success : colors.error }}>
          {note.text}
        </Text>
      ) : null}
      <Button
        testID={`${testID}-resend`}
        variant="secondary"
        compact
        icon="paper-plane-outline"
        label={secondsLeft > 0 ? `Retrimite în ${secondsLeft} s` : "Retrimite emailul"}
        onPress={resend}
        loading={busy}
        disabled={secondsLeft > 0}
      />
    </View>
  );
}
