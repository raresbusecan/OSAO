import React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { readableOn } from "@/components/ui/primitives";

/** Email confirmation state from `user.email_verified_at`: an ISO string
 * once confirmed, `null` while not. A user object without the field
 * (older cached session) shows no badge at all -- same rule as
 * VerifyEmailBanner. */
export function emailVerifiedState(user: { email_verified_at?: string | null } | null | undefined): "verified" | "unverified" | null {
  if (!user || user.email_verified_at === undefined) return null;
  return user.email_verified_at ? "verified" : "unverified";
}

/**
 * Small dot on the bottom-right of a profile circle: green check once the
 * email is confirmed, amber "!" while it isn't. Positioned absolutely --
 * the parent circle must not clip (no overflow: hidden).
 */
export function VerifiedBadge({ user, avatarSize, testID }: {
  user: { email_verified_at?: string | null } | null | undefined;
  avatarSize: number;
  testID?: string;
}) {
  const { colors } = useTheme();
  const state = emailVerifiedState(user);
  if (!state) return null;

  const size = Math.max(16, Math.round(avatarSize * 0.4));
  const fill = state === "verified" ? colors.success : colors.warning;
  return (
    <View
      testID={testID ?? `profile-badge-${state}`}
      accessible={false}
      pointerEvents="none"
      style={{
        position: "absolute",
        right: -2,
        bottom: -2,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: fill,
        // A ring in the page colour separates the dot from the circle.
        borderWidth: 2,
        borderColor: colors.surface,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name={state === "verified" ? "checkmark" : "alert"} size={Math.round(size * 0.62)} color={readableOn(fill)} />
    </View>
  );
}
