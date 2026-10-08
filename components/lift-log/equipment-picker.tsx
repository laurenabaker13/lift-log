import { EQUIPMENT_OPTIONS } from "@/shared/equipment";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { AppButton, colors } from "./ui";

type EquipmentPickerProps = {
  value: string;
  onChange: (equipment: string) => void;
  label?: string;
  disabled?: boolean;
  helperText?: string;
};

export function EquipmentPicker({ value, onChange, label = "Equipment", disabled = false, helperText }: EquipmentPickerProps) {
  const [open, setOpen] = useState(false);

  const choose = (equipment: string) => {
    setOpen(false);
    if (equipment !== value) onChange(equipment);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Choose equipment. Current: ${value}`}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.trigger, pressed && !disabled && styles.triggerPressed, disabled && styles.disabled]}
      >
        <Text style={styles.value} numberOfLines={1}>{value}</Text>
        <Text style={styles.chevron}>⌄</Text>
      </Pressable>
      {helperText ? <Text style={styles.helper}>{helperText}</Text> : null}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.shade} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <View style={styles.headerText}>
                <Text style={styles.title}>Choose equipment</Text>
                <Text style={styles.subtitle}>Progress is tracked separately for each equipment type.</Text>
              </View>
              <AppButton variant="ghost" style={styles.close} onPress={() => setOpen(false)}>Close</AppButton>
            </View>
            <View style={styles.options}>
              {EQUIPMENT_OPTIONS.map((option) => (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityState={{ selected: option === value }}
                  onPress={() => choose(option)}
                  style={({ pressed }) => [styles.option, option === value && styles.optionSelected, pressed && styles.optionPressed]}
                >
                  <Text style={[styles.optionText, option === value && styles.optionTextSelected]}>{option}</Text>
                  {option === value ? <Text style={styles.check}>✓</Text> : null}
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 7 },
  label: { color: colors.ink, fontSize: 16, fontWeight: "700" },
  trigger: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 15, backgroundColor: "#F8FAF7", paddingHorizontal: 15 },
  triggerPressed: { opacity: 0.72 },
  disabled: { opacity: 0.45 },
  value: { color: colors.ink, fontSize: 16, fontWeight: "700", flex: 1 },
  chevron: { color: colors.limeDark, fontSize: 20, fontWeight: "900", lineHeight: 20 },
  helper: { color: colors.muted, fontSize: 16, lineHeight: 17 },
  shade: { flex: 1, backgroundColor: "rgba(20,21,18,0.42)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.bone, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, gap: 16 },
  sheetHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  headerText: { flex: 1, gap: 3 },
  title: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 18 },
  close: { minHeight: 44, paddingHorizontal: 0 },
  options: { gap: 8 },
  option: { minHeight: 50, borderWidth: 1, borderColor: colors.line, borderRadius: 15, backgroundColor: colors.panel, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  optionSelected: { backgroundColor: colors.paleLime, borderColor: "#D6E9B9" },
  optionPressed: { opacity: 0.72 },
  optionText: { color: colors.ink, fontSize: 16, fontWeight: "700" },
  optionTextSelected: { color: colors.limeDark },
  check: { color: colors.limeDark, fontSize: 18, fontWeight: "900" },
});
