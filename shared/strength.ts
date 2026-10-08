export type Unit = "lb" | "kg";
const KG_PER_LB = 0.45359237;

/**
 * Store full precision in kilograms, but never surface binary floating-point
 * residue in a controlled text field after a round trip (for example 20 lb
 * becoming 19.999999999999996). Four decimals preserve fractional plates and
 * equipment increments while keeping display values stable.
 */
export function normalizeWeight(value: number) {
  return Number(value.toFixed(4));
}

export function toKilograms(weight: number, unit: Unit): number {
  return unit === "lb" ? weight * KG_PER_LB : weight;
}

export function fromKilograms(weightKg: number, unit: Unit): number {
  return normalizeWeight(unit === "lb" ? weightKg / KG_PER_LB : weightKg);
}

export function estimateOneRepMax(weight: number, reps: number): number | null {
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || weight <= 0 || reps <= 0) {
    return null;
  }
  return weight * (1 + reps / 30);
}

export function estimateThreeRepMax(oneRepMax: number | null): number | null {
  if (!oneRepMax || !Number.isFinite(oneRepMax) || oneRepMax <= 0) return null;
  return oneRepMax / (1 + 3 / 30);
}

export function estimateRepMax(oneRepMax: number | null, reps: number): number | null {
  if (!oneRepMax || !Number.isFinite(oneRepMax) || oneRepMax <= 0 || !Number.isInteger(reps) || reps < 1) {
    return null;
  }
  // The 1RM row represents the current estimated 1RM itself. Higher-rep rows
  // invert the same Epley relationship used for the app's strength estimate.
  return reps === 1 ? oneRepMax : oneRepMax / (1 + reps / 30);
}

export function loadIncrement(unit: Unit) {
  return unit === "lb" ? 5 : 2.5;
}

export function roundSuggestedWeight(weight: number | null, unit: Unit): number | null {
  if (!weight || !Number.isFinite(weight) || weight <= 0) return null;
  const increment = unit === "lb" ? 2.5 : 1;
  return Math.round(weight / increment) * increment;
}

export function suggestedWeight(
  oneRepMax: number | null,
  percentage: number | null | undefined,
  unit: Unit,
): number | null {
  if (!oneRepMax || !percentage || percentage <= 0 || percentage > 1) return null;
  return roundSuggestedWeight(oneRepMax * percentage, unit);
}

export function suggestedRepMaxWeight(
  oneRepMax: number | null,
  targetReps: number,
  intensityPercent: number | null | undefined,
  unit: Unit,
): number | null {
  return suggestedWeight(estimateRepMax(oneRepMax, targetReps), intensityPercent, unit);
}

export type LoadRecommendation = {
  weight: number | null;
  basis: "first_session" | "increase" | "hold" | "reduce";
};

/**
 * Returns a safe next-session starting load. A rep-max percentage is used only
 * when the athlete has no usable history. Once they complete a matching rep
 * goal, the last completed load is the anchor so the app never recommends a
 * surprising drop simply because a generic percentage is lower.
 */
export function recommendStartingLoad(input: {
  oneRepMax: number | null | undefined;
  targetReps: number;
  intensityPercent: number | null | undefined;
  unit: Unit;
  lastWeight: number | null | undefined;
  lastActualReps: number | null | undefined;
  lastRpe: number | null | undefined;
  targetRpe: number | null | undefined;
}): LoadRecommendation {
  const fallback = suggestedRepMaxWeight(input.oneRepMax ?? null, input.targetReps, input.intensityPercent, input.unit);
  const usableLastWeight = input.lastWeight && Number.isFinite(input.lastWeight) && input.lastWeight > 0 ? input.lastWeight : null;
  const usableLastReps = input.lastActualReps && Number.isFinite(input.lastActualReps) && input.lastActualReps > 0 ? input.lastActualReps : null;
  if (!usableLastWeight || !usableLastReps) return { weight: fallback, basis: "first_session" };

  const increment = loadIncrement(input.unit);
  const targetRpe = input.targetRpe ?? 7;
  const completedGoal = usableLastReps >= input.targetReps;
  const effort = input.lastRpe;

  if (completedGoal && (effort === null || effort === undefined || effort <= targetRpe)) {
    return { weight: roundSuggestedWeight(usableLastWeight + increment, input.unit), basis: "increase" };
  }
  if (completedGoal && effort !== null && effort !== undefined && effort <= targetRpe + 1) {
    return { weight: roundSuggestedWeight(usableLastWeight, input.unit), basis: "hold" };
  }
  return { weight: roundSuggestedWeight(Math.max(increment, usableLastWeight - increment), input.unit), basis: "reduce" };
}

export function recommendationLabel(basis: LoadRecommendation["basis"], unit: Unit) {
  const increment = loadIncrement(unit);
  if (basis === "increase") return `Matched your goal at or below target effort · +${increment} ${unit}`;
  if (basis === "hold") return "Matched your goal, but it was hard · hold steady";
  if (basis === "reduce") return `Missed the goal or reported high effort · −${increment} ${unit}`;
  return "Starting point from your estimated rep max";
}

export function guidedIntensityPercent(input: {
  basePercent: number | null | undefined;
  targetRpe: number | null | undefined;
  lastRpe: number | null | undefined;
  lastActualReps: number | null | undefined;
  targetReps: number;
}): number | null {
  const base = input.basePercent;
  if (!base || !Number.isFinite(base) || base <= 0) return null;
  const targetRpe = input.targetRpe ?? 7;
  let next = base;
  if (
    input.lastRpe !== null &&
    input.lastRpe !== undefined &&
    input.lastActualReps !== null &&
    input.lastActualReps !== undefined
  ) {
    if (input.lastActualReps >= input.targetReps && input.lastRpe < targetRpe) next += 0.025;
    else if (input.lastRpe > targetRpe + 1) next -= 0.025;
  }
  return Math.min(0.95, Math.max(0.5, Number(next.toFixed(3))));
}

export function formatWeight(value: number | null | undefined, unit: Unit, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const rounded = Number(value.toFixed(digits));
  return `${rounded} ${unit}`;
}
