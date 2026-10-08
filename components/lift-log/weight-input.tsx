import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { NumberInput } from "./number-input";
import type { Unit } from "@/shared/strength";
import { colors } from "./ui";

type WeightInputProps = {
  value: number | null;
  onChange: (value: number | null) => void;
  unit?: Unit;
  label?: string;
  compact?: boolean;
  placeholder?: string;
  disabled?: boolean;
};

function displayValue(value: number | null) {
  return value === null || !Number.isFinite(value) ? "" : String(value);
}

function parseWeight(value: string) {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed || trimmed === ".") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0
    ? Number(parsed.toFixed(4))
    : null;
}

/**
 * Keeps partially typed decimals (for example, "12.") in local state until
 * the field blurs, so a controlled numeric value never interrupts typing.
 */
export function WeightInput({
  value,
  onChange,
  unit,
  label,
  compact = false,
  placeholder = "0",
  disabled = false,
}: WeightInputProps) {
  const [text, setText] = useState(() => displayValue(value));
  const [focused, setFocused] = useState(false);
  const activeUnit = unit ?? "lb";
  const mainStep = activeUnit === "lb" ? 5 : 2.5;

  const [previousValue, setPreviousValue] = useState(value);
  if (previousValue !== value) {
    setPreviousValue(value);
    if (!focused || parseWeight(text) !== value) setText(displayValue(value));
  }

  const commit = () => {
    const nextValue = parseWeight(text);
    if (nextValue !== value) onChange(nextValue);
    setText(displayValue(nextValue));
  };

  const adjust = (step: number) => {
    const current = parseWeight(text) ?? value ?? 0;
    const nextValue = Math.max(0, Number((current + step).toFixed(4)));
    setText(displayValue(nextValue));
    onChange(nextValue);
  };

  return (
    <View style={[styles.group, compact && styles.groupCompact]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.controls, compact && styles.controlsCompact]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease weight by ${mainStep}${unit ? ` ${unit}` : ""}`}
          disabled={disabled}
          onPress={() => adjust(-mainStep)}
          style={({ pressed }) => [
            styles.stepButton,
            compact && styles.stepButtonCompact,
            disabled && styles.disabled,
            pressed && !disabled && styles.pressed,
          ]}
        >
          <Text style={styles.stepText}>−{mainStep}</Text>
        </Pressable>
        <View style={styles.fieldWrap}>
          <NumberInput
            accessibilityLabel={label ?? "Weight"}
            value={text}
            onChangeText={(nextText) => {
              if (!/^\d*(?:[.,]\d*)?$/.test(nextText)) return;
              setText(nextText);
              onChange(parseWeight(nextText));
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              commit();
            }}
            keyboardType="decimal-pad"
            placeholder={placeholder}
            placeholderTextColor="#9AA69D"
            editable={!disabled}
            style={[styles.input, compact && styles.inputCompact]}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase weight by ${mainStep}${unit ? ` ${unit}` : ""}`}
          disabled={disabled}
          onPress={() => adjust(mainStep)}
          style={({ pressed }) => [
            styles.stepButton,
            compact && styles.stepButtonCompact,
            disabled && styles.disabled,
            pressed && !disabled && styles.pressed,
          ]}
        >
          <Text style={styles.stepText}>+{mainStep}</Text>
        </Pressable>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 7 },
  groupCompact: { gap: 5 },
  label: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.25,
  },
  controls: { flexDirection: "row", alignItems: "center", gap: 8 },
  controlsCompact: { gap: 6 },
  stepButton: {
    minWidth: 44,
    minHeight: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paleInk,
    borderWidth: 1,
    borderColor: colors.line,
  },
  stepButtonCompact: { minWidth: 48, minHeight: 44, borderRadius: 12 },
  stepText: { color: colors.ink, fontSize: 16, fontWeight: "900" },
  fieldWrap: {
    flex: 1,
    minWidth: 0,
    position: "relative",
    justifyContent: "center",
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 15,
    backgroundColor: "#F8FAF7",
    color: colors.ink,
    paddingHorizontal: 14,
    paddingRight: 10,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  inputCompact: {
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingRight: 8,
  },
  unit: {
    position: "absolute",
    right: 13,
    color: colors.muted,
    fontSize: 16,
    fontWeight: "800",
  },
  quickRow: { flexDirection: "row", gap: 8 },
  quickButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paleLime,
    borderWidth: 1,
    borderColor: "#D6E9B9",
  },
  quickText: { color: colors.limeDark, fontSize: 16, fontWeight: "900" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});
