import { describe, expect, it } from "vitest";
import { APP_GUIDE_AREAS, getTourNavTarget, guideDestination, guideFinishLabel, parseGuideStart } from "../shared/app-guide";

describe("interactive first-time guide", () => {
  it("covers the five core Lift Log areas in order", () => {
    expect(APP_GUIDE_AREAS).toEqual(["Plans", "Workouts", "Progress", "Friends", "Settings"]);
  });

  it("exposes exactly the required real navigation actions", () => {
    expect(getTourNavTarget("plans_action")).toBeNull();
    expect(getTourNavTarget("plans_upload")).toBeNull();
    expect(getTourNavTarget("workouts_nav")).toEqual({ href: "/", next: "workouts_action", label: "Workouts" });
    expect(getTourNavTarget("workouts_start_solo")).toBeNull();
    expect(getTourNavTarget("workouts_add_exercise")).toBeNull();
    expect(getTourNavTarget("workouts_exercise_picker")).toBeNull();
    expect(getTourNavTarget("progress_nav")).toEqual({ href: "/progress", next: "progress_action", label: "Progress" });
    expect(getTourNavTarget("friends_nav")).toEqual({ href: "/friends", next: "friends_action", label: "Friends" });
    expect(getTourNavTarget("settings_nav")).toEqual({ href: "/settings", next: "settings_action", label: "Settings" });
    expect(getTourNavTarget(undefined)).toBeNull();
  });

  it("safely accepts only supported first-time destinations", () => {
    expect(parseGuideStart("plan")).toBe("plan");
    expect(parseGuideStart("solo")).toBe("solo");
    expect(parseGuideStart("other")).toBe("home");
    expect(parseGuideStart(["solo", "plan"])).toBe("solo");
    expect(guideFinishLabel("plan")).toBe("Open my plan");
    expect(guideFinishLabel("solo")).toBe("Start my workout");
    expect(guideDestination("plan")).toBe("/plans");
    expect(guideDestination("solo")).toBe("/");
    expect(guideDestination("home")).toBe("/");
  });
});
