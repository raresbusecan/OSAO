import React, { createContext, useContext, useMemo } from "react";
import { useColorScheme } from "react-native";

export type ThemeColors = {
  surface: string;
  onSurface: string;
  surfaceSecondary: string;
  onSurfaceSecondary: string;
  surfaceTertiary: string;
  onSurfaceTertiary: string;
  surfaceInverse: string;
  onSurfaceInverse: string;
  brandPrimary: string;
  onBrandPrimary: string;
  brandSecondary: string;
  brandTertiary: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  border: string;
  borderStrong: string;
};

const light: ThemeColors = {
  surface: "#FFFFFF",
  onSurface: "#111111",
  surfaceSecondary: "#F7F7F7",
  onSurfaceSecondary: "#111111",
  surfaceTertiary: "#EAEAEA",
  onSurfaceTertiary: "#444444",
  surfaceInverse: "#111111",
  onSurfaceInverse: "#FFFFFF",
  brandPrimary: "#111111",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#444444",
  brandTertiary: "#EAEAEA",
  success: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",
  info: "#6B7280",
  border: "#E5E5E5",
  borderStrong: "#CCCCCC",
};

const dark: ThemeColors = {
  surface: "#0A0A0A",
  onSurface: "#FFFFFF",
  surfaceSecondary: "#1A1A1A",
  onSurfaceSecondary: "#FFFFFF",
  surfaceTertiary: "#262626",
  onSurfaceTertiary: "#A3A3A3",
  surfaceInverse: "#FFFFFF",
  onSurfaceInverse: "#111111",
  brandPrimary: "#FFFFFF",
  onBrandPrimary: "#111111",
  brandSecondary: "#A3A3A3",
  brandTertiary: "#262626",
  success: "#059669",
  warning: "#D97706",
  error: "#DC2626",
  info: "#9CA3AF",
  border: "#262626",
  borderStrong: "#404040",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, "2xl": 32, "3xl": 48 };
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };

type Ctx = { colors: ThemeColors; isDark: boolean; spacing: typeof spacing; radius: typeof radius };
const ThemeCtx = createContext<Ctx>({ colors: light, isDark: false, spacing, radius });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const value = useMemo<Ctx>(
    () => ({ colors: isDark ? dark : light, isDark, spacing, radius }),
    [isDark],
  );
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}