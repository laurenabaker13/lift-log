export const APP_GUIDE_AREAS = ["Plans", "Workouts", "Progress", "Friends", "Settings"] as const;

export type GuideStart = "plan" | "solo" | "home";

export type InteractiveTourStep =
  | "plans_action"
  | "plans_upload"
  | "workouts_nav"
  | "workouts_action"
  | "workouts_start_solo"
  | "workouts_add_exercise"
  | "workouts_exercise_picker"
  | "progress_nav"
  | "progress_action"
  | "friends_nav"
  | "friends_action"
  | "settings_nav"
  | "settings_action";

export const TOUR_NAV_TARGETS: Partial<Record<InteractiveTourStep, { href: string; next: InteractiveTourStep; label: string }>> = {
  workouts_nav: { href: "/", next: "workouts_action", label: "Workouts" },
  progress_nav: { href: "/progress", next: "progress_action", label: "Progress" },
  friends_nav: { href: "/friends", next: "friends_action", label: "Friends" },
  settings_nav: { href: "/settings", next: "settings_action", label: "Settings" },
};

export function parseGuideStart(value: string | string[] | undefined): GuideStart {
  const start = Array.isArray(value) ? value[0] : value;
  if (start === "plan" || start === "solo") return start;
  return "home";
}

export function guideFinishLabel(start: GuideStart) {
  if (start === "plan") return "Open my plan";
  if (start === "solo") return "Start my workout";
  return "Open Workouts";
}

export function guideDestination(start: GuideStart) {
  if (start === "plan") return "/plans";
  return "/";
}

export function getTourNavTarget(step: InteractiveTourStep | undefined) {
  return step ? TOUR_NAV_TARGETS[step] ?? null : null;
}
