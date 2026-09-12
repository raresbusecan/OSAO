import React, { useState } from "react";
import { ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "@/lib/theme";

import type { HomeData } from "./home.data.types";
import { HomeHeader } from "./HomeHeader";
import { HomeStats } from "./HomeStats";
import { HomeNextSection } from "./HomeNextSection";
import { HomeCategoryPage } from "./HomeCategoryPage";
import { HOME_CATEGORIES, type HomeCategoryKey } from "./homeCategoryConfig";
import { useRegisterSpaceCategories } from "@/lib/spaceCategoryFab";
import {
  getThisMonthHomeExpenses,
  getUpcomingHomeItems,
} from "@/lib/spaces/home/calculations/dashboard.calculations";
import type { HomeProfile } from "@/lib/spaces/spaceProfile";

export type HomeDashboardProps = {
  space: any;
  homeData: HomeData;
  /** From the dedicated Home form (Edit -> County/City/...) -- null for a Home space created before this existed. */
  profile?: HomeProfile | null;
  onEdit?: () => void;
};

export default function HomeDashboard({
  space,
  homeData: initialHomeData,
  profile,
  onEdit,
}: HomeDashboardProps) {
  const { spacing } = useTheme();
  const router = useRouter();

  // Owns the list state directly -- adding an entry from a category page
  // is real, immediate interaction, same reasoning as Grocery/Expenses.
  const [homeData, setHomeData] = useState<HomeData>(initialHomeData);
  const [activeCategory, setActiveCategory] = useState<HomeCategoryKey | null>(null);

  const thisMonthExpenses = getThisMonthHomeExpenses(homeData);
  const upcomingItems = getUpcomingHomeItems(homeData, 3);

  // Claims the shared "+" FAB (app/(tabs)/_layout.tsx) for as long as this
  // dashboard is on screen -- pressing it fans out Home's categories
  // instead of opening Quick Add.
  useRegisterSpaceCategories({
    spaceLabel: "Home",
    categories: HOME_CATEGORIES.map((c) => ({ key: c.key, label: c.label, icon: c.icon })),
    onSelect: (key) => setActiveCategory(key as HomeCategoryKey),
  });

  if (activeCategory) {
    const category = HOME_CATEGORIES.find((c) => c.key === activeCategory)!;

    return (
      <HomeCategoryPage
        title={category.label}
        fields={category.fields}
        submitLabel={category.submitLabel}
        emptyLabel={category.emptyLabel}
        rows={category.rows(homeData)}
        onBack={() => setActiveCategory(null)}
        onSubmit={(values) => setHomeData((current) => category.addEntry(current, values))}
      />
    );
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: spacing.xl,
        // Clears the floating Quick Add / category FAB in the bottom-right
        // corner.
        paddingBottom: 100,
      }}
    >
      <HomeHeader
        space={space}
        subtitle={profile?.county}
        onBack={() => router.push("/spaces")}
        onEdit={onEdit}
      />

      <HomeStats
        thisMonthExpenses={thisMonthExpenses}
        upcomingCount={upcomingItems.length}
      />

      <HomeNextSection items={upcomingItems} />
    </ScrollView>
  );
}
