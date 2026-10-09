import React from "react";
import Svg, { Circle, Line } from "react-native-svg";

export type RingProgressProps = {
  /** 0-1+ -- values over 1 (over budget) still just fill the ring
   * completely; the color (passed in) is what signals "over", not the
   * ring itself trying to draw more than a full circle. */
  value: number;
  size?: number;
  strokeWidth?: number;
  color: string;
  trackColor: string;
  /** 0-1 -- where spending SHOULD be today if it were spread evenly
   * across the month (day of month / days in month), drawn as a short
   * radial tick across the ring's own stroke. Omit for no marker (an
   * unset space has nothing to pace against). See getSpendingPace in
   * budget.tsx. */
  paceMarker?: number;
  markerColor?: string;
};

/** A plain activity-ring style progress indicator -- react-native-svg
 * (added this session specifically for this) instead of a hand-rolled
 * rotated-half-circle trick, which gets fiddly to get pixel-correct in
 * RN's transform model. Used by the Budget tab's per-space cards. */
export function RingProgress({ value, size = 84, strokeWidth = 10, color, trackColor, paceMarker, markerColor }: RingProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, value));
  const center = size / 2;

  // Same "-90 rotation" convention as the progress Circle below (0 =
  // straight up, clockwise) -- computed by hand here since Line has no
  // rotation/origin shortcut the way Circle's stroke-based arc does.
  const markerAngleRad = paceMarker != null ? (paceMarker * 360 - 90) * (Math.PI / 180) : 0;
  const markerInner = radius - strokeWidth / 2 - 2;
  const markerOuter = radius + strokeWidth / 2 + 2;

  return (
    <Svg width={size} height={size}>
      <Circle cx={center} cy={center} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
      <Circle
        cx={center}
        cy={center}
        r={radius}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={circumference * (1 - clamped)}
        strokeLinecap="round"
        // An SVG transform string instead of rotation/origin props --
        // react-native-svg's web build forwards `origin` as an invalid
        // DOM "transform-origin" attribute (dev warning on Buget).
        transform={`rotate(-90 ${center} ${center})`}
      />
      {paceMarker != null ? (
        <Line
          x1={center + markerInner * Math.cos(markerAngleRad)}
          y1={center + markerInner * Math.sin(markerAngleRad)}
          x2={center + markerOuter * Math.cos(markerAngleRad)}
          y2={center + markerOuter * Math.sin(markerAngleRad)}
          stroke={markerColor}
          strokeWidth={3}
          strokeLinecap="round"
        />
      ) : null}
    </Svg>
  );
}

export type RingSegment = { value: number; color: string };

export type MultiRingProgressProps = {
  /** Each value is that segment's share of the WHOLE ring, 0-1;
   * segments are drawn in order starting at 12 o'clock, clockwise.
   * Values summing to under 1 just leave the rest as trackColor --
   * callers don't need to pad a "remainder" segment themselves. */
  segments: RingSegment[];
  size?: number;
  strokeWidth?: number;
  trackColor: string;
};

/** Composition ring for the Budget tab's overview page -- one colored
 * arc per space instead of a single value, built the same way as
 * RingProgress's own progress arc (stroke-dasharray trick), just
 * stacked: each segment's dash starts where the previous one's ended. */
export function MultiRingProgress({ segments, size = 88, strokeWidth = 10, trackColor }: MultiRingProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  let cumulative = 0;

  return (
    <Svg width={size} height={size}>
      <Circle cx={center} cy={center} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
      {segments.map((seg, index) => {
        const fraction = Math.max(0, Math.min(1, seg.value));
        const length = circumference * fraction;
        const offset = circumference * cumulative;
        cumulative += fraction;
        if (length <= 0) return null;
        return (
          <Circle
            key={index}
            cx={center}
            cy={center}
            r={radius}
            stroke={seg.color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${length} ${circumference - length}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${center} ${center})`}
          />
        );
      })}
    </Svg>
  );
}
