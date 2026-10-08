import { AuthGate } from "@/components/lift-log/auth-gate";
import { useInteractiveTour } from "@/components/lift-log/interactive-tour";
import { AppButton, AppInput, AppScreen, Card, EmptyState, LoadingState, SectionTitle, colors, ui } from "@/components/lift-log/ui";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Linking, Modal, ScrollView, StyleSheet, Text, View } from "react-native";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function ProgramPlanner() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const active = trpc.program.getActive.useQuery();
  const [createOpen, setCreateOpen] = useState(false);
  const [planName, setPlanName] = useState("");
  const [addWorkoutOpen, setAddWorkoutOpen] = useState(false);
  const [workoutName, setWorkoutName] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState(new Date().getDay());
  const [selectedWeekId, setSelectedWeekId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [planToolsOpen, setPlanToolsOpen] = useState(false);
  const [skipCandidate, setSkipCandidate] = useState<{ id: number; name: string } | null>(null);
  const { isTourStep } = useInteractiveTour();

  const program = active.data;
  const selectedWeek = useMemo(() => {
    if (!program?.weeks.length) return null;
    return program.weeks.find((week) => week.id === selectedWeekId) ?? program.weeks[program.weeks.length - 1];
  }, [program, selectedWeekId]);

  const createPlan = trpc.program.create.useMutation({
    onSuccess: () => { setCreateOpen(false); setPlanName(""); utils.program.getActive.invalidate(); },
    onError: (error) => setMessage(error.message),
  });
  const addWorkout = trpc.program.createWorkout.useMutation({
    onSuccess: (workout) => {
      setAddWorkoutOpen(false);
      setWorkoutName("");
      utils.program.getActive.invalidate();
      router.push(`/plan/workout/${workout.id}` as never);
    },
    onError: (error) => setMessage(error.message),
  });
  const duplicateWeek = trpc.program.duplicateWeek.useMutation({
    onSuccess: (updated) => { setSelectedWeekId(updated.weeks[updated.weeks.length - 1]?.id ?? null); utils.program.getActive.invalidate(); },
    onError: (error) => setMessage(error.message),
  });
  const archivePlan = trpc.program.archive.useMutation({
    onSuccess: () => {
      setArchiveOpen(false);
      setSelectedWeekId(null);
      setMessage(`“${program?.name ?? "Your plan"}” is archived. Your completed workouts are still in Progress.`);
      utils.program.getActive.invalidate();
    },
    onError: (error) => setMessage(error.message),
  });
  const startWorkout = trpc.program.startWorkout.useMutation({
    onSuccess: (workout) => {
      utils.workout.listRecent.invalidate();
      utils.program.getActive.invalidate();
      if (workout) router.push(`/workout/${workout.id}` as never);
    },
    onError: (error) => setMessage(error.message),
  });
  const skipWorkout = trpc.program.skipWorkout.useMutation({
    onSuccess: () => {
      setSkipCandidate(null);
      utils.program.getActive.invalidate();
      setMessage("Day marked as skipped. It will not affect Progress.");
    },
    onError: (error) => setMessage(error.message),
  });
  const undoSkipWorkout = trpc.program.undoSkipWorkout.useMutation({
    onSuccess: () => {
      utils.program.getActive.invalidate();
      setMessage("Skip removed. You can start this workout whenever you are ready.");
    },
    onError: (error) => setMessage(error.message),
  });
  const sourceDownload = trpc.program.sourceDownload.useMutation({
    onSuccess: (url) => Linking.openURL(url).catch(() => setMessage("Could not open the original trainer file.")),
    onError: (error) => setMessage(error.message),
  });
  const uploadNextWeek = () => {
    if (!program) return;
    const appendAfterWeek = Math.max(0, ...program.weeks.map((week) => week.weekNumber));
    router.push(`/plan/import?appendToProgramId=${program.id}&programName=${encodeURIComponent(program.name)}&appendAfterWeek=${appendAfterWeek}` as never);
  };
  const soloLog = trpc.workout.createEmpty.useMutation({ onSuccess: (workout) => workout && router.push(`/workout/${workout.id}` as never), onError: (error) => setMessage(error.message) });

  if (active.isLoading) return <AppScreen scroll={false}><LoadingState label="Loading your plan…" /></AppScreen>;

  return (
    <AppScreen>
      <View style={styles.header}>
        <Text style={ui.title}>Your plan</Text>
      </View>
      {message ? <Card style={styles.message}><Text style={styles.messageText}>{message}</Text></Card> : null}
      {!program ? (
        <Card style={[styles.emptyPlan, isTourStep("plans_action") && styles.tourTarget]}>
          <Text style={styles.emptyEyebrow}>Start here</Text>
          <Text style={styles.emptyTitle}>Build a week that works for you.</Text>
          <Text style={styles.emptyDetail}>Choose your training days and add workouts.</Text>
          <AppButton variant="secondary" onPress={() => setCreateOpen(true)}>Create a workout plan</AppButton>
          <AppButton variant="secondary" onPress={() => router.push("/plan/import" as never)}>Import a trainer plan</AppButton>
          <AppButton variant="ghost" style={styles.emptySoloButton} onPress={() => soloLog.mutate()} disabled={soloLog.isPending}>{soloLog.isPending ? "Opening…" : "Just log a workout today"}</AppButton>
        </Card>
      ) : (
        <>
          <Card style={[styles.programCard, isTourStep("plans_action") && styles.tourTarget]}>
            <Text style={styles.programLabel}>Active plan</Text>
            <Text style={styles.programName}>{program.name}</Text>
            <Text style={styles.programDetail}>Pick a day below, then log what you actually do. Completed work always stays in your history.</Text>
            <AppButton variant="secondary" onPress={uploadNextWeek}>Add next week</AppButton>
            <AppButton variant="secondary" style={styles.planToolsButton} onPress={() => setPlanToolsOpen((current) => !current)}>{planToolsOpen ? "Hide options" : "More options"}</AppButton>
            {planToolsOpen ? <View style={styles.planTools}>
              <AppButton variant="secondary" onPress={() => setCreateOpen(true)}>Start a different plan</AppButton>
              <AppButton variant="secondary" onPress={() => router.push("/plan/import" as never)}>Import a new plan</AppButton>
              {program.sourceStorageKey ? <AppButton variant="secondary" onPress={() => sourceDownload.mutate({ programId: program.id })} disabled={sourceDownload.isPending}>{sourceDownload.isPending ? "Opening original file…" : "View original trainer file"}</AppButton> : null}
              <AppButton variant="danger" onPress={() => setArchiveOpen(true)}>Archive this plan</AppButton>
            </View> : null}
          </Card>

          <View style={styles.weekSectionHeader}>
            <SectionTitle title="Choose a week" />
            {selectedWeek ? <AppButton variant="ghost" style={styles.duplicateLink} onPress={() => duplicateWeek.mutate({ sourceWeekId: selectedWeek.id })} disabled={duplicateWeek.isPending}>{duplicateWeek.isPending ? "Copying…" : "Duplicate week"}</AppButton> : null}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekRow}>
            {program.weeks.map((week) => <AppButton key={week.id} variant={selectedWeek?.id === week.id ? "primary" : "secondary"} style={styles.weekButton} onPress={() => setSelectedWeekId(week.id)}>{week.name}</AppButton>)}
          </ScrollView>

          {selectedWeek ? (
            <>
              <View style={styles.weekHeading}>
                <Text style={styles.weekTitle}>{selectedWeek.name}</Text>
              </View>
              <View style={styles.weekOverview}>
                {DAYS.map((day, dayIndex) => {
                  const dayWorkouts = selectedWeek.workouts.filter((workout) => workout.dayOfWeek === dayIndex);
                  const completed = dayWorkouts.length > 0 && dayWorkouts.every((workout) => Boolean(workout.latestSession?.completedAt));
                  const inProgress = dayWorkouts.some((workout) => Boolean(workout.latestSession) && !workout.latestSession?.completedAt);
                  const skipped = dayWorkouts.length > 0 && dayWorkouts.every((workout) => Boolean(workout.skippedAt));
                  const upcoming = dayWorkouts.length > 0 && !completed && !inProgress && !skipped;
                  const stateLabel = completed ? "Done" : inProgress ? "In progress" : skipped ? "Skipped" : upcoming ? `${dayWorkouts.length} planned` : "—";
                  return <View key={day} accessibilityLabel={`${day}: ${stateLabel}`} style={[styles.weekDay, upcoming && styles.weekDayUpcoming, completed && styles.weekDayComplete, inProgress && styles.weekDayProgress, skipped && styles.weekDaySkipped]}><Text style={[styles.weekDayName, completed && styles.weekDayCompleteText, skipped && styles.weekDaySkippedText]}>{day.slice(0, 3)}</Text><Text style={[styles.weekDayState, completed && styles.weekDayCompleteText, skipped && styles.weekDaySkippedText]}>{stateLabel}</Text><View style={[styles.weekDayDot, upcoming && styles.weekDayDotUpcoming, completed && styles.weekDayDotComplete, inProgress && styles.weekDayDotProgress, skipped && styles.weekDayDotSkipped]} /></View>;
                })}
              </View>
              {selectedWeek.workouts.map((workout) => {
                const completed = Boolean(workout.latestSession?.completedAt);
                const hasSession = Boolean(workout.latestSession);
                const skipped = Boolean(workout.skippedAt);
                return <Card key={workout.id} style={completed ? [styles.workoutCard, styles.completedCard] : skipped ? [styles.workoutCard, styles.skippedCard] : styles.workoutCard}>
                  <View style={styles.workoutTop}>
                    <View style={[styles.dayBadge, skipped && styles.skippedBadge]}><Text style={[styles.dayBadgeText, completed && styles.completedDay, skipped && styles.skippedDay]}>{completed ? "✓" : skipped ? "—" : DAYS[workout.dayOfWeek].slice(0, 3)}</Text></View>
                    <View style={ui.grow}>
                      <Text style={styles.workoutName}>{workout.name}</Text>
                      <Text style={styles.workoutDetail}>{completed ? "Completed — you can still review or edit your log." : hasSession ? "In progress — continue where you left off." : skipped ? "Skipped — this will not affect your Progress." : workout.exercises.length ? `${workout.exercises.length} lift${workout.exercises.length === 1 ? "" : "s"} planned` : "Add exercises and sets to this workout"}</Text>
                    </View>
                  </View>
                  {workout.exercises.length ? <Text style={styles.liftLine}>{workout.exercises.slice(0, 2).map((exercise) => exercise.exercise.name).join(" · ")}{workout.exercises.length > 2 ? ` +${workout.exercises.length - 2}` : ""}</Text> : null}
                  <View style={styles.workoutActions}>
                    <AppButton variant="secondary" style={styles.sessionButton} onPress={() => router.push((hasSession ? `/workout/${workout.latestSession?.id}` : `/plan/workout/${workout.id}`) as never)}>{hasSession ? completed ? "Open log" : "Continue" : "Edit workout"}</AppButton>
                    {skipped ? <AppButton variant="secondary" style={styles.startButton} onPress={() => undoSkipWorkout.mutate({ programWorkoutId: workout.id })} disabled={undoSkipWorkout.isPending}>{undoSkipWorkout.isPending ? "Restoring…" : "Undo skip"}</AppButton> : null}
                    {!hasSession && !skipped ? <><AppButton style={styles.startButton} onPress={() => startWorkout.mutate({ programWorkoutId: workout.id })} disabled={!workout.exercises.length || startWorkout.isPending}>{startWorkout.isPending ? "Starting…" : "Start"}</AppButton><AppButton variant="ghost" style={styles.skipButton} onPress={() => setSkipCandidate({ id: workout.id, name: workout.name })}>Skip</AppButton></> : null}
                  </View>
                </Card>;
              })}
              {!selectedWeek.workouts.length ? <EmptyState title="No workouts yet. Add your first day." detail="" /> : null}
              <AppButton variant="secondary" style={isTourStep("plans_action") ? styles.tourTarget : undefined} onPress={() => setAddWorkoutOpen(true)}>+ Add workout day</AppButton>
            </>
          ) : null}
          <Card style={styles.soloCard}>
            <Text style={styles.soloTitle}>Training outside the plan?</Text>
            <Text style={styles.soloText}>Start a simple workout. It will still show up with everything else in Progress.</Text>
            <AppButton variant="secondary" onPress={() => soloLog.mutate()} disabled={soloLog.isPending}>{soloLog.isPending ? "Opening…" : "Start a solo workout"}</AppButton>
          </Card>
        </>
      )}
      <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
        <View style={styles.modalShade}><Card style={styles.dialog}>
          <Text style={styles.dialogTitle}>Name your plan</Text>
          <Text style={styles.dialogText}>Start with Week 1. You can build the rest as you go.</Text>
          <AppInput label="Plan name" value={planName} onChangeText={setPlanName} placeholder="Strength block" autoFocus maxLength={120} />
          <View style={styles.dialogActions}><AppButton variant="secondary" style={styles.dialogButton} onPress={() => setCreateOpen(false)} disabled={createPlan.isPending}>Cancel</AppButton><AppButton style={styles.dialogButton} onPress={() => createPlan.mutate({ name: planName })} disabled={!planName.trim() || createPlan.isPending}>{createPlan.isPending ? "Creating…" : "Create plan"}</AppButton></View>
        </Card></View>
      </Modal>
      <Modal visible={addWorkoutOpen} transparent animationType="fade" onRequestClose={() => setAddWorkoutOpen(false)}>
        <View style={styles.modalShade}><Card style={styles.dialog}>
          <Text style={styles.dialogTitle}>Add a workout day</Text>
          <Text style={styles.dialogText}>Choose the day this workout belongs to. You can add more than one workout to a day.</Text>
          <AppInput label="Workout name" value={workoutName} onChangeText={setWorkoutName} placeholder="Lower body" autoFocus maxLength={120} />
          <Text style={styles.dayLabel}>Day of week</Text>
          <View style={styles.dayPills}>{DAYS.map((day, index) => <AppButton key={day} variant={dayOfWeek === index ? "primary" : "secondary"} style={styles.dayButton} onPress={() => setDayOfWeek(index)}>{day.slice(0, 3)}</AppButton>)}</View>
          <View style={styles.dialogActions}><AppButton variant="secondary" style={styles.dialogButton} onPress={() => setAddWorkoutOpen(false)} disabled={addWorkout.isPending}>Cancel</AppButton><AppButton style={styles.dialogButton} onPress={() => selectedWeek && addWorkout.mutate({ weekId: selectedWeek.id, name: workoutName, dayOfWeek })} disabled={!workoutName.trim() || !selectedWeek || addWorkout.isPending}>{addWorkout.isPending ? "Adding…" : "Add workout"}</AppButton></View>
        </Card></View>
      </Modal>
      <Modal visible={archiveOpen} transparent animationType="fade" onRequestClose={() => setArchiveOpen(false)}>
        <View style={styles.modalShade}><Card style={styles.dialog}>
          <Text style={styles.dialogTitle}>Archive this plan?</Text>
          <Text style={styles.dialogText}>“{program?.name}” will leave Plans. Completed workouts stay in your history and Progress.</Text>
          {archivePlan.error ? <Text style={styles.archiveError}>{archivePlan.error.message}</Text> : null}
          <View style={styles.dialogActions}><AppButton variant="secondary" style={styles.dialogButton} onPress={() => setArchiveOpen(false)} disabled={archivePlan.isPending}>Keep plan</AppButton><AppButton variant="danger" style={styles.dialogButton} onPress={() => program && archivePlan.mutate({ id: program.id })} disabled={archivePlan.isPending}>{archivePlan.isPending ? "Archiving…" : "Archive plan"}</AppButton></View>
        </Card></View>
      </Modal>
      <Modal visible={Boolean(skipCandidate)} transparent animationType="fade" onRequestClose={() => setSkipCandidate(null)}>
        <View style={styles.modalShade}><Card style={styles.dialog}>
          <Text style={styles.dialogTitle}>Skip this workout day?</Text>
          <Text style={styles.dialogText}>“{skipCandidate?.name}” will be marked skipped for this plan week. It will not create a workout or change your Progress. You can undo this later.</Text>
          {skipWorkout.error ? <Text style={styles.archiveError}>{skipWorkout.error.message}</Text> : null}
          <View style={styles.dialogActions}><AppButton variant="secondary" style={styles.dialogButton} onPress={() => setSkipCandidate(null)} disabled={skipWorkout.isPending}>Keep day</AppButton><AppButton variant="danger" style={styles.dialogButton} onPress={() => skipCandidate && skipWorkout.mutate({ programWorkoutId: skipCandidate.id })} disabled={skipWorkout.isPending}>{skipWorkout.isPending ? "Skipping…" : "Skip day"}</AppButton></View>
        </Card></View>
      </Modal>
    </AppScreen>
  );
}

export default function PlanScreen() { return <AuthGate><ProgramPlanner /></AuthGate>; }

const styles = StyleSheet.create({
  header: { gap: 3, marginTop: 4 },
  message: { backgroundColor: colors.paleLime, borderColor: "#D9EBC0" },
  messageText: { color: colors.limeDark, fontSize: 16, fontWeight: "700", lineHeight: 19 },
  emptyPlan: { gap: 12, backgroundColor: colors.ink, borderColor: colors.ink, padding: 20 },
  emptyEyebrow: { color: colors.lime, fontSize: 16, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  emptyTitle: { color: colors.panel, fontSize: 25, fontWeight: "800", letterSpacing: -0.6, lineHeight: 30 },
  emptyDetail: { color: "#CBD4CD", fontSize: 16, lineHeight: 21 },
  emptySoloButton: { alignSelf: "center" },
  tourTarget: { borderColor: colors.lime, borderWidth: 2, boxShadow: "0px 0px 0px 4px rgba(191, 232, 102, 0.22)" },
  programCard: { gap: 10, backgroundColor: colors.ink, borderColor: colors.ink, padding: 20 },
  programLabel: { color: colors.lime, fontSize: 16, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  programName: { color: colors.panel, fontSize: 25, fontWeight: "800", letterSpacing: -0.6, lineHeight: 30 },
  programDetail: { color: "#CBD4CD", fontSize: 16, lineHeight: 21, marginBottom: 2 },
  planToolsButton: { marginTop: -4 },
  planTools: { gap: 8, paddingTop: 3, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#31423A" },
  weekSectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  duplicateLink: { minHeight: 44, paddingHorizontal: 0 },
  weekRow: { gap: 8, paddingRight: 18 },
  weekButton: { minHeight: 44, borderRadius: 12, paddingHorizontal: 14 },
  weekHeading: { gap: 2, marginTop: 1 },
  weekTitle: { color: colors.ink, fontSize: 21, fontWeight: "800", letterSpacing: -0.35 },
  weekSub: { color: colors.muted, fontSize: 16, lineHeight: 18 },
  weekOverview: { flexDirection: "row", gap: 7 },
  weekDay: { flex: 1, minHeight: 56, borderRadius: 15, backgroundColor: colors.paleInk, alignItems: "center", justifyContent: "center", gap: 2, paddingHorizontal: 1 },
  weekDayUpcoming: { backgroundColor: "#F1F7E8" },
  weekDayComplete: { backgroundColor: colors.paleLime },
  weekDayProgress: { backgroundColor: "#FFF1D1" },
  weekDaySkipped: { backgroundColor: "#ECEFED" },
  weekDayName: { color: colors.muted, fontSize: 16, fontWeight: "800" },
  weekDayState: { color: colors.muted, fontSize: 16, fontWeight: "700", textAlign: "center" },
  weekDayCompleteText: { color: colors.limeDark },
  weekDaySkippedText: { color: "#68716D" },
  weekDayDot: { width: 5, height: 5, borderRadius: 5, backgroundColor: "#C9D1CA" },
  weekDayDotUpcoming: { backgroundColor: colors.limeDark },
  weekDayDotComplete: { backgroundColor: colors.limeDark },
  weekDayDotProgress: { backgroundColor: "#D99A20" },
  weekDayDotSkipped: { backgroundColor: "#7E8782" },
  workoutCard: { gap: 12 },
  completedCard: { backgroundColor: colors.paleLime, borderColor: "#D6E9B9" },
  skippedCard: { backgroundColor: "#F1F3F2", borderColor: "#D7DDDA" },
  workoutTop: { flexDirection: "row", gap: 10, alignItems: "center" },
  dayBadge: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.paleInk, alignItems: "center", justifyContent: "center" },
  dayBadgeText: { color: colors.ink, fontSize: 16, fontWeight: "800", textTransform: "uppercase" },
  completedDay: { color: colors.limeDark, fontSize: 18 },
  skippedBadge: { backgroundColor: "#E1E6E3" },
  skippedDay: { color: "#68716D", fontSize: 18 },
  workoutName: { color: colors.ink, fontSize: 17, fontWeight: "800", letterSpacing: -0.2 },
  workoutDetail: { color: colors.muted, fontSize: 16, lineHeight: 18, marginTop: 3 },
  liftLine: { color: colors.muted, fontSize: 16, lineHeight: 18, marginLeft: 50 },
  workoutActions: { flexDirection: "row", gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 10 },
  sessionButton: { flex: 1, minHeight: 44, borderRadius: 13 },
  startButton: { minHeight: 44, borderRadius: 13, paddingHorizontal: 16 },
  skipButton: { minHeight: 44, paddingHorizontal: 5, alignSelf: "center" },
  soloCard: { gap: 9, backgroundColor: colors.paleInk },
  soloTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  soloText: { color: colors.muted, fontSize: 16, lineHeight: 19 },
  modalShade: { flex: 1, backgroundColor: "rgba(20,32,26,0.48)", alignItems: "center", justifyContent: "center", padding: 24 },
  dialog: { width: "100%", maxWidth: 430, gap: 12 },
  dialogTitle: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  dialogText: { color: colors.muted, fontSize: 16, lineHeight: 20 },
  archiveError: { color: colors.rust, fontSize: 16, fontWeight: "700", lineHeight: 18 },
  dialogActions: { flexDirection: "row", gap: 8, marginTop: 2 },
  dialogButton: { flex: 1, paddingHorizontal: 8 },
  dayLabel: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  dayPills: { flexDirection: "row", gap: 7, flexWrap: "wrap" },
  dayButton: { minWidth: 48, minHeight: 44, borderRadius: 12, paddingHorizontal: 10 },
});
