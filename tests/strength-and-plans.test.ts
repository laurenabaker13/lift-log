import { describe, expect, it } from "vitest";
import { freshPlanFromEntries } from "../shared/plans";
import { estimateOneRepMax, estimateRepMax, estimateThreeRepMax, fromKilograms, guidedIntensityPercent, recommendStartingLoad, roundSuggestedWeight, suggestedRepMaxWeight, suggestedWeight, toKilograms } from "../shared/strength";

describe("strength estimates", () => {
  it("uses the Epley formula for a completed weighted set", () => {
    expect(estimateOneRepMax(85, 5)).toBeCloseTo(99.1667, 3);
    expect(estimateOneRepMax(115, 3)).toBeCloseTo(126.5, 3);
    expect(estimateOneRepMax(85, 8)).toBeCloseTo(107.6667, 3);
    expect(estimateOneRepMax(0, 5)).toBeNull();
  });

  it("derives a three-rep estimate and unit-appropriate suggestions", () => {
    expect(estimateThreeRepMax(200)).toBeCloseTo(181.818, 3);
    expect(roundSuggestedWeight(151.2, "lb")).toBe(150);
    expect(roundSuggestedWeight(71.6, "kg")).toBe(72);
    expect(suggestedWeight(200, 0.75, "lb")).toBe(150);
  });

  it("derives rep-max rows for percentage-based load planning", () => {
    expect(estimateRepMax(200, 1)).toBe(200);
    expect(estimateRepMax(200, 5)).toBeCloseTo(171.429, 3);
    expect(suggestedWeight(estimateRepMax(200, 5), 0.8, "lb")).toBe(137.5);
    // 3RM is the inverse Epley estimate: 200 / 1.1 = 181.8. 90% rounds to 162.5 lb.
    expect(suggestedRepMaxWeight(200, 3, 0.9, "lb")).toBe(162.5);
  });

  it("uses a completed matching set as the next-session anchor", () => {
    const base = { oneRepMax: estimateOneRepMax(85, 8), targetReps: 8, intensityPercent: 0.75, unit: "lb" as const, lastWeight: 85, lastActualReps: 8, targetRpe: 7 };
    expect(recommendStartingLoad({ ...base, lastRpe: 7 })).toEqual({ weight: 90, basis: "increase" });
    expect(recommendStartingLoad({ ...base, lastRpe: 8 })).toEqual({ weight: 85, basis: "hold" });
    expect(recommendStartingLoad({ ...base, lastRpe: 9 })).toEqual({ weight: 80, basis: "reduce" });
    expect(recommendStartingLoad({ ...base, lastActualReps: 7, lastRpe: 7 })).toEqual({ weight: 80, basis: "reduce" });
    expect(recommendStartingLoad({ ...base, lastWeight: null, lastActualReps: null, lastRpe: null }).basis).toBe("first_session");
  });

  it("guides the next intensity without changing the athlete plan automatically", () => {
    expect(guidedIntensityPercent({ basePercent: 0.8, targetRpe: 7, lastRpe: 6, lastActualReps: 8, targetReps: 8 })).toBe(0.825);
    expect(guidedIntensityPercent({ basePercent: 0.8, targetRpe: 7, lastRpe: 6.5, lastActualReps: 8, targetReps: 8 })).toBe(0.825);
    expect(guidedIntensityPercent({ basePercent: 0.8, targetRpe: 7, lastRpe: 8, lastActualReps: 8, targetReps: 8 })).toBe(0.8);
    expect(guidedIntensityPercent({ basePercent: 0.8, targetRpe: 7, lastRpe: 8.5, lastActualReps: 8, targetReps: 8 })).toBe(0.775);
    expect(guidedIntensityPercent({ basePercent: 0.8, targetRpe: 7, lastRpe: 7, lastActualReps: 8, targetReps: 8 })).toBe(0.8);
  });

  it("keeps the physical load equivalent when a display unit changes", () => {
    const loggedLoadKg = toKilograms(135, "lb");
    expect(fromKilograms(loggedLoadKg, "kg")).toBeCloseTo(61.235, 3);
    expect(fromKilograms(loggedLoadKg, "lb")).toBeCloseTo(135, 5);
  });

  it("does not expose binary conversion residue in load fields", () => {
    expect(fromKilograms(toKilograms(20, "lb"), "lb")).toBe(20);
    expect(fromKilograms(toKilograms(20.5, "lb"), "lb")).toBe(20.5);
  });
});

describe("workout reuse", () => {
  it("retains plan details but omits completed performance", () => {
    const source = [{
      exerciseId: 7,
      plannedPercent: 0.75,
      plannedWeight: 135,
      targetRpe: 7,
      sets: [
        { targetReps: 8, actualWeight: 135, actualReps: 8, rpe: 8 },
        { targetReps: 8, actualWeight: 135, actualReps: 7, rpe: 9 },
      ],
    }];
    const fresh = freshPlanFromEntries(source);
    expect(fresh).toEqual([{ exerciseId: 7, plannedPercent: 0.75, plannedWeight: 135, targetRpe: 7, sets: [{ targetReps: 8 }, { targetReps: 8 }] }]);
    expect(source[0].sets[0]).toMatchObject({ actualWeight: 135, rpe: 8 });
  });
});
