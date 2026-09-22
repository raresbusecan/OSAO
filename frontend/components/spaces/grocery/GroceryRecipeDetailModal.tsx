import React, { useEffect, useState } from "react";
import { View, Text, Pressable, Modal, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import type { Recipe, RecipeMatch } from "@/lib/spaces/grocery/recipeMatching";

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
  const { colors, spacing, radius } = useTheme();
  const [snapshot, setSnapshot] = useState<{ recipe: Recipe; match: RecipeMatch; otherTags: string[] } | null>(null);

  useEffect(() => {
    if (recipe && match) setSnapshot({ recipe, match, otherTags });
  }, [recipe, match, otherTags]);

  if (!snapshot) return null;

  const complete = snapshot.match.missingIngredients.length === 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable onPress={onClose} style={{ ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.4)" }} />

        <View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            maxHeight: "85%",
          }}
        >
          <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                justifyContent: "space-between",
                marginBottom: spacing.md,
              }}
            >
              <Text style={{ flex: 1, fontSize: 20, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.3, marginRight: spacing.md }}>
                {snapshot.recipe.title}
              </Text>

              <Pressable
                testID="recipe-detail-close"
                onPress={onClose}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: radius.pill,
                  backgroundColor: "transparent",
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="close" size={18} color={colors.onSurfaceTertiary} />
              </Pressable>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: spacing.lg }}>
              {snapshot.recipe.timeMinutes ? (
                <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>{snapshot.recipe.timeMinutes} min</Text>
              ) : null}
              {snapshot.recipe.difficulty ? (
                <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>&middot; {snapshot.recipe.difficulty}</Text>
              ) : null}
              <Text style={{ fontSize: 12, fontWeight: "700", color: complete ? colors.success : colors.onSurfaceTertiary }}>
                &middot; {complete ? "You have everything" : `${snapshot.match.matchedIngredients.length}/${snapshot.recipe.ingredients.length} ingredients you have`}
              </Text>
            </View>

            {snapshot.otherTags.length > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: spacing.lg }}>
                {snapshot.otherTags.map((tag) => (
                  <View
                    key={tag}
                    style={{
                      paddingHorizontal: spacing.sm,
                      minHeight: 24,
                      borderRadius: radius.pill,
                      backgroundColor: "transparent",
                      borderWidth: 1,
                      borderColor: colors.border,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "700", color: colors.onSurfaceTertiary }}>{tag}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 0.5, color: colors.onSurfaceTertiary, marginBottom: spacing.sm }}>
              INGREDIENTS
            </Text>
            {snapshot.recipe.ingredients.map((ingredient) => {
              const have = snapshot.match.matchedIngredients.includes(ingredient.name);
              return (
                <View key={ingredient.name} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: 4 }}>
                  <Ionicons
                    name={have ? "checkmark-circle" : "ellipse-outline"}
                    size={14}
                    color={have ? colors.success : colors.onSurfaceTertiary}
                  />
                  <Text style={{ fontSize: 13, color: colors.onSurface }}>{ingredient.name}</Text>
                </View>
              );
            })}

            {!complete && onAddMissing ? (
              <Pressable
                testID={`recipe-detail-add-missing-${snapshot.recipe.id}`}
                onPress={onAddMissing}
                style={{
                  alignSelf: "flex-start",
                  paddingHorizontal: spacing.md,
                  minHeight: 32,
                  borderRadius: radius.pill,
                  backgroundColor: "transparent",
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: spacing.md,
                  marginBottom: spacing.md,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.onSurface }}>Add missing to list</Text>
              </Pressable>
            ) : null}

            <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 0.5, color: colors.onSurfaceTertiary, marginTop: spacing.sm, marginBottom: spacing.sm }}>
              STEPS
            </Text>
            {snapshot.recipe.steps.map((step, index) => (
              <Text key={index} style={{ fontSize: 13, color: colors.onSurface, lineHeight: 19, marginBottom: 4 }}>
                {index + 1}. {step}
              </Text>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
