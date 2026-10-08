import { AuthGate } from "@/components/lift-log/auth-gate";
import {
  AppButton,
  AppInput,
  AppScreen,
  Card,
  colors,
  ui,
} from "@/components/lift-log/ui";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

function Settings() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const utils = trpc.useUtils();
  const settings = trpc.settings.get.useQuery();
  const profile = trpc.account.profile.useQuery();
  const friends = trpc.friends.hub.useQuery();
  const [message, setMessage] = useState<string | null>(null);
  const [socialDisplayName, setSocialDisplayName] = useState<string | null>(
    null,
  );
  const [socialNameMode, setSocialNameMode] = useState<
    "account" | "display" | null
  >(null);
  const setUnit = trpc.settings.setUnit.useMutation({
    onSuccess: () => {
      settings.refetch();
      utils.progress.list.invalidate();
      utils.workout.get.invalidate();
    },
  });
  const setPreferences = trpc.friends.setPreferences.useMutation({
    onSuccess: () => {
      settings.refetch();
      setMessage("Social preferences saved.");
    },
    onError: (error) => setMessage(error.message),
  });
  const setWorkspace = trpc.account.setWorkspace.useMutation({
    onSuccess: (_result, variables) => {
      profile.refetch();
      utils.settings.get.invalidate();
      setMessage("Workspace changed.");
      router.replace(
        (variables.workspace === "coach" ? "/coach" : "/") as never,
      );
    },
  });
  const saveSocial = trpc.account.setSocialProfile.useMutation({
    onSuccess: () => {
      profile.refetch();
      utils.settings.get.invalidate();
      utils.friends.hub.invalidate();
      setMessage("Friends settings saved.");
    },
    onError: (error) => setMessage(error.message),
  });
  const signOut = async () => {
    await logout();
    router.replace("/auth" as never);
  };
  const isCoach = profile.data?.settings.activeWorkspace === "coach";
  const currentSocialDisplayName =
    socialDisplayName ?? profile.data?.settings.socialDisplayName ?? "";
  const currentSocialNameMode =
    socialNameMode ?? profile.data?.settings.socialNameMode ?? "account";
  const hasFriends = Boolean(friends.data?.friends.length);
  const persistedShareWithFriends = Boolean(
    profile.data?.settings.shareFriendActivity,
  );
  const shareWithFriends = hasFriends && persistedShareWithFriends;
  const allowFriendNudges = Boolean(settings.data?.allowFriendNudges ?? 0);
  const socialNotificationsEnabled = Boolean(
    settings.data?.socialNotificationsEnabled ?? 1,
  );

  const saveFriendsSettings = (shareActivity = persistedShareWithFriends) => {
    if (
      currentSocialNameMode === "display" &&
      !currentSocialDisplayName.trim()
    ) {
      setMessage("Add a display name or choose your account name.");
      return;
    }
    saveSocial.mutate({
      displayName: currentSocialDisplayName.trim() || null,
      nameMode: currentSocialNameMode,
      shareActivity,
    });
  };

  return (
    <AppScreen>
      <View style={styles.header}>
        <Text style={ui.title}>Settings</Text>
      </View>
      <Card style={styles.account}>
        <Text style={styles.accountName}>
          {user?.name || "Lift Log athlete"}
        </Text>
        <Text style={styles.accountEmail}>{user?.email}</Text>
      </Card>
      {message ? (
        <Card style={styles.message}>
          <Text style={styles.messageText}>{message}</Text>
        </Card>
      ) : null}
      <Card style={styles.section}>
        <Text style={styles.sectionName}>Friends & activity</Text>
        <Text style={styles.sectionDetail}>
          {shareWithFriends
            ? "On — shared completed workouts show exercise names, set count, best weight, and reps. Notes, full sets, bodyweight, and personal stats stay private."
            : hasFriends
              ? "Off — your completed workouts stay private until you turn sharing on."
              : "Off — add and accept a friend to turn sharing on. Your workout details stay private."}
        </Text>
        <Text style={styles.choiceLabel}>Share with friends</Text>
        <View style={styles.workspaceRow}>
          <AppButton variant="secondary" style={[styles.workspaceButton, shareWithFriends && styles.selected]}
            onPress={() => saveFriendsSettings(true)} disabled={!hasFriends || saveSocial.isPending}>On</AppButton>
          <AppButton variant="secondary" style={[styles.workspaceButton, !shareWithFriends && styles.selected]}
            onPress={() => saveFriendsSettings(false)} disabled={saveSocial.isPending}>Off</AppButton>
        </View>
        <AppInput
          label="Friends display name (optional)"
          value={currentSocialDisplayName}
          onChangeText={setSocialDisplayName}
          placeholder="How friends see you"
          maxLength={48}
        />
        <Text style={styles.choiceLabel}>Name shown to friends</Text>
        <View style={styles.workspaceRow}>
          <AppButton
            variant={
              currentSocialNameMode === "account" ? "primary" : "secondary"
            }
            style={styles.workspaceButton}
            onPress={() => setSocialNameMode("account")}
          >
            Account name
          </AppButton>
          <AppButton
            variant={
              currentSocialNameMode === "display" ? "primary" : "secondary"
            }
            style={styles.workspaceButton}
            onPress={() => setSocialNameMode("display")}
          >
            Display name
          </AppButton>
        </View>
        <AppButton
          variant="secondary"
          style={styles.smallButton}
          onPress={() => saveFriendsSettings()}
          disabled={saveSocial.isPending}
        >
          {saveSocial.isPending ? "Saving…" : "Save name choice"}
        </AppButton>
        <AppButton
          variant="ghost"
          style={styles.linkButton}
          onPress={() => router.push("/friends" as never)}
        >
          Open Friends
        </AppButton>
      </Card>
      <Card style={styles.section}>
        <Text style={styles.sectionName}>Social preferences</Text>
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Let friends nudge me"
          accessibilityHint="Both friends need this on to send a nudge."
          aria-checked={allowFriendNudges}
          accessibilityState={{
            checked: allowFriendNudges,
            disabled: setPreferences.isPending,
          }}
          disabled={setPreferences.isPending}
          onPress={() =>
            setPreferences.mutate({ allowNudges: !allowFriendNudges })
          }
          style={({ pressed }) => [
            styles.switchRow,
            pressed && !setPreferences.isPending && styles.pressed,
            setPreferences.isPending && styles.disabled,
          ]}
        >
          <View style={ui.grow}>
            <Text style={styles.switchTitle}>Let friends nudge me</Text>
            <Text style={styles.switchDetail}>Both friends need this on.</Text>
          </View>
          <View pointerEvents="none" style={[styles.switchTrack, allowFriendNudges && styles.switchOn]}>
            <View style={[styles.switchThumb, allowFriendNudges && styles.switchThumbOn]} />
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Notifications"
          accessibilityHint="Receive at most one daily in-app notification."
          aria-checked={socialNotificationsEnabled}
          accessibilityState={{
            checked: socialNotificationsEnabled,
            disabled: setPreferences.isPending,
          }}
          disabled={setPreferences.isPending}
          onPress={() =>
            setPreferences.mutate({
              notificationsEnabled: !socialNotificationsEnabled,
            })
          }
          style={({ pressed }) => [
            styles.switchRow,
            pressed && !setPreferences.isPending && styles.pressed,
            setPreferences.isPending && styles.disabled,
          ]}
        >
          <View style={ui.grow}>
            <Text style={styles.switchTitle}>Notifications</Text>
            <Text style={styles.switchDetail}>
              At most one daily in-app notification.
            </Text>
          </View>
          <View pointerEvents="none" style={[styles.switchTrack, socialNotificationsEnabled && styles.switchOn]}>
            <View style={[styles.switchThumb, socialNotificationsEnabled && styles.switchThumbOn]} />
          </View>
        </Pressable>
      </Card>
      <Card style={styles.section}>
        <Text style={styles.sectionName}>Your workspace</Text>
        <Text style={styles.sectionDetail}>
          Athlete mode is for your own workouts. Coach mode lets you invite
          athletes and see their progress after they accept.
        </Text>
        <View style={styles.workspaceRow}>
          <AppButton
            variant={!isCoach ? "primary" : "secondary"}
            style={styles.workspaceButton}
            onPress={() => setWorkspace.mutate({ workspace: "athlete" })}
          >
            Athlete
          </AppButton>
          <AppButton
            variant={isCoach ? "primary" : "secondary"}
            style={styles.workspaceButton}
            onPress={() => setWorkspace.mutate({ workspace: "coach" })}
          >
            Coach
          </AppButton>
        </View>
        {profile.data?.settings.isTrainer ? (
          <AppButton
            variant="ghost"
            style={styles.linkButton}
            onPress={() => router.push("/coach" as never)}
          >
            Open coach workspace
          </AppButton>
        ) : null}
      </Card>
      <Card style={styles.section}>
        <Text style={styles.sectionName}>Weight unit</Text>
        <Text style={styles.sectionDetail}>
          Used for your logs and weight ideas. Changing units does not change
          the weight you lifted.
        </Text>
        <View style={styles.workspaceRow}>
          <AppButton
            variant={settings.data?.unit === "lb" ? "primary" : "secondary"}
            style={styles.workspaceButton}
            onPress={() => setUnit.mutate({ unit: "lb" })}
          >
            Pounds (lb)
          </AppButton>
          <AppButton
            variant={settings.data?.unit === "kg" ? "primary" : "secondary"}
            style={styles.workspaceButton}
            onPress={() => setUnit.mutate({ unit: "kg" })}
          >
            Kilograms (kg)
          </AppButton>
        </View>
      </Card>
      <Card style={styles.info}>
        <Text style={styles.sectionName}>Next time</Text>
        <Text style={styles.sectionDetail}>
          Suggestions use your last workout. Choose a weight that feels right
          for you.
        </Text>
      </Card>
      <Card style={styles.section}>
        <Text style={styles.sectionName}>Need a refresher?</Text>
        <Text style={styles.sectionDetail}>
          Show the two short tips for logging and Progress again.
        </Text>
        <AppButton
          variant="secondary"
          style={styles.smallButton}
          onPress={() => router.push("/guide" as never)}
        >
          Show tips again
        </AppButton>
      </Card>
      <AppButton
        variant="secondary"
        onPress={() => router.push("/privacy" as never)}
      >
        Privacy & data
      </AppButton>
      <AppButton variant="danger" onPress={signOut}>
        Sign out
      </AppButton>
    </AppScreen>
  );
}

export default function SettingsScreen() {
  return (
    <AuthGate>
      <Settings />
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  header: { gap: 3, marginTop: 4 },
  account: { gap: 7, padding: 18 },
  accountName: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  accountEmail: { color: colors.muted, fontSize: 16 },
  section: { gap: 9, padding: 18 },
  sectionName: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  sectionDetail: { color: colors.muted, fontSize: 16, lineHeight: 20 },
  workspaceRow: { flexDirection: "row", gap: 8, marginTop: 3 },
  workspaceButton: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: 8,
    borderRadius: 14,
  },
  smallButton: { minHeight: 46, borderRadius: 12 },
  linkButton: { alignSelf: "flex-start", minHeight: 44, paddingHorizontal: 0 },
  choiceLabel: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  switchRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 7,
  },
  switchTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 20,
  },
  switchDetail: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 20,
    marginTop: 2,
  },
  info: {
    backgroundColor: colors.paleInk,
    borderColor: colors.paleInk,
    gap: 6,
    padding: 18,
  },
  message: { backgroundColor: colors.paleLime, borderColor: "#D6E9B9" },
  messageText: {
    color: colors.limeDark,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 19,
  },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.45 },
  selected: { backgroundColor: colors.paleLime, borderColor: colors.lime },
  switchTrack: { width: 42, height: 24, borderRadius: 12, paddingHorizontal: 2, justifyContent: "center", backgroundColor: colors.line },
  switchOn: { backgroundColor: colors.limeDark },
  switchThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.panel, alignSelf: "flex-start" },
  switchThumbOn: { alignSelf: "flex-end" },
});
