import React from "react";
import { useRouter } from "expo-router";
import { useTheme } from "@/lib/theme";
import { Row, IconWell } from "@/components/ui/primitives";
import { SPACE_IDENTITY_COLORS, spaceTextColor } from "@/lib/spaces/spaceProfile";
import { lei } from "@/lib/format";

/**
 * A credit's monthly instalment as a REMINDER row (`reminder: true` from
 * /calendar and /dashboard, type expense_credit). Credits have no paid /
 * restant state and are managed in Cheltuieli > Credite, so this row has
 * no swipe, no checkbox and never counts as overdue. A tap opens the
 * Cheltuieli space the credit lives in (its root -- the Credite list is
 * one tap from there).
 */
export function isReminder(item: any): boolean {
  return !!item?.reminder;
}

export function CreditReminderRow({ item, testID, onBeforeOpen }: {
  item: any;
  testID?: string;
  /** Runs before navigating (e.g. close the sheet the row sits in). */
  onBeforeOpen?: () => void;
}) {
  const { isDark } = useTheme();
  const router = useRouter();
  const fill = SPACE_IDENTITY_COLORS.expenses ?? "#14B8A6";
  const tint = spaceTextColor("expenses", isDark) ?? fill;
  const amount = item?.amount != null && Number(item.amount) > 0 ? Number(item.amount) : null;
  const spaceId = item?.space?.id ?? item?.space_id;
  return (
    <Row
      testID={testID ?? `credit-reminder-${String(item?.id)}`}
      onPress={
        spaceId != null
          ? () => {
              onBeforeOpen?.();
              router.push(`/${String(spaceId)}` as any);
            }
          : undefined
      }
      leading={<IconWell icon="card-outline" color={fill} tint={tint} />}
      title={item?.title || "Credit"}
      subtitle={amount ? `Rată · ${lei(amount)}` : "Rată"}
    />
  );
}
