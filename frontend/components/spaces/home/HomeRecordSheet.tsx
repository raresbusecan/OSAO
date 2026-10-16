import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { useSpaceColors } from "@/lib/spaces/spaceTheme";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Group, Row } from "@/components/ui/primitives";
import type { HomeRecordPreview } from "./homeRecordPreview";

type IconName = keyof typeof Ionicons.glyphMap;

export type HomeRecordResolve = { label: string; icon: IconName; run: () => void };

/**
 * Every Casă record, one sheet (design-lead spec v2):
 *  - "preview" (a tap): the record read-only -- status line, its fields,
 *    then Rezolvă (Reînnoiește / Am cumpărat) and Editează + Șterge;
 *  - "actions" (a long press): just the action list, no preview.
 * Each action closes the sheet FIRST and runs a moment later: opening the
 * next modal (edit form, confirm, resolve sheet) while this one is still
 * up can fail to show on iOS.
 */
export function HomeRecordSheet({
  record,
  mode,
  onClose,
  resolve,
  onEdit,
  onDelete,
}: {
  record: HomeRecordPreview | null;
  mode: "preview" | "actions";
  onClose: () => void;
  /** Omitted for records with nothing to resolve (an expense). */
  resolve?: HomeRecordResolve | null;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { colors, spacing } = useTheme();
  const homeColors = useSpaceColors("home");
  const HOME = homeColors.color;
  const toneColor = (tone: "error" | "warning" | "muted") => (tone === "error" ? colors.error : tone === "warning" ? colors.warning : colors.onSurfaceTertiary);

  const run = (fn: () => void) => {
    onClose();
    setTimeout(fn, 320);
  };

  if (!record) return null;

  if (mode === "actions") {
    const subtitle = record.status ? `${record.typeLabel} · ${record.status.text.toLowerCase()}` : record.typeLabel;
    return (
      <Sheet visible onClose={onClose} title={record.title} subtitle={subtitle} testID="home-record-actions">
        <Group inset={50}>
          {resolve ? (
            <Row
              testID="home-record-action-resolve"
              leading={<Ionicons name={resolve.icon} size={20} color={colors.success} />}
              title={resolve.label}
              onPress={() => run(resolve.run)}
            />
          ) : null}
          <Row
            testID="home-record-action-edit"
            leading={<Ionicons name="create-outline" size={20} color={colors.onSurfaceSecondary} />}
            title="Editează"
            onPress={() => run(onEdit)}
          />
          <Row
            testID="home-record-action-delete"
            leading={<Ionicons name="trash-outline" size={20} color={colors.error} />}
            title="Șterge"
            destructive
            onPress={() => run(onDelete)}
          />
        </Group>
      </Sheet>
    );
  }

  return (
    <Sheet
      visible
      onClose={onClose}
      title={record.title}
      subtitle={record.typeLabel}
      icon={record.icon}
      tone={HOME}
      testID="home-record-preview"
      footer={
        <>
          {resolve ? (
            <Button testID="home-record-resolve" label={resolve.label} icon={resolve.icon} tone={homeColors.fill} onPress={() => run(resolve.run)} />
          ) : null}
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Button testID="home-record-edit" variant="secondary" label="Editează" icon="create-outline" onPress={() => run(onEdit)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button testID="home-record-delete" variant="destructive" label="Șterge" icon="trash-outline" onPress={() => run(onDelete)} />
            </View>
          </View>
        </>
      }
    >
      {record.status ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {record.status.tone === "error" ? <Ionicons name="alert-circle" size={16} color={colors.error} /> : null}
          <Text style={{ fontSize: 15, fontWeight: "500", color: toneColor(record.status.tone) }}>{record.status.text}</Text>
        </View>
      ) : null}
      {record.fields.length > 0 ? (
        <Group>
          {record.fields.map((f) => (
            <View key={f.label} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 52, paddingHorizontal: spacing.lg, backgroundColor: colors.surfaceTertiary }}>
              <Text style={{ fontSize: 15, color: colors.onSurfaceSecondary }}>{f.label}</Text>
              <Text style={{ flex: 1, flexShrink: 1, textAlign: "right", fontSize: 15, fontWeight: "500", color: colors.onSurface }}>{f.value}</Text>
            </View>
          ))}
        </Group>
      ) : null}
      {record.longFields.map((f) => (
        <View key={f.label} style={{ gap: 4 }}>
          <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>{f.label}</Text>
          <Text style={{ fontSize: 15, lineHeight: 21, color: colors.onSurface }}>{f.value}</Text>
        </View>
      ))}
    </Sheet>
  );
}
