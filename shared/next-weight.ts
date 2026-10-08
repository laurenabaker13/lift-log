import type { Unit } from "./strength";

export type NextWeightHistoryEntry = {
  workoutId: number;
  performedAt: Date | string;
  actualWeight: number;
  actualReps: number;
  rpe?: number | null;
};

export type NextWeightFeeling = "easy" | "good" | "hard";

export type NextWeightSuggestion = {
  weight: number;
  lastWeight: number;
  lastReps: number;
  feeling: NextWeightFeeling | null;
  rule: string;
};

function latestWorkout(history: NextWeightHistoryEntry[]) {
  const workouts = new Map<
    number,
    { workoutId: number; performedAt: number; sets: NextWeightHistoryEntry[] }
  >();

  for (const set of history) {
    const performedAt = new Date(set.performedAt).getTime();
    const existing = workouts.get(set.workoutId);
    if (existing) {
      existing.sets.push(set);
      existing.performedAt = Math.max(existing.performedAt, performedAt);
    } else {
      workouts.set(set.workoutId, {
        workoutId: set.workoutId,
        performedAt,
        sets: [set],
      });
    }
  }

  return [...workouts.values()].reduce<{
    workoutId: number;
    performedAt: number;
    sets: NextWeightHistoryEntry[];
  } | null>(
    (latest, workout) =>
      !latest ||
      workout.performedAt > latest.performedAt ||
      (workout.performedAt === latest.performedAt &&
        workout.workoutId > latest.workoutId)
        ? workout
        : latest,
    null,
  );
}

function feelingFor(sets: NextWeightHistoryEntry[]): NextWeightFeeling | null {
  const recordedEffort = sets.flatMap((set) =>
    typeof set.rpe === "number" && Number.isFinite(set.rpe) ? [set.rpe] : [],
  );
  if (!recordedEffort.length) return null;

  const hardest = Math.max(...recordedEffort);
  if (hardest <= 6) return "easy";
  if (hardest <= 8) return "good";
  return "hard";
}

function isBigLegExercise(exerciseName: string) {
  return /squat|deadlift|leg\s*press/i.test(exerciseName);
}

function cleanWeight(weight: number) {
  return Number(weight.toFixed(4));
}

/**
 * Gives a small, repeatable next-session suggestion from every completed set
 * in the latest workout. The heaviest set anchors the recommendation while
 * the hardest effort keeps it conservative.
 */
export function getNextWeight(
  history: NextWeightHistoryEntry[],
  exerciseName: string,
  unit: Unit,
): NextWeightSuggestion | null {
  const latest = latestWorkout(history);
  if (!latest?.sets.length) return null;

  const anchor = latest.sets.reduce((heaviest, set) =>
    set.actualWeight > heaviest.actualWeight ? set : heaviest,
  );
  const feeling = feelingFor(latest.sets);

  if (anchor.actualWeight <= 0) {
    return {
      weight: 0,
      lastWeight: anchor.actualWeight,
      lastReps: anchor.actualReps,
      feeling,
      rule: "Bodyweight stays the same.",
    };
  }

  const everySetReachedEight = latest.sets.every((set) => set.actualReps >= 8);
  const standardIncrease = unit === "lb" ? 5 : 2.5;
  const largeLegIncrease = unit === "lb" ? 10 : 5;
  const increase = isBigLegExercise(exerciseName)
    ? largeLegIncrease
    : standardIncrease;
  const increaseLabel = `${increase} ${unit}`;

  if (feeling === "easy") {
    return {
      weight: cleanWeight(anchor.actualWeight + increase),
      lastWeight: anchor.actualWeight,
      lastReps: anchor.actualReps,
      feeling,
      rule: `Easy work: add ${increaseLabel}.`,
    };
  }

  if (feeling === "hard") {
    return {
      weight: anchor.actualWeight,
      lastWeight: anchor.actualWeight,
      lastReps: anchor.actualReps,
      feeling,
      rule: "Hard work: keep this weight.",
    };
  }

  if (everySetReachedEight) {
    return {
      weight: cleanWeight(anchor.actualWeight + standardIncrease),
      lastWeight: anchor.actualWeight,
      lastReps: anchor.actualReps,
      feeling,
      rule: `8 reps on every set: add ${standardIncrease} ${unit}.`,
    };
  }

  return {
    weight: anchor.actualWeight,
    lastWeight: anchor.actualWeight,
    lastReps: anchor.actualReps,
    feeling,
    rule: "Get 8 reps on every set first.",
  };
}
