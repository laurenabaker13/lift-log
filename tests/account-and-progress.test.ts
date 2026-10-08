import { describe, expect, it } from "vitest";
import { createOpaqueToken, hashOpaqueToken, isFutureDate } from "../server/_core/secure-tokens";
import { normalizedTrendPoints, progressJourneyLine, progressSummary } from "../shared/progress";

describe("account token safety", () => {
  it("creates opaque tokens and stable one-way hashes", () => {
    const token = createOpaqueToken();
    expect(token.length).toBeGreaterThan(30);
    expect(hashOpaqueToken(token)).toHaveLength(64);
    expect(hashOpaqueToken(token)).toBe(hashOpaqueToken(token));
    expect(hashOpaqueToken(token)).not.toBe(hashOpaqueToken(createOpaqueToken()));
  });

  it("recognizes an unused future expiry", () => {
    expect(isFutureDate(new Date(Date.now() + 60_000))).toBe(true);
    expect(isFutureDate(new Date(Date.now() - 60_000))).toBe(false);
  });
});

describe("progress summaries", () => {
  const history = [
    { workoutId: 1, performedAt: "2026-01-01", estimatedOneRepMax: 100, actualWeight: 75, rpe: 6 },
    { workoutId: 2, performedAt: "2026-01-08", estimatedOneRepMax: 110, actualWeight: 82.5, rpe: 7 },
    { workoutId: 3, performedAt: "2026-01-15", estimatedOneRepMax: 105, actualWeight: 80, rpe: null },
  ];

  it("keeps the heaviest logged weight and latest entry distinct", () => {
    const summary = progressSummary(history);
    expect(summary.best).toBe(82.5);
    expect(summary.latest?.actualWeight).toBe(80);
    expect(summary.averageRpe).toBe(6.5);
  });

  it("normalizes a chart series without changing the recorded values", () => {
    const points = normalizedTrendPoints(history, 40);
    expect(points).toHaveLength(3);
    expect(points[0]?.value).toBe(75);
    expect(points[1]?.y).toBe(0);
  });

  it("plots one best point per workout and uses that best set for the latest workout", () => {
    const workouts = [
      { workoutId: 22, performedAt: "2026-02-08", estimatedOneRepMax: 116, actualWeight: 87.5, rpe: null },
      { workoutId: 22, performedAt: "2026-02-08", estimatedOneRepMax: 123, actualWeight: 92.5, rpe: null },
      { workoutId: 21, performedAt: "2026-02-01", estimatedOneRepMax: 110, actualWeight: 82.5, rpe: null },
      { workoutId: 21, performedAt: "2026-02-01", estimatedOneRepMax: 104, actualWeight: 80, rpe: null },
    ];

    const summary = progressSummary(workouts);
    const points = normalizedTrendPoints(workouts, 40);

    expect(summary.chronological).toHaveLength(2);
    expect(summary.chronological.map((point) => point.actualWeight)).toEqual([82.5, 92.5]);
    expect(summary.latest?.actualWeight).toBe(92.5);
    expect(points.map((point) => point.value)).toEqual([82.5, 92.5]);
  });

  it("keeps a single workout visible even when it has several recorded sets", () => {
    const summary = progressSummary([
      { workoutId: 50, performedAt: "2026-03-01", estimatedOneRepMax: 100, actualWeight: 75, rpe: null },
      { workoutId: 50, performedAt: "2026-03-01", estimatedOneRepMax: 115, actualWeight: 85, rpe: null },
    ]);

    expect(summary.chronological).toHaveLength(1);
    expect(summary.latest?.actualWeight).toBe(85);
  });
});

 describe("real starting best", () => {
 it("ignores estimates and shows the first logged weight", () => {
 const one = [{workoutId:1, performedAt:"2026-10-01", actualWeight:5, estimatedOneRepMax:7.5, rpe:null}];
 expect(progressSummary(one).best).toBe(5);
 expect(progressJourneyLine(one, "lb")).toBe("Starting line set.");
 const two=[...one,{workoutId:2,performedAt:"2026-10-08",actualWeight:10,estimatedOneRepMax:15,rpe:null}];
 expect(progressJourneyLine(two,"lb")).toBe("Started at 5 lb, now 10 lb.");
 });
 it("keeps zero-weight logs and chooses the heaviest rather than highest estimate",()=>{
 const points=normalizedTrendPoints([{workoutId:1,performedAt:"2026-01-01",actualWeight:0,estimatedOneRepMax:null,rpe:null},{workoutId:2,performedAt:"2026-01-02",actualWeight:5,estimatedOneRepMax:10,rpe:null},{workoutId:2,performedAt:"2026-01-02",actualWeight:6,estimatedOneRepMax:7,rpe:null}],40);
 expect(points.map(p=>p.value)).toEqual([0,6]);
 });
 });
