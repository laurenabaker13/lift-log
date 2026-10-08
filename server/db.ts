import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, lte, ne, or } from "drizzle-orm";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { drizzle } from "drizzle-orm/mysql2";
import {
  accountTokens,
  appleAuthChallenges,
  activityComments,
  activityReactions,
  challengeNotes,
  coachInvitations,
  coachSuggestions,
  exercises,
  friendActivities,
  friendBlocks,
  friendMutes,
  friendNudgeLocks,
  friendNudges,
  friendConnections,
  guestInviteAliases,
  type InsertUser,
  type User,
  liftChallenges,
  planImports,
  programExercises,
  programSets,
  programWeeks,
  programWorkouts,
  programWorkoutSkips,
  socialNotices,
  templateExercises,
  templateSets,
  trainingPrograms,
  trainerClients,
  userSettings,
  users,
  workoutExercises,
  workoutSets,
  workouts,
  workoutTemplates,
} from "../drizzle/schema";
import { freshPlanFromEntries } from "../shared/plans";
import { CHALLENGE_NOTE_LABELS, FRIEND_REACTION_LABELS, FRIEND_REQUEST_RECEIPT, FRIEND_NUDGE_COOLDOWN_DAYS, FRIEND_NUDGE_INACTIVITY_DAYS, NUDGE_LABELS, canViewChallengeScores, challengeEndsAt, challengeLiftKey, challengeLiftLabel, displaySocialName, formatChallengeTarget, nudgeUnavailableLine, type ChallengeLift, type ChallengeNotePreset, type FriendReaction, type NudgePreset } from "../shared/social";
import { estimateOneRepMax, estimateThreeRepMax, fromKilograms, toKilograms, type Unit } from "../shared/strength";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export type PlannedSetInput = {
  targetReps: number;
  actualReps?: number | null;
  actualWeight?: number | null;
  rpe?: number | null;
};

export type PlannedExerciseInput = {
  exerciseId: number;
  plannedPercent?: number | null;
  plannedWeight?: number | null;
  targetRpe?: number | null;
  sets: PlannedSetInput[];
};

export type WorkoutPlanInput = {
  name: string;
  notes?: string | null;
  isPrivate?: boolean;
  durationSeconds?: number;
  exercises: PlannedExerciseInput[];
};

export type GuestWorkoutSyncInput = {
  clientKey: string;
  unit: Unit;
  days?: number | null;
  performedAt: Date;
  durationSeconds: number;
  name: string;
  exercises: PlannedExerciseInput[];
};

export type ProgramExerciseInput = {
  exerciseId: number;
  prescriptionMode: "percent" | "weight";
  intensityPercent?: number | null;
  plannedWeight?: number | null;
  targetRpe?: number | null;
  sets: Array<{ targetReps: number }>;
};

export type ProgramWorkoutInput = {
  name: string;
  dayOfWeek: number;
  exercises: ProgramExerciseInput[];
};

export type ImportedWorkoutInput = {
  dayOfWeek: number;
  name: string;
  exercises: Array<{
    name: string;
    equipment: string;
    prescriptionMode: "percent" | "weight";
    intensityPercent?: number | null;
    plannedWeight?: number | null;
    weightUnit?: Unit | null;
    targetRpe?: number | null;
    sets: Array<{ targetReps: number }>;
  }>;
};

export type ImportedProgramInput = {
  name: string;
  trainerNotes?: string | null;
  weeks: Array<{ name: string; workouts: ImportedWorkoutInput[] }>;
};

const DEFAULT_EXERCISES = [
  ["Back Squat", "Barbell"],
  ["Front Squat", "Barbell"],
  ["Goblet Squat", "Kettlebell"],
  ["Bench Press", "Barbell"],
  ["Bench Press", "Dumbbell"],
  ["Overhead Press", "Barbell"],
  ["Overhead Press", "Dumbbell"],
  ["Deadlift", "Barbell"],
  ["Romanian Deadlift", "Barbell"],
  ["Romanian Deadlift", "Dumbbell"],
  ["Romanian Deadlift", "Kettlebell"],
  ["Hip Thrust", "Barbell"],
  ["Bent-Over Row", "Barbell"],
  ["Bent-Over Row", "Dumbbell"],
  ["Lat Pulldown", "Machine"],
  ["Leg Press", "Machine"],
  ["Split Squat", "Dumbbell"],
  ["Farmer Carry", "Dumbbell"],
  ["Push-Up", "Bodyweight"],
  ["Pull-Up", "Bodyweight"],
  ["Air Squat", "Bodyweight"],
  ["Sit-Up", "Bodyweight"],
] as const;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch {
      console.warn("[Database] Failed to connect");
      _db = null;
    }
  }
  return _db;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database connection is unavailable.");
  return db;
}

function insertId(result: unknown): number {
  const value = (result as Array<{ insertId?: number | bigint }>)[0]?.insertId;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Database did not return a record id.");
  return id;
}

function affectedRows(result: unknown) {
  const header = Array.isArray(result) ? result[0] : result;
  return Number((header as { affectedRows?: number | bigint } | undefined)?.affectedRows ?? 0);
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await requireDb();
  const values: InsertUser = { openId: user.openId, lastSignedIn: user.lastSignedIn ?? new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: values.lastSignedIn };

  for (const field of ["name", "email", "passwordHash", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }

  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await requireDb();
  const rows = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return rows[0];
}

export async function getUserById(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0];
}

export function emailOpenId(email: string) {
  return `email:${email.trim().toLowerCase()}`;
}

export async function getUserByEmail(email: string) {
  return getUserByOpenId(emailOpenId(email));
}

export async function createEmailUser(input: {
  email: string;
  displayName: string;
  passwordHash: string;
}) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const result = await tx.insert(users).values({
      openId: emailOpenId(input.email),
      name: input.displayName,
      email: input.email.trim().toLowerCase(),
      passwordHash: input.passwordHash,
      loginMethod: "email_password",
      lastSignedIn: new Date(),
    });
    const userId = insertId(result);
    await tx.insert(userSettings).values({
      userId,
      unit: "lb",
      shareFriendActivity: 0,
      allowFriendNudges: 0,
    });
    const created = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!created[0]) throw new Error("Account could not be created.");
    return created[0];
  });
}

export function guestOpenId() {
  return `guest:${randomBytes(32).toString("base64url")}`;
}

export function appleOpenId(subject: string) {
  return `apple:${subject}`;
}

async function getCreatedUser(database: Awaited<ReturnType<typeof requireDb>>, id: number): Promise<User> {
  const rows = await database.select().from(users).where(eq(users.id, id)).limit(1);
  if (!rows[0]) throw new Error("Account could not be created.");
  return rows[0];
}

export async function createGuestUser(): Promise<User> {
  const database = await requireDb();
  return database.transaction(async (tx) => {
    const result = await tx.insert(users).values({
      openId: guestOpenId(),
      name: null,
      email: null,
      passwordHash: null,
      loginMethod: "guest",
      lastSignedIn: new Date(),
    });
    const userId = insertId(result);
    await tx.insert(userSettings).values({
      userId,
      unit: "lb",
      unitChosen: 1,
      shareFriendActivity: 0,
      allowFriendNudges: 0,
    });
    const created = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!created[0]) throw new Error("Account could not be created.");
    return created[0];
  });
}

export async function createAppleUser(identity: { sub: string; email: string | null }): Promise<User> {
  const database = await requireDb();
  return database.transaction(async (tx) => {
    const result = await tx.insert(users).values({
      openId: appleOpenId(identity.sub),
      name: identity.email?.split("@")[0] ?? "Lift Log athlete",
      email: identity.email,
      passwordHash: null,
      loginMethod: "apple",
      lastSignedIn: new Date(),
    });
    const userId = insertId(result);
    // Apple and guest accounts are private by default, regardless of the older global setting default.
    await tx.insert(userSettings).values({
      userId,
      unit: "lb",
      shareFriendActivity: 0,
      allowFriendNudges: 0,
    });
    const created = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!created[0]) throw new Error("Account could not be created.");
    return created[0];
  });
}

export async function upgradeGuestToEmailUser(input: {
  userId: number;
  email: string;
  displayName: string;
  passwordHash: string;
}): Promise<User> {
  const database = await requireDb();
  const result = await database
    .update(users)
    .set({
      openId: emailOpenId(input.email),
      email: input.email,
      name: input.displayName,
      passwordHash: input.passwordHash,
      loginMethod: "email_password",
      lastSignedIn: new Date(),
    })
    .where(and(eq(users.id, input.userId), eq(users.loginMethod, "guest")));
  if (affectedRows(result) !== 1) throw new Error("Guest account is no longer available for upgrade.");
  return getCreatedUser(database, input.userId);
}

export async function upgradeGuestToAppleUser(userId: number, identity: { sub: string; email: string | null }): Promise<User> {
  const database = await requireDb();
  const result = await database
    .update(users)
    .set({
      openId: appleOpenId(identity.sub),
      email: identity.email,
      name: identity.email?.split("@")[0] ?? "Lift Log athlete",
      passwordHash: null,
      loginMethod: "apple",
      lastSignedIn: new Date(),
    })
    .where(and(eq(users.id, userId), eq(users.loginMethod, "guest")));
  if (affectedRows(result) !== 1) throw new Error("Guest account is no longer available for upgrade.");
  return getCreatedUser(database, userId);
}

export async function touchUserLastSignedIn(userId: number) {
  const database = await requireDb();
  await database.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, userId));
}

export async function getUserSettings(userId: number) {
  const db = await requireDb();
  const existing = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  if (existing[0]) return existing[0];
  await db.insert(userSettings).values({ userId, unit: "lb", onboardingComplete: 0, isTrainer: 0, activeWorkspace: "athlete", shareFriendActivity: 1 });
  const created = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  if (!created[0]) throw new Error("Settings could not be initialized.");
  return created[0];
}

export async function claimGuestData(targetUserId: number, guestUserId: number) {
  if (!Number.isInteger(targetUserId) || !Number.isInteger(guestUserId) || targetUserId <= 0 || guestUserId <= 0 || targetUserId === guestUserId) {
    throw new Error("A different signed-in account is required to claim guest data.");
  }
  const database = await requireDb();
  return database.transaction(async (tx) => {
    const participants = await tx
      .select()
      .from(users)
      .where(inArray(users.id, [targetUserId, guestUserId]))
      .orderBy(asc(users.id))
      .for("update");
    const target = participants.find((user) => user.id === targetUserId);
    const guest = participants.find((user) => user.id === guestUserId);
    if (!target || !guest || guest.loginMethod !== "guest") throw new Error("Guest session is no longer available.");
    if (target.loginMethod === "guest") throw new Error("Sign in to an account before claiming guest data.");

    const settings = await tx
      .select()
      .from(userSettings)
      .where(inArray(userSettings.userId, [targetUserId, guestUserId]))
      .orderBy(asc(userSettings.userId))
      .for("update");
    const targetSettings = settings.find((setting) => setting.userId === targetUserId);
    const guestSettings = settings.find((setting) => setting.userId === guestUserId);

    if (!targetSettings && guestSettings) {
      await tx.update(userSettings).set({ userId: targetUserId }).where(eq(userSettings.userId, guestUserId));
    } else if (targetSettings && guestSettings) {
      // Preserve an established account's choices where possible, but retain the more-private
      // sharing posture when either account opted out.
      await tx
        .update(userSettings)
        .set({
          unit: targetSettings.unitChosen ? targetSettings.unit : guestSettings.unit,
          unitChosen: targetSettings.unitChosen || guestSettings.unitChosen ? 1 : 0,
          firstWeekDays: targetSettings.firstWeekDays ?? guestSettings.firstWeekDays,
          onboardingComplete: targetSettings.onboardingComplete || guestSettings.onboardingComplete ? 1 : 0,
          tipsDismissed: targetSettings.tipsDismissed || guestSettings.tipsDismissed ? 1 : 0,
          shareFriendActivity: targetSettings.shareFriendActivity && guestSettings.shareFriendActivity ? 1 : 0,
          allowFriendNudges: targetSettings.allowFriendNudges && guestSettings.allowFriendNudges ? 1 : 0,
          socialNotificationsEnabled: targetSettings.socialNotificationsEnabled && guestSettings.socialNotificationsEnabled ? 1 : 0,
        })
        .where(eq(userSettings.userId, targetUserId));
    }

    // A claimed guest may already have shared a friend-invite link. Keep that link pointed at the
    // signed-in account, but never replace the account's own link.
    if (guest.inviteCode) {
      const aliases = await tx
        .select()
        .from(guestInviteAliases)
        .where(eq(guestInviteAliases.code, guest.inviteCode))
        .limit(1)
        .for("update");
      if (aliases[0] && aliases[0].targetUserId !== targetUserId) {
        throw new Error("This guest invite code is no longer available.");
      }
      if (!aliases[0]) {
        await tx.insert(guestInviteAliases).values({ code: guest.inviteCode, targetUserId });
      }
    }

    // Move every guest endpoint to the target account. Rows are locked after both participant
    // accounts, so ordinary friend-request creation (which locks its participants) cannot race a
    // claim. If both accounts already know the same person, retain one relation with accepted >
    // pending > declined precedence rather than creating a duplicate or self-link.
    const guestConnections = await tx
      .select()
      .from(friendConnections)
      .where(or(eq(friendConnections.requesterId, guestUserId), eq(friendConnections.recipientId, guestUserId)))
      .for("update");
    const connectionRank = (status: "pending" | "accepted" | "declined") =>
      status === "accepted" ? 3 : status === "pending" ? 2 : 1;
    for (const guestConnection of guestConnections) {
      const otherUserId = guestConnection.requesterId === guestUserId
        ? guestConnection.recipientId
        : guestConnection.requesterId;
      if (otherUserId === targetUserId) {
        await tx.delete(friendConnections).where(eq(friendConnections.id, guestConnection.id));
        continue;
      }

      const targetConnections = await tx
        .select()
        .from(friendConnections)
        .where(
          or(
            and(eq(friendConnections.requesterId, targetUserId), eq(friendConnections.recipientId, otherUserId)),
            and(eq(friendConnections.requesterId, otherUserId), eq(friendConnections.recipientId, targetUserId)),
          ),
        )
        .for("update");
      const preferredTarget = targetConnections.reduce<typeof friendConnections.$inferSelect | undefined>(
        (best, connection) => !best || connectionRank(connection.status) > connectionRank(best.status) ? connection : best,
        undefined,
      );
      const keeper = !preferredTarget || connectionRank(guestConnection.status) > connectionRank(preferredTarget.status)
        ? guestConnection
        : preferredTarget;
      const redundantIds = [...targetConnections, guestConnection]
        .filter((connection) => connection.id !== keeper.id)
        .map((connection) => connection.id);
      if (redundantIds.length) await tx.delete(friendConnections).where(inArray(friendConnections.id, redundantIds));
      await tx
        .update(friendConnections)
        .set({
          requesterId: keeper.requesterId === guestUserId ? targetUserId : keeper.requesterId,
          recipientId: keeper.recipientId === guestUserId ? targetUserId : keeper.recipientId,
          status: keeper.status,
          respondedAt: keeper.respondedAt,
        })
        .where(eq(friendConnections.id, keeper.id));
    }
    // Friend-request notices follow the migrated endpoint as well, but a relation between the
    // guest and target must not turn into a self-notification.
    await tx
      .delete(socialNotices)
      .where(
        and(
          eq(socialNotices.kind, "friend_request"),
          or(
            and(eq(socialNotices.recipientId, guestUserId), eq(socialNotices.actorId, targetUserId)),
            and(eq(socialNotices.recipientId, targetUserId), eq(socialNotices.actorId, guestUserId)),
          ),
        ),
      );
    await tx
      .update(socialNotices)
      .set({ recipientId: targetUserId })
      .where(and(eq(socialNotices.kind, "friend_request"), eq(socialNotices.recipientId, guestUserId)));
    await tx
      .update(socialNotices)
      .set({ actorId: targetUserId })
      .where(and(eq(socialNotices.kind, "friend_request"), eq(socialNotices.actorId, guestUserId)));

    const moved = {
      workouts: affectedRows(await tx.update(workouts).set({ userId: targetUserId }).where(eq(workouts.userId, guestUserId))),
      templates: affectedRows(await tx.update(workoutTemplates).set({ userId: targetUserId }).where(eq(workoutTemplates.userId, guestUserId))),
      programs: affectedRows(await tx.update(trainingPrograms).set({ userId: targetUserId }).where(eq(trainingPrograms.userId, guestUserId))),
      imports: affectedRows(await tx.update(planImports).set({ userId: targetUserId }).where(eq(planImports.userId, guestUserId))),
      exercises: affectedRows(await tx.update(exercises).set({ userId: targetUserId }).where(eq(exercises.userId, guestUserId))),
      programSkips: affectedRows(await tx.update(programWorkoutSkips).set({ userId: targetUserId }).where(eq(programWorkoutSkips.userId, guestUserId))),
    };
    const movedCount = Object.values(moved).reduce((total, count) => total + count, 0);
    // The guest user and its session remain intact. This makes an unchanged retry idempotent and
    // prevents this endpoint from deleting or taking over arbitrary accounts.
    return { claimed: true as const, alreadyClaimed: movedCount === 0, moved };
  });
}

export async function setUserUnit(userId: number, unit: Unit) {
  const db = await requireDb();
  await db
    .insert(userSettings)
    .values({ userId, unit, unitChosen: 1 })
    .onDuplicateKeyUpdate({ set: { unit, unitChosen: 1 } });
  return getUserSettings(userId);
}

export async function setSocialProfile(
  userId: number,
  input: { displayName: string | null; nameMode: "account" | "display"; shareActivity: boolean },
) {
  const db = await requireDb();
  const displayName = input.displayName?.trim() || null;
  await db
    .insert(userSettings)
    .values({
      userId,
      socialDisplayName: displayName,
      socialNameMode: input.nameMode,
      shareFriendActivity: input.shareActivity ? 1 : 0,
    })
    .onDuplicateKeyUpdate({
      set: {
        socialDisplayName: displayName,
        socialNameMode: input.nameMode,
        shareFriendActivity: input.shareActivity ? 1 : 0,
      },
    });
  return getSocialProfile(userId);
}

export async function setFriendPreferences(
  userId: number,
  input: { allowNudges?: boolean; notificationsEnabled?: boolean },
) {
  await getUserSettings(userId);
  const db = await requireDb();
  const set: Record<string, number> = {};
  if (input.allowNudges !== undefined) set.allowFriendNudges = input.allowNudges ? 1 : 0;
  if (input.notificationsEnabled !== undefined) set.socialNotificationsEnabled = input.notificationsEnabled ? 1 : 0;
  if (Object.keys(set).length) await db.update(userSettings).set(set).where(eq(userSettings.userId, userId));
  return getUserSettings(userId);
}

export async function getAccountProfile(userId: number) {
  const db = await requireDb();
  const user = await db
    .select({ id: users.id, name: users.name, email: users.email, emailVerifiedAt: users.emailVerifiedAt, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user[0]) throw new Error("Account not found.");
  const settings = await getUserSettings(userId);
  return { ...user[0], settings };
}

export async function completeOnboarding(userId: number) {
  const db = await requireDb();
  await db.insert(userSettings).values({ userId, onboardingComplete: 1 }).onDuplicateKeyUpdate({ set: { onboardingComplete: 1 } });
  return getUserSettings(userId);
}

export async function setAccountWorkspace(userId: number, workspace: "athlete" | "coach") {
  const db = await requireDb();
  await db
    .insert(userSettings)
    .values({ userId, activeWorkspace: workspace, isTrainer: workspace === "coach" ? 1 : 0 })
    .onDuplicateKeyUpdate({ set: { activeWorkspace: workspace, ...(workspace === "coach" ? { isTrainer: 1 } : {}) } });
  return getUserSettings(userId);
}

export async function markEmailVerified(userId: number) {
  const db = await requireDb();
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId));
  return getAccountProfile(userId);
}

export async function replaceUserPassword(userId: number, passwordHash: string) {
  const db = await requireDb();
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

export async function createAccountToken(input: {
  userId: number;
  email: string;
  type: "verify_email" | "reset_password";
  tokenHash: string;
  expiresAt: Date;
}) {
  const db = await requireDb();
  await db
    .update(accountTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(accountTokens.userId, input.userId), eq(accountTokens.type, input.type), isNull(accountTokens.usedAt)));
  const result = await db.insert(accountTokens).values(input);
  return insertId(result);
}

export async function consumeAccountToken(tokenHash: string, type: "verify_email" | "reset_password") {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(accountTokens)
    .where(and(eq(accountTokens.tokenHash, tokenHash), eq(accountTokens.type, type), isNull(accountTokens.usedAt)))
    .limit(1);
  const token = rows[0];
  if (!token || token.expiresAt.getTime() <= Date.now()) throw new Error("This link has expired. Request a new one.");
  const consumed = await db.update(accountTokens).set({ usedAt: new Date() }).where(and(eq(accountTokens.id, token.id), isNull(accountTokens.usedAt)));
  if (affectedRows(consumed) !== 1) throw new Error("This link has already been used. Request a new one.");
  return token;
}

export async function createAppleAuthChallenge(input: {
  id: string;
  nonce: string;
  credentialHash: string;
  expiresAt: Date;
}) {
  const db = await requireDb();
  // Pruning keeps this short-lived anti-replay store bounded without relying on process memory.
  await db.delete(appleAuthChallenges).where(lte(appleAuthChallenges.expiresAt, new Date()));
  await db.insert(appleAuthChallenges).values(input);
}

export async function consumeAppleAuthChallenge(input: { id: string; credentialHash: string }) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(appleAuthChallenges)
      .where(eq(appleAuthChallenges.id, input.id))
      .limit(1)
      .for("update");
    const challenge = rows[0];
    // Burn it while holding the row lock before checking any caller-derived values. A failed
    // verification therefore cannot leave a nonce that can be replayed in another request.
    if (challenge) await tx.delete(appleAuthChallenges).where(eq(appleAuthChallenges.id, challenge.id));
    if (!challenge || challenge.expiresAt.getTime() <= Date.now()) {
      throw new Error("Apple sign-in challenge has expired.");
    }
    const expectedCredentialHash = Buffer.from(challenge.credentialHash, "utf8");
    const actualCredentialHash = Buffer.from(input.credentialHash, "utf8");
    if (
      expectedCredentialHash.length !== actualCredentialHash.length ||
      !timingSafeEqual(expectedCredentialHash, actualCredentialHash)
    ) {
      throw new Error("Apple sign-in challenge belongs to a different session.");
    }
    return { nonce: challenge.nonce };
  });
}

async function ensureDefaultExercises() {
  const db = await requireDb();
  const existing = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(isNull(exercises.userId))
    .limit(1);
  if (existing[0]) return;
  await db.insert(exercises).values(
    DEFAULT_EXERCISES.map(([name, equipment]) => ({ name, equipment, category: "strength" })),
  );
}

export async function listExercises(userId: number) {
  await ensureDefaultExercises();
  const db = await requireDb();
  return db
    .select()
    .from(exercises)
    .where(or(isNull(exercises.userId), eq(exercises.userId, userId)))
    .orderBy(asc(exercises.name), asc(exercises.equipment));
}

export async function createCustomExercise(userId: number, name: string, equipment: string) {
  const db = await requireDb();
  const result = await db.insert(exercises).values({
    userId,
    name: name.trim(),
    equipment: equipment.trim(),
    category: "strength",
  });
  const id = insertId(result);
  const created = await db.select().from(exercises).where(eq(exercises.id, id)).limit(1);
  if (!created[0]) throw new Error("Custom exercise could not be created.");
  return created[0];
}

export async function getOrCreateExerciseVariant(ownerUserId: number, sourceExerciseId: number, equipment: string) {
  const db = await requireDb();
  const requestedEquipment = equipment.trim();
  const source = await db
    .select()
    .from(exercises)
    .where(
      and(
        eq(exercises.id, sourceExerciseId),
        or(isNull(exercises.userId), eq(exercises.userId, ownerUserId)),
      ),
    )
    .limit(1);
  if (!source[0]) throw new Error("This lift is no longer available.");

  const existing = await db
    .select()
    .from(exercises)
    .where(
      and(
        eq(exercises.name, source[0].name),
        eq(exercises.equipment, requestedEquipment),
        or(isNull(exercises.userId), eq(exercises.userId, ownerUserId)),
      ),
    )
    .orderBy(asc(exercises.userId))
    .limit(1);
  if (existing[0]) return existing[0];
  return createCustomExercise(ownerUserId, source[0].name, requestedEquipment);
}

export async function assertCanManageExerciseOwner(requesterUserId: number, ownerUserId: number) {
  if (requesterUserId === ownerUserId) return;
  await assertCoachClient(requesterUserId, ownerUserId);
}

async function assertAvailableExercises(userId: number, ids: number[]) {
  if (!ids.length) return;
  const db = await requireDb();
  const available = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(
      and(
        inArray(exercises.id, ids),
        or(isNull(exercises.userId), eq(exercises.userId, userId)),
      ),
    );
  if (available.length !== new Set(ids).size) throw new Error("One or more exercises are unavailable.");
}

async function replaceWorkoutPlan(
  workoutId: number,
  userId: number,
  input: WorkoutPlanInput,
  completed: boolean,
) {
  const db = await requireDb();
  const settings = await getUserSettings(userId);
  await assertAvailableExercises(
    userId,
    input.exercises.map((item) => item.exerciseId),
  );

  const existingEntries = await db
    .select({ id: workoutExercises.id })
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId));
  if (existingEntries.length) {
    await db
      .delete(workoutSets)
      .where(inArray(workoutSets.workoutExerciseId, existingEntries.map((entry) => entry.id)));
  }
  await db.delete(workoutExercises).where(eq(workoutExercises.workoutId, workoutId));

  for (const [exerciseIndex, exerciseInput] of input.exercises.entries()) {
    const exerciseResult = await db.insert(workoutExercises).values({
      workoutId,
      exerciseId: exerciseInput.exerciseId,
      sortOrder: exerciseIndex,
      plannedPercent: exerciseInput.plannedPercent ?? null,
      plannedWeightKg:
        exerciseInput.plannedWeight === null || exerciseInput.plannedWeight === undefined
          ? null
          : toKilograms(exerciseInput.plannedWeight, settings.unit),
      targetRpe: exerciseInput.targetRpe ?? null,
    });
    const workoutExerciseId = insertId(exerciseResult);
    if (exerciseInput.sets.length) {
      await db.insert(workoutSets).values(
        exerciseInput.sets.map((set, setIndex) => ({
          workoutExerciseId,
          sortOrder: setIndex,
          targetReps: set.targetReps,
          actualReps:
            set.actualReps === null || set.actualReps === undefined
              ? completed && set.actualWeight !== null && set.actualWeight !== undefined
                ? set.targetReps
                : null
              : set.actualReps,
          actualWeight: set.actualWeight ?? null,
          actualWeightKg:
            set.actualWeight === null || set.actualWeight === undefined
              ? null
              : toKilograms(set.actualWeight, settings.unit),
          rpe: set.rpe ?? null,
        })),
      );
    }
  }

  await db
    .update(workouts)
    .set({
      name: input.name.trim() || "Workout",
      notes: input.notes?.trim() || null,
      isPrivate: input.isPrivate ? 1 : 0,
      completedAt: completed ? new Date() : null,
      ...(input.durationSeconds !== undefined ? { durationSeconds: input.durationSeconds } : {}),
      ...(completed ? { activeProgramWorkoutId: null } : {}),
    })
    .where(eq(workouts.id, workoutId));
}

export async function createEmptyWorkout(userId: number) {
  const db = await requireDb();
  const result = await db.insert(workouts).values({ userId, name: "Workout" });
  return getWorkout(userId, insertId(result));
}

export async function createWorkoutFromPlan(userId: number, input: WorkoutPlanInput, programWorkoutId?: number) {
  const db = await requireDb();
  let result: unknown;
  try {
    result = await db.insert(workouts).values({
      userId,
      programWorkoutId: programWorkoutId ?? null,
      activeProgramWorkoutId: programWorkoutId ?? null,
      name: input.name.trim() || "Workout",
    });
  } catch (error) {
    if (programWorkoutId) {
      const existing = await db
        .select({ id: workouts.id })
        .from(workouts)
        .where(and(eq(workouts.userId, userId), eq(workouts.activeProgramWorkoutId, programWorkoutId)))
        .limit(1);
      if (existing[0]) return getWorkout(userId, existing[0].id);
    }
    throw error;
  }
  const workoutId = insertId(result);
  await replaceWorkoutPlan(workoutId, userId, input, false);
  return getWorkout(userId, workoutId);
}

export async function getWorkoutByClientKey(userId: number, clientKey: string) {
  const database = await requireDb();
  const rows = await database
    .select({ id: workouts.id, userId: workouts.userId })
    .from(workouts)
    .where(eq(workouts.clientKey, clientKey))
    .limit(1);
  const workout = rows[0];
  if (!workout) return null;
  if (workout.userId !== userId) throw new Error("This workout sync key belongs to another account.");
  return getWorkout(userId, workout.id);
}

async function requireWorkout(userId: number, workoutId: number) {
  const workout = await getWorkout(userId, workoutId);
  if (!workout) throw new Error("Workout sync could not be completed.");
  return workout;
}

export async function syncGuestWorkout(userId: number, input: GuestWorkoutSyncInput) {
  const database = await requireDb();
  const completedAt = new Date(input.performedAt.getTime() + input.durationSeconds * 1000);
  let workoutId: number;
  try {
    workoutId = await database.transaction(async (tx) => {
      const prior = await tx
        .select({ id: workouts.id, userId: workouts.userId })
        .from(workouts)
        .where(eq(workouts.clientKey, input.clientKey))
        .limit(1)
        .for("update");
      if (prior[0]) {
        if (prior[0].userId !== userId) throw new Error("This workout sync key belongs to another account.");
        return prior[0].id;
      }

      const settings = {
        unit: input.unit,
        unitChosen: 1,
        ...(input.days !== undefined ? { firstWeekDays: input.days } : {}),
      };
      await tx.insert(userSettings).values({ userId, ...settings }).onDuplicateKeyUpdate({ set: settings });
      const result = await tx.insert(workouts).values({
        userId,
        clientKey: input.clientKey,
        name: input.name.trim() || "First workout",
        performedAt: input.performedAt,
        completedAt,
        durationSeconds: input.durationSeconds,
        isPrivate: 1,
      });
      const id = insertId(result);
      const available = await tx
        .select({ id: exercises.id })
        .from(exercises)
        .where(
          and(
            inArray(exercises.id, input.exercises.map((exercise) => exercise.exerciseId)),
            or(isNull(exercises.userId), eq(exercises.userId, userId)),
          ),
        );
      if (available.length !== new Set(input.exercises.map((exercise) => exercise.exerciseId)).size) {
        throw new Error("One or more exercises are unavailable.");
      }

      for (const [exerciseIndex, exerciseInput] of input.exercises.entries()) {
        const exerciseResult = await tx.insert(workoutExercises).values({
          workoutId: id,
          exerciseId: exerciseInput.exerciseId,
          sortOrder: exerciseIndex,
          plannedPercent: exerciseInput.plannedPercent ?? null,
          plannedWeightKg:
            exerciseInput.plannedWeight === null || exerciseInput.plannedWeight === undefined
              ? null
              : toKilograms(exerciseInput.plannedWeight, input.unit),
          targetRpe: exerciseInput.targetRpe ?? null,
        });
        const workoutExerciseId = insertId(exerciseResult);
        await tx.insert(workoutSets).values(
          exerciseInput.sets.map((set, setIndex) => ({
            workoutExerciseId,
            sortOrder: setIndex,
            targetReps: set.targetReps,
            actualReps:
              set.actualReps === null || set.actualReps === undefined
                ? set.actualWeight === null || set.actualWeight === undefined
                  ? null
                  : set.targetReps
                : set.actualReps,
            actualWeight: set.actualWeight ?? null,
            actualWeightKg:
              set.actualWeight === null || set.actualWeight === undefined
                ? null
                : toKilograms(set.actualWeight, input.unit),
            rpe: set.rpe ?? null,
          })),
        );
      }
      return id;
    });
  } catch (error) {
    // A concurrent request may win the unique clientKey race after the initial read. Re-read only
    // the exact key and require the same owner; never attach another user's workout to this session.
    const raced = await getWorkoutByClientKey(userId, input.clientKey);
    if (raced) return raced;
    throw error;
  }
  return requireWorkout(userId, workoutId);
}

export async function saveWorkout(
  userId: number,
  workoutId: number,
  input: WorkoutPlanInput,
  completed: boolean,
) {
  const db = await requireDb();
  const owned = await db
    .select({ id: workouts.id, completedAt: workouts.completedAt, isPrivate: workouts.isPrivate })
    .from(workouts)
    .where(and(eq(workouts.id, workoutId), eq(workouts.userId, userId)))
    .limit(1);
  if (!owned[0]) throw new Error("Workout not found.");
  await replaceWorkoutPlan(workoutId, userId, input, completed);
  if (completed && owned[0].completedAt) await db.update(workouts).set({ completedAt: owned[0].completedAt }).where(eq(workouts.id, workoutId));
  const saved = await getWorkout(userId, workoutId);
  if (completed && saved) {
    if (saved.isPrivate) {
      await removeFriendActivitiesForWorkout(userId, saved.id);
    } else {
      await publishFriendActivitiesForWorkout(userId, saved);
      await resolveChallengesForWorkout(userId, saved);
    }
  }
  return saved;
}

export async function getWorkout(userId: number, workoutId: number) {
  const db = await requireDb();
  const workoutRows = await db
    .select()
    .from(workouts)
    .where(and(eq(workouts.id, workoutId), eq(workouts.userId, userId)))
    .limit(1);
  const workout = workoutRows[0];
  if (!workout) return null;

  const entries = await db
    .select({ entry: workoutExercises, exercise: exercises })
    .from(workoutExercises)
    .innerJoin(exercises, eq(workoutExercises.exerciseId, exercises.id))
    .where(eq(workoutExercises.workoutId, workoutId))
    .orderBy(asc(workoutExercises.sortOrder));
  const entryIds = entries.map((item) => item.entry.id);
  const sets = entryIds.length
    ? await db
        .select()
        .from(workoutSets)
        .where(inArray(workoutSets.workoutExerciseId, entryIds))
        .orderBy(asc(workoutSets.sortOrder))
    : [];
  const settings = await getUserSettings(userId);
  const displaySets = sets.map((set) => ({
    ...set,
    actualWeight:
      set.actualWeightKg === null || set.actualWeightKg === undefined
        ? set.actualWeight
        : fromKilograms(Number(set.actualWeightKg), settings.unit),
  }));

  return {
    ...workout,
    exercises: entries.map(({ entry, exercise }) => ({
      ...entry,
      plannedWeight:
        entry.plannedWeightKg === null || entry.plannedWeightKg === undefined
          ? null
          : fromKilograms(Number(entry.plannedWeightKg), settings.unit),
      exercise,
      sets: displaySets.filter((set) => set.workoutExerciseId === entry.id),
    })),
  };
}

export async function listRecentWorkouts(userId: number) {
  const db = await requireDb();
  const empty = await db.select({ id: workouts.id }).from(workouts)
    .leftJoin(workoutExercises, eq(workoutExercises.workoutId, workouts.id))
    .where(and(eq(workouts.userId, userId), isNull(workouts.completedAt), isNull(workoutExercises.id)));
  if (empty.length) await db.delete(workouts).where(inArray(workouts.id, empty.map(item => item.id)));
  return db
    .select()
    .from(workouts)
    .where(eq(workouts.userId, userId))
    .orderBy(desc(workouts.performedAt))
    .limit(12);
}

export async function deleteWorkout(userId: number, workoutId: number) {
  const db = await requireDb();
  const owned = await db
    .select({ id: workouts.id })
    .from(workouts)
    .where(and(eq(workouts.id, workoutId), eq(workouts.userId, userId)))
    .limit(1);
  if (!owned[0]) throw new Error("Workout not found.");

  await removeFriendActivitiesForWorkout(userId, workoutId);

  const entries = await db
    .select({ id: workoutExercises.id })
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId));
  if (entries.length) {
    await db
      .delete(workoutSets)
      .where(inArray(workoutSets.workoutExerciseId, entries.map((entry) => entry.id)));
  }
  await db.delete(workoutExercises).where(eq(workoutExercises.workoutId, workoutId));
  await db.delete(workouts).where(and(eq(workouts.id, workoutId), eq(workouts.userId, userId)));
  return { success: true } as const;
}

export async function copyWorkoutToToday(userId: number, sourceWorkoutId: number) {
  const source = await getWorkout(userId, sourceWorkoutId);
  if (!source) throw new Error("Workout not found.");
  return createWorkoutFromPlan(userId, {
    name: source.name,
    notes: source.notes,
    exercises: freshPlanFromEntries(source.exercises),
  });
}

export async function createTemplate(userId: number, input: WorkoutPlanInput) {
  const db = await requireDb();
  await assertAvailableExercises(
    userId,
    input.exercises.map((item) => item.exerciseId),
  );
  const templateResult = await db.insert(workoutTemplates).values({
    userId,
    name: input.name.trim() || "Workout template",
  });
  const templateId = insertId(templateResult);

  for (const [exerciseIndex, exerciseInput] of input.exercises.entries()) {
    const entryResult = await db.insert(templateExercises).values({
      templateId,
      exerciseId: exerciseInput.exerciseId,
      sortOrder: exerciseIndex,
      plannedPercent: exerciseInput.plannedPercent ?? null,
    });
    const templateExerciseId = insertId(entryResult);
    if (exerciseInput.sets.length) {
      await db.insert(templateSets).values(
        exerciseInput.sets.map((set, setIndex) => ({
          templateExerciseId,
          sortOrder: setIndex,
          targetReps: set.targetReps,
        })),
      );
    }
  }
  return getTemplate(userId, templateId);
}

export async function listTemplates(userId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(workoutTemplates)
    .where(eq(workoutTemplates.userId, userId))
    .orderBy(desc(workoutTemplates.updatedAt));
}

export async function deleteTemplate(userId: number, templateId: number) {
  const db = await requireDb();
  const owned = await db
    .select({ id: workoutTemplates.id })
    .from(workoutTemplates)
    .where(and(eq(workoutTemplates.id, templateId), eq(workoutTemplates.userId, userId)))
    .limit(1);
  if (!owned[0]) throw new Error("Template not found.");

  const entries = await db
    .select({ id: templateExercises.id })
    .from(templateExercises)
    .where(eq(templateExercises.templateId, templateId));
  if (entries.length) {
    await db
      .delete(templateSets)
      .where(inArray(templateSets.templateExerciseId, entries.map((entry) => entry.id)));
  }
  await db.delete(templateExercises).where(eq(templateExercises.templateId, templateId));
  await db
    .delete(workoutTemplates)
    .where(and(eq(workoutTemplates.id, templateId), eq(workoutTemplates.userId, userId)));
  return { success: true } as const;
}

export async function getTemplate(userId: number, templateId: number) {
  const db = await requireDb();
  const templateRows = await db
    .select()
    .from(workoutTemplates)
    .where(and(eq(workoutTemplates.id, templateId), eq(workoutTemplates.userId, userId)))
    .limit(1);
  const template = templateRows[0];
  if (!template) return null;
  const entries = await db
    .select({ entry: templateExercises, exercise: exercises })
    .from(templateExercises)
    .innerJoin(exercises, eq(templateExercises.exerciseId, exercises.id))
    .where(eq(templateExercises.templateId, templateId))
    .orderBy(asc(templateExercises.sortOrder));
  const entryIds = entries.map((item) => item.entry.id);
  const sets = entryIds.length
    ? await db
        .select()
        .from(templateSets)
        .where(inArray(templateSets.templateExerciseId, entryIds))
        .orderBy(asc(templateSets.sortOrder))
    : [];
  return {
    ...template,
    exercises: entries.map(({ entry, exercise }) => ({
      ...entry,
      exercise,
      sets: sets.filter((set) => set.templateExerciseId === entry.id),
    })),
  };
}

export async function useTemplate(userId: number, templateId: number) {
  const template = await getTemplate(userId, templateId);
  if (!template) throw new Error("Template not found.");
  return createWorkoutFromPlan(userId, {
    name: template.name,
    exercises: freshPlanFromEntries(template.exercises),
  });
}

async function getManageableProgramWeek(userId: number, weekId: number) {
  const db = await requireDb();
  const rows = await db
    .select({ week: programWeeks, program: trainingPrograms })
    .from(programWeeks)
    .innerJoin(trainingPrograms, eq(programWeeks.programId, trainingPrograms.id))
    .where(and(eq(programWeeks.id, weekId), or(eq(trainingPrograms.userId, userId), eq(trainingPrograms.managedByTrainerId, userId))))
    .limit(1);
  return rows[0] ?? null;
}

export async function getProgram(userId: number, programId: number) {
  const db = await requireDb();
  const programRows = await db
    .select()
    .from(trainingPrograms)
    .where(and(eq(trainingPrograms.id, programId), or(eq(trainingPrograms.userId, userId), eq(trainingPrograms.managedByTrainerId, userId))))
    .limit(1);
  const program = programRows[0];
  if (!program) return null;

  const weeks = await db
    .select()
    .from(programWeeks)
    .where(eq(programWeeks.programId, program.id))
    .orderBy(asc(programWeeks.weekNumber));
  const weekIds = weeks.map((week) => week.id);
  const planWorkouts = weekIds.length
    ? await db
        .select()
        .from(programWorkouts)
        .where(inArray(programWorkouts.programWeekId, weekIds))
        .orderBy(asc(programWorkouts.dayOfWeek), asc(programWorkouts.sortOrder))
    : [];
  const planWorkoutIds = planWorkouts.map((workout) => workout.id);
  const linkedSessions = planWorkoutIds.length
    ? await db
        .select({
          id: workouts.id,
          programWorkoutId: workouts.programWorkoutId,
          performedAt: workouts.performedAt,
          completedAt: workouts.completedAt,
        })
        .from(workouts)
        .where(and(eq(workouts.userId, program.userId), inArray(workouts.programWorkoutId, planWorkoutIds)))
        .orderBy(desc(workouts.performedAt))
    : [];
  const skippedSessions = planWorkoutIds.length
    ? await db
        .select({ programWorkoutId: programWorkoutSkips.programWorkoutId, skippedAt: programWorkoutSkips.skippedAt })
        .from(programWorkoutSkips)
        .where(and(eq(programWorkoutSkips.userId, program.userId), inArray(programWorkoutSkips.programWorkoutId, planWorkoutIds)))
    : [];
  const entries = planWorkoutIds.length
    ? await db
        .select({ entry: programExercises, exercise: exercises })
        .from(programExercises)
        .innerJoin(exercises, eq(programExercises.exerciseId, exercises.id))
        .where(inArray(programExercises.programWorkoutId, planWorkoutIds))
        .orderBy(asc(programExercises.sortOrder))
    : [];
  const entryIds = entries.map((entry) => entry.entry.id);
  const sets = entryIds.length
    ? await db
        .select()
        .from(programSets)
        .where(inArray(programSets.programExerciseId, entryIds))
        .orderBy(asc(programSets.sortOrder))
    : [];
  const settings = await getUserSettings(program.userId);

  return {
    ...program,
    ownerUserId: program.userId,
    ownerUnit: settings.unit,
    weeks: weeks.map((week) => ({
      ...week,
      workouts: planWorkouts
        .filter((workout) => workout.programWeekId === week.id)
        .map((workout) => ({
          ...workout,
          latestSession: linkedSessions.find((session) => session.programWorkoutId === workout.id) ?? null,
          skippedAt: skippedSessions.find((skip) => skip.programWorkoutId === workout.id)?.skippedAt ?? null,
          exercises: entries
            .filter((entry) => entry.entry.programWorkoutId === workout.id)
            .map(({ entry, exercise }) => ({
              ...entry,
              plannedWeight:
                entry.plannedWeightKg === null || entry.plannedWeightKg === undefined
                  ? null
                  : fromKilograms(Number(entry.plannedWeightKg), settings.unit),
              exercise,
              sets: sets.filter((set) => set.programExerciseId === entry.id),
            })),
        })),
    })),
  };
}

export async function getActiveProgram(userId: number) {
  const db = await requireDb();
  const rows = await db
    .select({ id: trainingPrograms.id })
    .from(trainingPrograms)
    .where(and(eq(trainingPrograms.userId, userId), eq(trainingPrograms.isActive, 1)))
    .orderBy(desc(trainingPrograms.updatedAt))
    .limit(1);
  return rows[0] ? getProgram(userId, rows[0].id) : null;
}

export async function archiveProgram(userId: number, programId: number) {
  const db = await requireDb();
  const owned = await db
    .select({ id: trainingPrograms.id })
    .from(trainingPrograms)
    .where(and(eq(trainingPrograms.id, programId), eq(trainingPrograms.userId, userId)))
    .limit(1);
  if (!owned[0]) throw new Error("Plan not found.");

  // Archiving only removes the plan from the active Plan view. Its planned
  // sessions and every completed workout remain available in workout history
  // and Progress, so athletes never lose training data by cleaning up a plan.
  await db.update(trainingPrograms).set({ isActive: 0 }).where(eq(trainingPrograms.id, programId));
  return { success: true } as const;
}

export async function createProgram(userId: number, name: string) {
  const db = await requireDb();
  await db.update(trainingPrograms).set({ isActive: 0 }).where(eq(trainingPrograms.userId, userId));
  const programResult = await db.insert(trainingPrograms).values({
    userId,
    name: name.trim() || "My training plan",
    isActive: 1,
  });
  const programId = insertId(programResult);
  await db.insert(programWeeks).values({ programId, weekNumber: 1, name: "Week 1" });
  const program = await getProgram(userId, programId);
  if (!program) throw new Error("Program could not be created.");
  return program;
}

export async function createProgramForClient(trainerId: number, athleteId: number, name: string) {
  const db = await requireDb();
  const relationship = await db
    .select({ id: trainerClients.id })
    .from(trainerClients)
    .where(and(eq(trainerClients.trainerId, trainerId), eq(trainerClients.athleteId, athleteId)))
    .limit(1);
  if (!relationship[0]) throw new Error("You can create plans only for athletes who accepted your invitation.");
  await db.update(trainingPrograms).set({ isActive: 0 }).where(eq(trainingPrograms.userId, athleteId));
  const programResult = await db.insert(trainingPrograms).values({
    userId: athleteId,
    managedByTrainerId: trainerId,
    name: name.trim() || "Coach-created plan",
    isActive: 1,
  });
  const programId = insertId(programResult);
  await db.insert(programWeeks).values({ programId, weekNumber: 1, name: "Week 1" });
  const program = await getProgram(trainerId, programId);
  if (!program) throw new Error("Client plan could not be created.");
  return program;
}

export async function createPlanImport(userId: number, input: { fileName: string; mimeType: string; storageKey: string }) {
  const db = await requireDb();
  const result = await db.insert(planImports).values({
    userId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    storageKey: input.storageKey,
    status: "uploaded",
  });
  return getPlanImport(userId, insertId(result));
}

export async function getPlanImport(userId: number, importId: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(planImports)
    .where(and(eq(planImports.id, importId), eq(planImports.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function canAccessPlanSource(userId: number, storageKey: string) {
  const db = await requireDb();
  const imported = await db
    .select({ id: planImports.id })
    .from(planImports)
    .where(and(eq(planImports.userId, userId), eq(planImports.storageKey, storageKey)))
    .limit(1);
  if (imported[0]) return true;
  const program = await db
    .select({ id: trainingPrograms.id })
    .from(trainingPrograms)
    .where(and(eq(trainingPrograms.userId, userId), eq(trainingPrograms.sourceStorageKey, storageKey)))
    .limit(1);
  return Boolean(program[0]);
}

export async function savePlanImportAnalysis(userId: number, importId: number, extractedJson: string) {
  const source = await getPlanImport(userId, importId);
  if (!source) throw new Error("Imported plan not found.");
  const db = await requireDb();
  await db
    .update(planImports)
    .set({ status: "analyzed", extractedJson })
    .where(and(eq(planImports.id, importId), eq(planImports.userId, userId)));
  return getPlanImport(userId, importId);
}

export async function markPlanImportFailed(userId: number, importId: number) {
  const db = await requireDb();
  await db
    .update(planImports)
    .set({ status: "failed" })
    .where(and(eq(planImports.id, importId), eq(planImports.userId, userId)));
}

async function findOrCreateImportedExercise(userId: number, name: string, equipment: string) {
  await ensureDefaultExercises();
  const db = await requireDb();
  const rows = await db
    .select()
    .from(exercises)
    .where(
      and(
        eq(exercises.name, name.trim()),
        eq(exercises.equipment, equipment.trim()),
        or(isNull(exercises.userId), eq(exercises.userId, userId)),
      ),
    )
    .limit(1);
  if (rows[0]) return rows[0];
  return createCustomExercise(userId, name.trim(), equipment.trim() || "Other");
}

async function addImportedWeeksToProgram(userId: number, programId: number, startWeekNumber: number, weeks: ImportedProgramInput["weeks"]) {
  const settings = await getUserSettings(userId);
  for (const [weekIndex, weekInput] of weeks.entries()) {
    const weekNumber = startWeekNumber + weekIndex + 1;
    const weekResult = await (await requireDb()).insert(programWeeks).values({
      programId,
      weekNumber,
      name: weekInput.name.trim() || `Week ${weekNumber}`,
    });
    const weekId = insertId(weekResult);
    for (const workoutInput of weekInput.workouts) {
      const workout = await createProgramWorkout(userId, weekId, {
        name: workoutInput.name,
        dayOfWeek: workoutInput.dayOfWeek,
      });
      const planExercises = await Promise.all(workoutInput.exercises.map(async (exercise) => {
        const catalogExercise = await findOrCreateImportedExercise(userId, exercise.name, exercise.equipment || "Other");
        return {
          exerciseId: catalogExercise.id,
          prescriptionMode: exercise.prescriptionMode,
          intensityPercent: exercise.intensityPercent,
          plannedWeight: exercise.plannedWeight === null || exercise.plannedWeight === undefined
            ? null
            : exercise.weightUnit && exercise.weightUnit !== settings.unit
              ? fromKilograms(toKilograms(exercise.plannedWeight, exercise.weightUnit), settings.unit)
              : exercise.plannedWeight,
          targetRpe: exercise.targetRpe,
          sets: exercise.sets,
        };
      }));
      await saveProgramWorkout(userId, workout.id, {
        name: workoutInput.name,
        dayOfWeek: workoutInput.dayOfWeek,
        exercises: planExercises,
      });
    }
  }
}

export async function createProgramFromImport(userId: number, importId: number, input: ImportedProgramInput) {
  const source = await getPlanImport(userId, importId);
  if (!source) throw new Error("Imported plan not found.");
  const db = await requireDb();
  await db.update(trainingPrograms).set({ isActive: 0 }).where(eq(trainingPrograms.userId, userId));
  const programResult = await db.insert(trainingPrograms).values({
    userId,
    name: input.name.trim() || "Imported workout plan",
    notes: input.trainerNotes?.trim() || null,
    sourceStorageKey: source.storageKey,
    isActive: 1,
  });
  const programId = insertId(programResult);
  await addImportedWeeksToProgram(userId, programId, 0, input.weeks);
  const program = await getProgram(userId, programId);
  if (!program) throw new Error("Imported plan could not be created.");
  return program;
}

export async function appendProgramWeeksFromImport(userId: number, programId: number, importId: number, input: ImportedProgramInput) {
  const source = await getPlanImport(userId, importId);
  if (!source) throw new Error("Imported plan not found.");
  const program = await getProgram(userId, programId);
  if (!program || program.ownerUserId !== userId || !program.isActive) throw new Error("Open your active plan before adding imported weeks.");

  await addImportedWeeksToProgram(userId, programId, Math.max(0, ...program.weeks.map((week) => week.weekNumber)), input.weeks);
  const importedNotes = input.trainerNotes?.trim();
  if (importedNotes) {
    const notes = [program.notes?.trim(), importedNotes].filter(Boolean).join("\n\n");
    await (await requireDb()).update(trainingPrograms).set({ notes }).where(eq(trainingPrograms.id, programId));
  }
  const updated = await getProgram(userId, programId);
  if (!updated) throw new Error("The imported week could not be added to your plan.");
  return updated;
}

export async function getProgramWorkout(userId: number, programWorkoutId: number) {
  const db = await requireDb();
  const rows = await db
    .select({ programId: trainingPrograms.id })
    .from(programWorkouts)
    .innerJoin(programWeeks, eq(programWorkouts.programWeekId, programWeeks.id))
    .innerJoin(trainingPrograms, eq(programWeeks.programId, trainingPrograms.id))
    .where(and(eq(programWorkouts.id, programWorkoutId), or(eq(trainingPrograms.userId, userId), eq(trainingPrograms.managedByTrainerId, userId))))
    .limit(1);
  if (!rows[0]) return null;
  const program = await getProgram(userId, rows[0].programId);
  if (!program) return null;
  for (const week of program.weeks) {
    const workout = week.workouts.find((item) => item.id === programWorkoutId);
    if (workout) return { ...workout, ownerUserId: program.ownerUserId, ownerUnit: program.ownerUnit, week, program: { id: program.id, name: program.name } };
  }
  return null;
}

export async function createProgramWorkout(userId: number, weekId: number, input: { name: string; dayOfWeek: number }) {
  const ownedWeek = await getManageableProgramWeek(userId, weekId);
  if (!ownedWeek) throw new Error("Plan week not found.");
  const db = await requireDb();
  const existing = await db
    .select({ id: programWorkouts.id })
    .from(programWorkouts)
    .where(eq(programWorkouts.programWeekId, weekId));
  const result = await db.insert(programWorkouts).values({
    programWeekId: weekId,
    dayOfWeek: input.dayOfWeek,
    name: input.name.trim() || "Planned workout",
    sortOrder: existing.length,
  });
  const workout = await getProgramWorkout(userId, insertId(result));
  if (!workout) throw new Error("Plan workout could not be created.");
  return workout;
}

export async function saveProgramWorkout(userId: number, programWorkoutId: number, input: ProgramWorkoutInput) {
  const workout = await getProgramWorkout(userId, programWorkoutId);
  if (!workout) throw new Error("Plan workout not found.");
  const db = await requireDb();
  const settings = await getUserSettings(workout.ownerUserId);
  await assertAvailableExercises(workout.ownerUserId, input.exercises.map((exercise) => exercise.exerciseId));

  const existing = await db
    .select({ id: programExercises.id })
    .from(programExercises)
    .where(eq(programExercises.programWorkoutId, programWorkoutId));
  if (existing.length) {
    await db
      .delete(programSets)
      .where(inArray(programSets.programExerciseId, existing.map((exercise) => exercise.id)));
  }
  await db.delete(programExercises).where(eq(programExercises.programWorkoutId, programWorkoutId));
  await db
    .update(programWorkouts)
    .set({ name: input.name.trim() || "Planned workout", dayOfWeek: input.dayOfWeek })
    .where(eq(programWorkouts.id, programWorkoutId));

  for (const [exerciseIndex, exerciseInput] of input.exercises.entries()) {
    const exerciseResult = await db.insert(programExercises).values({
      programWorkoutId,
      exerciseId: exerciseInput.exerciseId,
      sortOrder: exerciseIndex,
      prescriptionMode: exerciseInput.prescriptionMode,
      intensityPercent: exerciseInput.intensityPercent ?? null,
      plannedWeightKg:
        exerciseInput.plannedWeight === null || exerciseInput.plannedWeight === undefined
          ? null
          : toKilograms(exerciseInput.plannedWeight, settings.unit),
      targetRpe: exerciseInput.targetRpe ?? null,
    });
    const programExerciseId = insertId(exerciseResult);
    await db.insert(programSets).values(
      exerciseInput.sets.map((set, setIndex) => ({
        programExerciseId,
        sortOrder: setIndex,
        targetReps: set.targetReps,
      })),
    );
  }
  const saved = await getProgramWorkout(userId, programWorkoutId);
  if (!saved) throw new Error("Plan workout could not be saved.");
  return saved;
}

export async function duplicateProgramWeek(userId: number, sourceWeekId: number) {
  const sourceOwnership = await getManageableProgramWeek(userId, sourceWeekId);
  if (!sourceOwnership) throw new Error("Plan week not found.");
  const program = await getProgram(userId, sourceOwnership.program.id);
  const sourceWeek = program?.weeks.find((week) => week.id === sourceWeekId);
  if (!program || !sourceWeek) throw new Error("Plan week not found.");
  const nextWeekNumber = Math.max(...program.weeks.map((week) => week.weekNumber)) + 1;
  const db = await requireDb();
  const weekResult = await db.insert(programWeeks).values({
    programId: program.id,
    weekNumber: nextWeekNumber,
    name: `Week ${nextWeekNumber}`,
  });
  const newWeekId = insertId(weekResult);
  for (const sourceWorkout of sourceWeek.workouts) {
    const copied = await createProgramWorkout(userId, newWeekId, {
      name: sourceWorkout.name,
      dayOfWeek: sourceWorkout.dayOfWeek,
    });
    await saveProgramWorkout(userId, copied.id, {
      name: sourceWorkout.name,
      dayOfWeek: sourceWorkout.dayOfWeek,
      exercises: sourceWorkout.exercises.map((exercise) => ({
        exerciseId: exercise.exerciseId,
        prescriptionMode: exercise.prescriptionMode,
        intensityPercent: exercise.intensityPercent,
        plannedWeight: exercise.plannedWeight,
        targetRpe: exercise.targetRpe,
        sets: exercise.sets.map((set) => ({ targetReps: set.targetReps })),
      })),
    });
  }
  const copiedProgram = await getProgram(userId, program.id);
  if (!copiedProgram) throw new Error("Week could not be duplicated.");
  return copiedProgram;
}

export async function startProgramWorkout(userId: number, programWorkoutId: number) {
  const planWorkout = await getProgramWorkout(userId, programWorkoutId);
  if (!planWorkout) throw new Error("Plan workout not found.");
  if (planWorkout.ownerUserId !== userId) throw new Error("Only the athlete can start this workout.");
  const db = await requireDb();
  await db
    .delete(programWorkoutSkips)
    .where(and(eq(programWorkoutSkips.userId, userId), eq(programWorkoutSkips.programWorkoutId, programWorkoutId)));
  const existing = await db
    .select({ id: workouts.id })
    .from(workouts)
    .where(and(eq(workouts.userId, userId), eq(workouts.programWorkoutId, programWorkoutId), isNull(workouts.completedAt)))
    .orderBy(desc(workouts.performedAt))
    .limit(1);
  if (existing[0]) return getWorkout(userId, existing[0].id);
  return createWorkoutFromPlan(userId, {
    name: planWorkout.name,
    exercises: planWorkout.exercises.map((exercise) => ({
      exerciseId: exercise.exerciseId,
      plannedPercent: exercise.prescriptionMode === "percent" ? exercise.intensityPercent : null,
      plannedWeight: exercise.prescriptionMode === "weight" ? exercise.plannedWeight : null,
      targetRpe: exercise.targetRpe,
      sets: exercise.sets.map((set) => ({ targetReps: set.targetReps })),
    })),
  }, planWorkout.id);
}

export async function skipProgramWorkout(userId: number, programWorkoutId: number) {
  const planWorkout = await getProgramWorkout(userId, programWorkoutId);
  if (!planWorkout) throw new Error("Plan workout not found.");
  if (planWorkout.ownerUserId !== userId) throw new Error("Only the athlete can skip this workout.");
  const db = await requireDb();
  const sessions = await db
    .select({ id: workouts.id, completedAt: workouts.completedAt })
    .from(workouts)
    .where(and(eq(workouts.userId, userId), eq(workouts.programWorkoutId, programWorkoutId)))
    .orderBy(desc(workouts.performedAt))
    .limit(1);
  if (sessions[0]?.completedAt) throw new Error("Completed workouts cannot be skipped.");
  if (sessions[0]) throw new Error("Discard the in-progress workout before skipping this day.");

  const existing = await db
    .select({ id: programWorkoutSkips.id })
    .from(programWorkoutSkips)
    .where(and(eq(programWorkoutSkips.userId, userId), eq(programWorkoutSkips.programWorkoutId, programWorkoutId)))
    .limit(1);
  if (existing[0]) {
    await db.update(programWorkoutSkips).set({ skippedAt: new Date() }).where(eq(programWorkoutSkips.id, existing[0].id));
  } else {
    await db.insert(programWorkoutSkips).values({ userId, programWorkoutId });
  }
  return { success: true } as const;
}

export async function undoSkipProgramWorkout(userId: number, programWorkoutId: number) {
  const planWorkout = await getProgramWorkout(userId, programWorkoutId);
  if (!planWorkout) throw new Error("Plan workout not found.");
  if (planWorkout.ownerUserId !== userId) throw new Error("Only the athlete can update this day.");
  const db = await requireDb();
  await db
    .delete(programWorkoutSkips)
    .where(and(eq(programWorkoutSkips.userId, userId), eq(programWorkoutSkips.programWorkoutId, programWorkoutId)));
  return { success: true } as const;
}

export async function getProgress(userId: number) {
  const db = await requireDb();
  const settings = await getUserSettings(userId);
  const rows = await db
    .select({
      exerciseId: exercises.id,
      name: exercises.name,
      equipment: exercises.equipment,
      workoutId: workouts.id,
      performedAt: workouts.performedAt,
      setNumber: workoutSets.sortOrder,
      targetReps: workoutSets.targetReps,
      actualWeight: workoutSets.actualWeight,
      actualWeightKg: workoutSets.actualWeightKg,
      actualReps: workoutSets.actualReps,
      rpe: workoutSets.rpe,
    })
    .from(workoutSets)
    .innerJoin(workoutExercises, eq(workoutSets.workoutExerciseId, workoutExercises.id))
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .innerJoin(exercises, eq(workoutExercises.exerciseId, exercises.id))
    .where(
      and(
        eq(workouts.userId, userId),
        isNotNull(workouts.completedAt),
        or(isNotNull(workoutSets.actualWeightKg), isNotNull(workoutSets.actualWeight)),
      ),
    )
    .orderBy(desc(workouts.performedAt), asc(workoutSets.sortOrder));

  const grouped = new Map<
    number,
    {
      exerciseId: number;
      name: string;
      equipment: string;
      currentOneRepMax: number | null;
      currentThreeRepMax: number | null;
      history: Array<{ workoutId: number; performedAt: Date; setNumber: number; targetReps: number; actualWeight: number; actualReps: number; rpe: number | null; estimatedOneRepMax: number | null }>;
    }
  >();

  for (const row of rows) {
    const completedReps = row.actualReps === null || row.actualReps === undefined ? Number(row.targetReps) : Number(row.actualReps);
    if (!Number.isFinite(completedReps) || completedReps <= 0) continue;
    const actualWeightKg =
      row.actualWeightKg === null || row.actualWeightKg === undefined
        ? toKilograms(Number(row.actualWeight), settings.unit)
        : Number(row.actualWeightKg);
    const oneRepMaxKg = estimateOneRepMax(actualWeightKg, completedReps);
    const oneRepMax = oneRepMaxKg ? fromKilograms(oneRepMaxKg, settings.unit) : null;
    const current = grouped.get(row.exerciseId);
    const item = {
      workoutId: row.workoutId,
      performedAt: row.performedAt,
      setNumber: row.setNumber,
      targetReps: row.targetReps,
      actualWeight: fromKilograms(actualWeightKg, settings.unit),
      actualReps: completedReps,
      rpe: row.rpe === null || row.rpe === undefined ? null : Number(row.rpe),
      estimatedOneRepMax: oneRepMax,
    };
    if (current) {
      if (oneRepMax !== null && (current.currentOneRepMax === null || oneRepMax > current.currentOneRepMax)) {
        current.currentOneRepMax = oneRepMax;
        current.currentThreeRepMax = estimateThreeRepMax(oneRepMax);
      }
      current.history.push(item);
    } else {
      grouped.set(row.exerciseId, {
        exerciseId: row.exerciseId,
        name: row.name,
        equipment: row.equipment,
        currentOneRepMax: oneRepMax,
        currentThreeRepMax: oneRepMax === null ? null : estimateThreeRepMax(oneRepMax),
        history: [item],
      });
    }
  }

  return Array.from(grouped.values()).sort((a, b) => (b.currentOneRepMax ?? 0) - (a.currentOneRepMax ?? 0));
}


async function assertCoachClient(trainerId: number, athleteId: number) {
  const db = await requireDb();
  const relationship = await db
    .select({ id: trainerClients.id })
    .from(trainerClients)
    .where(and(eq(trainerClients.trainerId, trainerId), eq(trainerClients.athleteId, athleteId)))
    .limit(1);
  if (!relationship[0]) throw new Error("This athlete has not accepted your invitation.");
}

export async function createCoachInvitation(input: {
  trainerId: number;
  athleteEmail: string;
  tokenHash: string;
  expiresAt: Date;
}) {
  const db = await requireDb();
  const trainerSettings = await getUserSettings(input.trainerId);
  if (!trainerSettings.isTrainer) throw new Error("Switch to Coach mode before inviting an athlete.");
  const existingAthlete = await getUserByEmail(input.athleteEmail);
  await db
    .update(coachInvitations)
    .set({ status: "canceled" })
    .where(and(eq(coachInvitations.trainerId, input.trainerId), eq(coachInvitations.athleteEmail, input.athleteEmail), eq(coachInvitations.status, "pending")));
  const result = await db.insert(coachInvitations).values({
    trainerId: input.trainerId,
    athleteEmail: input.athleteEmail,
    invitedUserId: existingAthlete?.id ?? null,
    tokenHash: input.tokenHash,
    expiresAt: input.expiresAt,
  });
  const id = insertId(result);
  const invitation = await db.select().from(coachInvitations).where(eq(coachInvitations.id, id)).limit(1);
  if (!invitation[0]) throw new Error("Invitation could not be created.");
  return invitation[0];
}

export async function acceptCoachInvitation(input: { athleteId: number; athleteEmail: string; tokenHash: string; accept: boolean }) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(coachInvitations)
    .where(and(eq(coachInvitations.tokenHash, input.tokenHash), eq(coachInvitations.status, "pending")))
    .limit(1);
  const invitation = rows[0];
  if (!invitation || invitation.expiresAt.getTime() <= Date.now()) throw new Error("This invitation has expired. Ask the coach to send a new one.");
  if (invitation.athleteEmail.trim().toLowerCase() !== input.athleteEmail.trim().toLowerCase()) {
    throw new Error("Sign in with the email address the coach invited.");
  }
  const accepted = input.accept;
  await db.transaction(async (tx) => {
    const transitioned = await tx
      .update(coachInvitations)
      .set({ status: accepted ? "accepted" : "declined", invitedUserId: input.athleteId, respondedAt: new Date() })
      .where(and(eq(coachInvitations.id, invitation.id), eq(coachInvitations.status, "pending")));
    if (affectedRows(transitioned) !== 1) throw new Error("This invitation has already been used.");
    if (accepted) {
      await tx
        .insert(trainerClients)
        .values({ trainerId: invitation.trainerId, athleteId: input.athleteId })
        .onDuplicateKeyUpdate({ set: { acceptedAt: new Date() } });
    }
  });
  return { accepted, trainerId: invitation.trainerId };
}

export async function getIncomingCoachInvitations(athleteId: number) {
  const profile = await getAccountProfile(athleteId);
  if (!profile.email) return [];
  const db = await requireDb();
  const rows = await db
    .select({ invitation: coachInvitations, trainerName: users.name, trainerEmail: users.email })
    .from(coachInvitations)
    .innerJoin(users, eq(coachInvitations.trainerId, users.id))
    .where(and(eq(coachInvitations.athleteEmail, profile.email.toLowerCase()), eq(coachInvitations.status, "pending")))
    .orderBy(desc(coachInvitations.createdAt));
  return rows.filter(({ invitation }) => invitation.expiresAt.getTime() > Date.now()).map(({ invitation, trainerName, trainerEmail }) => ({ ...invitation, trainerName, trainerEmail }));
}

export async function listCoachClients(trainerId: number) {
  const db = await requireDb();
  const rows = await db
    .select({ athleteId: trainerClients.athleteId, acceptedAt: trainerClients.acceptedAt, name: users.name, email: users.email })
    .from(trainerClients)
    .innerJoin(users, eq(trainerClients.athleteId, users.id))
    .where(eq(trainerClients.trainerId, trainerId))
    .orderBy(desc(trainerClients.acceptedAt));
  return Promise.all(rows.map(async (client) => {
    const progress = await getProgress(client.athleteId);
    const recent = await listRecentWorkouts(client.athleteId);
    const active = await getActiveProgram(client.athleteId);
    return {
      ...client,
      activeProgramName: active?.name ?? null,
      trackedLifts: progress.length,
      completedWorkouts: recent.filter((workout) => workout.completedAt).length,
      mostRecentWorkoutAt: recent.find((workout) => workout.completedAt)?.performedAt ?? null,
    };
  }));
}

export async function getCoachClient(trainerId: number, athleteId: number) {
  await assertCoachClient(trainerId, athleteId);
  const profile = await getAccountProfile(athleteId);
  const progress = await getProgress(athleteId);
  const db = await requireDb();
  const programRow = await db
    .select({ id: trainingPrograms.id })
    .from(trainingPrograms)
    .where(and(eq(trainingPrograms.userId, athleteId), eq(trainingPrograms.managedByTrainerId, trainerId), eq(trainingPrograms.isActive, 1)))
    .orderBy(desc(trainingPrograms.updatedAt))
    .limit(1);
  const managedProgram = programRow[0] ? await getProgram(trainerId, programRow[0].id) : null;
  const suggestions = await db
    .select()
    .from(coachSuggestions)
    .where(and(eq(coachSuggestions.trainerId, trainerId), eq(coachSuggestions.athleteId, athleteId)))
    .orderBy(desc(coachSuggestions.createdAt))
    .limit(8);
  return { profile, progress, managedProgram, suggestions };
}

export async function createCoachSuggestion(input: { trainerId: number; athleteId: number; title: string; message: string }) {
  await assertCoachClient(input.trainerId, input.athleteId);
  const db = await requireDb();
  const result = await db.insert(coachSuggestions).values({
    trainerId: input.trainerId,
    athleteId: input.athleteId,
    title: input.title.trim(),
    message: input.message.trim(),
  });
  const rows = await db.select().from(coachSuggestions).where(eq(coachSuggestions.id, insertId(result))).limit(1);
  if (!rows[0]) throw new Error("Suggestion could not be saved.");
  return rows[0];
}

export async function getAthleteSuggestions(athleteId: number) {
  const db = await requireDb();
  const rows = await db
    .select({ suggestion: coachSuggestions, trainerName: users.name })
    .from(coachSuggestions)
    .innerJoin(users, eq(coachSuggestions.trainerId, users.id))
    .where(eq(coachSuggestions.athleteId, athleteId))
    .orderBy(desc(coachSuggestions.createdAt))
    .limit(6);
  return rows.map(({ suggestion, trainerName }) => ({ ...suggestion, trainerName }));
}

export async function getVisibleProgress(viewerId: number, athleteId?: number) {
  const subjectId = athleteId ?? viewerId;
  if (subjectId !== viewerId) await assertCoachClient(viewerId, subjectId);
  return getProgress(subjectId);
}

export async function exportAccountData(userId: number) {
  const db = await requireDb();
  const profile = await getAccountProfile(userId);
  const workoutRows = await db.select({ id: workouts.id }).from(workouts).where(eq(workouts.userId, userId)).orderBy(desc(workouts.performedAt));
  const fullWorkouts = await Promise.all(workoutRows.map((workout) => getWorkout(userId, workout.id)));
  const templateRows = await db.select({ id: workoutTemplates.id }).from(workoutTemplates).where(eq(workoutTemplates.userId, userId));
  const templates = await Promise.all(templateRows.map((template) => getTemplate(userId, template.id)));
  const programs = await db.select({ id: trainingPrograms.id }).from(trainingPrograms).where(eq(trainingPrograms.userId, userId));
  const fullPrograms = await Promise.all(programs.map((program) => getProgram(userId, program.id)));
  const socialActivityRows = await db
    .select()
    .from(friendActivities)
    .where(
      or(
        eq(friendActivities.actorId, userId),
        and(eq(friendActivities.kind, "challenge_win"), eq(friendActivities.opponentId, userId)),
      ),
    );
  const socialActivityIds = socialActivityRows.map((activity) => activity.id);
  const socialReactions = await db
    .select()
    .from(activityReactions)
    .where(socialActivityIds.length ? or(eq(activityReactions.userId, userId), inArray(activityReactions.activityId, socialActivityIds)) : eq(activityReactions.userId, userId));
  const socialComments = await db
    .select()
    .from(activityComments)
    .where(socialActivityIds.length ? or(eq(activityComments.authorId, userId), inArray(activityComments.activityId, socialActivityIds)) : eq(activityComments.authorId, userId));
  const [socialBlocks, socialMutes, socialNudgeRows, socialNudgeLockRows, socialNoticeRows, inviteAliases] = await Promise.all([
    db.select().from(friendBlocks).where(or(eq(friendBlocks.blockerId, userId), eq(friendBlocks.blockedId, userId))),
    db.select().from(friendMutes).where(or(eq(friendMutes.userId, userId), eq(friendMutes.mutedUserId, userId))),
    db.select().from(friendNudges).where(or(eq(friendNudges.senderId, userId), eq(friendNudges.recipientId, userId))),
    db.select().from(friendNudgeLocks).where(or(eq(friendNudgeLocks.senderId, userId), eq(friendNudgeLocks.recipientId, userId))),
    db.select().from(socialNotices).where(or(eq(socialNotices.recipientId, userId), eq(socialNotices.actorId, userId))),
    db.select().from(guestInviteAliases).where(eq(guestInviteAliases.targetUserId, userId)),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    account: profile,
    workouts: fullWorkouts.filter(Boolean),
    templates: templates.filter(Boolean),
    programs: fullPrograms.filter(Boolean),
    progress: await getProgress(userId),
    athleteSuggestions: await getAthleteSuggestions(userId),
    friends: {
      profile: await getSocialProfile(userId),
      connections: await getFriendConnectionsForUser(userId),
      activities: socialActivityRows,
      reactions: socialReactions,
      comments: socialComments,
      challenges: await getLiftChallenges(userId, { includeHistory: true }),
      blocks: socialBlocks,
      mutes: socialMutes,
      nudges: socialNudgeRows,
      nudgeLocks: socialNudgeLockRows,
      notices: socialNoticeRows,
      inviteAliases,
    },
  };
}

async function deleteProgramGraph(programIds: number[]) {
  if (!programIds.length) return;
  const db = await requireDb();
  const weeks = await db.select({ id: programWeeks.id }).from(programWeeks).where(inArray(programWeeks.programId, programIds));
  const weekIds = weeks.map((week) => week.id);
  const planWorkouts = weekIds.length ? await db.select({ id: programWorkouts.id }).from(programWorkouts).where(inArray(programWorkouts.programWeekId, weekIds)) : [];
  const planWorkoutIds = planWorkouts.map((workout) => workout.id);
  const planExercises = planWorkoutIds.length ? await db.select({ id: programExercises.id }).from(programExercises).where(inArray(programExercises.programWorkoutId, planWorkoutIds)) : [];
  if (planExercises.length) await db.delete(programSets).where(inArray(programSets.programExerciseId, planExercises.map((exercise) => exercise.id)));
  if (planWorkoutIds.length) await db.delete(programExercises).where(inArray(programExercises.programWorkoutId, planWorkoutIds));
  if (weekIds.length) await db.delete(programWorkouts).where(inArray(programWorkouts.programWeekId, weekIds));
  if (weekIds.length) await db.delete(programWeeks).where(inArray(programWeeks.id, weekIds));
  await db.delete(trainingPrograms).where(inArray(trainingPrograms.id, programIds));
}

export async function deleteAccountData(userId: number) {
  const db = await requireDb();
  const profile = await getAccountProfile(userId);
  const importRows = await db.select({ storageKey: planImports.storageKey }).from(planImports).where(eq(planImports.userId, userId));
  const socialActivityRows = await db.select({ id: friendActivities.id }).from(friendActivities).where(or(eq(friendActivities.actorId, userId), eq(friendActivities.opponentId, userId)));
  const socialActivityIds = socialActivityRows.map((activity) => activity.id);
  const socialChallengeRows = await db
    .select({ id: liftChallenges.id })
    .from(liftChallenges)
    .where(or(eq(liftChallenges.creatorId, userId), eq(liftChallenges.opponentId, userId)));
  const socialChallengeIds = socialChallengeRows.map((challenge) => challenge.id);
  if (socialActivityIds.length) await db.delete(activityReactions).where(inArray(activityReactions.activityId, socialActivityIds));
  if (socialActivityIds.length) await db.delete(activityComments).where(inArray(activityComments.activityId, socialActivityIds));
  await db.delete(activityReactions).where(eq(activityReactions.userId, userId));
  await db.delete(activityComments).where(eq(activityComments.authorId, userId));
  if (socialActivityIds.length) await db.delete(friendActivities).where(inArray(friendActivities.id, socialActivityIds));
  if (socialChallengeIds.length) await db.delete(challengeNotes).where(inArray(challengeNotes.challengeId, socialChallengeIds));
  await db.delete(challengeNotes).where(eq(challengeNotes.authorId, userId));
  if (socialChallengeIds.length) await db.delete(liftChallenges).where(inArray(liftChallenges.id, socialChallengeIds));
  await db.delete(socialNotices).where(or(eq(socialNotices.recipientId, userId), eq(socialNotices.actorId, userId)));
  await db.delete(friendNudges).where(or(eq(friendNudges.senderId, userId), eq(friendNudges.recipientId, userId)));
  await db.delete(friendNudgeLocks).where(or(eq(friendNudgeLocks.senderId, userId), eq(friendNudgeLocks.recipientId, userId)));
  await db.delete(friendMutes).where(or(eq(friendMutes.userId, userId), eq(friendMutes.mutedUserId, userId)));
  await db.delete(friendBlocks).where(or(eq(friendBlocks.blockerId, userId), eq(friendBlocks.blockedId, userId)));
  await db.delete(friendConnections).where(or(eq(friendConnections.requesterId, userId), eq(friendConnections.recipientId, userId)));
  const workoutRows = await db.select({ id: workouts.id }).from(workouts).where(eq(workouts.userId, userId));
  const workoutIds = workoutRows.map((workout) => workout.id);
  const workoutEntryRows = workoutIds.length ? await db.select({ id: workoutExercises.id }).from(workoutExercises).where(inArray(workoutExercises.workoutId, workoutIds)) : [];
  if (workoutEntryRows.length) await db.delete(workoutSets).where(inArray(workoutSets.workoutExerciseId, workoutEntryRows.map((entry) => entry.id)));
  if (workoutIds.length) await db.delete(workoutExercises).where(inArray(workoutExercises.workoutId, workoutIds));
  if (workoutIds.length) await db.delete(workouts).where(inArray(workouts.id, workoutIds));
  const templateRows = await db.select({ id: workoutTemplates.id }).from(workoutTemplates).where(eq(workoutTemplates.userId, userId));
  const templateIds = templateRows.map((template) => template.id);
  const templateEntryRows = templateIds.length ? await db.select({ id: templateExercises.id }).from(templateExercises).where(inArray(templateExercises.templateId, templateIds)) : [];
  if (templateEntryRows.length) await db.delete(templateSets).where(inArray(templateSets.templateExerciseId, templateEntryRows.map((entry) => entry.id)));
  if (templateIds.length) await db.delete(templateExercises).where(inArray(templateExercises.templateId, templateIds));
  if (templateIds.length) await db.delete(workoutTemplates).where(inArray(workoutTemplates.id, templateIds));
  const ownedPrograms = await db.select({ id: trainingPrograms.id }).from(trainingPrograms).where(eq(trainingPrograms.userId, userId));
  await deleteProgramGraph(ownedPrograms.map((program) => program.id));
  await db.update(trainingPrograms).set({ managedByTrainerId: null }).where(eq(trainingPrograms.managedByTrainerId, userId));
  await db.delete(coachSuggestions).where(or(eq(coachSuggestions.athleteId, userId), eq(coachSuggestions.trainerId, userId)));
  await db
    .delete(coachInvitations)
    .where(or(eq(coachInvitations.trainerId, userId), eq(coachInvitations.invitedUserId, userId), profile.email ? eq(coachInvitations.athleteEmail, profile.email.toLowerCase()) : eq(coachInvitations.id, -1)));
  await db.delete(trainerClients).where(or(eq(trainerClients.trainerId, userId), eq(trainerClients.athleteId, userId)));
  await db.delete(accountTokens).where(eq(accountTokens.userId, userId));
  await db.delete(guestInviteAliases).where(eq(guestInviteAliases.targetUserId, userId));
  await db.delete(planImports).where(eq(planImports.userId, userId));
  await db.delete(exercises).where(eq(exercises.userId, userId));
  await db.delete(userSettings).where(eq(userSettings.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
  return { inaccessiblePlanSourceKeys: importRows.map((item) => item.storageKey) };
}


type SocialProfile = {
  id: number;
  name: string;
  sharesActivity: boolean;
};

type ActualLift = ChallengeLift & { bestWeightKg: number; bestWorkoutId: number };
type LiftChallengeHistory = typeof liftChallenges.$inferSelect;
type LiftChallengeView = Omit<LiftChallengeHistory, "targetWorkoutId" | "winningWorkoutId" | "targetKg"> & {
  targetKg: number;
  otherPerson: { id: number; name: string };
  target: number;
  unit: Unit;
  targetDescription: string;
  viewerScore: number | null;
  otherScore: number | null;
  notes: Array<{
    id: number;
    preset: ChallengeNotePreset;
    label: string;
    createdAt: Date;
    author: { id: number; name: string };
  }>;
};

const SOCIAL_NOTICE_WINDOW_MS = 24 * 60 * 60 * 1000;
const NUDGE_COOLDOWN_MS = FRIEND_NUDGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
const NUDGE_INACTIVITY_MS = FRIEND_NUDGE_INACTIVITY_DAYS * 24 * 60 * 60 * 1000;
const COMPARISON_LIFTS = new Set(["bench press", "back squat", "squat", "deadlift", "overhead press"]);

function actualWeightKg(row: { actualWeight: number | null; actualWeightKg: number | null }, unit: Unit) {
  if (row.actualWeightKg !== null && row.actualWeightKg !== undefined) return Number(row.actualWeightKg);
  return toKilograms(Number(row.actualWeight ?? 0), unit);
}

function isComparisonLift(name: string) {
  return COMPARISON_LIFTS.has(name.trim().toLocaleLowerCase());
}

async function getSocialProfiles(userIds: number[]): Promise<SocialProfile[]> {
  const ids = [...new Set(userIds)];
  if (!ids.length) return [];
  await Promise.all(ids.map((id) => getUserSettings(id)));
  const db = await requireDb();
  const rows = await db
    .select({
      id: users.id,
      accountName: users.name,
      socialDisplayName: userSettings.socialDisplayName,
      socialNameMode: userSettings.socialNameMode,
      shareFriendActivity: userSettings.shareFriendActivity,
    })
    .from(users)
    .innerJoin(userSettings, eq(userSettings.userId, users.id))
    .where(inArray(users.id, ids));
  return rows.map((row) => ({
    id: row.id,
    name: displaySocialName({ accountName: row.accountName, socialDisplayName: row.socialDisplayName, socialNameMode: row.socialNameMode }),
    sharesActivity: Boolean(row.shareFriendActivity),
  }));
}

export async function getSocialProfile(userId: number) {
  const profiles = await getSocialProfiles([userId]);
  if (!profiles[0]) throw new Error("Account not found.");
  return profiles[0];
}

async function getFriendConnectionsForUser(userId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(friendConnections)
    .where(or(eq(friendConnections.requesterId, userId), eq(friendConnections.recipientId, userId)))
    .orderBy(desc(friendConnections.updatedAt));
}

async function isBlockedEither(userId: number, otherId: number) {
  if (userId === otherId) return false;
  const db = await requireDb();
  const rows = await db
    .select({ id: friendBlocks.id })
    .from(friendBlocks)
    .where(
      or(
        and(eq(friendBlocks.blockerId, userId), eq(friendBlocks.blockedId, otherId)),
        and(eq(friendBlocks.blockerId, otherId), eq(friendBlocks.blockedId, userId)),
      ),
    )
    .limit(1);
  return Boolean(rows[0]);
}

async function assertNoSocialBlock(userId: number, otherId: number) {
  if (await isBlockedEither(userId, otherId)) throw new Error("This social action is unavailable.");
}

async function getBlockedUserIds(userId: number) {
  const db = await requireDb();
  const rows = await db
    .select({ blockerId: friendBlocks.blockerId, blockedId: friendBlocks.blockedId })
    .from(friendBlocks)
    .where(or(eq(friendBlocks.blockerId, userId), eq(friendBlocks.blockedId, userId)));
  return new Set(rows.map((row) => (row.blockerId === userId ? row.blockedId : row.blockerId)));
}

/** Only outgoing blocks are actionable by this user. Inbound blockers stay undisclosed. */
async function getOutgoingBlockedUserIds(userId: number) {
  const db = await requireDb();
  const rows = await db
    .select({ blockedId: friendBlocks.blockedId })
    .from(friendBlocks)
    .where(eq(friendBlocks.blockerId, userId));
  return new Set(rows.map((row) => row.blockedId));
}

async function isMutedBy(recipientId: number, actorId: number) {
  const db = await requireDb();
  const rows = await db
    .select({ id: friendMutes.id })
    .from(friendMutes)
    .where(and(eq(friendMutes.userId, recipientId), eq(friendMutes.mutedUserId, actorId)))
    .limit(1);
  return Boolean(rows[0]);
}

async function getAcceptedFriendIds(userId: number) {
  const connections = await getFriendConnectionsForUser(userId);
  const blocked = await getBlockedUserIds(userId);
  return connections
    .filter((connection) => connection.status === "accepted")
    .map((connection) => (connection.requesterId === userId ? connection.recipientId : connection.requesterId))
    .filter((id) => !blocked.has(id));
}

async function assertAcceptedFriendship(userId: number, friendId: number) {
  if (userId === friendId) throw new Error("Choose a friend to continue.");
  await assertNoSocialBlock(userId, friendId);
  const db = await requireDb();
  const rows = await db
    .select({ id: friendConnections.id })
    .from(friendConnections)
    .where(
      and(
        eq(friendConnections.status, "accepted"),
        or(
          and(eq(friendConnections.requesterId, userId), eq(friendConnections.recipientId, friendId)),
          and(eq(friendConnections.requesterId, friendId), eq(friendConnections.recipientId, userId)),
        ),
      ),
    )
    .limit(1);
  if (!rows[0]) throw new Error("You can do that only with an accepted friend.");
}

async function hasAcceptedFriendship(userId: number, friendId: number) {
  try {
    await assertAcceptedFriendship(userId, friendId);
    return true;
  } catch {
    return false;
  }
}

/** A notice has no email side effect. The locked recipient settings row serializes the rolling 24h limit. */
async function queueSocialNotice(input: {
  recipientId: number;
  actorId: number;
  kind: "friend_request" | "nudge" | "challenge" | "challenge_accepted" | "challenge_note" | "challenge_win";
  message: string;
}) {
  if (input.recipientId === input.actorId || await isBlockedEither(input.recipientId, input.actorId) || await isMutedBy(input.recipientId, input.actorId)) return null;
  await getUserSettings(input.recipientId);
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const settings = await tx
      .select({ notificationsEnabled: userSettings.socialNotificationsEnabled })
      .from(userSettings)
      .where(eq(userSettings.userId, input.recipientId))
      .for("update");
    if (!settings[0]?.notificationsEnabled) return null;
    const recent = await tx
      .select({ id: socialNotices.id })
      .from(socialNotices)
      .where(and(eq(socialNotices.recipientId, input.recipientId), gt(socialNotices.createdAt, new Date(Date.now() - SOCIAL_NOTICE_WINDOW_MS))))
      .orderBy(desc(socialNotices.createdAt))
      .limit(1);
    if (recent[0]) return null;
    const result = await tx.insert(socialNotices).values(input);
    return insertId(result);
  });
}

export async function readSocialNotice(userId: number, noticeId: number) {
  const db = await requireDb();
  const result = await db
    .update(socialNotices)
    .set({ readAt: new Date() })
    .where(and(eq(socialNotices.id, noticeId), eq(socialNotices.recipientId, userId)));
  if (affectedRows(result) !== 1) throw new Error("Notice not found.");
  return { success: true } as const;
}

export async function readFriendNudge(userId: number, nudgeId: number) {
  const db = await requireDb();
  const result = await db
    .update(friendNudges)
    .set({ readAt: new Date() })
    .where(and(eq(friendNudges.id, nudgeId), eq(friendNudges.recipientId, userId)));
  if (affectedRows(result) !== 1) throw new Error("Nudge not found.");
  return { success: true } as const;
}

export async function getFriendInviteCode(userId: number) {
  const db = await requireDb();
  const existing = await db.select({ inviteCode: users.inviteCode }).from(users).where(eq(users.id, userId)).limit(1);
  if (!existing[0]) throw new Error("Account not found.");
  if (existing[0].inviteCode) return { code: existing[0].inviteCode };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomBytes(12).toString("hex").toUpperCase(); // 96 random bits, opaque and UI-friendly.
    try {
      const alias = await db.select({ id: guestInviteAliases.id }).from(guestInviteAliases).where(eq(guestInviteAliases.code, code)).limit(1);
      if (alias[0]) continue;
      const updated = await db.update(users).set({ inviteCode: code }).where(and(eq(users.id, userId), isNull(users.inviteCode)));
      if (affectedRows(updated) === 1) return { code };
      const concurrent = await db.select({ inviteCode: users.inviteCode }).from(users).where(eq(users.id, userId)).limit(1);
      if (concurrent[0]?.inviteCode) return { code: concurrent[0].inviteCode };
    } catch {
      // A globally unique code collision is retried; no user identity is exposed.
    }
  }
  throw new Error("Could not create an invite code. Please try again.");
}

async function createPendingFriendRequest(requesterId: number, recipientId: number) {
  if (requesterId === recipientId) throw new Error("You cannot add yourself.");
  const db = await requireDb();
  const created = await db.transaction(async (tx) => {
    const participantIds = [requesterId, recipientId].sort((a, b) => a - b);
    const participants = await tx
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.id, participantIds))
      .orderBy(asc(users.id))
      .for("update");
    if (participants.length !== 2) throw new Error("This social action is unavailable.");

    const blocks = await tx
      .select({ id: friendBlocks.id })
      .from(friendBlocks)
      .where(
        or(
          and(eq(friendBlocks.blockerId, requesterId), eq(friendBlocks.blockedId, recipientId)),
          and(eq(friendBlocks.blockerId, recipientId), eq(friendBlocks.blockedId, requesterId)),
        ),
      )
      .for("update");
    if (blocks[0]) throw new Error("This social action is unavailable.");

    const existing = await tx
      .select()
      .from(friendConnections)
      .where(
        or(
          and(eq(friendConnections.requesterId, requesterId), eq(friendConnections.recipientId, recipientId)),
          and(eq(friendConnections.requesterId, recipientId), eq(friendConnections.recipientId, requesterId)),
        ),
      )
      .for("update");
    if (existing.some((connection) => connection.status === "accepted")) return false;
    // A pending request in either direction remains the recipient's request to answer.
    // In particular, invite redemption must not delete and reverse an incoming request.
    if (existing.some((connection) => connection.status === "pending")) return false;
    if (existing.length) await tx.delete(friendConnections).where(inArray(friendConnections.id, existing.map((connection) => connection.id)));
    await tx.insert(friendConnections).values({ requesterId, recipientId, status: "pending" });
    return true;
  });
  return created;
}

export async function redeemFriendInvite(userId: number, code: string) {
  const db = await requireDb();
  const normalizedCode = code.trim();
  const aliases = await db
    .select({ targetUserId: guestInviteAliases.targetUserId })
    .from(guestInviteAliases)
    .where(eq(guestInviteAliases.code, normalizedCode))
    .limit(1);
  const target = aliases[0]
    ? await db.select({ id: users.id }).from(users).where(eq(users.id, aliases[0].targetUserId)).limit(1)
    : await db.select({ id: users.id }).from(users).where(eq(users.inviteCode, normalizedCode)).limit(1);
  if (!target[0] || target[0].id === userId) throw new Error("This invite code is unavailable.");
  const created = await createPendingFriendRequest(userId, target[0].id);
  if (created) await queueSocialNotice({ recipientId: target[0].id, actorId: userId, kind: "friend_request", message: "sent you a friend request." });
  return { sent: true, message: FRIEND_REQUEST_RECEIPT };
}

export async function requestFriendByEmail(userId: number, email: string) {
  const target = await getUserByEmail(email);
  const receipt = { sent: true, message: FRIEND_REQUEST_RECEIPT };
  if (!target || target.id === userId) return receipt;
  const created = await createPendingFriendRequest(userId, target.id);
  if (created) await queueSocialNotice({ recipientId: target.id, actorId: userId, kind: "friend_request", message: "sent you a friend request." });
  return receipt;
}

export async function respondToFriendRequest(userId: number, requestId: number, accept: boolean) {
  const db = await requireDb();
  const request = await db
    .select()
    .from(friendConnections)
    .where(and(eq(friendConnections.id, requestId), eq(friendConnections.recipientId, userId), eq(friendConnections.status, "pending")))
    .limit(1);
  if (!request[0]) throw new Error("This friend request is no longer available.");
  await assertNoSocialBlock(userId, request[0].requesterId);
  await db.transaction(async (tx) => {
    const result = await tx
      .update(friendConnections)
      .set({ status: accept ? "accepted" : "declined", respondedAt: new Date() })
      .where(and(eq(friendConnections.id, requestId), eq(friendConnections.status, "pending")));
    if (affectedRows(result) !== 1) throw new Error("This friend request is no longer available.");
    await tx.update(socialNotices).set({ readAt: new Date() }).where(and(eq(socialNotices.recipientId, userId), eq(socialNotices.actorId, request[0].requesterId), eq(socialNotices.kind, "friend_request"), isNull(socialNotices.readAt)));
    if (accept) {
      for (const participantId of [request[0].requesterId, request[0].recipientId]) {
        await tx.insert(userSettings).values({ userId: participantId, shareFriendActivity: 1 }).onDuplicateKeyUpdate({ set: { userId: participantId } });
      }
    }
  });
  if (accept) await queueSocialNotice({ recipientId: request[0].requesterId, actorId: userId, kind: "challenge_accepted", message: "accepted your friend request." });
  return { accepted: accept };
}

async function cancelChallengesForPair(userId: number, otherId: number) {
  const db = await requireDb();
  await db
    .update(liftChallenges)
    .set({ status: "canceled" })
    .where(
      and(
        inArray(liftChallenges.status, ["pending", "active"]),
        or(
          and(eq(liftChallenges.creatorId, userId), eq(liftChallenges.opponentId, otherId)),
          and(eq(liftChallenges.creatorId, otherId), eq(liftChallenges.opponentId, userId)),
        ),
      ),
    );
}

export async function removeFriend(userId: number, friendId: number) {
  const db = await requireDb();
  const pair = or(
    and(eq(friendConnections.requesterId, userId), eq(friendConnections.recipientId, friendId)),
    and(eq(friendConnections.requesterId, friendId), eq(friendConnections.recipientId, userId)),
  );
  await db.transaction(async (tx) => {
    const participantIds = [userId, friendId].sort((a, b) => a - b);
    await tx.select({ id: users.id }).from(users).where(inArray(users.id, participantIds)).orderBy(asc(users.id)).for("update");
    await tx.delete(friendConnections).where(pair);
    await tx
      .update(liftChallenges)
      .set({ status: "canceled" })
      .where(
        and(
          inArray(liftChallenges.status, ["pending", "active"]),
          or(
            and(eq(liftChallenges.creatorId, userId), eq(liftChallenges.opponentId, friendId)),
            and(eq(liftChallenges.creatorId, friendId), eq(liftChallenges.opponentId, userId)),
          ),
        ),
      );
  });
  return { success: true } as const;
}

export async function setFriendMuted(userId: number, friendId: number, muted: boolean) {
  const db = await requireDb();
  await db.transaction(async (tx) => {
    const participantIds = [userId, friendId].sort((a, b) => a - b);
    const participants = await tx.select({ id: users.id }).from(users).where(inArray(users.id, participantIds)).orderBy(asc(users.id)).for("update");
    const connection = await tx
      .select({ id: friendConnections.id })
      .from(friendConnections)
      .where(
        and(
          eq(friendConnections.status, "accepted"),
          or(
            and(eq(friendConnections.requesterId, userId), eq(friendConnections.recipientId, friendId)),
            and(eq(friendConnections.requesterId, friendId), eq(friendConnections.recipientId, userId)),
          ),
        ),
      )
      .for("update");
    const blocks = await tx
      .select({ id: friendBlocks.id })
      .from(friendBlocks)
      .where(
        or(
          and(eq(friendBlocks.blockerId, userId), eq(friendBlocks.blockedId, friendId)),
          and(eq(friendBlocks.blockerId, friendId), eq(friendBlocks.blockedId, userId)),
        ),
      )
      .for("update");
    if (participants.length !== 2 || !connection[0] || blocks[0]) throw new Error("You can do that only with an accepted friend.");
    if (muted) {
      await tx.insert(friendMutes).values({ userId, mutedUserId: friendId }).onDuplicateKeyUpdate({ set: { userId } });
    } else {
      await tx.delete(friendMutes).where(and(eq(friendMutes.userId, userId), eq(friendMutes.mutedUserId, friendId)));
    }
  });
  return { muted };
}

export async function blockFriend(userId: number, friendId: number) {
  if (userId === friendId) throw new Error("You cannot block yourself.");
  const db = await requireDb();
  const pair = or(
    and(eq(friendConnections.requesterId, userId), eq(friendConnections.recipientId, friendId)),
    and(eq(friendConnections.requesterId, friendId), eq(friendConnections.recipientId, userId)),
  );
  await db.transaction(async (tx) => {
    const participantIds = [userId, friendId].sort((a, b) => a - b);
    const participants = await tx.select({ id: users.id }).from(users).where(inArray(users.id, participantIds)).orderBy(asc(users.id)).for("update");
    if (participants.length !== 2) throw new Error("This social action is unavailable.");
    await tx.insert(friendBlocks).values({ blockerId: userId, blockedId: friendId }).onDuplicateKeyUpdate({ set: { blockerId: userId } });
    await tx.delete(friendConnections).where(pair);
    await tx.delete(friendMutes).where(or(and(eq(friendMutes.userId, userId), eq(friendMutes.mutedUserId, friendId)), and(eq(friendMutes.userId, friendId), eq(friendMutes.mutedUserId, userId))));
    await tx
      .update(liftChallenges)
      .set({ status: "canceled" })
      .where(
        and(
          inArray(liftChallenges.status, ["pending", "active"]),
          or(
            and(eq(liftChallenges.creatorId, userId), eq(liftChallenges.opponentId, friendId)),
            and(eq(liftChallenges.creatorId, friendId), eq(liftChallenges.opponentId, userId)),
          ),
        ),
      );
  });
  return { success: true } as const;
}

export async function unblockFriend(userId: number, friendId: number) {
  const db = await requireDb();
  await db.delete(friendBlocks).where(and(eq(friendBlocks.blockerId, userId), eq(friendBlocks.blockedId, friendId)));
  return { success: true } as const;
}

async function listActualBestLifts(userId: number, sharedOnly: boolean): Promise<ActualLift[]> {
  const db = await requireDb();
  const settings = await getUserSettings(userId);
  const base = db
    .select({ workoutId: workouts.id, exerciseName: exercises.name, equipment: exercises.equipment, actualWeight: workoutSets.actualWeight, actualWeightKg: workoutSets.actualWeightKg })
    .from(workoutSets)
    .innerJoin(workoutExercises, eq(workoutSets.workoutExerciseId, workoutExercises.id))
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .innerJoin(exercises, eq(workoutExercises.exerciseId, exercises.id));
  const rows = sharedOnly
    ? await base
        .innerJoin(friendActivities, and(eq(friendActivities.workoutId, workouts.id), eq(friendActivities.actorId, userId), eq(friendActivities.kind, "workout_completed")))
        .where(and(eq(workouts.userId, userId), isNotNull(workouts.completedAt), eq(workouts.isPrivate, 0)))
    : await base.where(and(eq(workouts.userId, userId), isNotNull(workouts.completedAt)));
  const bests = new Map<string, ActualLift>();
  for (const row of rows) {
    const bestWeightKg = actualWeightKg(row, settings.unit);
    if (!bestWeightKg) continue;
    const lift = { exerciseName: row.exerciseName, equipment: row.equipment };
    const key = challengeLiftKey(lift);
    const existing = bests.get(key);
    if (!existing || bestWeightKg > existing.bestWeightKg) bests.set(key, { ...lift, bestWeightKg, bestWorkoutId: row.workoutId });
  }
  return [...bests.values()];
}

async function bestActualWeightKgByLift(userId: number, exerciseName: string, equipment: string, sharedOnly = true) {
  const lifts = await listActualBestLifts(userId, sharedOnly);
  return lifts.find((lift) => challengeLiftKey(lift) === challengeLiftKey({ exerciseName, equipment }))?.bestWeightKg ?? 0;
}

/** A non-private completion is not shareable unless its explicit publication marker still exists. */
async function isPublishedCompletedWorkout(ownerId: number, workoutId: number | null | undefined) {
  if (!workoutId) return false;
  const db = await requireDb();
  const rows = await db
    .select({ id: workouts.id })
    .from(workouts)
    .innerJoin(
      friendActivities,
      and(
        eq(friendActivities.workoutId, workouts.id),
        eq(friendActivities.actorId, ownerId),
        eq(friendActivities.kind, "workout_completed"),
      ),
    )
    .where(
      and(
        eq(workouts.id, workoutId),
        eq(workouts.userId, ownerId),
        eq(workouts.isPrivate, 0),
        isNotNull(workouts.completedAt),
      ),
    )
    .limit(1);
  return Boolean(rows[0]);
}

async function hasCurrentSharedFriendship(userId: number, otherId: number) {
  const [friendship, profiles] = await Promise.all([
    hasAcceptedFriendship(userId, otherId),
    getSocialProfiles([userId, otherId]),
  ]);
  return friendship && profiles.length === 2 && profiles.every((profile) => profile.sharesActivity);
}

async function nudgeState(senderId: number, recipientId: number) {
  const [senderSettings, recipientSettings, recipient] = await Promise.all([
    getUserSettings(senderId),
    getUserSettings(recipientId),
    getUserById(recipientId),
  ]);
  const db = await requireDb();
  const latest = await db
    .select({ completedAt: workouts.completedAt })
    .from(workouts)
    .where(and(eq(workouts.userId, recipientId), isNotNull(workouts.completedAt)))
    .orderBy(desc(workouts.completedAt))
    .limit(1);
  const lock = await db
    .select({ lastSentAt: friendNudgeLocks.lastSentAt })
    .from(friendNudgeLocks)
    .where(and(eq(friendNudgeLocks.senderId, senderId), eq(friendNudgeLocks.recipientId, recipientId)))
    .limit(1);
  const now = Date.now();
  const inactiveSince = latest[0]?.completedAt ?? recipient?.createdAt ?? new Date();
  const bothOptedIn = Boolean(senderSettings.allowFriendNudges && recipientSettings.allowFriendNudges);
  const recentlySent = Boolean(lock[0]?.lastSentAt && lock[0].lastSentAt.getTime() > now - NUDGE_COOLDOWN_MS);
  return { bothOptedIn, recentlySent, isInactive: inactiveSince.getTime() <= now - NUDGE_INACTIVITY_MS };
}

export async function sendFriendNudge(userId: number, friendId: number, preset: NudgePreset) {
  if (userId === friendId) throw new Error("Nudges are unavailable right now.");
  await Promise.all([getUserSettings(userId), getUserSettings(friendId)]);
  const db = await requireDb();
  const now = new Date();
  return db.transaction(async (tx) => {
    const participantIds = [userId, friendId].sort((a, b) => a - b);
    const participants = await tx
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.id, participantIds))
      .orderBy(asc(users.id))
      .for("update");
    if (participants.length !== 2) throw new Error("Nudges are unavailable right now.");

    const [connections, blocks, mutes, settingsRows] = await Promise.all([
      tx
        .select({ id: friendConnections.id })
        .from(friendConnections)
        .where(
          and(
            eq(friendConnections.status, "accepted"),
            or(
              and(eq(friendConnections.requesterId, userId), eq(friendConnections.recipientId, friendId)),
              and(eq(friendConnections.requesterId, friendId), eq(friendConnections.recipientId, userId)),
            ),
          ),
        )
        .for("update"),
      tx
        .select({ id: friendBlocks.id })
        .from(friendBlocks)
        .where(
          or(
            and(eq(friendBlocks.blockerId, userId), eq(friendBlocks.blockedId, friendId)),
            and(eq(friendBlocks.blockerId, friendId), eq(friendBlocks.blockedId, userId)),
          ),
        )
        .for("update"),
      tx
        .select({ id: friendMutes.id })
        .from(friendMutes)
        .where(
          or(
            and(eq(friendMutes.userId, userId), eq(friendMutes.mutedUserId, friendId)),
            and(eq(friendMutes.userId, friendId), eq(friendMutes.mutedUserId, userId)),
          ),
        )
        .for("update"),
      tx
        .select({ userId: userSettings.userId, allowNudges: userSettings.allowFriendNudges, notificationsEnabled: userSettings.socialNotificationsEnabled })
        .from(userSettings)
        .where(inArray(userSettings.userId, participantIds))
        .orderBy(asc(userSettings.userId))
        .for("update"),
    ]);
    if (!connections[0] || blocks[0] || mutes[0]) throw new Error("Nudges are unavailable right now.");
    const senderSettings = settingsRows.find((settings) => settings.userId === userId);
    const recipientSettings = settingsRows.find((settings) => settings.userId === friendId);
    if (!senderSettings?.allowNudges || !recipientSettings?.allowNudges) throw new Error("Friend nudges require both athletes to opt in.");

    await tx.insert(friendNudgeLocks).values({ senderId: userId, recipientId: friendId }).onDuplicateKeyUpdate({ set: { senderId: userId } });
    const [lockRows, latestWorkout, recipient] = await Promise.all([
      tx.select({ lastSentAt: friendNudgeLocks.lastSentAt }).from(friendNudgeLocks).where(and(eq(friendNudgeLocks.senderId, userId), eq(friendNudgeLocks.recipientId, friendId))).for("update"),
      tx.select({ completedAt: workouts.completedAt }).from(workouts).where(and(eq(workouts.userId, friendId), isNotNull(workouts.completedAt))).orderBy(desc(workouts.completedAt)).limit(1),
      tx.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, friendId)).limit(1),
    ]);
    if (lockRows[0]?.lastSentAt && lockRows[0].lastSentAt.getTime() > now.getTime() - NUDGE_COOLDOWN_MS) throw new Error("A nudge was already sent recently.");
    const inactiveSince = latestWorkout[0]?.completedAt ?? recipient[0]?.createdAt;
    if (!inactiveSince || inactiveSince.getTime() > now.getTime() - NUDGE_INACTIVITY_MS) throw new Error("Nudges are not available right now.");
    const result = await tx.insert(friendNudges).values({ senderId: userId, recipientId: friendId, preset });
    await tx.update(friendNudgeLocks).set({ lastSentAt: now }).where(and(eq(friendNudgeLocks.senderId, userId), eq(friendNudgeLocks.recipientId, friendId)));
    if (recipientSettings.notificationsEnabled) {
      const recentNotice = await tx.select({ id: socialNotices.id }).from(socialNotices).where(and(eq(socialNotices.recipientId, friendId), gt(socialNotices.createdAt, new Date(now.getTime() - SOCIAL_NOTICE_WINDOW_MS)))).limit(1);
      if (!recentNotice[0]) await tx.insert(socialNotices).values({ recipientId: friendId, actorId: userId, kind: "nudge", message: "sent you a nudge." });
    }
    return { id: insertId(result), sent: true };
  });
}

async function listFriendActivities(viewerId: number, actorIds: number[]) {
  const allowedActors = actorIds.filter((id) => id !== viewerId || true).filter((id) => true);
  const blocked = await getBlockedUserIds(viewerId);
  const visibleActors = allowedActors.filter((id) => !blocked.has(id));
  if (!visibleActors.length) return [];
  const db = await requireDb();
  const candidateRows = await db
    .select({ activity: friendActivities, actorId: users.id, accountName: users.name, socialDisplayName: userSettings.socialDisplayName, socialNameMode: userSettings.socialNameMode, actorUnit: userSettings.unit })
    .from(friendActivities)
    .innerJoin(users, eq(friendActivities.actorId, users.id))
    .innerJoin(userSettings, eq(userSettings.userId, users.id))
    .innerJoin(workouts, eq(friendActivities.workoutId, workouts.id))
    .where(and(inArray(friendActivities.actorId, visibleActors), eq(userSettings.shareFriendActivity, 1), eq(workouts.isPrivate, 0), isNotNull(workouts.completedAt)))
    .orderBy(desc(friendActivities.occurredAt))
    .limit(40);
  const rows = [] as typeof candidateRows;
  for (const row of candidateRows) {
    if (row.activity.kind === "challenge_win") {
      const opponentId = row.activity.opponentId;
      // Challenge wins are a two-person result, never a general activity feed item.
      if (!opponentId || (viewerId !== row.activity.actorId && viewerId !== opponentId)) continue;
      if (!(await hasCurrentSharedFriendship(row.activity.actorId, opponentId))) continue;
    }
    rows.push(row);
  }
  const activityIds = rows.map((row) => row.activity.id);
  if (!activityIds.length) return [];
  const workoutIds = [...new Set(rows.map((row) => row.activity.workoutId))];
  const [reactions, comments, workoutRows] = await Promise.all([
    db.select().from(activityReactions).where(inArray(activityReactions.activityId, activityIds)),
    db.select({ comment: activityComments, authorId: users.id, accountName: users.name, socialDisplayName: userSettings.socialDisplayName, socialNameMode: userSettings.socialNameMode })
      .from(activityComments).innerJoin(users, eq(activityComments.authorId, users.id)).innerJoin(userSettings, eq(userSettings.userId, users.id))
      .where(inArray(activityComments.activityId, activityIds)).orderBy(asc(activityComments.createdAt)),
    db.select({ workoutId: workoutExercises.workoutId, exerciseId: workoutExercises.exerciseId, exerciseName: exercises.name, equipment: exercises.equipment, targetReps: workoutSets.targetReps, actualReps: workoutSets.actualReps, actualWeight: workoutSets.actualWeight, actualWeightKg: workoutSets.actualWeightKg })
      .from(workoutExercises).innerJoin(workoutSets, eq(workoutSets.workoutExerciseId, workoutExercises.id)).innerJoin(exercises, eq(workoutExercises.exerciseId, exercises.id))
      .where(inArray(workoutExercises.workoutId, workoutIds)),
  ]);
  const blockedReactionAuthors = blocked;
  const people = await getSocialProfiles([...new Set(reactions.filter((item) => !blockedReactionAuthors.has(item.userId)).map((item) => item.userId))]);
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const prKeys = new Set(rows.filter((row) => row.activity.kind === "personal_record" && row.activity.exerciseId).map((row) => `${row.activity.workoutId}:${row.activity.exerciseId}`));
  const summariesByWorkout = new Map<number, Array<{ exerciseName: string; equipment: string; setCount: number; bestWeightKg: number; bestReps: number; newBest: boolean }>>();
  for (const row of rows) {
    if (row.activity.kind !== "workout_completed" || summariesByWorkout.has(row.activity.workoutId)) continue;
    const groups = new Map<number, { exerciseName: string; equipment: string; setCount: number; bestWeightKg: number; bestReps: number }>();
    for (const set of workoutRows.filter((item) => item.workoutId === row.activity.workoutId)) {
      const current = groups.get(set.exerciseId) ?? { exerciseName: set.exerciseName, equipment: set.equipment, setCount: 0, bestWeightKg: 0, bestReps: 0 };
      const weightKg = actualWeightKg(set, row.actorUnit);
      current.setCount += 1;
      if (weightKg > current.bestWeightKg || (weightKg === current.bestWeightKg && Number(set.actualReps ?? set.targetReps) > current.bestReps)) {
        current.bestWeightKg = weightKg;
        current.bestReps = Number(set.actualReps ?? set.targetReps);
      }
      groups.set(set.exerciseId, current);
    }
    summariesByWorkout.set(row.activity.workoutId, [...groups.entries()].map(([exerciseId, value]) => ({ ...value, newBest: prKeys.has(`${row.activity.workoutId}:${exerciseId}`) })));
  }
  const profiles = await getSocialProfiles(rows.filter((row) => row.activity.opponentId).map((row) => row.activity.opponentId!));
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const feedRows = rows.filter((row) => row.activity.kind !== "personal_record" || !rows.some((candidate) => candidate.activity.kind === "workout_completed" && candidate.activity.workoutId === row.activity.workoutId));
  return feedRows.map((row) => {
    const activityReactions = reactions.filter((reaction) => reaction.activityId === row.activity.id && !blockedReactionAuthors.has(reaction.userId));
    const kudosGivers = [...new Map(activityReactions.map((reaction) => [reaction.userId, peopleById.get(reaction.userId)]).filter((entry): entry is [number, SocialProfile] => Boolean(entry[1]))).values()].map((person) => ({ id: person.id, name: person.name }));
    return {
      ...row.activity,
      actor: { id: row.actorId, name: displaySocialName({ accountName: row.accountName, socialDisplayName: row.socialDisplayName, socialNameMode: row.socialNameMode }) },
      opponent: row.activity.opponentId ? profileById.get(row.activity.opponentId) ? { id: row.activity.opponentId, name: profileById.get(row.activity.opponentId)!.name } : null : null,
      opponentName: row.activity.opponentId ? profileById.get(row.activity.opponentId)?.name ?? null : null,
      viewerReaction: activityReactions.some((reaction) => reaction.userId === viewerId) ? "strong" as const : null,
      reactionCounts: { fist_bump: 0, fire: 0, strong: activityReactions.length } as Record<FriendReaction, number>,
      kudosGivers,
      summaries: row.activity.kind === "workout_completed" ? summariesByWorkout.get(row.activity.workoutId) ?? [] : [],
      comments: comments.filter((item) => item.comment.activityId === row.activity.id && !blocked.has(item.authorId)).map((item) => ({ id: item.comment.id, message: item.comment.message, createdAt: item.comment.createdAt, author: { id: item.authorId, name: displaySocialName({ accountName: item.accountName, socialDisplayName: item.socialDisplayName, socialNameMode: item.socialNameMode }) } })),
    };
  });
}

async function assertActivityInteraction(viewerId: number, activityId: number) {
  const db = await requireDb();
  const rows = await db
    .select({ actorId: friendActivities.actorId, opponentId: friendActivities.opponentId, workoutId: friendActivities.workoutId, kind: friendActivities.kind })
    .from(friendActivities).innerJoin(workouts, eq(friendActivities.workoutId, workouts.id)).innerJoin(userSettings, eq(friendActivities.actorId, userSettings.userId))
    .where(and(eq(friendActivities.id, activityId), eq(userSettings.shareFriendActivity, 1), eq(workouts.isPrivate, 0), isNotNull(workouts.completedAt)))
    .limit(1);
  const activity = rows[0];
  if (!activity || activity.actorId === viewerId) throw new Error("You can interact with a friend’s activity only.");
  if (activity.kind === "challenge_win") {
    if (
      activity.opponentId !== viewerId ||
      !(await hasCurrentSharedFriendship(activity.actorId, activity.opponentId)) ||
      !(await isPublishedCompletedWorkout(activity.actorId, activity.workoutId))
    ) {
      throw new Error("You can interact with a friend’s activity only.");
    }
  }
  await assertAcceptedFriendship(viewerId, activity.actorId);
  return activity;
}

export async function toggleActivityReaction(userId: number, activityId: number, _kind: FriendReaction = "strong") {
  await assertActivityInteraction(userId, activityId);
  const db = await requireDb();
  const existing = await db.select().from(activityReactions).where(and(eq(activityReactions.activityId, activityId), eq(activityReactions.userId, userId))).limit(1);
  if (existing[0]) {
    await db.delete(activityReactions).where(eq(activityReactions.id, existing[0].id));
    return { active: false, kind: "strong" as const };
  }
  await db.insert(activityReactions).values({ activityId, userId, kind: "strong" });
  return { active: true, kind: "strong" as const };
}

export async function addActivityComment(userId: number, activityId: number, message: string) {
  await assertActivityInteraction(userId, activityId);
  const text = message.trim();
  if (!text) throw new Error("Write a short comment first.");
  const db = await requireDb();
  const result = await db.insert(activityComments).values({ activityId, authorId: userId, message: text });
  return { id: insertId(result), message: text };
}

export async function deleteActivityComment(userId: number, commentId: number) {
  const db = await requireDb();
  const rows = await db.select({ comment: activityComments, actorId: friendActivities.actorId }).from(activityComments).innerJoin(friendActivities, eq(activityComments.activityId, friendActivities.id)).where(eq(activityComments.id, commentId)).limit(1);
  const item = rows[0];
  if (!item || (item.comment.authorId !== userId && item.actorId !== userId)) throw new Error("You can remove only your own comment.");
  const counterpartyId = item.comment.authorId === userId ? item.actorId : item.comment.authorId;
  // A comment authored on the viewer's own activity has no social counterparty.
  if (counterpartyId !== userId) await assertAcceptedFriendship(userId, counterpartyId);
  await db.delete(activityComments).where(eq(activityComments.id, commentId));
  return { success: true } as const;
}

export async function getFriendsHub(userId: number) {
  const db = await requireDb();
  const [connections, blockedIds, outgoingBlockedIds, viewerSettings] = await Promise.all([
    getFriendConnectionsForUser(userId),
    getBlockedUserIds(userId),
    getOutgoingBlockedUserIds(userId),
    getUserSettings(userId),
  ]);
  const visibleConnections = connections.filter((connection) => !blockedIds.has(connection.requesterId === userId ? connection.recipientId : connection.requesterId));
  const counterpartIds = visibleConnections.map((connection) => connection.requesterId === userId ? connection.recipientId : connection.requesterId);
  const profiles = await getSocialProfiles(counterpartIds);
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const toConnectionItem = (connection: typeof visibleConnections[number]) => {
    const personId = connection.requesterId === userId ? connection.recipientId : connection.requesterId;
    return { id: connection.id, person: profileById.get(personId) ?? null, createdAt: connection.createdAt, respondedAt: connection.respondedAt };
  };
  const acceptedIds = visibleConnections.filter((connection) => connection.status === "accepted").map((connection) => connection.requesterId === userId ? connection.recipientId : connection.requesterId);
  const acceptedIdSet = new Set(acceptedIds);
  const incomingRequestActorIds = new Set(visibleConnections.filter((connection) => connection.status === "pending" && connection.recipientId === userId).map((connection) => connection.requesterId));
  const [noticeRows, unreadNudges, blockedProfiles] = await Promise.all([
    db.select({ notice: socialNotices, actorId: users.id, accountName: users.name, socialDisplayName: userSettings.socialDisplayName, socialNameMode: userSettings.socialNameMode })
      .from(socialNotices).innerJoin(users, eq(socialNotices.actorId, users.id)).innerJoin(userSettings, eq(userSettings.userId, users.id))
      .where(and(eq(socialNotices.recipientId, userId), isNull(socialNotices.readAt))).orderBy(desc(socialNotices.createdAt)).limit(24),
    db.select({ nudge: friendNudges, actorId: users.id, accountName: users.name, socialDisplayName: userSettings.socialDisplayName, socialNameMode: userSettings.socialNameMode, actorAllowsNudges: userSettings.allowFriendNudges })
      .from(friendNudges).innerJoin(users, eq(friendNudges.senderId, users.id)).innerJoin(userSettings, eq(userSettings.userId, users.id))
      .where(and(eq(friendNudges.recipientId, userId), isNull(friendNudges.readAt))).orderBy(desc(friendNudges.createdAt)).limit(24),
    getSocialProfiles([...outgoingBlockedIds]),
  ]);
  const notices = [] as Array<{ id: number; actor: { id: number; name: string }; message: string; createdAt: Date }>;
  if (viewerSettings.socialNotificationsEnabled) {
    for (const row of noticeRows) {
      if (row.notice.kind === "nudge" || blockedIds.has(row.actorId) || await isMutedBy(userId, row.actorId)) continue;
      const validActor = row.notice.kind === "friend_request"
        ? incomingRequestActorIds.has(row.actorId)
        : acceptedIdSet.has(row.actorId);
      if (!validActor) continue;
      notices.push({
        id: row.notice.id,
        actor: { id: row.actorId, name: displaySocialName({ accountName: row.accountName, socialDisplayName: row.socialDisplayName, socialNameMode: row.socialNameMode }) },
        message: row.notice.message,
        createdAt: row.notice.createdAt,
      });
    }
  }
  const nudges = [] as Array<{ id: number; actor: { id: number; name: string }; message: string; createdAt: Date }>;
  if (viewerSettings.allowFriendNudges) {
    for (const row of unreadNudges) {
      if (
        !acceptedIdSet.has(row.actorId) ||
        blockedIds.has(row.actorId) ||
        !row.actorAllowsNudges ||
        await isMutedBy(userId, row.actorId) ||
        await isMutedBy(row.actorId, userId)
      ) continue;
      nudges.push({
        id: row.nudge.id,
        actor: { id: row.actorId, name: displaySocialName({ accountName: row.accountName, socialDisplayName: row.socialDisplayName, socialNameMode: row.socialNameMode }) },
        message: NUDGE_LABELS[row.nudge.preset],
        createdAt: row.nudge.createdAt,
      });
    }
  }
  return {
    socialProfile: await getSocialProfile(userId),
    friends: visibleConnections.filter((connection) => connection.status === "accepted").map(toConnectionItem),
    incoming: visibleConnections.filter((connection) => connection.status === "pending" && connection.recipientId === userId).map(toConnectionItem),
    outgoing: visibleConnections.filter((connection) => connection.status === "pending" && connection.requesterId === userId).map(toConnectionItem),
    activities: await listFriendActivities(userId, acceptedIds),
    myActivities: await listFriendActivities(userId, [userId]),
    challenges: await getLiftChallenges(userId),
    notices,
    nudges,
    blocked: blockedProfiles.map((profile) => ({ id: profile.id, name: profile.name })),
  };
}

export async function getFriendProfile(userId: number, friendId: number) {
  await assertAcceptedFriendship(userId, friendId);
  const [profile, challenges, viewerSettings, muted, mutedByFriend, nudge, myMaxes, mySharedMaxes, friendMaxes] = await Promise.all([
    getSocialProfile(friendId), getLiftChallenges(userId), getUserSettings(userId), isMutedBy(userId, friendId), isMutedBy(friendId, userId), nudgeState(userId, friendId), listActualBestLifts(userId, false), listActualBestLifts(userId, true), listActualBestLifts(friendId, true),
  ]);
  const viewerByLift = new Map(myMaxes.map((lift) => [challengeLiftKey(lift), lift]));
  const viewerSharedByLift = new Map(mySharedMaxes.map((lift) => [challengeLiftKey(lift), lift]));
  const visibleFriendMaxes = (profile.sharesActivity ? friendMaxes : []).filter((lift) => isComparisonLift(lift.exerciseName));
  const friendByLift = new Map(visibleFriendMaxes.map((lift) => [challengeLiftKey(lift), lift]));
  const keys = [...new Set([...myMaxes, ...visibleFriendMaxes].filter((lift) => isComparisonLift(lift.exerciseName)).map(challengeLiftKey))];
  const comparisons = keys.map((key) => {
    const viewerLift = viewerByLift.get(key);
    const friendLift = friendByLift.get(key);
    const viewerSharedLift = viewerSharedByLift.get(key);
    const lift = viewerLift ?? friendLift!;
    return { exerciseName: lift.exerciseName, equipment: lift.equipment, viewerBest: viewerLift ? fromKilograms(viewerLift.bestWeightKg, viewerSettings.unit) : null, viewerSharedBest: viewerSettings.shareFriendActivity && viewerSharedLift ? fromKilograms(viewerSharedLift.bestWeightKg, viewerSettings.unit) : null, friendBest: friendLift ? fromKilograms(friendLift.bestWeightKg, viewerSettings.unit) : null, unit: viewerSettings.unit };
  }).sort((a, b) => a.exerciseName.localeCompare(b.exerciseName) || a.equipment.localeCompare(b.equipment));
  const toViewerLift = (lift: ActualLift) => ({ exerciseName: lift.exerciseName, equipment: lift.equipment, oneRepMax: fromKilograms(lift.bestWeightKg, viewerSettings.unit), unit: viewerSettings.unit });
  const challengeableLifts = visibleFriendMaxes.filter((lift) => viewerSharedByLift.has(challengeLiftKey(lift))).map((lift) => ({
    ...toViewerLift(lift),
    viewerOneRepMax: viewerByLift.has(challengeLiftKey(lift)) ? fromKilograms(viewerByLift.get(challengeLiftKey(lift))!.bestWeightKg, viewerSettings.unit) : null,
    // The challenge target must always use this published source, never a private personal best.
    viewerSharedBest: fromKilograms(viewerSharedByLift.get(challengeLiftKey(lift))!.bestWeightKg, viewerSettings.unit),
  }));
  const canNudge = !muted && !mutedByFriend && nudge.bothOptedIn && nudge.isInactive && !nudge.recentlySent;
  const unavailableLine = muted || mutedByFriend ? "Nudges are unavailable right now." : nudgeUnavailableLine(nudge);
  return {
    profile: { ...profile, muted, canNudge, nudgeUnavailableLine: unavailableLine },
    muted,
    canNudge,
    nudgeUnavailableLine: unavailableLine,
    activities: profile.sharesActivity ? await listFriendActivities(userId, [friendId]) : [],
    friendMaxes: visibleFriendMaxes.map(toViewerLift).sort((a, b) => a.exerciseName.localeCompare(b.exerciseName) || a.equipment.localeCompare(b.equipment)),
    challengeableLifts,
    comparisons,
    challenges: challenges.filter((challenge) => challenge.otherPerson.id === friendId),
  };
}

async function bestActualWeightKgForExercise(userId: number, exerciseId: number, excludeWorkoutId?: number) {
  const db = await requireDb();
  const settings = await getUserSettings(userId);
  const rows = await db.select({ workoutId: workouts.id, actualWeight: workoutSets.actualWeight, actualWeightKg: workoutSets.actualWeightKg }).from(workoutSets).innerJoin(workoutExercises, eq(workoutSets.workoutExerciseId, workoutExercises.id)).innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id)).where(and(eq(workouts.userId, userId), eq(workoutExercises.exerciseId, exerciseId), isNotNull(workouts.completedAt)));
  return rows.reduce((best, row) => row.workoutId === excludeWorkoutId ? best : Math.max(best, actualWeightKg(row, settings.unit)), 0);
}

async function publishFriendActivitiesForWorkout(userId: number, workout: NonNullable<Awaited<ReturnType<typeof getWorkout>>>) {
  const settings = await getUserSettings(userId);
  if (!settings.shareFriendActivity || workout.isPrivate || !workout.completedAt || !(await getAcceptedFriendIds(userId)).length) return;
  const db = await requireDb();
  await db.transaction(async (tx) => {
    const current = await tx.select({ isPrivate: workouts.isPrivate, completedAt: workouts.completedAt }).from(workouts).where(and(eq(workouts.id, workout.id), eq(workouts.userId, userId))).for("update");
    if (!current[0]?.completedAt || current[0].isPrivate) return;
    await tx.insert(friendActivities).values({ actorId: userId, workoutId: workout.id, kind: "workout_completed", publishKey: `completed:${workout.id}`, workoutName: workout.name, occurredAt: current[0].completedAt }).onDuplicateKeyUpdate({ set: { publishKey: `completed:${workout.id}` } });
    for (const entry of workout.exercises) {
      const currentBest = entry.sets.reduce((best, set) => Math.max(best, actualWeightKg(set, settings.unit)), 0);
      if (!currentBest || currentBest <= await bestActualWeightKgForExercise(userId, entry.exerciseId, workout.id)) continue;
      await tx.insert(friendActivities).values({ actorId: userId, workoutId: workout.id, kind: "personal_record", publishKey: `record:${workout.id}:${entry.exerciseId}`, exerciseId: entry.exerciseId, exerciseName: entry.exercise.name, equipment: entry.exercise.equipment, valueKg: currentBest, occurredAt: current[0].completedAt }).onDuplicateKeyUpdate({ set: { publishKey: `record:${workout.id}:${entry.exerciseId}`, valueKg: currentBest } });
    }
  });
}

async function removeFriendActivitiesForWorkout(userId: number, workoutId: number) {
  const db = await requireDb();
  const activities = await db.select({ id: friendActivities.id }).from(friendActivities).where(and(eq(friendActivities.actorId, userId), eq(friendActivities.workoutId, workoutId)));
  const activityIds = activities.map((activity) => activity.id);
  if (!activityIds.length) return;
  await db.delete(activityReactions).where(inArray(activityReactions.activityId, activityIds));
  await db.delete(activityComments).where(inArray(activityComments.activityId, activityIds));
  await db.delete(friendActivities).where(inArray(friendActivities.id, activityIds));
}

async function resolveChallengesForWorkout(userId: number, workout: NonNullable<Awaited<ReturnType<typeof getWorkout>>>) {
  if (!workout.completedAt) return;
  const db = await requireDb();
  const won = await db.transaction(async (tx) => {
    const currentWorkout = await tx
      .select({ id: workouts.id, isPrivate: workouts.isPrivate, completedAt: workouts.completedAt })
      .from(workouts)
      .where(and(eq(workouts.id, workout.id), eq(workouts.userId, userId)))
      .for("update");
    const completion = currentWorkout[0];
    if (!completion?.completedAt || completion.isPrivate) return [] as Array<{ challengeId: number; otherId: number }>;

    const winnerPublication = await tx
      .select({ id: friendActivities.id })
      .from(friendActivities)
      .where(and(eq(friendActivities.actorId, userId), eq(friendActivities.workoutId, workout.id), eq(friendActivities.kind, "workout_completed")))
      .for("update");
    if (!winnerPublication[0]) return [] as Array<{ challengeId: number; otherId: number }>;

    const winnerSettings = await tx
      .select({ unit: userSettings.unit, sharesActivity: userSettings.shareFriendActivity })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .for("update");
    if (!winnerSettings[0]?.sharesActivity) return [] as Array<{ challengeId: number; otherId: number }>;

    const challenges = await tx
      .select()
      .from(liftChallenges)
      .where(
        and(
          eq(liftChallenges.status, "active"),
          eq(liftChallenges.opponentId, userId),
          isNotNull(liftChallenges.targetKg),
          isNotNull(liftChallenges.targetWorkoutId),
        ),
      )
      .for("update");
    const wonChallenges: Array<{ challengeId: number; otherId: number }> = [];
    for (const challenge of challenges) {
      if (
        !challenge.acceptedAt ||
        challenge.acceptedAt.getTime() >= completion.completedAt.getTime() ||
        completion.completedAt.getTime() > challenge.endsAt.getTime() ||
        !challenge.targetWorkoutId ||
        !challenge.targetKg ||
        Number(challenge.targetKg) <= 0
      ) continue;

      const [connection, blocks, opponentSettings, targetWorkout, targetPublication] = await Promise.all([
        tx
          .select({ id: friendConnections.id })
          .from(friendConnections)
          .where(
            and(
              eq(friendConnections.status, "accepted"),
              or(
                and(eq(friendConnections.requesterId, userId), eq(friendConnections.recipientId, challenge.creatorId)),
                and(eq(friendConnections.requesterId, challenge.creatorId), eq(friendConnections.recipientId, userId)),
              ),
            ),
          )
          .for("update"),
        tx
          .select({ id: friendBlocks.id })
          .from(friendBlocks)
          .where(
            or(
              and(eq(friendBlocks.blockerId, userId), eq(friendBlocks.blockedId, challenge.creatorId)),
              and(eq(friendBlocks.blockerId, challenge.creatorId), eq(friendBlocks.blockedId, userId)),
            ),
          )
          .for("update"),
        tx
          .select({ sharesActivity: userSettings.shareFriendActivity })
          .from(userSettings)
          .where(eq(userSettings.userId, challenge.creatorId))
          .for("update"),
        tx
          .select({ id: workouts.id })
          .from(workouts)
          .where(and(eq(workouts.id, challenge.targetWorkoutId), eq(workouts.userId, challenge.creatorId), eq(workouts.isPrivate, 0), isNotNull(workouts.completedAt)))
          .for("update"),
        tx
          .select({ id: friendActivities.id })
          .from(friendActivities)
          .where(and(eq(friendActivities.actorId, challenge.creatorId), eq(friendActivities.workoutId, challenge.targetWorkoutId), eq(friendActivities.kind, "workout_completed")))
          .for("update"),
      ]);
      if (!connection[0] || blocks[0] || !opponentSettings[0]?.sharesActivity || !targetWorkout[0] || !targetPublication[0]) continue;

      const matching = workout.exercises.filter((entry) => challengeLiftKey({ exerciseName: entry.exercise.name, equipment: entry.exercise.equipment }) === challengeLiftKey(challenge));
      const best = matching.reduce((maximum, entry) => Math.max(maximum, ...entry.sets.map((set) => actualWeightKg(set, winnerSettings[0].unit))), 0);
      if (best <= Number(challenge.targetKg)) continue;
      const result = await tx
        .update(liftChallenges)
        .set({ status: "won", winnerId: userId, winningWorkoutId: workout.id, winningAt: completion.completedAt })
        .where(and(eq(liftChallenges.id, challenge.id), eq(liftChallenges.status, "active"), isNull(liftChallenges.winnerId)));
      if (affectedRows(result) !== 1) continue;
      await tx
        .insert(friendActivities)
        .values({
          actorId: userId,
          opponentId: challenge.creatorId,
          challengeId: challenge.id,
          workoutId: workout.id,
          kind: "challenge_win",
          publishKey: `challenge_win:${challenge.id}`,
          workoutName: "Challenge win",
          exerciseName: challenge.exerciseName,
          equipment: challenge.equipment,
          valueKg: best,
          occurredAt: completion.completedAt,
        })
        .onDuplicateKeyUpdate({ set: { publishKey: `challenge_win:${challenge.id}`, exerciseName: challenge.exerciseName, equipment: challenge.equipment, valueKg: best } });
      wonChallenges.push({ challengeId: challenge.id, otherId: challenge.creatorId });
    }
    return wonChallenges;
  });
  for (const item of won) await queueSocialNotice({ recipientId: item.otherId, actorId: userId, kind: "challenge_win", message: "won your lift challenge." });
}

export async function createLiftChallenge(userId: number, opponentId: number, lift: ChallengeLift, timeZoneOffsetMinutes = 0) {
  if (userId === opponentId) throw new Error("Choose a friend to continue.");
  const [myMaxes, opponentMaxes, settings] = await Promise.all([listActualBestLifts(userId, true), listActualBestLifts(opponentId, true), getUserSettings(userId)]);
  const matchingLift = myMaxes.find((candidate) => challengeLiftKey(candidate) === challengeLiftKey(lift));
  const opponentHasLift = opponentMaxes.some((candidate) => challengeLiftKey(candidate) === challengeLiftKey(lift));
  if (!matchingLift || !opponentHasLift) throw new Error("Choose a lift that both of you have completed first.");
  const db = await requireDb();
  const id = await db.transaction(async (tx) => {
    const participantIds = [userId, opponentId].sort((a, b) => a - b);
    const participants = await tx.select({ id: users.id }).from(users).where(inArray(users.id, participantIds)).orderBy(asc(users.id)).for("update");
    if (participants.length !== 2) throw new Error("This social action is unavailable.");
    const [connection, blocks, participantSettings, targetWorkout, targetPublication, existing] = await Promise.all([
      tx
        .select({ id: friendConnections.id })
        .from(friendConnections)
        .where(
          and(
            eq(friendConnections.status, "accepted"),
            or(
              and(eq(friendConnections.requesterId, userId), eq(friendConnections.recipientId, opponentId)),
              and(eq(friendConnections.requesterId, opponentId), eq(friendConnections.recipientId, userId)),
            ),
          ),
        )
        .for("update"),
      tx
        .select({ id: friendBlocks.id })
        .from(friendBlocks)
        .where(
          or(
            and(eq(friendBlocks.blockerId, userId), eq(friendBlocks.blockedId, opponentId)),
            and(eq(friendBlocks.blockerId, opponentId), eq(friendBlocks.blockedId, userId)),
          ),
        )
        .for("update"),
      tx
        .select({ userId: userSettings.userId, sharesActivity: userSettings.shareFriendActivity })
        .from(userSettings)
        .where(inArray(userSettings.userId, participantIds))
        .orderBy(asc(userSettings.userId))
        .for("update"),
      tx
        .select({ id: workouts.id })
        .from(workouts)
        .where(and(eq(workouts.id, matchingLift.bestWorkoutId), eq(workouts.userId, userId), eq(workouts.isPrivate, 0), isNotNull(workouts.completedAt)))
        .for("update"),
      tx
        .select({ id: friendActivities.id })
        .from(friendActivities)
        .where(and(eq(friendActivities.actorId, userId), eq(friendActivities.workoutId, matchingLift.bestWorkoutId), eq(friendActivities.kind, "workout_completed")))
        .for("update"),
      tx
        .select({ id: liftChallenges.id })
        .from(liftChallenges)
        .where(and(eq(liftChallenges.exerciseName, matchingLift.exerciseName), eq(liftChallenges.equipment, matchingLift.equipment), inArray(liftChallenges.status, ["pending", "active"]), or(and(eq(liftChallenges.creatorId, userId), eq(liftChallenges.opponentId, opponentId)), and(eq(liftChallenges.creatorId, opponentId), eq(liftChallenges.opponentId, userId)))))
        .for("update"),
    ]);
    if (!connection[0] || blocks[0]) throw new Error("This social action is unavailable.");
    if (participantSettings.length !== 2 || participantSettings.some((participant) => !participant.sharesActivity)) throw new Error("Both friends must share activity to start a lift challenge.");
    if (!targetWorkout[0] || !targetPublication[0]) throw new Error("Choose a lift that both of you have completed first.");
    if (existing[0]) throw new Error("You already have an active challenge for that lift.");
    const result = await tx.insert(liftChallenges).values({ creatorId: userId, opponentId, exerciseName: matchingLift.exerciseName, equipment: matchingLift.equipment, targetKg: matchingLift.bestWeightKg, targetWorkoutId: matchingLift.bestWorkoutId, endsAt: challengeEndsAt(new Date(), timeZoneOffsetMinutes) });
    return insertId(result);
  });
  const target = fromKilograms(matchingLift.bestWeightKg, settings.unit);
  await queueSocialNotice({ recipientId: opponentId, actorId: userId, kind: "challenge", message: "sent you a lift challenge." });
  return { id, targetKg: matchingLift.bestWeightKg, target, unit: settings.unit, targetDescription: formatChallengeTarget({ target, unit: settings.unit, exerciseName: matchingLift.exerciseName }), message: `${challengeLiftLabel(matchingLift)} challenge sent.` };
}

export async function respondToLiftChallenge(userId: number, challengeId: number, accept: boolean) {
  const db = await requireDb();
  const rows = await db.select().from(liftChallenges).where(and(eq(liftChallenges.id, challengeId), eq(liftChallenges.opponentId, userId), eq(liftChallenges.status, "pending"))).limit(1);
  const challenge = rows[0];
  if (!challenge || challenge.endsAt.getTime() <= Date.now()) throw new Error("This challenge is no longer available.");
  await assertAcceptedFriendship(userId, challenge.creatorId);
  if (
    accept &&
    (
      !challenge.targetWorkoutId ||
      !challenge.targetKg ||
      Number(challenge.targetKg) <= 0 ||
      !(await hasCurrentSharedFriendship(userId, challenge.creatorId)) ||
      !(await isPublishedCompletedWorkout(challenge.creatorId, challenge.targetWorkoutId))
    )
  ) throw new Error("This challenge is no longer available.");
  const result = await db.update(liftChallenges).set({ status: accept ? "active" : "declined", acceptedAt: accept ? new Date() : null }).where(and(eq(liftChallenges.id, challengeId), eq(liftChallenges.status, "pending")));
  if (affectedRows(result) !== 1) throw new Error("This challenge is no longer available.");
  if (accept) await queueSocialNotice({ recipientId: challenge.creatorId, actorId: userId, kind: "challenge_accepted", message: "accepted your lift challenge." });
  return { accepted: accept };
}

export async function cancelLiftChallenge(userId: number, challengeId: number) {
  const db = await requireDb();
  const rows = await db.select({ id: liftChallenges.id }).from(liftChallenges).where(and(eq(liftChallenges.id, challengeId), inArray(liftChallenges.status, ["pending", "active"]), or(eq(liftChallenges.creatorId, userId), eq(liftChallenges.opponentId, userId)))).limit(1);
  if (!rows[0]) throw new Error("This challenge is no longer active.");
  await db.update(liftChallenges).set({ status: "canceled" }).where(eq(liftChallenges.id, challengeId));
  return { success: true } as const;
}

export async function rematchLiftChallenge(userId: number, challengeId: number, timeZoneOffsetMinutes = 0) {
  const db = await requireDb();
  const rows = await db.select().from(liftChallenges).where(and(eq(liftChallenges.id, challengeId), or(eq(liftChallenges.creatorId, userId), eq(liftChallenges.opponentId, userId)))).limit(1);
  const challenge = rows[0];
  if (!challenge || !challenge.winnerId || challenge.winnerId === userId) throw new Error("Only the challenge loser can request a rematch.");
  const otherId = challenge.creatorId === userId ? challenge.opponentId : challenge.creatorId;
  if (challenge.status === "active") await db.update(liftChallenges).set({ status: "canceled" }).where(eq(liftChallenges.id, challenge.id));
  return createLiftChallenge(userId, otherId, { exerciseName: challenge.exerciseName, equipment: challenge.equipment }, timeZoneOffsetMinutes);
}

export async function addChallengeNote(userId: number, challengeId: number, preset: ChallengeNotePreset) {
  const db = await requireDb();
  const rows = await db.select().from(liftChallenges).where(and(eq(liftChallenges.id, challengeId), eq(liftChallenges.status, "active"), or(eq(liftChallenges.creatorId, userId), eq(liftChallenges.opponentId, userId)))).limit(1);
  const challenge = rows[0];
  if (!challenge || challenge.endsAt.getTime() <= Date.now()) throw new Error("This challenge has ended.");
  const otherId = challenge.creatorId === userId ? challenge.opponentId : challenge.creatorId;
  await assertAcceptedFriendship(userId, otherId);
  if (await isMutedBy(otherId, userId)) throw new Error("This friend has muted nudges and notes.");
  const result = await db.insert(challengeNotes).values({ challengeId, authorId: userId, preset });
  await queueSocialNotice({ recipientId: otherId, actorId: userId, kind: "challenge_note", message: CHALLENGE_NOTE_LABELS[preset] });
  return { id: insertId(result), preset, label: CHALLENGE_NOTE_LABELS[preset] };
}

export function getLiftChallenges(userId: number, options: { includeHistory: true }): Promise<LiftChallengeHistory[]>;
export function getLiftChallenges(userId: number, options?: { includeHistory?: false }): Promise<LiftChallengeView[]>;
export async function getLiftChallenges(userId: number, options?: { includeHistory?: boolean }): Promise<LiftChallengeHistory[] | LiftChallengeView[]> {
  const db = await requireDb();
  const query = db.select().from(liftChallenges).where(options?.includeHistory ? or(eq(liftChallenges.creatorId, userId), eq(liftChallenges.opponentId, userId)) : and(or(eq(liftChallenges.creatorId, userId), eq(liftChallenges.opponentId, userId)), inArray(liftChallenges.status, ["pending", "active", "won"]))).orderBy(desc(liftChallenges.createdAt));
  const rows = options?.includeHistory ? await query : await query.limit(24);
  // This is used only by account export. Keep raw historical/legacy records there;
  // normal social endpoints never expose a target without a current published source.
  if (options?.includeHistory) return rows;

  const now = Date.now();
  const visible = [] as typeof rows;
  for (const row of rows) {
    const otherId = row.creatorId === userId ? row.opponentId : row.creatorId;
    if ((row.status === "active" || row.status === "pending") && row.endsAt.getTime() <= now) {
      await db.update(liftChallenges).set({ status: "expired" }).where(eq(liftChallenges.id, row.id));
      continue;
    }
    if (!row.targetWorkoutId || !row.targetKg || Number(row.targetKg) <= 0) continue;
    if (!(await hasCurrentSharedFriendship(userId, otherId))) continue;
    if (!(await isPublishedCompletedWorkout(row.creatorId, row.targetWorkoutId))) continue;
    if (
      row.status === "won" &&
      (
        !row.winnerId ||
        (row.winnerId !== row.creatorId && row.winnerId !== row.opponentId) ||
        !(await isPublishedCompletedWorkout(row.winnerId, row.winningWorkoutId))
      )
    ) continue;
    visible.push(row);
  }
  const people = await getSocialProfiles(visible.flatMap((row) => [row.creatorId, row.opponentId]));
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const notes = visible.length ? await db.select({ note: challengeNotes, authorId: users.id, accountName: users.name, socialDisplayName: userSettings.socialDisplayName, socialNameMode: userSettings.socialNameMode }).from(challengeNotes).innerJoin(users, eq(challengeNotes.authorId, users.id)).innerJoin(userSettings, eq(userSettings.userId, users.id)).where(inArray(challengeNotes.challengeId, visible.map((row) => row.id))).orderBy(asc(challengeNotes.createdAt)) : [];
  const mutedNoteAuthorIds = new Set<number>();
  for (const authorId of new Set(notes.map((item) => item.authorId))) {
    if (await isMutedBy(userId, authorId)) mutedNoteAuthorIds.add(authorId);
  }
  const visibleNotes = notes.filter((item) => !mutedNoteAuthorIds.has(item.authorId));
  const settings = await getUserSettings(userId);
  return Promise.all(visible.map(async (row): Promise<LiftChallengeView> => {
    const otherId = row.creatorId === userId ? row.opponentId : row.creatorId;
    const other = peopleById.get(otherId) ?? { id: otherId, name: "Lift Log athlete", sharesActivity: false };
    const canShowScores = canViewChallengeScores({ status: row.status, friendshipAccepted: true, hasTarget: true });
    const [viewerScoreKg, otherScoreKg] = canShowScores ? await Promise.all([bestActualWeightKgByLift(userId, row.exerciseName, row.equipment), bestActualWeightKgByLift(otherId, row.exerciseName, row.equipment)]) : [0, 0];
    const target = fromKilograms(Number(row.targetKg), settings.unit);
    return {
      id: row.id,
      creatorId: row.creatorId,
      opponentId: row.opponentId,
      exerciseName: row.exerciseName,
      equipment: row.equipment,
      status: row.status,
      endsAt: row.endsAt,
      acceptedAt: row.acceptedAt,
      winnerId: row.winnerId,
      winningAt: row.winningAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      targetKg: Number(row.targetKg),
      otherPerson: { id: other.id, name: other.name },
      target,
      unit: settings.unit,
      targetDescription: formatChallengeTarget({ target, unit: settings.unit, exerciseName: row.exerciseName }),
      viewerScore: viewerScoreKg ? fromKilograms(viewerScoreKg, settings.unit) : null,
      otherScore: otherScoreKg ? fromKilograms(otherScoreKg, settings.unit) : null,
      notes: visibleNotes.filter((item) => item.note.challengeId === row.id).map((item) => ({ id: item.note.id, preset: item.note.preset, label: CHALLENGE_NOTE_LABELS[item.note.preset], createdAt: item.note.createdAt, author: { id: item.authorId, name: displaySocialName({ accountName: item.accountName, socialDisplayName: item.socialDisplayName, socialNameMode: item.socialNameMode }) } })),
    };
  }));
}


export async function setTipsDismissed(userId: number, dismissed: boolean) {
  await getUserSettings(userId);
  const db = await requireDb();
  await db.update(userSettings).set({ tipsDismissed: dismissed ? 1 : 0 }).where(eq(userSettings.userId, userId));
  return { success: true };
}

export async function getWorkoutFinishSummary(userId: number, workoutId: number, weekStart: string, weekEnd: string) {
  const workout = await getWorkout(userId, workoutId);
  if (!workout?.completedAt) throw new Error("Completed workout not found.");
  const settings = await getUserSettings(userId);
  const db = await requireDb();
  const allDates = await db.select({ id: workouts.id, completedAt: workouts.completedAt }).from(workouts).where(and(eq(workouts.userId, userId), isNotNull(workouts.completedAt)));
  const start = new Date(weekStart).getTime(), end = new Date(weekEnd).getTime();
  const workoutsThisWeek = allDates.filter(row => row.completedAt && new Date(row.completedAt).getTime() >= start && new Date(row.completedAt).getTime() < end).length;
  const prior = await db.select({ exerciseId: workoutExercises.exerciseId, weight: workoutSets.actualWeight, weightKg: workoutSets.actualWeightKg }).from(workoutSets).innerJoin(workoutExercises,eq(workoutSets.workoutExerciseId,workoutExercises.id)).innerJoin(workouts,eq(workoutExercises.workoutId,workouts.id)).where(and(eq(workouts.userId,userId),ne(workouts.id,workoutId),isNotNull(workouts.completedAt),lte(workouts.completedAt,workout.completedAt)));
  const newBests = workout.exercises.flatMap(entry => {
    const best = Math.max(0, ...entry.sets.map(set => Number(set.actualWeight ?? 0)));
    const previous = prior.filter(set => set.exerciseId === entry.exerciseId);
    const priorBest = Math.max(0, ...previous.map(set => set.weightKg === null ? Number(set.weight ?? 0) : fromKilograms(Number(set.weightKg), settings.unit)));
    return best > priorBest ? [{ exerciseId: entry.exerciseId, name: entry.exercise.name, equipment: entry.exercise.equipment, weight: best }] : [];
  });
  const sets = workout.exercises.flatMap(entry => entry.sets);
  return { id: workout.id, unit: settings.unit, totalWeight: Number(sets.reduce((sum,set) => sum + Number(set.actualWeight ?? 0) * Number(set.actualReps ?? 0),0).toFixed(4)), sets: sets.length, durationSeconds: workout.durationSeconds, workoutsThisWeek, newBests, hasFriends: (await getAcceptedFriendIds(userId)).length > 0, isShared: !workout.isPrivate && Boolean(settings.shareFriendActivity) };
}
export async function shareCompletedWorkout(userId: number, workoutId: number) {
  const workout = await getWorkout(userId, workoutId);
  if (!workout?.completedAt) throw new Error("Completed workout not found.");
  if (!(await getAcceptedFriendIds(userId)).length) throw new Error("Add a friend first.");
  const settings = await getUserSettings(userId);
  if (!settings.shareFriendActivity) throw new Error("Sharing is off. Turn on Share with friends in Settings first.");
  const db = await requireDb();
  await db.update(workouts).set({isPrivate: 0}).where(and(eq(workouts.id,workoutId),eq(workouts.userId,userId)));
  const saved = await getWorkout(userId,workoutId);
  if (saved) {
    await publishFriendActivitiesForWorkout(userId, saved);
    await resolveChallengesForWorkout(userId, saved);
  }
  return { shared:true };
}
