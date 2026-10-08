import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import * as db from "../server/db";
import { appRouter } from "../server/routers";
import { friendNudges, socialNotices, users, workouts, friendBlocks, friendMutes, friendNudgeLocks, friendActivities } from "../drizzle/schema";
import type { User } from "../drizzle/schema";
import type { TrpcContext } from "../server/_core/context";

const fakeUsers: User[] = [];
const passed: string[] = [];
const mark = (label: string) => { passed.push(label); console.log(`PASS ${label}`); };
const rejected = async (task: Promise<unknown>, label: string) => {
  let failed = false;
  try { await task; } catch { failed = true; }
  assert.ok(failed, label);
};
const caller = (user: User) => appRouter.createCaller({ user, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const sqlDb = await db.getDb();
  assert.ok(sqlDb);
  const tag = randomBytes(7).toString("hex");
  for (const name of ["Alex", "Sam", "Jamie", "Taylor"]) {
    fakeUsers.push(await db.createEmailUser({ email: `phase3-${name.toLowerCase()}-${tag}@liftlog.invalid`, displayName: name, passwordHash: "not-a-login-hash" }));
    await db.setUserUnit(fakeUsers.at(-1)!.id, "lb");
  }
  const [a, b, c, d] = fakeUsers;
  const [A, B, C, D] = fakeUsers.map(caller);
  const bench = (await A.exercise.list()).find((lift) => lift.name === "Bench Press" && lift.equipment === "Barbell")!;
  assert.ok(bench);
  const plan = (weight: number, isPrivate = false, sets = 3) => ({ name: "Test bench", notes: "PRIVATE TEST NOTE", isPrivate, durationSeconds: 60, exercises: [{ exerciseId: bench.id, sets: Array.from({ length: sets }, () => ({ targetReps: 8, actualReps: 8, actualWeight: weight, rpe: 6 })) }] });
  const completed = async (who: User, weight: number, isPrivate = false, sets = 3) => {
    const input = plan(weight, isPrivate, sets);
    const draft = await db.createWorkoutFromPlan(who.id, input);
    assert.ok(draft);
    await db.saveWorkout(who.id, draft.id, input, true);
    return draft.id;
  };
  const befriend = async (sender: ReturnType<typeof caller>, recipient: ReturnType<typeof caller>, senderId: number) => {
    const invite = await recipient.friends.invite();
    await sender.friends.redeemInvite({ code: invite.code });
    const request = (await recipient.friends.hub()).incoming.find((item) => item.person?.id === senderId)!;
    assert.ok(request);
    await recipient.friends.respond({ requestId: request.id, accept: true });
  };
  assert.equal((await A.settings.get()).allowFriendNudges, 0);
  const code = (await A.friends.invite()).code;
  assert.match(code, /^[A-F0-9]{24}$/);
  const codes = await Promise.all([A.friends.invite(), A.friends.invite(), A.friends.invite()]);
  assert.ok(codes.every((item) => item.code === code));
  await rejected(B.friends.profile({ friendId: a.id }), "unapproved profile blocked");
  await B.friends.redeemInvite({ code });
  await rejected(B.friends.profile({ friendId: a.id }), "pending profile blocked");
  const request = (await A.friends.hub()).incoming.find((item) => item.person?.id === b.id)!;
  await A.friends.respond({ requestId: request.id, accept: true });
  mark("opaque stable invitations require approval; nudges default Off");
  const aShared = await completed(a, 135);
  await completed(a, 999, true);
  await A.account.setSocialProfile({ displayName: null, nameMode: "account", shareActivity: false });
  await completed(a, 900);
  await A.account.setSocialProfile({ displayName: null, nameMode: "account", shareActivity: true });
  const aComparison = (await B.friends.profile({ friendId: a.id })).comparisons.find((lift) => lift.exerciseName === "Bench Press")!;
  assert.equal(aComparison.friendBest, 135);
  const bShared = await completed(b, 145);
  const comparisonA = (await A.friends.profile({ friendId: b.id })).comparisons.find((lift) => lift.exerciseName === "Bench Press")!;
  assert.equal(comparisonA.viewerBest, 999);
  assert.equal(comparisonA.viewerSharedBest, 135);
  const hubA = await A.friends.hub();
  const activity = hubA.activities.find((item) => item.kind === "workout_completed" && item.workoutId === bShared)!;
  assert.ok(activity);
  assert.equal(activity.summaries[0].setCount, 3);
  assert.equal(Math.round(activity.summaries[0].bestWeightKg / 0.45359237), 145);
  assert.equal(activity.summaries[0].bestReps, 8);
  assert.ok(activity.summaries[0].newBest);
  const serialized = JSON.stringify(activity);
  assert.ok(!serialized.includes("PRIVATE TEST NOTE") && !serialized.includes("actualWeight") && !serialized.includes("rpe"));
  await A.friends.react({ activityId: activity.id, kind: "strong" });
  await A.friends.comment({ activityId: activity.id, message: "Strong!" });
  const updated = (await A.friends.hub()).activities.find((item) => item.id === activity.id)!;
  assert.equal(updated.kudosGivers[0].name, "Alex");
  assert.equal(updated.comments[0].message, "Strong!");
  mark("shared-only actual comparisons; whitelisted 3-set card; named Kudos and quick comment");
  await db.saveWorkout(b.id, bShared, plan(145, true), true);
  assert.ok(!(await A.friends.hub()).activities.some((item) => item.workoutId === bShared));
  await rejected(A.friends.react({ activityId: activity.id }), "private activity reaction denied");
  await rejected(A.friends.comment({ activityId: activity.id, message: "Nice lift" }), "private activity comment denied");
  await db.saveWorkout(b.id, bShared, plan(145, false), true);
  mark("making a workout private removes summaries, interactions and maxima");
  await befriend(C, B, c.id);
  const challengeArgs = { friendId: b.id, exerciseName: "Bench Press", equipment: "Barbell" };
  const created = await Promise.allSettled([A.friends.createChallenge(challengeArgs), A.friends.createChallenge(challengeArgs)]);
  assert.equal(created.filter((item) => item.status === "fulfilled").length, 1);
  const challenge = (created.find((item): item is PromiseFulfilledResult<Awaited<ReturnType<typeof A.friends.createChallenge>>> => item.status === "fulfilled")!).value;
  assert.equal((await A.friends.hub()).challenges.find((item) => item.id === challenge.id)!.endsAt.getUTCDay(), 0);
  await B.friends.respondToChallenge({ challengeId: challenge.id, accept: true });
  await A.friends.sendChallengeNote({ challengeId: challenge.id, preset: "your_turn" });
  await pause(1200);
  await completed(b, 150);
  const win = (await A.friends.hub()).activities.find((item) => item.kind === "challenge_win" && item.challengeId === challenge.id)!;
  assert.ok(win);
  assert.equal(win.exerciseName, "Bench Press");
  assert.ok(!(await C.friends.hub()).activities.some((item) => item.kind === "challenge_win" && item.challengeId === challenge.id));
  await rejected(C.friends.react({ activityId: win.id }), "third friend cannot react to a private win");
  await rejected(C.friends.comment({ activityId: win.id, message: "Strong!" }), "third friend cannot comment on private win");
  await rejected(B.friends.rematch({ challengeId: challenge.id }), "winner cannot request losing-side rematch");
  const exportA = await A.account.exportData();
  assert.ok(exportA.friends.activities.some((item) => item.id === win.id));
  await A.friends.rematch({ challengeId: challenge.id });
  mark("one challenge per lift under concurrency; accepted new-lift win; participant-only Rematch/export");
  await db.saveWorkout(a.id, aShared, plan(135, true), true);
  assert.ok(!(await B.friends.hub()).challenges.some((item) => item.id === challenge.id));
  assert.ok(!(await B.friends.hub()).notices.some((notice) => /135/.test(notice.message)));
  await db.saveWorkout(a.id, aShared, plan(135, false), true);
  await A.account.setSocialProfile({ displayName: null, nameMode: "account", shareActivity: false });
  assert.equal((await B.friends.profile({ friendId: a.id })).friendMaxes.length, 0);
  assert.ok(!(await B.friends.hub()).challenges.some((item) => item.creatorId === a.id || item.opponentId === a.id));
  await A.account.setSocialProfile({ displayName: null, nameMode: "account", shareActivity: true });
  mark("withdrawn source/global sharing Off hide challenge targets and comparisons");
  const notice = (await A.friends.hub()).notices[0];
  if (notice) {
    await A.friends.readNotice({ noticeId: notice.id });
    assert.ok(!(await A.friends.hub()).notices.some((item) => item.id === notice.id));
  }
  const inviteD = await D.friends.invite();
  await Promise.all([A.friends.redeemInvite({ code: inviteD.code }), B.friends.redeemInvite({ code: inviteD.code }), C.friends.redeemInvite({ code: inviteD.code })]);
  const dNotices = await sqlDb.select().from(socialNotices).where(eq(socialNotices.recipientId, d.id));
  assert.equal(dNotices.length, 1);
  mark("notice dismissal persists; simultaneous social events create at most one daily notice");
  const old = new Date(Date.now() - 16 * 86400000);
  await sqlDb.update(workouts).set({ completedAt: old }).where(eq(workouts.userId, b.id));
  await sqlDb.update(users).set({ createdAt: old }).where(eq(users.id, b.id));
  await rejected(A.friends.sendNudge({ friendId: b.id, preset: "gym_misses_you" }), "opt-out cannot be nudged");
  await A.friends.setPreferences({ allowNudges: true });
  await rejected(A.friends.sendNudge({ friendId: b.id, preset: "gym_misses_you" }), "both must opt in");
  await B.friends.setPreferences({ allowNudges: true, notificationsEnabled: false });
  await B.friends.setMuted({ friendId: a.id, muted: true });
  assert.equal((await A.friends.profile({ friendId: b.id })).canNudge, false);
  await rejected(A.friends.sendNudge({ friendId: b.id, preset: "gym_misses_you" }), "recipient mute prevents send");
  await B.friends.setMuted({ friendId: a.id, muted: false });
  const sent = await Promise.allSettled([A.friends.sendNudge({ friendId: b.id, preset: "gym_misses_you" }), A.friends.sendNudge({ friendId: b.id, preset: "gym_misses_you" }), A.friends.sendNudge({ friendId: b.id, preset: "where_are_you" })]);
  assert.equal(sent.filter((item) => item.status === "fulfilled").length, 1);
  const nudgeRows = await sqlDb.select().from(friendNudges).where(and(eq(friendNudges.senderId, a.id), eq(friendNudges.recipientId, b.id)));
  assert.equal(nudgeRows.length, 1);
  const nudges = (await B.friends.hub()).nudges;
  assert.equal(nudges.length, 1);
  assert.ok(["Gym misses you.", "Where are you bro?"].includes(nudges[0].message));
  assert.ok(!JSON.stringify(nudges).includes("16 days"));
  assert.equal((await B.friends.hub()).notices.length, 0);
  await B.friends.readNudge({ nudgeId: nudges[0].id });
  assert.equal((await B.friends.hub()).nudges.length, 0);
  const nudgeExport = await A.account.exportData();
  assert.equal(nudgeExport.friends.nudgeLocks.length, 1);
  mark("14-day nudges require both opt-ins, respect mute, serialize weekly limit, show direct messages with alerts Off");
  const bFeed = (await A.friends.hub()).activities.find((item) => item.kind === "workout_completed")!;
  await A.friends.comment({ activityId: bFeed.id, message: "Nice lift" });
  const commentId = (await A.friends.hub()).activities.find((item) => item.id === bFeed.id)!.comments.at(-1)!.id;
  await B.friends.block({ friendId: a.id });
  await rejected(A.friends.profile({ friendId: b.id }), "blocked profile denied");
  await rejected(A.friends.redeemInvite({ code: (await B.friends.invite()).code }), "block cannot be bypassed with code");
  await rejected(A.friends.request({ email: b.email! }), "block cannot be bypassed with email");
  await rejected(A.friends.react({ activityId: bFeed.id }), "blocked reaction denied");
  await rejected(A.friends.deleteComment({ commentId }), "blocked legacy delete-comment denied");
  assert.ok(!(await A.friends.hub()).challenges.some((item) => item.creatorId === b.id || item.opponentId === b.id));
  assert.equal((await A.friends.hub()).blocked.length, 0);
  assert.ok((await B.friends.hub()).blocked.some((item) => item.id === a.id));
  await B.friends.unblock({ friendId: a.id });
  assert.equal((await B.friends.hub()).friends.some((item) => item.person?.id === a.id), false);
  mark("block gates old and new endpoints; unblock belongs to blocker and requires fresh approval");
  await db.deleteAccountData(b.id);
  fakeUsers.splice(fakeUsers.findIndex((user) => user.id === b.id), 1);
  for (const [table, condition] of [
    [friendBlocks, or(eq(friendBlocks.blockerId, b.id), eq(friendBlocks.blockedId, b.id))],
    [friendMutes, or(eq(friendMutes.userId, b.id), eq(friendMutes.mutedUserId, b.id))],
    [friendNudgeLocks, or(eq(friendNudgeLocks.senderId, b.id), eq(friendNudgeLocks.recipientId, b.id))],
    [friendNudges, or(eq(friendNudges.senderId, b.id), eq(friendNudges.recipientId, b.id))],
    [socialNotices, or(eq(socialNotices.actorId, b.id), eq(socialNotices.recipientId, b.id))],
    [friendActivities, or(eq(friendActivities.actorId, b.id), eq(friendActivities.opponentId, b.id))],
  ] as const) assert.equal((await sqlDb.select().from(table).where(condition)).length, 0);
  mark("account deletion removes new social references and locks");
  console.log(`Phase3 fake-account integration: ${passed.length} groups passed.`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  for (const user of fakeUsers.reverse()) await db.deleteAccountData(user.id).catch((error) => { console.error("Fake fixture cleanup failed", error.message); process.exitCode = 1; });
  process.exit(process.exitCode ?? 0);
});
