import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { fromKilograms, formatWeight, type Unit } from "@/shared/strength";
import { type FriendReaction } from "@/shared/social";
import { AppButton, Card, colors } from "./ui";

export type SharedActivity = {
  id: number;
  kind: "workout_completed" | "personal_record" | "challenge_win";
  workoutName: string | null;
  exerciseName: string | null;
  equipment: string | null;
  valueKg: number | null;
  occurredAt: Date | string;
  actor: { id: number; name: string };
  viewerReaction: FriendReaction | null;
  reactionCounts: Record<FriendReaction, number>;
  kudosGivers?: { id: number; name: string }[];
  summaries?: { exerciseName: string; equipment: string; setCount: number; bestWeightKg: number; bestReps: number; newBest: boolean }[];
  challengeId?: number | null;
  opponentId?: number | null;
  opponentName?: string | null;
  comments: { id: number; message: string; createdAt: Date | string; author: { id: number; name: string } }[];
};
type Props = {
  activity: SharedActivity;
  unit: Unit;
  viewerId: number | undefined;
  onReact: (activityId: number, kind: FriendReaction) => void;
  onComment: (activityId: number, message: string) => void | Promise<unknown>;
  onDeleteComment: (commentId: number) => void;
  onRematch?: (challengeId: number) => void;
  rematching?: boolean;
  rematchOpen?: boolean;
  reacting?: boolean;
  commenting?: boolean;
  allowInteractions?: boolean;
};
export function activityTime(value: Date | string) {
  const date = new Date(value);
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)} hr ago`;
  if (minutes < 10_080) return `${Math.floor(minutes / 1_440)} days ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
export function FriendActivityCard({ activity, unit, viewerId, onReact, onComment, onDeleteComment, onRematch, rematching, rematchOpen, reacting, commenting, allowInteractions = true }: Props) {
  const [commentOpen, setCommentOpen] = useState(false);
  const [message, setMessage] = useState("");
  const activityOwner = activity.actor.id === viewerId;
  const givers = activity.kudosGivers ?? [];
  const hasKudos = Boolean(activity.viewerReaction);
  const newBest = activity.kind === "personal_record" || activity.summaries?.some((lift) => lift.newBest);
  const name = activityOwner ? "You" : activity.actor.name;
  const weight = (kg: number) => formatWeight(fromKilograms(kg, unit), unit);
  const submit = async (text = message) => {
    if (!text.trim()) return;
    try { await onComment(activity.id, text.trim()); }
    catch { return; } // Keep the draft; the caller shows the save error.
    setMessage("");
    setCommentOpen(false);
  };
  const victory = activity.kind === "challenge_win";
  const sameDay = new Date(activity.occurredAt).toDateString() === new Date().toDateString();
  return <Card style={styles.card}>
    <View style={styles.topRow}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{activity.actor.name.slice(0, 1).toUpperCase()}</Text></View>
      <View style={styles.heading}><Text style={styles.name}>{activity.actor.name}</Text><Text style={styles.time}>{activityTime(activity.occurredAt)}</Text></View>
      {newBest && !victory ? <View style={styles.badge}><Text style={styles.badgeText}>New best</Text></View> : null}
    </View>
    {victory ? <Text style={styles.headline}>{name} beat {activity.opponentId === viewerId ? "your" : `${activity.opponentName || "a friend"}’s`} {activity.exerciseName || "lift"}{sameDay ? " today" : ""}.</Text>
      : activity.summaries?.length ? activity.summaries.map((lift, index) => <View key={`${lift.exerciseName}-${lift.equipment}-${index}`} style={styles.lift}>
        <Text style={styles.headline}>{name} did {lift.exerciseName}: {lift.setCount} {lift.setCount === 1 ? "set" : "sets"}, best {weight(lift.bestWeightKg)} × {lift.bestReps}</Text>
        <Text style={styles.time}>{lift.equipment}{lift.newBest && activity.summaries!.length > 1 ? " · New best" : ""}</Text>
      </View>)
        : <Text style={styles.headline}>{activity.kind === "personal_record" ? `${name} set a new best on ${activity.exerciseName || "a lift"}${activity.valueKg !== null ? `: ${weight(activity.valueKg)}` : ""}.` : `${name} finished ${activity.workoutName || "a workout"}.`}</Text>}
    {givers.length ? <Text style={styles.givers}>Kudos from {givers.map((giver) => giver.id === viewerId ? "you" : giver.name).join(", ")}</Text> : null}
    {allowInteractions && !activityOwner ? <View style={styles.actions}>
      <AppButton variant="secondary" style={[styles.action, hasKudos && styles.selected]} onPress={() => onReact(activity.id, "strong")} disabled={reacting}>{hasKudos ? "Kudos given" : "Kudos"}{givers.length ? ` · ${givers.length}` : ""}</AppButton>
      <AppButton variant="ghost" style={styles.action} onPress={() => setCommentOpen((open) => !open)}>{commentOpen ? "Close comment" : "Comment"}</AppButton>
    </View> : null}
    {victory && activity.opponentId === viewerId && activity.challengeId && onRematch ? <AppButton variant="secondary" disabled={rematching || rematchOpen} onPress={() => onRematch(activity.challengeId!)}>{rematching ? "Sending…" : rematchOpen ? "Challenge in progress" : "Rematch"}</AppButton> : null}
    {activity.comments.length ? <View style={styles.comments}>{activity.comments.map((comment) => <View key={comment.id} style={styles.comment}>
      <Text style={styles.commentText}><Text style={styles.name}>{comment.author.name}: </Text>{comment.message}</Text>
      {comment.author.id === viewerId || activityOwner ? <AppButton variant="ghost" style={styles.remove} onPress={() => onDeleteComment(comment.id)}>Remove comment</AppButton> : null}
    </View>)}</View> : null}
    {allowInteractions && commentOpen ? <View style={styles.composer}>
      <View style={styles.chips}>{["Strong!", "Nice lift", "Beast mode"].map((reply) => <AppButton key={reply} variant="secondary" style={styles.chip} onPress={() => submit(reply)} disabled={commenting}>{reply}</AppButton>)}</View>
      <TextInput accessibilityLabel="Short comment" value={message} onChangeText={setMessage} placeholder="Say something encouraging" placeholderTextColor={colors.muted} maxLength={180} multiline style={styles.input} textAlignVertical="top" />
      <View style={styles.footer}><Text style={styles.time}>{message.length}/180</Text><AppButton onPress={() => submit()} disabled={!message.trim() || commenting}>{commenting ? "Sending…" : "Send"}</AppButton></View>
    </View> : null}
  </Card>;
}
const styles = StyleSheet.create({
  card: { gap: 14, padding: 18 }, topRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: colors.paleLime },
  avatarText: { color: colors.limeDark, fontSize: 16, fontWeight: "800" }, heading: { flex: 1, gap: 3 },
  name: { color: colors.ink, fontSize: 16, fontWeight: "800" }, time: { color: colors.muted, fontSize: 16, lineHeight: 22 },
  badge: { borderRadius: 12, backgroundColor: colors.paleLime, paddingHorizontal: 8, paddingVertical: 6 },
  badgeText: { color: colors.limeDark, fontSize: 16, fontWeight: "700" },
  headline: { color: colors.ink, fontSize: 16, lineHeight: 25, fontWeight: "600" }, lift: { gap: 3 },
  givers: { color: colors.limeDark, fontSize: 16, lineHeight: 23 }, actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  action: { paddingHorizontal: 12, minHeight: 44 }, selected: { backgroundColor: colors.paleLime, borderColor: colors.lime },
  comments: { gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12 }, comment: { gap: 3 },
  commentText: { color: colors.ink, fontSize: 16, lineHeight: 24 }, remove: { alignSelf: "flex-start", paddingHorizontal: 0 },
  composer: { gap: 12, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 14 }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 10 }, input: { minHeight: 72, borderWidth: 1, borderColor: colors.line, borderRadius: 12, color: colors.ink, padding: 12, fontSize: 16, lineHeight: 24 },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});
