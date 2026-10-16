import React, { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import type { Recipe, RecipeMatch } from "@/lib/spaces/grocery/recipeMatching";
import { useSpaceColors } from "@/lib/spaces/spaceTheme";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Chip, Group, Row, SectionHeader } from "@/components/ui/primitives";

export type GroceryRecipeDetailModalProps = {
  visible: boolean;
  recipe: Recipe | null;
  match: RecipeMatch | null;
  /** Cuisine/meal-type-free tags to show as plain chips (see
   * GroceryRecipesPage's otherTags) -- purely descriptive here, not a
   * filter. */
  otherTags: string[];
  onClose: () => void;
  /** Undefined when there's nothing to add (recipe's complete, or no
   * list picked yet in "ADD TO" above) -- hides the button rather than
   * showing it disabled. */
  onAddMissing?: () => void;
};

/**
 * The recipe grid's card is deliberately compact (a photo block, a
 * title, a match badge -- see GroceryRecipesPage) with no room for the
 * full ingredient/step breakdown that used to live in an inline
 * expand. This sheet is where that detail moved to instead: tapping a
 * card's body (not its selection checkbox) opens this, closing it
 * lands back on the grid exactly where it was.
 *
 * Snapshots `recipe`/`match` into local state on open and keeps
 * rendering that snapshot while `visible` is false -- the same reason
 * GroceryProductModal only re-seeds its fields on open: React Native's
 * Modal slides this sheet closed over ~300ms, and the parent nulls its
 * `detailRecipeId` the instant the user taps away, so rendering the
 * live prop directly would blank the sheet's content mid-close-animation.
 */
export function GroceryRecipeDetailModal({
  visible,
  recipe,
  match,
  otherTags,
  onClose,
  onAddMissing,
}: GroceryRecipeDetailModalProps) {
  const { colors, spacing } = useTheme();
  const GROC = useSpaceColors("grocery").color;
  const [snapshot, setSnapshot] = useState<{ recipe: Recipe; match: RecipeMatch; otherTags: string[] } | null>(null);

  useEffect(() => {
    if (recipe && match) setSnapshot({ recipe, match, otherTags });
  }, [recipe, match, otherTags]);

  if (!snapshot) return null;

  const complete = snapshot.match.missingIngredients.length === 0;

  const have = snapshot.match.matchedIngredients.length;
  const total = snapshot.recipe.ingredients.length;
  const meta = [
    snapshot.recipe.timeMinutes ? `${snapshot.recipe.timeMinutes} min` : null,
    snapshot.recipe.difficulty ? DIFFICULTY[String(snapshot.recipe.difficulty).toLowerCase()] ?? snapshot.recipe.difficulty : null,
  ].filter(Boolean).join(", ");

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={snapshot.recipe.title}
      subtitle={meta || undefined}
      icon="restaurant-outline"
      tone={GROC}
      footer={
        !complete && onAddMissing ? (
          <Button testID={`recipe-detail-add-missing-${snapshot.recipe.id}`} icon="add" label={`Adaugă pe listă ce lipsește (${total - have})`} tone={GROC} onPress={onAddMissing} />
        ) : undefined
      }
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        <Chip label={complete ? "Ai tot ce trebuie" : `Ai ${have} din ${total} ingrediente`} color={complete ? colors.success : colors.onSurfaceTertiary} filled={complete} />
        {snapshot.otherTags.map((tag) => (
          <Chip key={tag} label={tag} color={colors.onSurfaceTertiary} filled={false} />
        ))}
      </View>

      <View style={{ gap: spacing.sm }}>
        <SectionHeader title="Ingrediente" />
        <Group inset={48}>
          {snapshot.recipe.ingredients.map((ingredient) => {
            const ok = snapshot.match.matchedIngredients.includes(ingredient.name);
            return (
              <Row
                key={ingredient.name}
                leading={<Ionicons name={ok ? "checkmark-circle" : "ellipse-outline"} size={20} color={ok ? colors.success : colors.control} />}
                title={ingredient.name}
                dim={!ok}
              />
            );
          })}
        </Group>
      </View>

      <View style={{ gap: spacing.sm }}>
        <SectionHeader title="Pași" />
        {snapshot.recipe.steps.map((step, index) => (
          <View key={index} style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.onSurface }}>{index + 1}</Text>
            </View>
            <Text style={{ flex: 1, fontSize: 15, color: colors.onSurface, lineHeight: 22 }}>{step}</Text>
          </View>
        ))}
      </View>
    </Sheet>
  );
}

const DIFFICULTY: Record<string, string> = { easy: "ușor", medium: "mediu", hard: "dificil" };
