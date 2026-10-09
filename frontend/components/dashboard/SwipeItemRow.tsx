import React from "react";
import { useRouter } from "expo-router";
import { useTheme } from "@/lib/theme";
import { SwipeRow } from "@/components/spaces/SwipeRow";
import { type ActionItem, canSwipeResolve, deleteAnywhere, resolveFromSummary } from "@/lib/dashboard/itemActions";

/**
 * Swipe right = rezolvă, swipe left = șterge, for an item shown outside
 * its own Space (Acasă, "De făcut", Calendar, Buget). Swipe-right asks
 * "cu datele salvate / modifică informațiile" and stays on this screen
 * unless the user picks "Modifică" -- see lib/dashboard/itemActions.ts.
 * `canResolve` false keeps only the delete (e.g. a future projected
 * occurrence of a bill: only the CURRENT one can be paid).
 */
export function SwipeItemRow({
  item,
  onChanged,
  canResolve = true,
  canDelete = true,
  children,
}: {
  item: ActionItem;
  onChanged: () => void;
  canResolve?: boolean;
  canDelete?: boolean;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const isCarService = item.type === "car_maintenance";
  const isDocument = item.type.endsWith("_document");

  return (
    <SwipeRow
      cornerRadius={0}
      colors={colors}
      resolveIcon={isCarService ? "construct" : isDocument ? "refresh" : "checkmark"}
      resolveLabel={isCarService ? "Înregistrează service-ul" : isDocument ? "Reînnoiește" : "Rezolvă"}
      onResolve={
        canResolve && canSwipeResolve(item)
          ? async () => {
              if (await resolveFromSummary(item, (href) => router.push(href as any))) onChanged();
            }
          : undefined
      }
      // A car service is a log kept for history (and its next-service
      // prediction) -- not swiped away from a summary list.
      onDelete={
        canDelete && !isCarService
          ? async () => {
              if (await deleteAnywhere(item)) onChanged();
            }
          : undefined
      }
    >
      {children}
    </SwipeRow>
  );
}
