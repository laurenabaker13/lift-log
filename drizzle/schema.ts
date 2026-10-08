import {
  double,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 160 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  inviteCode: varchar("inviteCode", { length: 48 }).unique(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  emailVerifiedAt: timestamp("emailVerifiedAt"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const userSettings = mysqlTable("user_settings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  unit: mysqlEnum("unit", ["lb", "kg"]).notNull().default("lb"),
  onboardingComplete: int("onboardingComplete").notNull().default(0),
  unitChosen: int("unitChosen").notNull().default(0),
  firstWeekDays: int("firstWeekDays"),
  tipsDismissed: int("tipsDismissed").notNull().default(0),
  isTrainer: int("isTrainer").notNull().default(0),
  activeWorkspace: mysqlEnum("activeWorkspace", ["athlete", "coach"]).notNull().default("athlete"),
  socialDisplayName: varchar("socialDisplayName", { length: 48 }),
  socialNameMode: mysqlEnum("socialNameMode", ["account", "display"]).notNull().default("account"),
  shareFriendActivity: int("shareFriendActivity").notNull().default(1),
  allowFriendNudges: int("allowFriendNudges").notNull().default(0),
  socialNotificationsEnabled: int("socialNotificationsEnabled").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const accountTokens = mysqlTable(
  "account_tokens",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    type: mysqlEnum("type", ["verify_email", "reset_password"]).notNull(),
    tokenHash: varchar("tokenHash", { length: 128 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    usedAt: timestamp("usedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("account_tokens_hash_unique").on(table.tokenHash),
    index("account_tokens_user_type_idx").on(table.userId, table.type, table.expiresAt),
  ],
);

/** Preserves a guest's existing friend-invite link after its data is claimed by another account. */
export const guestInviteAliases = mysqlTable(
  "guest_invite_aliases",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 48 }).notNull(),
    targetUserId: int("targetUserId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("guest_invite_aliases_code_unique").on(table.code),
    index("guest_invite_aliases_target_idx").on(table.targetUserId),
  ],
);

/** Short-lived, one-use native Sign in with Apple nonce challenges. */
export const appleAuthChallenges = mysqlTable(
  "apple_auth_challenges",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    nonce: varchar("nonce", { length: 96 }).notNull(),
    credentialHash: varchar("credentialHash", { length: 64 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [index("apple_auth_challenges_expires_idx").on(table.expiresAt)],
);

export const coachInvitations = mysqlTable(
  "coach_invitations",
  {
    id: int("id").autoincrement().primaryKey(),
    trainerId: int("trainerId").notNull(),
    athleteEmail: varchar("athleteEmail", { length: 320 }).notNull(),
    invitedUserId: int("invitedUserId"),
    tokenHash: varchar("tokenHash", { length: 128 }).notNull(),
    status: mysqlEnum("status", ["pending", "accepted", "declined", "expired", "canceled"]).notNull().default("pending"),
    expiresAt: timestamp("expiresAt").notNull(),
    respondedAt: timestamp("respondedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("coach_invitations_hash_unique").on(table.tokenHash),
    index("coach_invitations_trainer_idx").on(table.trainerId, table.status),
    index("coach_invitations_email_idx").on(table.athleteEmail, table.status),
  ],
);

export const trainerClients = mysqlTable(
  "trainer_clients",
  {
    id: int("id").autoincrement().primaryKey(),
    trainerId: int("trainerId").notNull(),
    athleteId: int("athleteId").notNull(),
    acceptedAt: timestamp("acceptedAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("trainer_clients_unique").on(table.trainerId, table.athleteId),
    index("trainer_clients_trainer_idx").on(table.trainerId),
    index("trainer_clients_athlete_idx").on(table.athleteId),
  ],
);

export const friendConnections = mysqlTable(
  "friend_connections",
  {
    id: int("id").autoincrement().primaryKey(),
    requesterId: int("requesterId").notNull(),
    recipientId: int("recipientId").notNull(),
    status: mysqlEnum("status", ["pending", "accepted", "declined"]).notNull().default("pending"),
    respondedAt: timestamp("respondedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("friend_connections_direction_unique").on(table.requesterId, table.recipientId),
    index("friend_connections_requester_idx").on(table.requesterId, table.status),
    index("friend_connections_recipient_idx").on(table.recipientId, table.status),
  ],
);

/** A block is directional in storage and denies social operations in either direction. */
export const friendBlocks = mysqlTable(
  "friend_blocks",
  {
    id: int("id").autoincrement().primaryKey(),
    blockerId: int("blockerId").notNull(),
    blockedId: int("blockedId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("friend_blocks_direction_unique").on(table.blockerId, table.blockedId),
    index("friend_blocks_blocked_idx").on(table.blockedId),
  ],
);

export const friendMutes = mysqlTable(
  "friend_mutes",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    mutedUserId: int("mutedUserId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("friend_mutes_direction_unique").on(table.userId, table.mutedUserId),
    index("friend_mutes_muted_idx").on(table.mutedUserId),
  ],
);

/** In-app only. Notice creation locks the recipient settings row before checking its 24-hour window. */
export const socialNotices = mysqlTable(
  "social_notices",
  {
    id: int("id").autoincrement().primaryKey(),
    recipientId: int("recipientId").notNull(),
    actorId: int("actorId").notNull(),
    kind: mysqlEnum("kind", ["friend_request", "nudge", "challenge", "challenge_accepted", "challenge_note", "challenge_win"]).notNull(),
    message: varchar("message", { length: 180 }).notNull(),
    readAt: timestamp("readAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("social_notices_recipient_idx").on(table.recipientId, table.createdAt),
    index("social_notices_actor_idx").on(table.actorId),
  ],
);

/** A pair row is deliberately retained to serialize first and subsequent nudge sends. */
export const friendNudgeLocks = mysqlTable(
  "friend_nudge_locks",
  {
    id: int("id").autoincrement().primaryKey(),
    senderId: int("senderId").notNull(),
    recipientId: int("recipientId").notNull(),
    lastSentAt: timestamp("lastSentAt"),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [uniqueIndex("friend_nudge_locks_pair_unique").on(table.senderId, table.recipientId)],
);

export const friendNudges = mysqlTable(
  "friend_nudges",
  {
    id: int("id").autoincrement().primaryKey(),
    senderId: int("senderId").notNull(),
    recipientId: int("recipientId").notNull(),
    preset: mysqlEnum("preset", ["where_are_you", "gym_misses_you"]).notNull(),
    readAt: timestamp("readAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("friend_nudges_pair_idx").on(table.senderId, table.recipientId, table.createdAt),
    index("friend_nudges_recipient_idx").on(table.recipientId, table.createdAt),
  ],
);

export const friendActivities = mysqlTable(
  "friend_activities",
  {
    id: int("id").autoincrement().primaryKey(),
    actorId: int("actorId").notNull(),
    workoutId: int("workoutId").notNull(),
    kind: mysqlEnum("kind", ["workout_completed", "personal_record", "challenge_win"]).notNull(),
    publishKey: varchar("publishKey", { length: 96 }),
    workoutName: varchar("workoutName", { length: 120 }),
    exerciseId: int("exerciseId"),
    exerciseName: varchar("exerciseName", { length: 120 }),
    equipment: varchar("equipment", { length: 48 }),
    valueKg: double("valueKg"),
    challengeId: int("challengeId"),
    opponentId: int("opponentId"),
    occurredAt: timestamp("occurredAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("friend_activities_publish_unique").on(table.publishKey),
    index("friend_activities_actor_idx").on(table.actorId, table.occurredAt),
    index("friend_activities_workout_idx").on(table.workoutId),
    index("friend_activities_challenge_idx").on(table.challengeId),
  ],
);

export const activityReactions = mysqlTable(
  "activity_reactions",
  {
    id: int("id").autoincrement().primaryKey(),
    activityId: int("activityId").notNull(),
    userId: int("userId").notNull(),
    kind: mysqlEnum("kind", ["fist_bump", "fire", "strong"]).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("activity_reactions_user_unique").on(table.activityId, table.userId),
    index("activity_reactions_activity_idx").on(table.activityId),
  ],
);

export const activityComments = mysqlTable(
  "activity_comments",
  {
    id: int("id").autoincrement().primaryKey(),
    activityId: int("activityId").notNull(),
    authorId: int("authorId").notNull(),
    message: varchar("message", { length: 180 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("activity_comments_activity_idx").on(table.activityId, table.createdAt),
    index("activity_comments_author_idx").on(table.authorId),
  ],
);

export const liftChallenges = mysqlTable(
  "lift_challenges",
  {
    id: int("id").autoincrement().primaryKey(),
    creatorId: int("creatorId").notNull(),
    opponentId: int("opponentId").notNull(),
    exerciseName: varchar("exerciseName", { length: 120 }).notNull(),
    equipment: varchar("equipment", { length: 48 }).notNull(),
    status: mysqlEnum("status", ["pending", "active", "declined", "canceled", "expired", "won"]).notNull().default("pending"),
    endsAt: timestamp("endsAt").notNull(),
    acceptedAt: timestamp("acceptedAt"),
    targetKg: double("targetKg"),
    /** The published completed workout that supplied the creator's target. */
    targetWorkoutId: int("targetWorkoutId"),
    winnerId: int("winnerId"),
    winningWorkoutId: int("winningWorkoutId"),
    winningAt: timestamp("winningAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("lift_challenges_creator_idx").on(table.creatorId, table.status),
    index("lift_challenges_opponent_idx").on(table.opponentId, table.status),
  ],
);

export const challengeNotes = mysqlTable(
  "challenge_notes",
  {
    id: int("id").autoincrement().primaryKey(),
    challengeId: int("challengeId").notNull(),
    authorId: int("authorId").notNull(),
    preset: mysqlEnum("preset", ["nice_lift", "your_turn", "catching_up", "taking_lead", "coming_for_you"]).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [index("challenge_notes_challenge_idx").on(table.challengeId, table.createdAt)],
);

export const coachSuggestions = mysqlTable(
  "coach_suggestions",
  {
    id: int("id").autoincrement().primaryKey(),
    trainerId: int("trainerId").notNull(),
    athleteId: int("athleteId").notNull(),
    title: varchar("title", { length: 120 }).notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    viewedAt: timestamp("viewedAt"),
  },
  (table) => [index("coach_suggestions_athlete_idx").on(table.athleteId, table.createdAt)],
);

export const exercises = mysqlTable(
  "exercises",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId"),
    name: varchar("name", { length: 120 }).notNull(),
    equipment: varchar("equipment", { length: 48 }).notNull(),
    category: varchar("category", { length: 48 }).notNull().default("strength"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [index("exercises_user_idx").on(table.userId)],
);

export const workoutTemplates = mysqlTable(
  "workout_templates",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [index("workout_templates_user_idx").on(table.userId)],
);

export const templateExercises = mysqlTable(
  "template_exercises",
  {
    id: int("id").autoincrement().primaryKey(),
    templateId: int("templateId").notNull(),
    exerciseId: int("exerciseId").notNull(),
    sortOrder: int("sortOrder").notNull(),
    plannedPercent: double("plannedPercent"),
  },
  (table) => [index("template_exercises_template_idx").on(table.templateId)],
);

export const templateSets = mysqlTable(
  "template_sets",
  {
    id: int("id").autoincrement().primaryKey(),
    templateExerciseId: int("templateExerciseId").notNull(),
    sortOrder: int("sortOrder").notNull(),
    targetReps: int("targetReps").notNull(),
  },
  (table) => [index("template_sets_exercise_idx").on(table.templateExerciseId)],
);

export const trainingPrograms = mysqlTable(
  "training_programs",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    notes: text("notes"),
    sourceStorageKey: varchar("sourceStorageKey", { length: 360 }),
    managedByTrainerId: int("managedByTrainerId"),
    isActive: int("isActive").notNull().default(1),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [index("training_programs_user_idx").on(table.userId, table.isActive), index("training_programs_trainer_idx").on(table.managedByTrainerId)],
);

export const planImports = mysqlTable(
  "plan_imports",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    fileName: varchar("fileName", { length: 255 }).notNull(),
    mimeType: varchar("mimeType", { length: 120 }).notNull(),
    storageKey: varchar("storageKey", { length: 360 }).notNull(),
    status: mysqlEnum("status", ["uploaded", "analyzed", "failed"]).notNull().default("uploaded"),
    extractedJson: text("extractedJson"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [index("plan_imports_user_idx").on(table.userId, table.createdAt)],
);

export const programWeeks = mysqlTable(
  "program_weeks",
  {
    id: int("id").autoincrement().primaryKey(),
    programId: int("programId").notNull(),
    weekNumber: int("weekNumber").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [index("program_weeks_program_idx").on(table.programId, table.weekNumber)],
);

export const programWorkouts = mysqlTable(
  "program_workouts",
  {
    id: int("id").autoincrement().primaryKey(),
    programWeekId: int("programWeekId").notNull(),
    dayOfWeek: int("dayOfWeek").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    sortOrder: int("sortOrder").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [index("program_workouts_week_idx").on(table.programWeekId, table.dayOfWeek)],
);

export const programWorkoutSkips = mysqlTable(
  "program_workout_skips",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    programWorkoutId: int("programWorkoutId").notNull().unique(),
    skippedAt: timestamp("skippedAt").defaultNow().notNull(),
  },
  (table) => [index("program_workout_skips_user_idx").on(table.userId, table.skippedAt)],
);

export const programExercises = mysqlTable(
  "program_exercises",
  {
    id: int("id").autoincrement().primaryKey(),
    programWorkoutId: int("programWorkoutId").notNull(),
    exerciseId: int("exerciseId").notNull(),
    sortOrder: int("sortOrder").notNull(),
    prescriptionMode: mysqlEnum("prescriptionMode", ["percent", "weight"]).notNull().default("percent"),
    intensityPercent: double("intensityPercent"),
    plannedWeightKg: double("plannedWeightKg"),
    targetRpe: double("targetRpe"),
  },
  (table) => [index("program_exercises_workout_idx").on(table.programWorkoutId)],
);

export const programSets = mysqlTable(
  "program_sets",
  {
    id: int("id").autoincrement().primaryKey(),
    programExerciseId: int("programExerciseId").notNull(),
    sortOrder: int("sortOrder").notNull(),
    targetReps: int("targetReps").notNull(),
  },
  (table) => [index("program_sets_exercise_idx").on(table.programExerciseId)],
);

export const workouts = mysqlTable(
  "workouts",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    clientKey: varchar("clientKey", { length: 64 }),
    programWorkoutId: int("programWorkoutId"),
    activeProgramWorkoutId: int("activeProgramWorkoutId").unique(),
    name: varchar("name", { length: 120 }).notNull().default("Workout"),
    notes: text("notes"),
    performedAt: timestamp("performedAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
    durationSeconds: int("durationSeconds"),
    isPrivate: int("isPrivate").notNull().default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("workouts_client_key_unique").on(table.clientKey),
    index("workouts_user_date_idx").on(table.userId, table.performedAt),
    index("workouts_program_idx").on(table.userId, table.programWorkoutId, table.performedAt),
  ],
);

export const workoutExercises = mysqlTable(
  "workout_exercises",
  {
    id: int("id").autoincrement().primaryKey(),
    workoutId: int("workoutId").notNull(),
    exerciseId: int("exerciseId").notNull(),
    sortOrder: int("sortOrder").notNull(),
    plannedPercent: double("plannedPercent"),
    plannedWeightKg: double("plannedWeightKg"),
    targetRpe: double("targetRpe"),
  },
  (table) => [index("workout_exercises_workout_idx").on(table.workoutId)],
);

export const workoutSets = mysqlTable(
  "workout_sets",
  {
    id: int("id").autoincrement().primaryKey(),
    workoutExerciseId: int("workoutExerciseId").notNull(),
    sortOrder: int("sortOrder").notNull(),
    targetReps: int("targetReps").notNull(),
    actualReps: int("actualReps"),
    actualWeight: double("actualWeight"),
    actualWeightKg: double("actualWeightKg"),
    rpe: double("rpe"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [index("workout_sets_exercise_idx").on(table.workoutExerciseId)],
);

type UserRecord = typeof users.$inferSelect;
export type User = Omit<UserRecord, "passwordHash" | "inviteCode"> & { passwordHash?: string | null; inviteCode?: string | null };
export type InsertUser = typeof users.$inferInsert;
export type Exercise = typeof exercises.$inferSelect;
export type Workout = typeof workouts.$inferSelect;
