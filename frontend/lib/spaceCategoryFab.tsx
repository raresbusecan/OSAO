import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import type { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";

export type SpaceCategory = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap | keyof typeof MaterialCommunityIcons.glyphMap;
  /** Which icon family `icon` names a glyph from -- defaults to Ionicons
   * (the family every other space's categories already use) when
   * omitted, so this is purely additive. Only needed for a glyph
   * Ionicons doesn't have, e.g. Grocery's Smart List "brain" icon. */
  iconSet?: "ionicons" | "material-community";
  /** A small overlay badge in the icon circle's corner -- "plus" for a
   * "create a new one" action (e.g. Grocery's "New List") where the
   * base icon alone reads as the thing being created, not the fact
   * that this makes a new one; "soon" for a category that's still
   * visible (so it stays discoverable) but not live yet -- dims the
   * whole circle and marks it with a small clock instead of navigating
   * anywhere when pressed (e.g. Grocery's "Smart List" while paused). */
  badge?: "plus" | "soon";
};

export type SpaceCategoryFabConfig = {
  spaceLabel: string;
  categories: SpaceCategory[];
  onSelect: (key: string) => void;
};

type Ctx = {
  config: SpaceCategoryFabConfig | null;
  setConfig: (config: SpaceCategoryFabConfig | null) => void;
};

const SpaceCategoryFabContext = createContext<Ctx | null>(null);

/**
 * Wraps the tab navigator: the shared "+" FAB (rendered once, in
 * app/(tabs)/_layout.tsx) reads `config` to decide what pressing it does --
 * a space screen registers its own categories here for as long as it's on
 * screen (see useRegisterSpaceCategories below), and the FAB falls back to
 * opening Quick Add whenever nothing is registered (config is null).
 */
export function SpaceCategoryFabProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<SpaceCategoryFabConfig | null>(null);
  return (
    <SpaceCategoryFabContext.Provider value={{ config, setConfig }}>
      {children}
    </SpaceCategoryFabContext.Provider>
  );
}

export function useSpaceCategoryFab() {
  const ctx = useContext(SpaceCategoryFabContext);
  if (!ctx) {
    throw new Error("useSpaceCategoryFab must be used within a SpaceCategoryFabProvider");
  }
  return ctx;
}

/**
 * Registers this screen's categories with the shared FAB for as long as
 * it's FOCUSED, and clears them (back to the Quick Add default) the
 * moment it loses focus -- not on unmount. [id].tsx is one of the tab
 * navigator's own screens (registered with `href: null` to stay out of
 * the tab bar), and React Navigation keeps tab screens mounted in the
 * background when you switch to a different tab, for scroll-position/
 * state continuity -- it never actually unmounts just because you
 * navigated to Home/Budget/Spaces. A plain useEffect's cleanup (which
 * only runs on unmount) therefore never fired, so the FAB kept showing
 * whichever space's categories were registered last, no matter which
 * tab you were actually looking at. useFocusEffect's cleanup runs on
 * blur too, regardless of whether the screen underneath is still alive.
 *
 * Dashboards rebuild `categories`/`onSelect` fresh every render, so this
 * only re-registers when the space label or the actual set of category
 * keys changes (a signature comparison, not object identity) -- `onSelect`
 * itself is always read through a ref, so it's never stale even between
 * those re-registrations.
 */
export function useRegisterSpaceCategories(config: SpaceCategoryFabConfig | null) {
  const { setConfig } = useSpaceCategoryFab();
  const latestRef = useRef(config);
  latestRef.current = config;

  const signature = config
    ? `${config.spaceLabel}|${config.categories.map((c) => c.key).join(",")}`
    : "";

  useFocusEffect(
    useCallback(() => {
      if (!latestRef.current) {
        setConfig(null);
        return;
      }

      setConfig({
        spaceLabel: latestRef.current.spaceLabel,
        categories: latestRef.current.categories,
        onSelect: (key: string) => latestRef.current?.onSelect(key),
      });

      return () => setConfig(null);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signature]),
  );
}
