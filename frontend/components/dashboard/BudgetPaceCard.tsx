import React, { useEffect, useRef, useState } from "react";
import { Animated, Text, View } from "react-native";
import Svg, { Circle, Defs, Line, Pattern, Polygon, Polyline, Rect, Text as SvgText } from "react-native-svg";
import { fonts, useTheme } from "@/lib/theme";
import { motion, useReducedMotion } from "@/lib/motion";
import { PressableScale } from "@/components/ui/PressableScale";
import { hexToRgba } from "@/components/ui/primitives";
import { aheadPoints, cumulative, fmtLei, paceChip, paceSentence, paceStatus, ritmPoints, type PaceEvent, type PaceTone } from "@/lib/budget/pace";

const H = 168;
const TOP = 10;
const BOTTOM = 140;

// The S line's reveal plays once per app session (lib/motion.ts: the second
// unprompted motion in the app, after Home's total).
let revealedThisSession = false;

/**
 * Buget "Ritmul lunii" (direction C, 2026-11): the month's pace in lei.
 * Status chip + one sentence (lib/budget/pace.ts holds every formula and
 * string), then a chart: De cheltuit line, recurring bills + credit rates as a hatched band
 * under it, the dashed "ritm normal" line, the solid recorded-spend line up
 * to today, and a dotted line for the Calendar purchases still ahead. Tap =
 * the month overview. Only drawn when GET /budget sends `pace`.
 */
export function BudgetPaceCard({
  E,
  R,
  pAhead,
  S,
  t,
  D,
  daily,
  events,
  month,
  onPress,
}: {
  E: number;
  R: number;
  pAhead: number;
  S: number;
  t: number;
  D: number;
  /** Recorded spend per day (summed over the counted labels). */
  daily: number[];
  /** Every Calendar purchase of the month (counted labels). */
  events: PaceEvent[];
  /** "2026-11". */
  month: string;
  onPress: () => void;
}) {
  const { card, colors, spacing, radius, typography } = useTheme();
  const reduced = useReducedMotion();
  const [w, setW] = useState(0);
  const reveal = useRef(new Animated.Value(revealedThisSession ? 1 : 0)).current;

  const input = { E, R, pAhead, S, t, D, events };
  const r = paceStatus(input);
  const toneColor = (tone: PaceTone) => (tone === "neutral" ? null : colors[tone]);
  const chipColor = toneColor(r.tone);
  const runs = paceSentence(r, input);

  useEffect(() => {
    if (w <= 0) return;
    if (revealedThisSession || reduced) {
      reveal.setValue(1);
      revealedThisSession = true;
      return;
    }
    revealedThisSession = true;
    Animated.timing(reveal, { toValue: 1, ...motion.reveal, useNativeDriver: false }).start();
  }, [w, reduced, reveal]);

  // --- geometry
  const [yy, mm] = month.split("-").map(Number);
  const monthShort = new Date(yy || 2000, (mm || 1) - 1, 1).toLocaleDateString("ro-RO", { month: "short" }).replace(".", "");
  const yMax = Math.max(E, r.committed, S, 1);
  // Day d's cumulative value sits at the END of day d: day 0 = the left edge.
  const x = (d: number) => 4 + (Math.max(0, Math.min(D, d)) / Math.max(1, D)) * (w - 8);
  const y = (v: number) => BOTTOM - (Math.max(0, v) / yMax) * (BOTTOM - TOP);
  const pts = (list: [number, number][]) => list.map(([d, v]) => `${x(d)},${y(v)}`).join(" ");

  const cum = cumulative(daily).slice(0, t + 1);
  const spentPts: [number, number][] = cum.map((v, d) => [d, v]);
  const areaPts = `${x(0)},${y(0)} ${pts(spentPts)} ${x(t)},${y(0)}`;
  const ritm = ritmPoints(r.flex, D, events);
  const ahead = aheadPoints(S, t, D, events);
  const bandTop = y(E);
  const bandBottom = y(Math.max(0, E - R));
  const bandH = bandBottom - bandTop;
  const dotFill = chipColor ?? colors.onSurface;

  const leftLabel = `1 ${monthShort}`;
  const rightLabel = `${D} ${monthShort}`;
  const xt = x(t);
  // "azi" hides when it would touch an end label (~6px a character).
  const showAzi = xt - 10 > 4 + leftLabel.length * 6 + 6 && xt + 10 < w - 4 - rightLabel.length * 6 - 6;
  const label = (props: { x: number; y: number; anchor: "start" | "middle" | "end"; text: string; strong?: boolean }) => (
    <SvgText
      x={props.x}
      y={props.y}
      textAnchor={props.anchor}
      fontSize={11}
      fontFamily={fonts[props.strong ? "600" : "400"]}
      fill={props.strong ? colors.onSurface : colors.onSurfaceTertiary}
    >
      {props.text}
    </SvgText>
  );

  const legendIcon = (kind: "solid" | "dashed" | "dotted") => (
    <Svg width={14} height={4}>
      <Line
        x1={kind === "dotted" ? 1 : 0}
        y1={2}
        x2={kind === "dotted" ? 13 : 14}
        y2={2}
        stroke={kind === "solid" ? colors.onSurface : colors.onSurfaceTertiary}
        strokeWidth={kind === "solid" ? 2.5 : kind === "dotted" ? 2 : 1.5}
        strokeDasharray={kind === "dashed" ? "4 4" : kind === "dotted" ? "1 4" : undefined}
        strokeLinecap={kind === "dotted" ? "round" : "butt"}
      />
    </Svg>
  );

  return (
    <PressableScale
      testID="budget-pace-card"
      onPress={onPress}
      scaleTo={motion.scale.card}
      accessibilityRole="button"
      accessibilityLabel={`${paceChip(r)}. ${runs.map((x) => x.text).join("")} Vezi detalii`}
      style={{ ...card, borderRadius: radius.lg, padding: spacing.gutter, gap: spacing.md }}
    >
      <View style={{ gap: spacing.sm }}>
        <Text
          testID="budget-pace-chip"
          style={{
            ...typography.chip,
            alignSelf: "flex-start",
            paddingHorizontal: 9,
            paddingVertical: 3,
            borderRadius: radius.pill,
            overflow: "hidden",
            color: chipColor ?? colors.onSurfaceSecondary,
            backgroundColor: chipColor ? hexToRgba(chipColor, 0.12) : colors.surfaceTertiary,
          }}
        >
          {paceChip(r)}
        </Text>
        <Text testID="budget-pace-sentence" style={{ fontSize: 15, lineHeight: 22, color: colors.onSurfaceSecondary }}>
          {runs.map((run, i) =>
            run.strong ? (
              <Text key={i} style={{ fontWeight: "600", color: colors.onSurface }}>{run.text}</Text>
            ) : (
              run.text
            ),
          )}
        </Text>
      </View>

      <View
        onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Graficul lunii: ai cheltuit ${fmtLei(S)} lei din ${fmtLei(E)}. Normal până azi: ${fmtLei(r.ritm)} lei.`}
        style={{ height: H }}
      >
        {w > 0 ? (
          <>
            {/* Back: envelope, bills band, baseline, ritm. */}
            <Svg width={w} height={H} style={{ position: "absolute", left: 0, top: 0 }}>
              <Defs>
                <Pattern id="budgetPaceHatch" patternUnits="userSpaceOnUse" width={6} height={6} patternTransform="rotate(45)">
                  <Line x1={0} y1={0} x2={0} y2={6} stroke={colors.onSurfaceTertiary} strokeWidth={2} strokeOpacity={0.35} />
                </Pattern>
              </Defs>
              {R > 0 && bandH > 0 ? <Rect x={4} y={bandTop} width={w - 8} height={bandH} fill="url(#budgetPaceHatch)" /> : null}
              <Line x1={4} y1={bandTop} x2={w - 4} y2={bandTop} stroke={colors.surfaceTertiary} strokeWidth={2} />
              {label({ x: w - 4, y: bandTop + 4 + 9, anchor: "end", text: `De cheltuit ${fmtLei(E)}` })}
              {R > 0 && bandH >= 14 ? label({ x: 8, y: bandTop + 4 + 9, anchor: "start", text: `facturi și rate ${fmtLei(R)}` }) : null}
              <Line x1={4} y1={y(0)} x2={w - 4} y2={y(0)} stroke={colors.surfaceTertiary} strokeWidth={1} />
              {r.state !== 1 ? (
                <Polyline points={pts(ritm)} fill="none" stroke={colors.onSurfaceTertiary} strokeWidth={1.5} strokeDasharray="4 4" />
              ) : null}
            </Svg>

            {/* The recorded-spend line, revealed left to right once. A
                clipping View, not a cover: cards can be translucent. */}
            <Animated.View
              style={{ position: "absolute", left: 0, top: 0, height: H, overflow: "hidden", width: reveal.interpolate({ inputRange: [0, 1], outputRange: [0, w] }) }}
            >
              <Svg width={w} height={H} style={{ position: "absolute", left: 0, top: 0 }}>
                <Polygon points={areaPts} fill={colors.onSurface} fillOpacity={0.07} />
                <Polyline points={pts(spentPts)} fill="none" stroke={colors.onSurface} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
              </Svg>
            </Animated.View>

            {/* Front: what's ahead, today, labels. */}
            <Svg width={w} height={H} style={{ position: "absolute", left: 0, top: 0 }}>
              {t < D ? (
                <Polyline points={pts(ahead)} fill="none" stroke={colors.onSurfaceTertiary} strokeWidth={2} strokeDasharray="1 4" strokeLinecap="round" />
              ) : null}
              <Line x1={xt} y1={14} x2={xt} y2={BOTTOM} stroke={colors.onSurface} strokeOpacity={0.35} strokeWidth={1} />
              <Circle cx={xt} cy={y(S)} r={4.5} fill={dotFill} stroke={colors.surfaceSecondary} strokeWidth={2} />
              {label({ x: 4, y: 158, anchor: "start", text: leftLabel })}
              {showAzi ? label({ x: xt, y: 158, anchor: "middle", text: "azi", strong: true }) : null}
              {label({ x: w - 4, y: 158, anchor: "end", text: rightLabel })}
            </Svg>
          </>
        ) : null}
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
        {(
          [
            ["solid", "cheltuit"],
            ["dashed", "ritm normal"],
            ["dotted", "facturi, rate și planificate"],
          ] as const
        ).map(([kind, text]) => (
          <View key={kind} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {legendIcon(kind)}
            <Text style={{ ...typography.caption, color: colors.onSurfaceTertiary }}>{text}</Text>
          </View>
        ))}
      </View>
    </PressableScale>
  );
}
