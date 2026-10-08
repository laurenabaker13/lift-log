export const FRIEND_REACTIONS = ["fist_bump", "fire", "strong"] as const;
export type FriendReaction = (typeof FRIEND_REACTIONS)[number];

/** Old reactions remain readable, but every reaction is presented as Kudos. */
export const FRIEND_REACTION_LABELS: Record<FriendReaction, string> = {
  fist_bump: "Kudos",
  fire: "Kudos",
  strong: "Kudos",
};

export type ChallengeLift = {
  exerciseName: string;
  equipment: string;
};

export const CHALLENGE_NOTE_PRESETS = ["nice_lift", "your_turn", "catching_up", "taking_lead", "coming_for_you"] as const;
export type ChallengeNotePreset = (typeof CHALLENGE_NOTE_PRESETS)[number];

export const CHALLENGE_NOTE_LABELS: Record<ChallengeNotePreset, string> = {
  nice_lift: "Nice lift",
  your_turn: "Your turn",
  catching_up: "Catching up",
  taking_lead: "I took the lead",
  coming_for_you: "Catch me if you can",
};

export const NUDGE_PRESETS = ["where_are_you", "gym_misses_you"] as const;
export type NudgePreset = (typeof NUDGE_PRESETS)[number];

export const NUDGE_LABELS: Record<NudgePreset, string> = {
  where_are_you: "Where are you bro?",
  gym_misses_you: "Gym misses you.",
};

export const NUDGE_OPT_IN_LINE = "Both friends need to turn nudges on in Settings.";
export const NUDGE_RECENTLY_SENT_LINE = "You can send one nudge per friend each week.";
export const FRIEND_NUDGE_INACTIVITY_DAYS = 14;
export const FRIEND_NUDGE_COOLDOWN_DAYS = 7;
/** Retained for source compatibility; challenges finish at the user's upcoming Sunday boundary. */
export const FRIEND_CHALLENGE_DAYS = 7;
export const FRIEND_REQUEST_RECEIPT = "If they use Lift Log, they can review your request in Friends.";

export function challengeLiftKey(input: ChallengeLift) {
  return `${input.exerciseName.trim().toLocaleLowerCase()}::${input.equipment.trim().toLocaleLowerCase()}`;
}

export function challengeLiftLabel(input: ChallengeLift) {
  return `${input.exerciseName.trim()} · ${input.equipment.trim()}`;
}

/** Sunday 23:59:59 in local time; whole seconds avoid MySQL rounding the deadline into Monday. */
export function challengeEndsAt(from = new Date(), timeZoneOffsetMinutes = 0) {
  const local = new Date(from.getTime() - timeZoneOffsetMinutes * 60000);
  const endsAt = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 23, 59, 59, 0));
  const daysUntilSunday = (7 - local.getUTCDay()) % 7;
  endsAt.setUTCDate(endsAt.getUTCDate() + daysUntilSunday);
  endsAt.setTime(endsAt.getTime() + timeZoneOffsetMinutes * 60000);
  if (endsAt.getTime() <= from.getTime()) endsAt.setUTCDate(endsAt.getUTCDate() + 7);
  return endsAt;
}

export function canViewChallengeScores(input: { status: "pending" | "active" | "declined" | "canceled" | "expired" | "won"; friendshipAccepted: boolean; hasTarget?: boolean }) {
  return input.status === "active" && input.friendshipAccepted && input.hasTarget !== false;
}

export function displaySocialName(input: {
  accountName: string | null | undefined;
  socialDisplayName: string | null | undefined;
  socialNameMode: "account" | "display";
}) {
  const displayName = input.socialDisplayName?.trim();
  const accountName = input.accountName?.trim();
  if (input.socialNameMode === "display" && displayName) return displayName;
  return accountName || displayName || "Lift Log athlete";
}

/** Generic copy only: callers must never disclose another person's inactivity timestamp or reason. */
export function nudgeUnavailableLine(input: { bothOptedIn: boolean; recentlySent: boolean }) {
  if (!input.bothOptedIn) return NUDGE_OPT_IN_LINE;
  if (input.recentlySent) return NUDGE_RECENTLY_SENT_LINE;
  return null;
}

export function formatChallengeTarget(input: { target: number; unit: "lb" | "kg"; exerciseName: string }) {
  const rounded = Math.round(input.target * 10) / 10;
  return `Beat my ${rounded} ${input.unit} ${input.exerciseName.trim().toLowerCase()} by Sunday.`;
}
