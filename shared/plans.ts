export type ReusablePlanEntry = {
  exerciseId: number;
  plannedPercent?: number | null;
  plannedWeight?: number | null;
  targetRpe?: number | null;
  sets: Array<{ targetReps: number }>;
};

/**
 * Copies only the plan: exercise, prescription, target RPE, and target reps.
 * Completed performance (actual weight, reps, and RPE) is deliberately omitted.
 */
export function freshPlanFromEntries(entries: ReusablePlanEntry[]) {
  return entries.map((entry) => ({
    exerciseId: entry.exerciseId,
    plannedPercent: entry.plannedPercent ?? null,
    plannedWeight: entry.plannedWeight ?? null,
    targetRpe: entry.targetRpe ?? null,
    sets: entry.sets.map((set) => ({ targetReps: set.targetReps })),
  }));
}
