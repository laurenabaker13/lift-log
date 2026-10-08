import { formatWeight, type Unit } from "@/shared/strength";
import { type NextWeightSuggestion } from "@/shared/next-weight";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "./ui";

export type NextWeightLineProps = {
  suggestion: NextWeightSuggestion | null;
  unit: Unit;
  onUse: () => void;
};

function plainWeight(weight: number) {
  return String(Number(weight.toFixed(4)));
}

/** A compact, plain-language next-session recommendation. */
export function NextWeightLine({
  suggestion,
  unit,
  onUse,
}: NextWeightLineProps) {
  const [whyOpen, setWhyOpen] = useState(false);
  if (!suggestion) return null;

  const feeling = suggestion.feeling
    ? ` and it felt ${suggestion.feeling}`
    : "";
  const sentence = `Next time: ${formatWeight(suggestion.weight, unit)}. You did ${plainWeight(suggestion.lastWeight)} for ${suggestion.lastReps}${feeling}.`;

  return (
    <View style={styles.wrap}>
      <Text style={styles.sentence}>{sentence}</Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Use this next weight"
          onPress={onUse}
          style={({ pressed }) => [
            styles.linkButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.link}>Use it</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Why this next weight"
          onPress={() => setWhyOpen((open) => !open)}
          style={({ pressed }) => [
            styles.linkButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.link}>Why?</Text>
        </Pressable>
      </View>
      {whyOpen ? <Text style={styles.rule}>{suggestion.rule}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 4,
    backgroundColor: colors.paleLime,
    borderColor: "#D6E7A4",
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  sentence: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 23,
  },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  linkButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 2 },
  link: {
    color: colors.limeDark,
    fontSize: 16,
    fontWeight: "800",
    textDecorationLine: "underline",
  },
  rule: { color: colors.limeDark, fontSize: 16, lineHeight: 22 },
  pressed: { opacity: 0.7 },
});
