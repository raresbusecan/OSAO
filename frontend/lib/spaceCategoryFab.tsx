import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import type { Ionicons } from "@expo/vector-icons";

export type SpaceCategory = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
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
 * it's mounted, and clears them (back to the Quick Add default) on
 * unmount -- i.e. as soon as the user navigates away from this space.
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

  useEffect(() => {
    if (!config) {
      setConfig(null);
      return;
    }

    setConfig({
      spaceLabel: config.spaceLabel,
      categories: config.categories,
      onSelect: (key: string) => latestRef.current?.onSelect(key),
    });

    return () => setConfig(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
}
