import React from "react";
import { Text } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/providers/auth";
import { motion } from "@/lib/motion";
import { PressableScale } from "@/components/ui/PressableScale";
import { VerifiedBadge, emailVerifiedState } from "@/components/auth/VerifiedBadge";

/**
 * The profile circle (the user's initial + email badge) that opens
 * Settings. The LAST item in the title row of every main tab root --
 * Acasă, Spații, Calendar, Buget, and Simplu's Acasă / Calendar (user
 * decision 2026-11-01: same row, same spot as on Acasă). Hidden in edit
 * modes, like Acasă's.
 */
export function ProfileButton({ testID = "profile-button" }: { testID?: string }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const initial = (user?.name ?? "?").trim().charAt(0).toUpperCase();
  return (
    <PressableScale
      onPress={() => router.push("/settings")}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`Profil și setări${emailVerifiedState(user) === "unverified" ? ", email neconfirmat" : ""}`}
      scaleTo={motion.scale.control}
      style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" }}
    >
      <Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface }}>{initial}</Text>
      <VerifiedBadge user={user} avatarSize={44} />
    </PressableScale>
  );
}
