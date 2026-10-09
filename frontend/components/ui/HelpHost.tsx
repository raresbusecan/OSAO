import React, { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { useTheme } from "@/lib/theme";
import { HELP, setHelpHandler, setHelpOpen, type HelpKey, type HelpTopic } from "@/lib/help";
import { requestTour, tourExists, TOUR_LIST, type TourKey } from "@/lib/tours";
import { Sheet } from "./Sheet";
import { Button } from "./primitives";

/**
 * The "ⓘ" sheet: mounted once at the app root (app/_layout.tsx), opened
 * from anywhere by InfoButton -> showHelp(key). One explanation per
 * topic from lib/help.ts: an optional intro line, then short points,
 * each with an optional bold lead-in. A topic with `tour` also offers
 * "Arată ghidul ..." (the first-use tour, lib/tours.ts).
 */
export function HelpHost() {
  const { colors, spacing } = useTheme();
  const [key, setKey] = useState<HelpKey | null>(null);

  useEffect(() => {
    setHelpHandler(setKey);
    return () => setHelpHandler(null);
  }, []);

  useEffect(() => {
    setHelpOpen(key !== null);
  }, [key]);

  const topic: HelpTopic | null = key ? HELP[key] : null;
  // Mounted only while open (like ConfirmHost): a Modal created at app
  // start sits UNDER any sheet opened later on web, so "ⓘ" inside a form
  // would open behind it.
  if (!topic) return null;

  const tourKey = topic.tour && tourExists(topic.tour as TourKey) ? (topic.tour as TourKey) : null;
  const tourLabel = tourKey ? TOUR_LIST.find((t) => t.key === tourKey)?.label : null;
  // The tour starts from its screen's useAutoTour once this sheet is gone
  // (it waits for isHelpOpen() to turn false, then ~350ms for the Modal to
  // leave -- never two Modals at once on iOS).
  const replay = tourKey
    ? () => {
        requestTour(tourKey);
        setKey(null);
      }
    : null;

  return (
    <Sheet
      visible
      onClose={() => setKey(null)}
      title={topic.title}
      icon="information-circle-outline"
      testID="help-sheet"
      footer={
        replay ? (
          <Button testID="help-replay-tour" variant="secondary" icon="play-circle-outline" label={`Arată ghidul ${tourLabel}`} onPress={replay} />
        ) : undefined
      }
    >
      <View style={{ gap: spacing.md + 2 }}>
        {topic.intro ? (
          <Text style={{ fontSize: 15, lineHeight: 22, color: colors.onSurface }}>{topic.intro}</Text>
        ) : null}
        {topic.points.map((p, i) => (
          <View key={i} style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ width: 5, height: 5, borderRadius: 3, marginTop: 9, backgroundColor: colors.onSurfaceTertiary }} />
            <Text style={{ flex: 1, fontSize: 15, lineHeight: 22, color: colors.onSurfaceSecondary }}>
              {p.title ? <Text style={{ fontWeight: "600", color: colors.onSurface }}>{/[.?!”]$/.test(p.title) ? `${p.title} ` : `${p.title}. `}</Text> : null}
              {p.text}
            </Text>
          </View>
        ))}
      </View>
    </Sheet>
  );
}
