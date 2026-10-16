import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTheme } from "@/lib/theme";
import { PressableScale } from "@/components/ui/PressableScale";
import { motion } from "@/lib/motion";

/** Google's own colours for its sign-in button (developers.google.com/
 * identity/branding-guidelines): neutral light / dark themes, only the "G"
 * mark is multicoloured -- the word "Google" stays plain text by rule. */
const GOOGLE_THEME = {
  light: { bg: "#FFFFFF", border: "#747775", text: "#1F1F1F" },
  dark: { bg: "#131314", border: "#8E918F", text: "#E3E3E3" },
};

/** The official four-colour "G" mark. */
export function GoogleG({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessible={false}>
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

/** "Continuă cu Google" in Google's branded style -- same height and
 * corner radius as the Apple button next to it. */
export function GoogleSignInButton({ onPress, loading, disabled, testID }: {
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  const { radius, isDark } = useTheme();
  const t = isDark ? GOOGLE_THEME.dark : GOOGLE_THEME.light;
  const inactive = !!disabled || !!loading;
  return (
    <PressableScale
      testID={testID}
      onPress={inactive ? undefined : onPress}
      disabled={inactive}
      scaleTo={motion.scale.card}
      accessibilityRole="button"
      accessibilityLabel="Continuă cu Google"
      accessibilityState={{ disabled: inactive, busy: !!loading }}
      style={{
        height: 52,
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: t.border,
        backgroundColor: t.bg,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        opacity: disabled && !loading ? 0.5 : 1,
      }}
    >
      {loading ? (
        <ActivityIndicator color={t.text} />
      ) : (
        <>
          <View style={{ width: 20, height: 20 }}>
            <GoogleG size={20} />
          </View>
          <Text style={{ fontSize: 16, fontWeight: "500", color: t.text }}>Continuă cu Google</Text>
        </>
      )}
    </PressableScale>
  );
}
