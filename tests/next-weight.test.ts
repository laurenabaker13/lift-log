import { describe, expect, it } from "vitest";
import { getNextWeight } from "../shared/next-weight";

const set = (
  overrides: Partial<{
    workoutId: number;
    performedAt: string;
    actualWeight: number;
    actualReps: number;
    rpe: number | null;
  }> = {},
) => ({
  workoutId: 2,
  performedAt: "2026-03-10T10:00:00.000Z",
  actualWeight: 135,
  actualReps: 8,
  rpe: 7,
  ...overrides,
});

describe("getNextWeight", () => {
  it("returns null when there is no completed history", () => {
    expect(getNextWeight([], "Bench Press", "lb")).toBeNull();
  });

  it("uses every set in the latest workout, with its heaviest set as the anchor", () => {
    const suggestion = getNextWeight(
      [
        set({
          workoutId: 1,
          performedAt: "2026-03-01T10:00:00.000Z",
          actualWeight: 200,
          actualReps: 8,
          rpe: 6,
        }),
        set({ actualWeight: 125, actualReps: 10, rpe: 6 }),
        set({ actualWeight: 135, actualReps: 8, rpe: 6 }),
      ],
      "Bench Press",
      "lb",
    );

    expect(suggestion).toMatchObject({
      weight: 140,
      lastWeight: 135,
      lastReps: 8,
      feeling: "easy",
    });
  });

  it("uses the hardest effort in the latest workout and holds after hard work", () => {
    const suggestion = getNextWeight(
      [
        set({ actualWeight: 135, actualReps: 10, rpe: 6 }),
        set({ actualWeight: 140, actualReps: 8, rpe: 9 }),
      ],
      "Bench Press",
      "lb",
    );

    expect(suggestion).toMatchObject({
      weight: 140,
      lastWeight: 140,
      feeling: "hard",
    });
  });

  it("gives squat, deadlift, and leg press the larger easy increase in each unit", () => {
    expect(getNextWeight([set({ rpe: 6 })], "Back Squat", "lb")).toMatchObject({
      weight: 145,
      feeling: "easy",
    });
    expect(
      getNextWeight([set({ actualWeight: 60, rpe: 6 })], "Leg Press", "kg"),
    ).toMatchObject({ weight: 65, feeling: "easy" });
  });

  it("only advances good or unreported effort after every latest-workout set reaches eight reps", () => {
    expect(
      getNextWeight(
        [set({ rpe: 8 }), set({ actualWeight: 135, actualReps: 8, rpe: null })],
        "Bench Press",
        "lb",
      ),
    ).toMatchObject({ weight: 140, feeling: "good" });
    expect(
      getNextWeight(
        [
          set({ rpe: null }),
          set({ actualWeight: 135, actualReps: 7, rpe: null }),
        ],
        "Bench Press",
        "lb",
      ),
    ).toMatchObject({ weight: 135, feeling: null });
  });

  it("uses the newer workout when completion timestamps tie", () => {
    expect(
      getNextWeight(
        [
          set({ workoutId: 3, actualWeight: 140, rpe: 9 }),
          set({ workoutId: 2, actualWeight: 135, rpe: 6 }),
        ],
        "Bench Press",
        "lb",
      ),
    ).toMatchObject({ weight: 140, lastWeight: 140, feeling: "hard" });
  });
  it("keeps bodyweight work at zero", () => {
    expect(
      getNextWeight(
        [set({ actualWeight: 0, actualReps: 12, rpe: 6 })],
        "Push-up",
        "lb",
      ),
    ).toMatchObject({ weight: 0, lastWeight: 0, feeling: "easy" });
  });
});
