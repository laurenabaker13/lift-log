export type ProgressPoint = {
  workoutId: number;
  performedAt: Date | string;
  estimatedOneRepMax?: number | null;
  actualWeight: number;
  rpe: number | null;
};

export function bestSetByWorkout(history: ProgressPoint[]) {
  const bestByWorkout = new Map<number, ProgressPoint>();
  for (const entry of history) {
    if (!Number.isFinite(entry.actualWeight) || entry.actualWeight < 0) continue;
    const existing = bestByWorkout.get(entry.workoutId);
    if (!existing || entry.actualWeight > existing.actualWeight) bestByWorkout.set(entry.workoutId, entry);
  }
  return [...bestByWorkout.values()].sort((a, b) =>
    new Date(a.performedAt).getTime() - new Date(b.performedAt).getTime() || a.workoutId - b.workoutId);
}

export function progressSummary(history: ProgressPoint[]) {
  const chronological = bestSetByWorkout(history);
  const best = chronological.length ? Math.max(...chronological.map((item) => item.actualWeight)) : null;
  const latest = chronological.at(-1) ?? null;
  const recentRpe = history.filter((item) => item.rpe !== null).slice(0, 6);
  const averageRpe = recentRpe.length
    ? recentRpe.reduce((total, item) => total + (item.rpe ?? 0), 0) / recentRpe.length : null;
  return { chronological, best, latest, averageRpe };
}

export function progressJourneyLine(history: ProgressPoint[], unit: string) {
  const { chronological, latest } = progressSummary(history);
  if (!latest) return null;
  if (chronological.length === 1) return "Starting line set.";
  const show = (weight: number) => `${Number(weight.toFixed(4))} ${unit}`;
  return `Started at ${show(chronological[0].actualWeight)}, now ${show(latest.actualWeight)}.`;
}

export function normalizedTrendPoints(history: ProgressPoint[], height: number) {
  const values = progressSummary(history).chronological.map((item) => item.actualWeight);
  if (!values.length) return [];
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  return values.map((value, index) => ({
    x: values.length === 1 ? 0.5 : index / (values.length - 1),
    y: values.length === 1 ? height / 2 : height - ((value - min) / range) * height,
    value,
  }));
}
