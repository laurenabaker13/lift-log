import { z } from "zod";
import * as db from "./db";
import { actionLink, emailDeliveryConfigured, safeBrowserOrigin, sendTransactionalEmail } from "./_core/email";
import { ENV } from "./_core/env";
import { getSessionCookieName, getSessionCookieOptions } from "./_core/cookies";
import { analyzePlanImport, getPlanSourceDownloadUrl } from "./_core/plan-import";
import { getLiftGuidance } from "./_core/lift-guidance";
import { createOpaqueToken, hashOpaqueToken } from "./_core/secure-tokens";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";

const setInput = z.object({
  targetReps: z.number().int().min(1).max(100),
  actualReps: z.number().int().min(1).max(100).nullable().optional(),
  actualWeight: z.number().min(0).max(5000).nullable().optional(),
  rpe: z.number().min(1).max(10).nullable().optional(),
});

const exercisePlanInput = z.object({
  exerciseId: z.number().int().positive(),
  plannedPercent: z.number().min(0.3).max(1).nullable().optional(),
  plannedWeight: z.number().min(0).max(5000).nullable().optional(),
  targetRpe: z.number().min(1).max(10).nullable().optional(),
  sets: z.array(setInput).min(1).max(12),
});

const workoutPlanInput = z.object({
  name: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(2000).nullable().optional(),
  isPrivate: z.boolean().optional(),
  durationSeconds: z.number().int().min(0).max(604800).optional(),
  exercises: z.array(exercisePlanInput).min(1).max(20),
});

const programExerciseInput = z.object({
  exerciseId: z.number().int().positive(),
  prescriptionMode: z.enum(["percent", "weight"]),
  intensityPercent: z.number().min(0.5).max(0.95).nullable().optional(),
  plannedWeight: z.number().min(0).max(5000).nullable().optional(),
  targetRpe: z.number().min(1).max(10).nullable().optional(),
  sets: z.array(z.object({ targetReps: z.number().int().min(1).max(100) })).min(1).max(12),
});

const programWorkoutInput = z.object({
  name: z.string().trim().min(1).max(120),
  dayOfWeek: z.number().int().min(0).max(6),
  exercises: z.array(programExerciseInput).min(1).max(20),
});

const importedProgramInput = z.object({
  importId: z.number().int().positive(),
  name: z.string().trim().min(1).max(120),
  trainerNotes: z.string().trim().max(4000).nullable().optional(),
  weeks: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    workouts: z.array(z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      name: z.string().trim().min(1).max(120),
      exercises: z.array(z.object({
        name: z.string().trim().min(1).max(120),
        equipment: z.string().trim().min(1).max(48),
        prescriptionMode: z.enum(["percent", "weight"]),
        intensityPercent: z.number().min(0.5).max(0.95).nullable().optional(),
        plannedWeight: z.number().min(0).max(5000).nullable().optional(),
        weightUnit: z.enum(["lb", "kg"]).nullable().optional(),
        targetRpe: z.number().min(1).max(10).nullable().optional(),
        sets: z.array(z.object({ targetReps: z.number().int().min(1).max(100) })).min(1).max(12),
      })).min(1).max(20),
    })).min(1).max(14),
  })).min(1).max(12),
});

function messageOrigin(requestOrigin: string | string[] | undefined) {
  const configured = safeBrowserOrigin(undefined, ENV.appUrl);
  const origin = configured || safeBrowserOrigin(typeof requestOrigin === "string" ? requestOrigin : undefined, "");
  if (!origin) throw new Error("Open Lift Log from its browser link before sending an email invitation.");
  return origin;
}

export const appRouter = router({
  system: systemRouter,
  settings: router({
    get: protectedProcedure.query(({ ctx }) => db.getUserSettings(ctx.user.id)),
    setUnit: protectedProcedure
      .input(z.object({ unit: z.enum(["lb", "kg"]) }))
      .mutation(({ ctx, input }) => db.setUserUnit(ctx.user.id, input.unit)),
  }),
  account: router({
    profile: protectedProcedure.query(({ ctx }) => db.getAccountProfile(ctx.user.id)),
    dismissTips: protectedProcedure.mutation(({ ctx }) => db.setTipsDismissed(ctx.user.id, true)),
    resetTips: protectedProcedure.mutation(({ ctx }) => db.setTipsDismissed(ctx.user.id, false)),
    completeOnboarding: protectedProcedure.mutation(({ ctx }) => db.completeOnboarding(ctx.user.id)),
    setWorkspace: protectedProcedure
      .input(z.object({ workspace: z.enum(["athlete", "coach"]) }))
      .mutation(({ ctx, input }) => db.setAccountWorkspace(ctx.user.id, input.workspace)),
    setSocialProfile: protectedProcedure
      .input(z.object({
        displayName: z.string().trim().max(48).nullable().optional(),
        nameMode: z.enum(["account", "display"]),
        shareActivity: z.boolean(),
      }))
      .mutation(({ ctx, input }) => db.setSocialProfile(ctx.user.id, {
        displayName: input.displayName ?? null,
        nameMode: input.nameMode,
        shareActivity: input.shareActivity,
      })),
    exportData: protectedProcedure.mutation(({ ctx }) => db.exportAccountData(ctx.user.id)),
    deleteData: protectedProcedure
      .input(z.object({ confirmation: z.literal("DELETE") }))
      .mutation(({ ctx }) => db.deleteAccountData(ctx.user.id)),
  }),
  exercise: router({
    list: protectedProcedure.query(({ ctx }) => db.listExercises(ctx.user.id)),
    createCustom: protectedProcedure
      .input(z.object({ name: z.string().trim().min(2).max(120), equipment: z.string().trim().min(2).max(48) }))
      .mutation(({ ctx, input }) => db.createCustomExercise(ctx.user.id, input.name, input.equipment)),
    getOrCreateVariant: protectedProcedure
      .input(z.object({ sourceExerciseId: z.number().int().positive(), equipment: z.string().trim().min(2).max(48), ownerUserId: z.number().int().positive().optional(), clientExerciseKey: z.string().trim().min(1).max(64).optional() }))
      .mutation(async ({ ctx, input }) => {
        const ownerUserId = input.ownerUserId ?? ctx.user.id;
        await db.assertCanManageExerciseOwner(ctx.user.id, ownerUserId);
        return db.getOrCreateExerciseVariant(ownerUserId, input.sourceExerciseId, input.equipment);
      }),
  }),
  workout: router({
    finishSummary: protectedProcedure.input(z.object({ id: z.number().int().positive(), weekStart: z.string().datetime(), weekEnd: z.string().datetime() })).query(({ctx,input}) => db.getWorkoutFinishSummary(ctx.user.id,input.id,input.weekStart,input.weekEnd)),
    shareCompleted: protectedProcedure.input(z.object({ id:z.number().int().positive() })).mutation(({ctx,input}) => db.shareCompletedWorkout(ctx.user.id,input.id)),
    listRecent: protectedProcedure.query(({ ctx }) => db.listRecentWorkouts(ctx.user.id)),
    createEmpty: protectedProcedure.mutation(({ ctx }) => db.createEmptyWorkout(ctx.user.id)),
    createFromPlan: protectedProcedure.input(workoutPlanInput).mutation(({ ctx, input }) => db.createWorkoutFromPlan(ctx.user.id, input)),
    syncGuest: protectedProcedure
      .input(
        z.object({
          clientKey: z.string().trim().min(1).max(64),
          unit: z.enum(["lb", "kg"]),
          days: z.number().int().min(1).max(7).nullable().optional(),
          performedAt: z.string().datetime(),
          durationSeconds: z.number().int().min(0).max(604800),
          name: z.string().trim().min(1).max(120),
          exercises: z.array(exercisePlanInput).min(1).max(20),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        // Once a guest account is upgraded or claimed, its original clientKey may be replayed
        // safely, but a pre-existing non-guest account may not create new guest drafts.
        const existing = await db.getWorkoutByClientKey(ctx.user.id, input.clientKey);
        if (existing) return existing;
        if (ctx.user.loginMethod !== "guest") {
          throw new TRPCError({ code: "FORBIDDEN", message: "A guest session is required to create this first-workout draft." });
        }
        return db.syncGuestWorkout(ctx.user.id, { ...input, performedAt: new Date(input.performedAt) });
      }),
    get: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(({ ctx, input }) => db.getWorkout(ctx.user.id, input.id)),
    save: protectedProcedure
      .input(workoutPlanInput.extend({ id: z.number().int().positive(), completed: z.boolean() }))
      .mutation(({ ctx, input }) => db.saveWorkout(ctx.user.id, input.id, input, input.completed)),
    copyToToday: protectedProcedure
      .input(z.object({ sourceWorkoutId: z.number().int().positive() }))
      .mutation(({ ctx, input }) => db.copyWorkoutToToday(ctx.user.id, input.sourceWorkoutId)),
    delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ ctx, input }) => db.deleteWorkout(ctx.user.id, input.id)),
  }),
  template: router({
    list: protectedProcedure.query(({ ctx }) => db.listTemplates(ctx.user.id)),
    get: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(({ ctx, input }) => db.getTemplate(ctx.user.id, input.id)),
    create: protectedProcedure.input(workoutPlanInput).mutation(({ ctx, input }) => db.createTemplate(ctx.user.id, input)),
    use: protectedProcedure.input(z.object({ templateId: z.number().int().positive() })).mutation(({ ctx, input }) => db.useTemplate(ctx.user.id, input.templateId)),
    delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ ctx, input }) => db.deleteTemplate(ctx.user.id, input.id)),
  }),
  program: router({
    getActive: protectedProcedure.query(({ ctx }) => db.getActiveProgram(ctx.user.id)),
    create: protectedProcedure.input(z.object({ name: z.string().trim().min(1).max(120) })).mutation(({ ctx, input }) => db.createProgram(ctx.user.id, input.name)),
    archive: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ ctx, input }) => db.archiveProgram(ctx.user.id, input.id)),
    getWorkout: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(({ ctx, input }) => db.getProgramWorkout(ctx.user.id, input.id)),
    createWorkout: protectedProcedure
      .input(z.object({ weekId: z.number().int().positive(), name: z.string().trim().min(1).max(120), dayOfWeek: z.number().int().min(0).max(6) }))
      .mutation(({ ctx, input }) => db.createProgramWorkout(ctx.user.id, input.weekId, input)),
    saveWorkout: protectedProcedure.input(programWorkoutInput.extend({ id: z.number().int().positive() })).mutation(({ ctx, input }) => db.saveProgramWorkout(ctx.user.id, input.id, input)),
    duplicateWeek: protectedProcedure.input(z.object({ sourceWeekId: z.number().int().positive() })).mutation(({ ctx, input }) => db.duplicateProgramWeek(ctx.user.id, input.sourceWeekId)),
    startWorkout: protectedProcedure.input(z.object({ programWorkoutId: z.number().int().positive() })).mutation(({ ctx, input }) => db.startProgramWorkout(ctx.user.id, input.programWorkoutId)),
    skipWorkout: protectedProcedure.input(z.object({ programWorkoutId: z.number().int().positive() })).mutation(({ ctx, input }) => db.skipProgramWorkout(ctx.user.id, input.programWorkoutId)),
    undoSkipWorkout: protectedProcedure.input(z.object({ programWorkoutId: z.number().int().positive() })).mutation(({ ctx, input }) => db.undoSkipProgramWorkout(ctx.user.id, input.programWorkoutId)),
    analyzeImport: protectedProcedure.input(z.object({ importId: z.number().int().positive() })).mutation(({ ctx, input }) => analyzePlanImport(ctx.user.id, input.importId)),
    createFromImport: protectedProcedure.input(importedProgramInput).mutation(({ ctx, input }) => db.createProgramFromImport(ctx.user.id, input.importId, input)),
    appendFromImport: protectedProcedure.input(importedProgramInput.extend({ programId: z.number().int().positive() })).mutation(({ ctx, input }) => db.appendProgramWeeksFromImport(ctx.user.id, input.programId, input.importId, input)),
    sourceDownload: protectedProcedure.input(z.object({ programId: z.number().int().positive() })).mutation(({ ctx, input }) => getPlanSourceDownloadUrl(ctx.user.id, input.programId)),
  }),
  progress: router({
    list: protectedProcedure
      .input(z.object({ athleteId: z.number().int().positive().optional() }).optional())
      .query(({ ctx, input }) => db.getVisibleProgress(ctx.user.id, input?.athleteId)),
  }),
  friends: router({
    hub: protectedProcedure.query(({ ctx }) => db.getFriendsHub(ctx.user.id)),
    invite: protectedProcedure.mutation(({ ctx }) => db.getFriendInviteCode(ctx.user.id)),
    redeemInvite: protectedProcedure
      .input(z.object({ code: z.string().trim().regex(/^[A-Za-z0-9]{16,40}$/) }))
      .mutation(({ ctx, input }) => db.redeemFriendInvite(ctx.user.id, input.code)),
    profile: protectedProcedure
      .input(z.object({ friendId: z.number().int().positive() }))
      .query(({ ctx, input }) => db.getFriendProfile(ctx.user.id, input.friendId)),
    request: protectedProcedure
      .input(z.object({ email: z.string().trim().email().max(320) }))
      .mutation(({ ctx, input }) => db.requestFriendByEmail(ctx.user.id, input.email)),
    respond: protectedProcedure
      .input(z.object({ requestId: z.number().int().positive(), accept: z.boolean() }))
      .mutation(({ ctx, input }) => db.respondToFriendRequest(ctx.user.id, input.requestId, input.accept)),
    remove: protectedProcedure
      .input(z.object({ friendId: z.number().int().positive() }))
      .mutation(({ ctx, input }) => db.removeFriend(ctx.user.id, input.friendId)),
    setPreferences: protectedProcedure
      .input(z.object({ allowNudges: z.boolean().optional(), notificationsEnabled: z.boolean().optional() }))
      .mutation(({ ctx, input }) => db.setFriendPreferences(ctx.user.id, input)),
    setMuted: protectedProcedure
      .input(z.object({ friendId: z.number().int().positive(), muted: z.boolean() }))
      .mutation(({ ctx, input }) => db.setFriendMuted(ctx.user.id, input.friendId, input.muted)),
    block: protectedProcedure
      .input(z.object({ friendId: z.number().int().positive() }))
      .mutation(({ ctx, input }) => db.blockFriend(ctx.user.id, input.friendId)),
    unblock: protectedProcedure
      .input(z.object({ friendId: z.number().int().positive() }))
      .mutation(({ ctx, input }) => db.unblockFriend(ctx.user.id, input.friendId)),
    sendNudge: protectedProcedure
      .input(z.object({ friendId: z.number().int().positive(), preset: z.enum(["where_are_you", "gym_misses_you"]) }))
      .mutation(({ ctx, input }) => db.sendFriendNudge(ctx.user.id, input.friendId, input.preset)),
    readNotice: protectedProcedure
      .input(z.object({ noticeId: z.number().int().positive() }))
      .mutation(({ ctx, input }) => db.readSocialNotice(ctx.user.id, input.noticeId)),
    readNudge: protectedProcedure
      .input(z.object({ nudgeId: z.number().int().positive() }))
      .mutation(({ ctx, input }) => db.readFriendNudge(ctx.user.id, input.nudgeId)),
    react: protectedProcedure
      .input(z.object({ activityId: z.number().int().positive(), kind: z.enum(["fist_bump", "fire", "strong"]).optional().default("strong") }))
      .mutation(({ ctx, input }) => db.toggleActivityReaction(ctx.user.id, input.activityId, input.kind)),
    comment: protectedProcedure
      .input(z.object({ activityId: z.number().int().positive(), message: z.string().trim().min(1).max(180) }))
      .mutation(({ ctx, input }) => db.addActivityComment(ctx.user.id, input.activityId, input.message)),
    deleteComment: protectedProcedure
      .input(z.object({ commentId: z.number().int().positive() }))
      .mutation(({ ctx, input }) => db.deleteActivityComment(ctx.user.id, input.commentId)),
    createChallenge: protectedProcedure
      .input(z.object({ friendId: z.number().int().positive(), exerciseName: z.string().trim().min(1).max(120), equipment: z.string().trim().min(1).max(48), timeZoneOffsetMinutes: z.number().int().min(-840).max(840).optional() }))
      .mutation(({ ctx, input }) => db.createLiftChallenge(ctx.user.id, input.friendId, { exerciseName: input.exerciseName, equipment: input.equipment }, input.timeZoneOffsetMinutes)),
    respondToChallenge: protectedProcedure
      .input(z.object({ challengeId: z.number().int().positive(), accept: z.boolean() }))
      .mutation(({ ctx, input }) => db.respondToLiftChallenge(ctx.user.id, input.challengeId, input.accept)),
    cancelChallenge: protectedProcedure
      .input(z.object({ challengeId: z.number().int().positive() }))
      .mutation(({ ctx, input }) => db.cancelLiftChallenge(ctx.user.id, input.challengeId)),
    rematch: protectedProcedure
      .input(z.object({ challengeId: z.number().int().positive(), timeZoneOffsetMinutes: z.number().int().min(-840).max(840).optional() }))
      .mutation(({ ctx, input }) => db.rematchLiftChallenge(ctx.user.id, input.challengeId, input.timeZoneOffsetMinutes)),
    sendChallengeNote: protectedProcedure
      .input(z.object({ challengeId: z.number().int().positive(), preset: z.enum(["nice_lift", "your_turn", "catching_up", "taking_lead", "coming_for_you"]) }))
      .mutation(({ ctx, input }) => db.addChallengeNote(ctx.user.id, input.challengeId, input.preset)),
  }),
  coach: router({
    liftGuide: protectedProcedure
      .input(z.object({ exerciseId: z.number().int().positive(), name: z.string().trim().min(1).max(120), equipment: z.string().trim().min(1).max(48) }))
      .mutation(({ input }) => getLiftGuidance(input)),
    listClients: protectedProcedure.query(({ ctx }) => db.listCoachClients(ctx.user.id)),
    getClient: protectedProcedure.input(z.object({ athleteId: z.number().int().positive() })).query(({ ctx, input }) => db.getCoachClient(ctx.user.id, input.athleteId)),
    createProgram: protectedProcedure
      .input(z.object({ athleteId: z.number().int().positive(), name: z.string().trim().min(1).max(120) }))
      .mutation(({ ctx, input }) => db.createProgramForClient(ctx.user.id, input.athleteId, input.name)),
    suggest: protectedProcedure
      .input(z.object({ athleteId: z.number().int().positive(), title: z.string().trim().min(1).max(120), message: z.string().trim().min(1).max(1200) }))
      .mutation(({ ctx, input }) => db.createCoachSuggestion({ trainerId: ctx.user.id, ...input })),
    invite: protectedProcedure
      .input(z.object({ email: z.string().trim().email().max(320) }))
      .mutation(async ({ ctx, input }) => {
        if (!emailDeliveryConfigured()) throw new Error("Email delivery is not configured yet. Add a verified sender before inviting athletes.");
        const email = input.email.toLowerCase();
        const token = createOpaqueToken();
        const invitation = await db.createCoachInvitation({ trainerId: ctx.user.id, athleteEmail: email, tokenHash: hashOpaqueToken(token), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
        const origin = messageOrigin(ctx.req.headers.origin);
        const link = actionLink(origin, "/invite", token);
        const sender = ctx.user.name?.trim() || "Your coach";
        const delivery = await sendTransactionalEmail({
          to: email,
          subject: `${sender} invited you to Lift Log`,
          text: `${sender} invited you to connect in Lift Log. Accept or decline here: ${link}\n\nThis invitation expires in 7 days.`,
          html: `<p><strong>${sender}</strong> invited you to connect in Lift Log.</p><p><a href="${link}">Review invitation</a></p><p>This invitation expires in 7 days.</p>`,
        });
        if (!delivery.delivered) throw new Error(delivery.reason);
        return { invitationId: invitation.id, message: "Invitation email sent." };
      }),
    incoming: protectedProcedure.query(({ ctx }) => db.getIncomingCoachInvitations(ctx.user.id)),
    respondToInvite: protectedProcedure
      .input(z.object({ token: z.string().min(20).max(200), accept: z.boolean() }))
      .mutation(({ ctx, input }) => {
        if (!ctx.user.email) throw new Error("This account does not have an email address.");
        return db.acceptCoachInvitation({ athleteId: ctx.user.id, athleteEmail: ctx.user.email, tokenHash: hashOpaqueToken(input.token), accept: input.accept });
      }),
    athleteSuggestions: protectedProcedure.query(({ ctx }) => db.getAthleteSuggestions(ctx.user.id)),
  }),
  auth: router({
    me: publicProcedure.query(({ ctx }) =>
      ctx.user
        ? { id: ctx.user.id, openId: ctx.user.openId, name: ctx.user.name, email: ctx.user.email, loginMethod: ctx.user.loginMethod, lastSignedIn: ctx.user.lastSignedIn }
        : null,
    ),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(getSessionCookieName(ctx.req), getSessionCookieOptions(ctx.req));
      return { success: true } as const;
    }),
  }),
});

export type AppRouter = typeof appRouter;
