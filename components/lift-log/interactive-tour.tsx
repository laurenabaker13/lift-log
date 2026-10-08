import { trpc } from "@/lib/trpc";
import { type GuideStart, type InteractiveTourStep } from "@/shared/app-guide";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { Text } from "react-native";
import { AppButton, Card, ui } from "./ui";

type TourState = { intent: GuideStart; step: InteractiveTourStep };
type TourContextValue = {
  tour: TourState | null;
  startTour: (intent: GuideStart) => void;
  advanceTour: (step: InteractiveTourStep) => void;
  endTour: () => void;
  isTourStep: (step: InteractiveTourStep) => boolean;
};
const TourContext = createContext<TourContextValue | null>(null);
export function InteractiveTourProvider({ children }: PropsWithChildren) {
  const [tour, setTour] = useState<TourState | null>(null);
  const startTour = useCallback(
    (intent: GuideStart) => setTour({ intent, step: "workouts_action" }),
    [],
  );
  const endTour = useCallback(() => setTour(null), []);
  const advanceTour = useCallback((_step: InteractiveTourStep) => {}, []);
  const isTourStep = useCallback((_step: InteractiveTourStep) => false, []);
  const value = useMemo(
    () => ({ tour, startTour, endTour, advanceTour, isTourStep }),
    [tour, startTour, endTour, advanceTour, isTourStep],
  );
  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}
export function useInteractiveTour() {
  const value = useContext(TourContext);
  if (!value) throw new Error("Tips require the app provider.");
  return value;
}
// Tips live in the relevant screen's document flow, never as an overlay.
export function InteractiveTourCoach() {
  return null;
}
export function ScreenTip({ area }: { area: "workout" | "progress" }) {
  const settings = trpc.settings.get.useQuery();
  const utils = trpc.useUtils();
  const dismiss = trpc.account.dismissTips.useMutation({
    onSuccess: () => utils.settings.get.invalidate(),
  });
  const { endTour } = useInteractiveTour();
  if (!settings.data || settings.data.tipsDismissed || dismiss.isSuccess)
    return null;
  const skip = () => {
    endTour();
    dismiss.mutate();
  };
  return (
    <Card style={{ gap: 8 }}>
      <Text style={ui.link}>
        {area === "workout" ? "Tip 1 of 2" : "Tip 2 of 2"}
      </Text>
      <Text style={ui.mutedText}>
        {area === "workout"
          ? "Add an exercise, enter your weight and reps, then finish your workout. Add set repeats the row above."
          : "Each dot is one workout. Your best set from that workout shows how you are progressing."}
      </Text>
      <AppButton variant="ghost" onPress={skip} disabled={dismiss.isPending}>
        {area === "workout" ? "Skip tips" : "Got it"}
      </AppButton>
    </Card>
  );
}
