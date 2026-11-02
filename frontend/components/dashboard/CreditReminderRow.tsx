import React from "react";
import { useRouter } from "expo-router";
import { useTheme } from "@/lib/theme";
import { Row, IconWell } from "@/components/ui/primitives";
import { spaceColors } from "@/lib/spaces/spaceProfile";
import { lei } from "@/lib/format";
import { todoHref } from "@/lib/dashboard/spaceDue";

/**
 * A credit's monthly instalment as a REMINDER row (`reminder: true` from
 * /calendar and /dashboard, type expense_credit). Credits have no paid /
 * restant state and are managed in Cheltuieli > Credite, so this row has
 * no swipe, no checkbox and never counts as overdue. A tap opens the
 * exact credit in Cheltuieli > Credite, returning here after save/cancel.
 */
export function isReminder(item: any): boolean {
  return !!item?.reminder;
}

/** Obiectiv de economii's "Pune deoparte X lei" (type savings_reminder,
 * from /calendar only): no space, `done` once that period is confirmed. */
export function isSavingsReminder(item: any): boolean {
  return item?.type === "savings_reminder";
}

export function CreditReminderRow({ item, testID, onBeforeOpen }: {
  item: any;
  testID?: string;
  /** Runs before navigating (e.g. close the sheet the row sits in). */
  onBeforeOpen?: () => void;
}) {
  const { isDark, colors } = useTheme();
  const router = useRouter();
  if (isSavingsReminder(item)) {
    const sum = Number(item?.amount) > 0 ? lei(Math.ceil(Number(item.amount))) : null;
    return (
      <Row
        testID={testID ?? `savings-reminder-${String(item?.id)}`}
        onPress={() => {
          onBeforeOpen?.();
          router.navigate("/budget" as any);
        }}
        leading={<IconWell icon={item?.done ? "checkmark-circle-outline" : "wallet-outline"} color={colors.success} />}
        title={item?.title || "Economii"}
        subtitle={[item?.done ? "Pus deoparte" : "Pune deoparte", sum].filter(Boolean).join(" · ")}
      />
    );
  }
  // The Cheltuieli space the credit lives in (its pick, else teal).
  const own = spaceColors(item?.space?.type ? item.space : { kind: "expenses", color: item?.space?.color }, isDark)!;
  const fill = own.color;
  const tint = own.tint;
  const amount = item?.amount != null && Number(item.amount) > 0 ? Number(item.amount) : null;
  const spaceId = item?.space?.id ?? item?.space_id;
  return (
    <Row
      testID={testID ?? `credit-reminder-${String(item?.id)}`}
      onPress={
        spaceId != null
          ? () => {
              onBeforeOpen?.();
              router.navigate(todoHref({ ...item, type: "expense_credit" }) as any);
            }
          : undefined
      }
      leading={<IconWell icon="card-outline" color={fill} tint={tint} />}
      title={item?.title || "Credit"}
      subtitle={amount ? `Rată · ${lei(amount)}` : "Rată"}
    />
  );
}
