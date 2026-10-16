import React, { useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Field, Group, IconWell, Pill, Row, Segmented, SectionHeader } from "@/components/ui/primitives";
import { PressableScale } from "@/components/ui/PressableScale";
import { motion } from "@/lib/motion";
import { roCount } from "@/lib/format";
import { spaceColors, type SpaceKind } from "@/lib/spaces/spaceProfile";
import {
  LAYOUT_TEMPLATES, ROW_CHOICES, WIDGET_META, WIDGET_PALETTE, newWidget,
  type Widget, type WidgetSettings, type WidgetSize, type WidgetType,
} from "@/lib/dashboard/layout";
import type { HomeCtx } from "./HomeWidgets";

type IconName = keyof typeof Ionicons.glyphMap;

/** One addable card: a type, or a type pointed at one car/list/space. */
type CatalogEntry = { key: string; type: WidgetType; name: string; description: string; settings?: WidgetSettings; color?: string };

function catalogEntries(ctx: HomeCtx): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  // The icon takes that particular space's colour (its pick, else the kind's).
  const toneOf = (spaceId: unknown, kind: SpaceKind) =>
    spaceColors({ kind, color: ctx.spaces.find((s) => s.id === String(spaceId))?.color }, false)?.color;
  (Object.keys(WIDGET_META) as WidgetType[]).forEach((type) => {
    const meta = WIDGET_META[type];
    if (!meta.perInstance) {
      out.push({ key: type, type, name: meta.label, description: meta.description });
      return;
    }
    if (meta.perInstance === "car") {
      (ctx.dashboard?.cars ?? []).forEach((c: any) =>
        out.push({ key: `car-${c.space_id}`, type, name: `Mașină · ${c.name}`, description: meta.description, settings: { spaceId: String(c.space_id) }, color: toneOf(c.space_id, "car") }),
      );
    } else if (meta.perInstance === "list") {
      (ctx.dashboard?.toBuyLists ?? []).forEach((l: any) =>
        out.push({ key: `list-${l.list_id}`, type, name: `Listă · ${l.title}`, description: `${roCount(l.count, "produs", "produse")} de cumpărat`, settings: { listId: String(l.list_id) }, color: toneOf(l.space_id, "grocery") }),
      );
    } else {
      const kind = meta.perInstance === "home" ? "home" : "expenses";
      ctx.spaces.filter((s) => s.kind === kind).forEach((s) =>
        out.push({ key: `${type}-${s.id}`, type, name: `${meta.label} · ${s.name}`, description: meta.description, settings: { spaceId: s.id }, color: toneOf(s.id, kind) }),
      );
    }
  });
  return out;
}

function sameCard(w: Widget, e: CatalogEntry): boolean {
  if (w.type !== e.type) return false;
  if (e.settings?.listId) return w.settings?.listId === e.settings.listId;
  if (e.settings?.spaceId && WIDGET_META[e.type].perInstance) return w.settings?.spaceId === e.settings.spaceId;
  return true;
}

const GROUPS: { key: "bani" | "todo" | "spatii"; label: string }[] = [
  { key: "bani", label: "Bani" },
  { key: "todo", label: "De făcut" },
  { key: "spatii", label: "Spații" },
];

/** "Adaugă un card": every card type, and one entry per car / list /
 * space for the cards that point at one. A card already on Acasă says
 * "Adăugat"; one that's hidden offers "Arată" instead. */
export function CatalogSheet({ visible, onClose, ctx, layout, onAdd, onShow }: {
  visible: boolean;
  onClose: () => void;
  ctx: HomeCtx;
  layout: Widget[];
  onAdd: (w: Widget) => void;
  onShow: (id: string) => void;
}) {
  const { colors, spacing } = useTheme();
  const [filter, setFilter] = useState<"toate" | "bani" | "todo" | "spatii">("toate");
  const entries = useMemo(() => catalogEntries(ctx), [ctx]);

  return (
    <Sheet visible={visible} onClose={onClose} title="Adaugă un card" info="home.catalog" icon="add" testID="home-catalog">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {[{ key: "toate" as const, label: "Toate" }, ...GROUPS].map((g) => (
          <Pill key={g.key} label={g.label} active={filter === g.key} onPress={() => setFilter(g.key)} testID={`home-catalog-filter-${g.key}`} />
        ))}
      </ScrollView>
      {GROUPS.filter((g) => filter === "toate" || filter === g.key).map((g) => {
        const list = entries.filter((e) => WIDGET_META[e.type].group === g.key);
        if (list.length === 0) return null;
        return (
          <View key={g.key} style={{ gap: spacing.sm }}>
            <SectionHeader title={g.label} muted />
            <Group inset={62}>
              {list.map((e) => {
                const existing = layout.find((w) => sameCard(w, e));
                const trailing = existing && !existing.hidden ? (
                  <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>Adăugat</Text>
                ) : existing ? (
                  <Button compact variant="secondary" label="Arată" onPress={() => onShow(existing.id)} />
                ) : (
                  <PressableScale
                    testID={`home-catalog-add-${e.key}`}
                    onPress={() => onAdd({ ...newWidget(e.type, e.settings) })}
                    scaleTo={motion.scale.control}
                    accessibilityRole="button"
                    accessibilityLabel={`Adaugă ${e.name}`}
                    style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.onSurface, alignItems: "center", justifyContent: "center" }}
                  >
                    <Ionicons name="add" size={20} color={colors.surface} />
                  </PressableScale>
                );
                return (
                  <Row
                    key={e.key}
                    leading={<IconWell icon={WIDGET_META[e.type].icon} color={e.color ?? colors.onSurfaceTertiary} size={34} />}
                    title={e.name}
                    subtitle={e.description}
                    trailing={trailing}
                  />
                );
              })}
            </Group>
          </View>
        );
      })}
    </Sheet>
  );
}

/** One card's settings: size, color, what it shows, title. */
export function WidgetSettingsSheet({ widget, onClose, onSave, onRemove, ctx }: {
  widget: Widget | null;
  onClose: () => void;
  onSave: (w: Widget) => void;
  onRemove: (id: string) => void;
  ctx: HomeCtx;
}) {
  if (!widget) return null;
  return <SettingsBody key={widget.id} widget={widget} onClose={onClose} onSave={onSave} onRemove={onRemove} ctx={ctx} />;
}

function SettingsBody({ widget, onClose, onSave, onRemove, ctx }: { widget: Widget; onClose: () => void; onSave: (w: Widget) => void; onRemove: (id: string) => void; ctx: HomeCtx }) {
  const { colors, spacing } = useTheme();
  const meta = WIDGET_META[widget.type];
  const [size, setSize] = useState<WidgetSize>(widget.size);
  const [color, setColor] = useState<string | null>(widget.color ?? null);
  const [settings, setSettings] = useState<WidgetSettings>(widget.settings ?? {});
  const set = (patch: WidgetSettings) => setSettings((s) => ({ ...s, ...patch }));

  // What this card can point at.
  const choices: { key: string; label: string }[] | null = (() => {
    if (widget.type === "todo") return [{ key: "", label: "Toate spațiile" }, ...ctx.spaces.map((s) => ({ key: s.id, label: s.name }))];
    if (widget.type === "car") return (ctx.dashboard?.cars ?? []).map((c: any) => ({ key: String(c.space_id), label: c.name }));
    if (widget.type === "grocery") return (ctx.dashboard?.toBuyLists ?? []).map((l: any) => ({ key: String(l.list_id), label: l.title }));
    if (widget.type === "supplies") return ctx.spaces.filter((s) => s.kind === "home").map((s) => ({ key: s.id, label: s.name }));
    if (widget.type === "expenses") return ctx.spaces.filter((s) => s.kind === "expenses").map((s) => ({ key: s.id, label: s.name }));
    return null;
  })();
  const choiceKey = widget.type === "grocery" ? "listId" : "spaceId";
  const current = (settings as any)[choiceKey] ?? (widget.type === "todo" ? "" : choices?.[0]?.key);
  const rowsValue = String(settings.rows ?? (widget.type === "todo" ? 0 : widget.type === "bills" || widget.type === "calendar" ? (widget.type === "bills" ? 3 : 5) : 5));

  return (
    <Sheet
      visible
      onClose={onClose}
      title={meta.label}
      subtitle="Setările cardului"
      icon={meta.icon as IconName}
      tone={color ?? undefined}
      testID="home-widget-settings"
      footer={
        <>
          <Button testID="home-widget-settings-save" label="Salvează" onPress={() => onSave({ ...widget, size, color, settings })} />
          {widget.type !== "spend" ? (
            <Button testID="home-widget-settings-remove" variant="ghost" icon="trash-outline" label="Scoate cardul de pe Acasă" onPress={() => onRemove(widget.id)} />
          ) : null}
        </>
      }
    >
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>Mărime</Text>
        <Segmented
          testIDPrefix="home-widget-size"
          options={[{ key: "wide", label: "Lat" }, { key: "compact", label: "Compact" }]}
          value={size}
          onChange={setSize}
        />
        <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>Două carduri compacte stau unul lângă altul.</Text>
      </View>

      {widget.type === "spend" ? (
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>Grafic</Text>
          <Segmented
            testIDPrefix="home-widget-chart"
            options={[{ key: "ring", label: "Inel" }, { key: "bar", label: "Bară" }]}
            value={settings.chart ?? "ring"}
            onChange={(k) => set({ chart: k })}
          />
        </View>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>Culoare</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <Swatch label="Implicit" selected={!color} onPress={() => setColor(null)} />
          {WIDGET_PALETTE.map((p) => (
            <Swatch key={p.hex} label={p.name} hex={p.hex} selected={color === p.hex} onPress={() => setColor(p.hex)} />
          ))}
        </View>
      </View>

      {choices && choices.length > 0 ? (
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>{widget.type === "grocery" ? "Ce listă arată" : widget.type === "todo" ? "Din ce spații" : "Ce spațiu arată"}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            {choices.map((c) => (
              <Pill key={c.key || "all"} label={c.label} active={current === c.key} onPress={() => set({ [choiceKey]: c.key || undefined } as any)} />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {meta.hasRows && size === "wide" ? (
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>Câte rânduri</Text>
          <Segmented
            testIDPrefix="home-widget-rows"
            options={ROW_CHOICES.map((r) => ({ key: r.key, label: r.label }))}
            value={rowsValue}
            onChange={(k) => set({ rows: Number(k) })}
          />
        </View>
      ) : null}

      <Field
        testID="home-widget-title"
        label="Titlu (opțional)"
        value={settings.title ?? ""}
        onChangeText={(t) => set({ title: t || undefined })}
        placeholder={meta.label}
        maxLength={40}
      />
    </Sheet>
  );
}

function Swatch({ label, hex, selected, onPress }: { label: string; hex?: string; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      hitSlop={4}
      style={{
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: hex ?? colors.surfaceTertiary,
        borderWidth: selected ? 3 : hex ? 0 : 1.5,
        borderColor: selected ? colors.onSurface : colors.borderStrong,
        alignItems: "center", justifyContent: "center",
      }}
    >
      {!hex ? <Ionicons name="color-wand-outline" size={16} color={colors.onSurfaceTertiary} /> : null}
    </Pressable>
  );
}

/** "Pornește de la un șablon" -- replaces the arrangement (still editable). */
export function TemplatesSheet({ visible, onClose, onPick, onReset }: {
  visible: boolean;
  onClose: () => void;
  onPick: (key: string) => void;
  onReset: () => void;
}) {
  const { colors, spacing, radius } = useTheme();
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Pornește de la un șablon"
      info="home.templates"
      subtitle="Îți înlocuiește aranjamentul. Îl poți ajusta după aceea."
      icon="albums-outline"
      footer={<Button variant="ghost" label="Revino la aranjamentul implicit" onPress={onReset} testID="home-templates-reset" />}
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
        {LAYOUT_TEMPLATES.map((t) => (
          <PressableScale
            key={t.key}
            testID={`home-template-${t.key}`}
            onPress={() => onPick(t.key)}
            scaleTo={motion.scale.tile}
            accessibilityRole="button"
            accessibilityLabel={`${t.name}: ${t.description}`}
            style={{ width: "47%", flexGrow: 1, backgroundColor: colors.surfaceTertiary, borderRadius: radius.card, padding: spacing.md, gap: spacing.sm }}
          >
            <TemplatePreview templateKey={t.key} />
            <Text style={{ fontSize: 14, fontWeight: "500", color: colors.onSurface }}>{t.name}</Text>
            <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>{t.description}</Text>
          </PressableScale>
        ))}
      </View>
    </Sheet>
  );
}

function TemplatePreview({ templateKey }: { templateKey: string }) {
  const { colors } = useTheme();
  const green = "rgba(46,189,133,0.35)";
  const amber = "rgba(245,158,11,0.35)";
  const blocks: { h: number; c: string; half?: boolean }[][] =
    templateKey === "bani"
      ? [[{ h: 22, c: green, half: true }, { h: 22, c: green, half: true }], [{ h: 26, c: colors.borderStrong }], [{ h: 20, c: colors.borderStrong }]]
      : templateKey === "minimal"
        ? [[{ h: 30, c: colors.borderStrong }], [{ h: 18, c: "rgba(59,130,246,0.35)", half: true }, { h: 18, c: colors.borderStrong, half: true }], [{ h: 16, c: amber }]]
        : [[{ h: 24, c: colors.borderStrong }], [{ h: 28, c: colors.borderStrong }], [{ h: 16, c: colors.borderStrong }], [{ h: 10, c: colors.borderStrong }]];
  return (
    <View style={{ height: 104, borderRadius: 10, backgroundColor: colors.surface, padding: 8, gap: 5, overflow: "hidden" }}>
      {blocks.map((row, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 5 }}>
          {row.map((b, j) => <View key={j} style={{ flex: 1, height: b.h, borderRadius: 4, backgroundColor: b.c }} />)}
        </View>
      ))}
    </View>
  );
}
