import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Platform, StyleSheet, Text, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { AppButton, AppScreen, colors } from "./ui";

type FirstLiftMomentProps = {
  firstSet: boolean;
  line: string;
  bestLine: string;
  onAnother: () => void;
  onFinish: () => void;
};

const confetti: { left: `${number}%`; delay: number; color: string }[] = [
  { left: "8%", delay: 0, color: colors.lime },
  { left: "19%", delay: 70, color: "#D8B359" },
  { left: "31%", delay: 25, color: "#8EB69A" },
  { left: "45%", delay: 110, color: colors.limeDark },
  { left: "58%", delay: 45, color: "#D8B359" },
  { left: "69%", delay: 140, color: "#8EB69A" },
  { left: "82%", delay: 85, color: colors.lime },
  { left: "91%", delay: 15, color: colors.limeDark },
];

export function FirstLiftMoment({ firstSet, line, bestLine, onAnother, onFinish }: FirstLiftMomentProps) {
  const reanimatedReducedMotion = useReducedMotion();
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
  const [motionPreferenceReady, setMotionPreferenceReady] = useState(false);
  const [animation] = useState(() => new Animated.Value(0));
  const reducedMotion = Boolean(reanimatedReducedMotion || systemReducedMotion);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!mounted) return;
      setSystemReducedMotion(enabled);
      setMotionPreferenceReady(true);
    }).catch(() => {
      if (mounted) setMotionPreferenceReady(true);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setSystemReducedMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!firstSet || reducedMotion || !motionPreferenceReady) {
      animation.setValue(1);
      return;
    }
    animation.setValue(0);
    const running = Animated.timing(animation, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: true,
    });
    running.start();
    if (Platform.OS === "ios") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    return () => running.stop();
  }, [animation, firstSet, motionPreferenceReady, reducedMotion]);

  return (
    <AppScreen scroll={false} contentStyle={styles.screen}>
      <View style={styles.confettiField} pointerEvents="none" importantForAccessibility="no-hide-descendants">
        {firstSet && !reducedMotion
          ? confetti.map((piece, index) => (
              <Animated.View
                key={`${piece.left}-${index}`}
                style={[
                  styles.confetti,
                  {
                    left: piece.left,
                    backgroundColor: piece.color,
                    opacity: animation.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 1, 0] }),
                    transform: [
                      { translateY: animation.interpolate({ inputRange: [0, 1], outputRange: [-14 - piece.delay / 18, 72] }) },
                      { rotate: animation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${90 + piece.delay}deg`] }) },
                    ],
                  },
                ]}
              />
            ))
          : null}
      </View>
      <View style={styles.content}>
        <View style={styles.copy}>
          <Text style={styles.title}>{firstSet ? "Starting line set." : "Set logged."}</Text>
          <Text style={styles.line}>{line}</Text>
          <Text style={styles.caption}>
            {firstSet
              ? "This is your best lift so far. We’ll show you the real climb from here."
              : `Best lift so far: ${bestLine}.`}
          </Text>
        </View>
        <View style={styles.actions}>
          <AppButton onPress={onAnother}>Log another set</AppButton>
          <AppButton variant="ghost" onPress={onFinish}>Finish</AppButton>
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20, paddingTop: 30, paddingBottom: 26 },
  confettiField: { ...StyleSheet.absoluteFill, overflow: "hidden" },
  confetti: { position: "absolute", top: 76, width: 7, height: 14, borderRadius: 4 },
  content: { flex: 1, width: "100%", maxWidth: 520, alignSelf: "center", justifyContent: "space-between", gap: 28 },
  copy: { paddingTop: 72, gap: 16 },
  title: { color: colors.ink, fontSize: 34, fontWeight: "800", letterSpacing: -1.1, lineHeight: 41 },
  line: { color: colors.limeDark, fontSize: 31, fontWeight: "800", letterSpacing: -0.8, lineHeight: 38 },
  caption: { color: colors.muted, fontSize: 16, lineHeight: 24, maxWidth: 360 },
  actions: { gap: 4 },
});
