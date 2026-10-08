import * as Crypto from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, Share } from "react-native";
import * as Api from "./_core/api";
import * as Auth from "./_core/auth";
import { createTRPCClient } from "./trpc";

const KEY = "liftlog.first-lift.v1";
export type GuestDraft = {
  version: 1;
  clientKey?: string;
  unit: "lb" | "kg";
  days: 2 | 3 | 4 | null;
  stage: "welcome" | "choose" | "log" | "moment" | "finish";
  exercise: { name: string; equipment: string; exerciseId?: number } | null;
  sets: { id: string; weight: number; reps: number; exerciseName: string; equipment: string; exerciseId?: number }[];
  startedAt: number;
  finishedAt: number | null;
  workoutId?: number;
};
export function defaultGuestDraft(): GuestDraft {
  return { version: 1, clientKey: Crypto.randomUUID(), unit: "lb", days: null, stage: "welcome", exercise: null, sets: [], startedAt: Date.now(), finishedAt: null };
}
export async function readGuestDraft(): Promise<GuestDraft | null> {
  const stored = await AsyncStorage.getItem(KEY);
  if (!stored) return null;
  try { const draft = JSON.parse(stored); return draft.version === 1 && Array.isArray(draft.sets) ? draft : null; } catch { return null; }
}
export async function saveGuestDraft(draft: GuestDraft) { await AsyncStorage.setItem(KEY, JSON.stringify(draft)); }
let sessionPromise: Promise<void> | null = null;
export async function ensureGuestSession(): Promise<void> {
  if (sessionPromise) return sessionPromise;
  sessionPromise = (async () => {
    const user = await Api.getMe();
    if (user) return;
    const result = await Api.apiCall<Api.EmailAuthResponse>("/api/auth/guest", { method: "POST" });
    await Auth.setSessionToken(result.app_session_id);
    await Auth.setUserInfo({ ...result.user, lastSignedIn: new Date(result.user.lastSignedIn) });
  })();
  try { await sessionPromise; } finally { sessionPromise = null; }
}
let syncPromise: Promise<GuestDraft> | null = null;
export async function syncGuestWorkout(draft: GuestDraft): Promise<GuestDraft> {
  if (!draft.sets.length) return draft;
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    await ensureGuestSession();
    const client = createTRPCClient();
    if (draft.workoutId) {
      const existing = await client.workout.get.query({ id: draft.workoutId });
      if (existing) return draft;
    }
    const catalog = await client.exercise.list.query();
    const groups = new Map<string, { exerciseId: number; sets: {targetReps: number; actualReps: number; actualWeight: number; rpe: null}[] }>();
    for (const set of draft.sets) {
      const key = `${set.exerciseName.toLowerCase()}|${set.equipment.toLowerCase()}`;
      let group = groups.get(key);
      if (!group) {
        let exercise = catalog.find((item) => item.id === set.exerciseId) ?? catalog.find((item) => item.name.toLowerCase() === set.exerciseName.toLowerCase() && item.equipment.toLowerCase() === set.equipment.toLowerCase());
        if (!exercise) exercise = await client.exercise.createCustom.mutate({name: set.exerciseName, equipment: set.equipment});
        group = {exerciseId: exercise.id, sets: []}; groups.set(key, group);
      }
      group.sets.push({ targetReps: set.reps, actualReps: set.reps, actualWeight: set.weight, rpe: null });
    }
    const saved = await client.workout.syncGuest.mutate({
      clientKey: draft.clientKey ?? String(draft.startedAt), unit: draft.unit, days: draft.days,
      performedAt: new Date(draft.startedAt).toISOString(),
      durationSeconds: Math.min(604800, Math.max(0, Math.floor(((draft.finishedAt ?? Date.now()) - draft.startedAt) / 1000))),
      name: "First workout", exercises: [...groups.values()],
    });
    const updated = { ...draft, workoutId: saved.id };
    const latest = await readGuestDraft();
    if (latest?.startedAt === draft.startedAt) await saveGuestDraft({...latest, workoutId: saved.id});
    return updated;
  })();
  try { return await syncPromise; } finally { syncPromise = null; }
}
export async function shareGuestInvite() {
  await ensureGuestSession();
  const invite = await createTRPCClient().friends.invite.mutate();
  const origin = Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : "https://liftlog-uwz9xcwl.manus.space";
  const url = `${origin}/friend-invite?code=${encodeURIComponent(invite.code)}`;
  if (Platform.OS === "web") {
    if (navigator.share) await navigator.share({ title: "Lift Log", text: "Lift with me on Lift Log.", url });
    else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
    else throw new Error("Sharing is unavailable here. Try your phone's browser.");
  } else await Share.share({ message: `Lift with me on Lift Log. ${url}`, url });
}
