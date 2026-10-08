import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "./ui";

const items = [
  { label: "Today", href: "/", icon: "barbell-outline" as const, matches: (path: string) => path === "/" || path.startsWith("/workout") },
  { label: "Plans", href: "/plans", icon: "calendar-outline" as const, matches: (path: string) => path === "/plans" || path.startsWith("/plan") },
  { label: "Progress", href: "/progress", icon: "trending-up-outline" as const, matches: (path: string) => path === "/progress" || path.startsWith("/exercise") },
  { label: "Friends", href: "/friends", icon: "people-outline" as const, matches: (path: string) => path === "/friends" || path.startsWith("/friends/") },
  { label: "More", href: "/more", icon: "ellipsis-horizontal-outline" as const, matches: (path: string) => path === "/more" || path.startsWith("/templates") || path === "/settings" || path === "/privacy" || path.startsWith("/coach") },
];

export function GlobalBottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const previewInset = Platform.OS === "web" && __DEV__ ? 38 : 0;
  const hidden = pathname.startsWith("/first-lift") || pathname.startsWith("/auth") || pathname.startsWith("/oauth") || pathname.startsWith("/reset-password") || pathname.startsWith("/verify-email") || pathname.startsWith("/invite") || pathname.startsWith("/onboarding");
  if (hidden) return null;

  return (
    <View style={[styles.outer, { paddingBottom: Math.max(insets.bottom, 8), marginBottom: previewInset }]}>
      <View style={styles.shell}>
        {items.map((item) => {
          const active = item.matches(pathname);
          return (
            <Pressable
              key={item.href}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => router.replace(item.href as never)}
              style={({ pressed }) => [styles.item, active && styles.itemActive, pressed && styles.pressed]}
            >
              <Ionicons name={item.icon} size={20} color={active ? colors.panel : colors.muted} />
              <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { backgroundColor: colors.bone, paddingHorizontal: 12, paddingTop: 7 },
  shell: { flexDirection: "row", alignSelf: "center", width: "100%", maxWidth: 760, backgroundColor: colors.panel, borderRadius: 22, borderWidth: 1, borderColor: colors.line, padding: 6, boxShadow: "0px -2px 12px rgba(20, 32, 26, 0.05)" },
  item: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", gap: 3, borderRadius: 16, paddingHorizontal: 2 },
  itemActive: { backgroundColor: colors.limeDark },
  label: { color: colors.muted, fontSize: 16, fontWeight: "800" },
  labelActive: { color: colors.panel },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
});
