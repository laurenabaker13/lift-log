import { describe, expect, it } from "vitest";
import {
  CHALLENGE_NOTE_LABELS,
  FRIEND_NUDGE_COOLDOWN_DAYS,
  FRIEND_NUDGE_INACTIVITY_DAYS,
  FRIEND_REACTION_LABELS,
  FRIEND_REQUEST_RECEIPT,
  NUDGE_OPT_IN_LINE,
  NUDGE_RECENTLY_SENT_LINE,
  canViewChallengeScores,
  challengeEndsAt,
  challengeLiftKey,
  challengeLiftLabel,
  displaySocialName,
  formatChallengeTarget,
  nudgeUnavailableLine,
} from "../shared/social";

describe("social contracts", () => {
  it("creates stable keys and readable labels for any lift and equipment variant", () => {
    expect(challengeLiftKey({ exerciseName: "  Romanian Deadlift ", equipment: "Kettlebell" })).toBe("romanian deadlift::kettlebell");
    expect(challengeLiftLabel({ exerciseName: "Romanian Deadlift", equipment: "Kettlebell" })).toBe("Romanian Deadlift · Kettlebell");
  });

  it("uses the upcoming Sunday UTC end, not a rolling challenge duration", () => {
    expect(challengeEndsAt(new Date("2026-10-07T12:00:00.000Z")).toISOString()).toBe("2026-10-11T23:59:59.000Z");
    expect(challengeEndsAt(new Date("2026-10-11T23:59:59.999Z")).toISOString()).toBe("2026-10-18T23:59:59.000Z");
  });

  it("ends on local Sunday in both eastward and westward time zones", () => {
    const now = new Date("2026-10-08T12:00:00.000Z");
    expect(challengeEndsAt(now, -480).toISOString()).toBe("2026-10-11T15:59:59.000Z");
    expect(challengeEndsAt(now, 240).toISOString()).toBe("2026-10-12T03:59:59.000Z");
  });

  it("uses a chosen display name without exposing account email", () => {
    expect(displaySocialName({ accountName: "Lauren Baker", socialDisplayName: "LiftQueen", socialNameMode: "display" })).toBe("LiftQueen");
    expect(displaySocialName({ accountName: "Lauren Baker", socialDisplayName: "LiftQueen", socialNameMode: "account" })).toBe("Lauren Baker");
  });

  it("normalizes legacy reactions to Kudos and limits live score visibility to targeted active challenges", () => {
    expect(canViewChallengeScores({ status: "active", friendshipAccepted: true, hasTarget: true })).toBe(true);
    expect(canViewChallengeScores({ status: "pending", friendshipAccepted: true, hasTarget: true })).toBe(false);
    expect(canViewChallengeScores({ status: "active", friendshipAccepted: false, hasTarget: true })).toBe(false);
    expect(canViewChallengeScores({ status: "active", friendshipAccepted: true, hasTarget: false })).toBe(false);
    expect(FRIEND_REACTION_LABELS.fist_bump).toBe("Kudos");
    expect(FRIEND_REACTION_LABELS.fire).toBe("Kudos");
    expect(FRIEND_REACTION_LABELS.strong).toBe("Kudos");
  });

  it("uses friendly preset text and never supplies an inactivity reason to clients", () => {
    expect(CHALLENGE_NOTE_LABELS.coming_for_you).toBe("Catch me if you can");
    expect(CHALLENGE_NOTE_LABELS.your_turn).toBe("Your turn");
    expect(formatChallengeTarget({ target: 145, unit: "lb", exerciseName: "Bench Press" })).toBe("Beat my 145 lb bench press by Sunday.");
    expect(nudgeUnavailableLine({ bothOptedIn: false, recentlySent: false })).toBe(NUDGE_OPT_IN_LINE);
    expect(nudgeUnavailableLine({ bothOptedIn: true, recentlySent: true })).toBe(NUDGE_RECENTLY_SENT_LINE);
    expect(nudgeUnavailableLine({ bothOptedIn: true, recentlySent: false })).toBeNull();
    expect(FRIEND_NUDGE_INACTIVITY_DAYS).toBe(14);
    expect(FRIEND_NUDGE_COOLDOWN_DAYS).toBe(7);
  });

  it("preserves the generic no-email request receipt", () => {
    expect(FRIEND_REQUEST_RECEIPT).toBe("If they use Lift Log, they can review your request in Friends.");
  });
});
