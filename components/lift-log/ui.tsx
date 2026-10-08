import { NumberInput } from "./number-input";
import type { PropsWithChildren, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export const colors = {
  ink: "#15211B",
  bone: "#F7F9F7",
  panel: "#FFFFFF",
  line: "#E1E8E2",
  muted: "#637067",
  lime: "#4C8B5C",
  limeDark: "#2F6A43",
  rust: "#D65745",
  paleLime: "#EAF3EC",
  paleInk: "#F0F4F1",
};

type AppScreenProps = PropsWithChildren<{
  scroll?: boolean;
  contentStyle?: ViewStyle;
}>;

export function AppScreen({ children, scroll = true, contentStyle }: AppScreenProps) {
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.scroll, contentStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.brandMark, compact && styles.brandMarkCompact]}>
      <View style={styles.brandLetterLeft} />
      <View style={styles.brandLetterRight} />
    </View>
  );
}

export function AppButton({
  children,
  onPress,
  variant = "primary",
  disabled = false,
  style,
}: PropsWithChildren<{
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}>) {
  const inverseText = variant === "primary" || variant === "danger";
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" && styles.primaryButton,
        variant === "secondary" && styles.secondaryButton,
        variant === "ghost" && styles.ghostButton,
        variant === "danger" && styles.dangerButton,
        pressed && !disabled && styles.buttonPressed,
        disabled && styles.buttonDisabled,
        style,
        { minHeight: 44 },
      ]}
    >
      <Text style={[styles.buttonText, inverseText && styles.buttonTextInverse, variant === "ghost" && styles.ghostButtonText]}>{children}</Text>
    </Pressable>
  );
}

export function AppInput({ label, ...props }: TextInputProps & { label?: string }) {
  const Input = ["decimal-pad", "number-pad", "numeric"].includes(props.keyboardType ?? "") ? NumberInput : TextInput;
  return (
    <View style={styles.inputGroup}>
      {label ? <Text style={styles.inputLabel}>{label}</Text> : null}
      <Input placeholderTextColor="#9AA69D" style={styles.input} {...props} />
    </View>
  );
}

export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action}
    </View>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.ink} />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <Card style={styles.emptyCard}>
      <View style={styles.emptyAccent} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {detail ? <Text style={styles.emptyDetail}>{detail}</Text> : null}
    </Card>
  );
}

export function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, accent && styles.metricValueAccent]}>{value}</Text>
    </View>
  );
}

export function Pill({ label, active = false, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  const content = <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>;
  if (!onPress) return <View style={[styles.pill, active && styles.pillActive]}>{content}</View>;
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.pill, active && styles.pillActive, pressed && styles.buttonPressed]}>{content}</Pressable>;
}

export const ui: any = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  grow: { flex: 1 },
  smallLabel: { color: colors.muted, fontSize: 16, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase" },
  mutedText: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  title: { color: colors.ink, fontSize: 31, fontWeight: "800", letterSpacing: -0.9, lineHeight: 37 },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 24, marginTop: 4 },
  link: { color: colors.limeDark, fontSize: 16, fontWeight: "800" },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginVertical: 16 },
});

const styles: any = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bone },
  fill: { flex: 1 },
  scroll: { width: "100%", maxWidth: 760, alignSelf: "center", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32, gap: 24 },
  brandMark: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.lime, justifyContent: "center", paddingHorizontal: 12, gap: 5, flexDirection: "row", alignItems: "center" },
  brandMarkCompact: { width: 34, height: 34, borderRadius: 12, paddingHorizontal: 8, gap: 3 },
  brandLetterLeft: { width: 8, height: 23, borderRadius: 3, backgroundColor: colors.ink },
  brandLetterRight: { width: 8, height: 16, borderRadius: 3, backgroundColor: colors.ink, marginTop: 7 },
  button: { minHeight: 50, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, borderWidth: 1, borderColor: "transparent" },
  primaryButton: { backgroundColor: colors.limeDark, borderColor: colors.limeDark },
  secondaryButton: { backgroundColor: colors.paleInk, borderColor: colors.paleInk },
  ghostButton: { minHeight: 44, backgroundColor: "transparent", borderColor: "transparent" },
  dangerButton: { backgroundColor: colors.rust, borderColor: colors.rust },
  buttonPressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: colors.ink, fontSize: 16, fontWeight: "800", letterSpacing: -0.1 },
  buttonTextInverse: { color: colors.panel },
  ghostButtonText: { color: colors.limeDark },
  inputGroup: { gap: 8 },
  inputLabel: { color: colors.ink, fontSize: 16, fontWeight: "800", letterSpacing: 0.1 },
  input: { minHeight: 50, backgroundColor: "#F8FAF7", color: colors.ink, borderRadius: 15, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 15, fontSize: 16, fontWeight: "600" },
  card: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 20, boxShadow: "0px 4px 12px rgba(21, 33, 27, 0.035)" },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: "800", letterSpacing: -0.25 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: colors.bone },
  loadingText: { color: colors.muted, fontSize: 16, fontWeight: "700" },
  emptyCard: { alignItems: "flex-start", gap: 8, paddingVertical: 24 },
  emptyAccent: { width: 34, height: 5, borderRadius: 10, backgroundColor: colors.lime },
  emptyTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  emptyDetail: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  metric: { flex: 1, gap: 6 },
  metricLabel: { color: colors.muted, fontSize: 16, textTransform: "uppercase", fontWeight: "800", letterSpacing: 0.4 },
  metricValue: { color: colors.ink, fontSize: 23, fontWeight: "800", letterSpacing: -0.7 },
  metricValueAccent: { color: colors.limeDark },
  pill: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start", borderRadius: 999, backgroundColor: colors.paleInk, paddingHorizontal: 14, paddingVertical: 7 },
  pillActive: { backgroundColor: colors.limeDark },
  pillText: { color: colors.muted, fontSize: 16, fontWeight: "800" },
  pillTextActive: { color: colors.panel },
});
