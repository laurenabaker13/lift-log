import { progressJourneyLine, progressSummary, type ProgressPoint } from "@/shared/progress";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Circle, Polyline, Svg } from "react-native-svg";
import { colors } from "./ui";

export type ProgressTrendProps = {
  history: ProgressPoint[];
  unit: string;
  chartOnly?: boolean;
};

function displayWeight(value: number | null | undefined, unit: string) {
  if (value === null || value === undefined) return "—";
  return `${Number(value.toFixed(4))} ${unit}`;
}

/** Shows one visible best-lift point for each completed workout. */
export function ProgressTrend({
  history,
  unit,
  chartOnly = false,
}: ProgressTrendProps) {
  const [helpOpen, setHelpOpen] = useState(false);
  const { chronological, best } = progressSummary(history);
  if (!chronological.length) return null;

  const values = chronological.map((item) => item.actualWeight);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const chartWidth = 320;
  const chartHeight = 96;
  const points = values
    .map((value, index) => {
      const x =
        chronological.length === 1
          ? chartWidth / 2
          : (index / (chronological.length - 1)) * chartWidth;
      const y =
        chronological.length === 1
          ? chartHeight / 2
          : chartHeight - ((value - min) / range) * (chartHeight - 20) - 10;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <View style={styles.wrap}>
      {!chartOnly ? (
        <View style={styles.summary}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Best lift</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="What is a best lift?"
              onPress={() => setHelpOpen((open) => !open)}
              style={({ pressed }) => [
                styles.helpButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.help}>?</Text>
            </Pressable>
          </View>
          <Text style={styles.best}>{displayWeight(best, unit)}</Text>
          {helpOpen ? (
            <Text style={styles.helpText}>
              The heaviest weight you actually lifted and logged.
            </Text>
          ) : null}
        </View>
      ) : null}
      <Svg
        width="100%"
        height={chartHeight}
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        preserveAspectRatio="none"
      >
        {chronological.length > 1 ? (
          <Polyline
            points={points}
            fill="none"
            stroke={colors.limeDark}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        {points.split(" ").map((point, index) => {
          const [x, y] = point.split(",").map(Number);
          return (
            <Circle key={index} cx={x} cy={y} r={5} fill={colors.limeDark} />
          );
        })}
      </Svg>
      <Text style={styles.label}>{progressJourneyLine(history, unit)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
    backgroundColor: colors.paleInk,
    borderRadius: 18,
    padding: 16,
  },
  summary: { gap: 5 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  best: {
    color: colors.limeDark,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.8,
    lineHeight: 35,
  },
  helpButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  help: {
    width: 24,
    height: 24,
    borderRadius: 12,
    overflow: "hidden",
    textAlign: "center",
    color: colors.panel,
    backgroundColor: colors.ink,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 24,
  },
  helpText: { color: colors.muted, fontSize: 16, lineHeight: 22 },
  labels: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  label: {
    flex: 1,
    color: colors.muted,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
  },
  pressed: { opacity: 0.7 },
});
