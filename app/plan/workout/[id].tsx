import { AuthGate } from "@/components/lift-log/auth-gate";
import { EquipmentPicker } from "@/components/lift-log/equipment-picker";
import { NumberInput } from "@/components/lift-log/number-input";
import { WeightInput } from "@/components/lift-log/weight-input";
import { AppButton, AppInput, AppScreen, Card, EmptyState, LoadingState, colors, ui } from "@/components/lift-log/ui";
import { trpc } from "@/lib/trpc";
import { getNextWeight } from "@/shared/next-weight";
import { NextWeightLine } from "@/components/lift-log/next-weight-line";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const newKey = () => Math.random().toString(36).slice(2);

type PlanSet = { key: string; targetReps: number };
type PlanExercise = {
  key: string;
  exerciseId: number;
  name: string;
  equipment: string;
  prescriptionMode: "percent" | "weight";
  intensityPercent: number | null;
  plannedWeight: number | null;
  targetRpe: number | null;
  sets: PlanSet[];
};
type PlanDraft = { name: string; dayOfWeek: number; exercises: PlanExercise[] };

function toDraft(workout: any): PlanDraft {
  return {
    name: workout.name,
    dayOfWeek: workout.dayOfWeek,
    exercises: (workout.exercises || []).map((entry: any) => ({
      key: newKey(),
      exerciseId: entry.exerciseId,
      name: entry.exercise.name,
      equipment: entry.exercise.equipment,
      prescriptionMode: entry.prescriptionMode ?? "percent",
      intensityPercent: entry.intensityPercent ?? 0.8,
      plannedWeight: entry.plannedWeight ?? null,
      targetRpe: entry.targetRpe ?? 7,
      sets: (entry.sets || []).map((set: any) => ({ key: newKey(), targetReps: set.targetReps })),
    })),
  };
}

function PlanWorkoutEditor() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; athleteId?: string }>();
  const planWorkoutId = Number(params.id);
  const athleteId = Number(params.athleteId);
  const coachAthleteId = Number.isInteger(athleteId) && athleteId > 0 ? athleteId : undefined;
  const utils = trpc.useUtils();
  const workout = trpc.program.getWorkout.useQuery({ id: planWorkoutId }, { enabled: Number.isInteger(planWorkoutId) && planWorkoutId > 0 });
  const catalog = trpc.exercise.list.useQuery();
  const progress = trpc.progress.list.useQuery(coachAthleteId ? { athleteId: coachAthleteId } : undefined);
  const settings = trpc.settings.get.useQuery();
  const [draftOverride, setDraftOverride] = useState<PlanDraft | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [customName, setCustomName] = useState("");
  const [customEquipment, setCustomEquipment] = useState("Barbell");
  const [message, setMessage] = useState<string | null>(null);

  const serverDraft = useMemo(() => workout.data ? toDraft(workout.data) : null, [workout.data]);
  const draft = draftOverride ?? serverDraft;
  const unit = workout.data?.ownerUnit ?? settings.data?.unit ?? "lb";
  const updateDraft = (update: (current: PlanDraft) => PlanDraft) => {
    setDraftOverride((current) => {
      const base = current ?? serverDraft;
      return base ? update(base) : current;
    });
  };
  const save = trpc.program.saveWorkout.useMutation({
    onSuccess: (saved) => {
      setDraftOverride(toDraft(saved));
      utils.program.getActive.invalidate();
      utils.program.getWorkout.invalidate({ id: planWorkoutId });
      if (coachAthleteId) utils.coach.getClient.invalidate({ athleteId: coachAthleteId });
      setMessage("Plan saved. Completed workouts will always keep their original logged numbers.");
    },
    onError: (error) => setMessage(error.message),
  });
  const createCustom = trpc.exercise.createCustom.useMutation({
    onSuccess: (exercise) => {
      utils.exercise.list.invalidate();
      addExercise(exercise);
      setCustomName("");
      setPickerOpen(false);
    },
    onError: (error) => setMessage(error.message),
  });
  const changeEquipmentVariant = trpc.exercise.getOrCreateVariant.useMutation({
    onSuccess: (variant, variables) => {
      updateDraft((current) => ({
        ...current,
        exercises: current.exercises.map((exercise) => exercise.key === variables.clientExerciseKey
          ? { ...exercise, exerciseId: variant.id, name: variant.name, equipment: variant.equipment }
          : exercise),
      }));
      utils.exercise.list.invalidate();
      if (coachAthleteId) utils.coach.getClient.invalidate({ athleteId: coachAthleteId });
      setMessage(`Equipment changed to ${variant.equipment}. Save this plan day to keep the change.`);
    },
    onError: (error) => setMessage(error.message),
  });

  const filteredCatalog = useMemo(
    () => (catalog.data || []).filter((exercise) => `${exercise.name} ${exercise.equipment}`.toLowerCase().includes(search.trim().toLowerCase())),
    [catalog.data, search],
  );
  const addExercise = (exercise: { id: number; name: string; equipment: string }) => {
    updateDraft((current) => ({
      ...current,
      exercises: [...current.exercises, {
        key: newKey(), exerciseId: exercise.id, name: exercise.name, equipment: exercise.equipment,
        prescriptionMode: "percent", intensityPercent: 0.8, plannedWeight: null, targetRpe: 7,
        sets: [{ key: newKey(), targetReps: 8 }, { key: newKey(), targetReps: 8 }, { key: newKey(), targetReps: 8 }],
      }],
    }));
    setPickerOpen(false);
  };
  const changeExercise = (key: string, change: Partial<PlanExercise>) => updateDraft((current) => ({ ...current, exercises: current.exercises.map((exercise) => exercise.key === key ? { ...exercise, ...change } : exercise) }));
  const changeSet = (exerciseKey: string, setKey: string, targetReps: number) => updateDraft((current) => ({ ...current, exercises: current.exercises.map((exercise) => exercise.key === exerciseKey ? { ...exercise, sets: exercise.sets.map((set) => set.key === setKey ? { ...set, targetReps } : set) } : exercise) }));
  const removeExercise = (key: string) => updateDraft((current) => ({ ...current, exercises: current.exercises.filter((exercise) => exercise.key !== key) }));
  const removeSet = (exerciseKey: string, setKey: string) => updateDraft((current) => ({ ...current, exercises: current.exercises.map((exercise) => exercise.key === exerciseKey ? { ...exercise, sets: exercise.sets.filter((set) => set.key !== setKey) } : exercise) }));
  const addSet = (exerciseKey: string, reps: number) => updateDraft((current) => ({ ...current, exercises: current.exercises.map((exercise) => exercise.key === exerciseKey ? { ...exercise, sets: [...exercise.sets, { key: newKey(), targetReps: reps }] } : exercise) }));

  const submit = () => {
    if (!draft) return;
    if (!draft.exercises.length) return setMessage("Add at least one exercise before saving this workout day.");
    if (draft.exercises.some((exercise) => !exercise.sets.length)) return setMessage("Each exercise needs at least one planned set.");
    setMessage(null);
    save.mutate({
      id: planWorkoutId,
      name: draft.name.trim() || "Planned workout",
      dayOfWeek: draft.dayOfWeek,
      exercises: draft.exercises.map((exercise) => ({
        exerciseId: exercise.exerciseId,
        prescriptionMode: exercise.prescriptionMode,
        intensityPercent: exercise.intensityPercent,
        plannedWeight: exercise.plannedWeight,
        targetRpe: exercise.targetRpe,
        sets: exercise.sets.map((set) => ({ targetReps: Math.max(1, set.targetReps || 1) })),
      })),
    });
  };

  if (workout.isLoading || !draft) return <AppScreen scroll={false}><LoadingState label="Opening workout…" /></AppScreen>;
  if (!workout.data) return <AppScreen><EmptyState title="This workout is no longer available." detail="" /></AppScreen>;
  const ownerUserId = workout.data.ownerUserId;

  return (
    <AppScreen>
      <Card style={styles.planHero}>
        <View style={styles.topbar}><Pressable onPress={() => router.back()} style={({ pressed }) => [styles.heroAction, pressed && styles.pressed]}><Text style={styles.heroActionText}>‹ Back to plan</Text></Pressable><View style={styles.weekBadge}><Text style={styles.weekBadgeText}>{workout.data.week.name}</Text></View></View>
        <Text style={styles.heroEyebrow}>Edit workout plan</Text>
        <TextInput value={draft.name} onChangeText={(name) => updateDraft((current) => ({ ...current, name }))} style={styles.titleInput} placeholder="Workout name" placeholderTextColor="#AAB7AC" />
        <Text style={styles.heroSubtitle}>Set up the {DAYS[draft.dayOfWeek]} workout. Your actual weight and reps are recorded when you train.</Text>
      </Card>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>{DAYS.map((day, index) => <AppButton key={day} variant={draft.dayOfWeek === index ? "primary" : "secondary"} style={styles.dayButton} onPress={() => updateDraft((current) => ({ ...current, dayOfWeek: index }))}>{day.slice(0, 3)}</AppButton>)}</ScrollView>
      {message ? <Card style={styles.message}><Text style={styles.messageText}>{message}</Text></Card> : null}
      {draft.exercises.map((exercise, exerciseIndex) => {
        const current = progress.data?.find((item) => item.exerciseId === exercise.exerciseId);
        const suggestion = getNextWeight(current?.history ?? [], exercise.name, unit);
        return (
          <Card key={exercise.key} style={styles.exerciseCard}>
            <View style={styles.exerciseHeader}><View style={ui.grow}><Text style={styles.exerciseName}>{exerciseIndex + 1}. {exercise.name}</Text><Text style={styles.equipment}>{exercise.equipment}</Text></View><AppButton variant="ghost" style={styles.remove} onPress={() => removeExercise(exercise.key)}>Remove</AppButton></View>
            <EquipmentPicker
              value={exercise.equipment}
              onChange={(equipment) => changeEquipmentVariant.mutate({ sourceExerciseId: exercise.exerciseId, equipment, ownerUserId, clientExerciseKey: exercise.key })}
              disabled={changeEquipmentVariant.isPending}
              helperText="Changing equipment affects this plan only."
            />
            <WeightInput label={`Weight (${unit})`} value={exercise.plannedWeight} unit={unit} onChange={(plannedWeight) => { if (plannedWeight !== exercise.plannedWeight) changeExercise(exercise.key, { prescriptionMode: plannedWeight === null ? "percent" : "weight", plannedWeight }); }} />
            <NextWeightLine suggestion={suggestion} unit={unit} onUse={() => { if (suggestion) changeExercise(exercise.key, { prescriptionMode: "weight", plannedWeight: suggestion.weight }); }} />
            <Text style={styles.setTitle}>Sets and reps</Text>
            {exercise.sets.map((set, setIndex) => <View key={set.key} style={styles.setRow}><Text style={styles.setNumber}>Set {setIndex + 1}</Text><NumberInput accessibilityLabel={`Set ${setIndex + 1} reps`} value={String(set.targetReps)} onChangeText={(value) => changeSet(exercise.key, set.key, Number(value) || 1)} keyboardType="decimal-pad" style={styles.repsInput} /><Text style={styles.repsLabel}>reps</Text><Pressable onPress={() => removeSet(exercise.key, set.key)} style={styles.deleteSet}><Text style={styles.deleteSetText}>×</Text></Pressable></View>)}
            <AppButton variant="secondary" style={styles.addSet} onPress={() => addSet(exercise.key, exercise.sets[exercise.sets.length - 1]?.targetReps ?? 8)}>Add set</AppButton>
          </Card>
        );
      })}
      <AppButton variant="secondary" onPress={() => setPickerOpen(true)}>+ Add exercise</AppButton>
      <AppButton onPress={submit} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save changes"}</AppButton>
      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}><View style={styles.modalShade}><View style={styles.modal}><View style={styles.modalHeader}><Text style={styles.modalTitle}>Add an exercise</Text><AppButton variant="ghost" style={styles.close} onPress={() => setPickerOpen(false)}>Close</AppButton></View><AppInput value={search} onChangeText={setSearch} placeholder="Search Back Squat, Bench Press…" /><ScrollView style={styles.catalog} keyboardShouldPersistTaps="handled">{filteredCatalog.map((exercise) => <Pressable key={exercise.id} onPress={() => addExercise(exercise)} style={({ pressed }) => [styles.catalogItem, pressed && styles.pressed]}><Text style={styles.catalogName}>{exercise.name}</Text><Text style={styles.catalogEquipment}>{exercise.equipment}</Text></Pressable>)}</ScrollView><View style={styles.custom}><Text style={styles.customTitle}>Or add a custom exercise</Text><AppInput value={customName} onChangeText={setCustomName} placeholder="Exercise name" /><EquipmentPicker value={customEquipment} onChange={setCustomEquipment} /><AppButton onPress={() => createCustom.mutate({ name: customName, equipment: customEquipment })} disabled={!customName.trim() || !customEquipment.trim() || createCustom.isPending}>Add custom exercise</AppButton></View></View></View></Modal>
    </AppScreen>
  );
}

export default function PlanWorkoutScreen() { return <AuthGate><PlanWorkoutEditor /></AuthGate>; }

const styles = StyleSheet.create({
  topbar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  planHero: { gap: 9, backgroundColor: colors.ink, borderColor: colors.ink, padding: 20 }, heroAction: { minHeight: 44, justifyContent: "center" }, heroActionText: { color: colors.lime, fontSize: 16, fontWeight: "800" }, weekBadge: { backgroundColor: "#26372F", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }, weekBadgeText: { color: colors.panel, fontSize: 16, fontWeight: "800" }, heroEyebrow: { color: colors.lime, fontSize: 16, fontWeight: "800", letterSpacing: 0.9, textTransform: "uppercase" }, titleInput: { color: colors.panel, fontSize: 27, fontWeight: "800", letterSpacing: -0.65, paddingVertical: 0 }, heroSubtitle: { color: "#CBD4CD", fontSize: 16, lineHeight: 20 }, dayRow: { gap: 7, paddingRight: 18 }, dayButton: { minWidth: 52, minHeight: 44, borderRadius: 12, paddingHorizontal: 10 },
  message: { backgroundColor: colors.paleLime, borderColor: "#D6E9B9" }, messageText: { color: colors.limeDark, fontSize: 16, fontWeight: "700", lineHeight: 19 },
  exerciseCard: { gap: 13, padding: 18 }, exerciseHeader: { flexDirection: "row", gap: 8, alignItems: "flex-start" }, exerciseName: { color: colors.ink, fontSize: 19, fontWeight: "800", letterSpacing: -0.25 }, equipment: { color: colors.muted, fontSize: 16, marginTop: 3 }, remove: { minHeight: 44, paddingHorizontal: 0 },
  guidance: { gap: 6, backgroundColor: colors.paleInk, borderRadius: 15, padding: 13 }, guidanceLabel: { color: colors.limeDark, fontSize: 16, fontWeight: "800" }, guidanceValue: { color: colors.ink, fontSize: 19, fontWeight: "800" }, guidanceText: { color: colors.muted, fontSize: 16, lineHeight: 17 }, applyButton: { minHeight: 44, borderRadius: 12, marginTop: 3 },
  setTitle: { color: colors.ink, fontSize: 16, fontWeight: "800", marginTop: 3 }, setRow: { flexDirection: "row", alignItems: "center", gap: 8 }, setNumber: { width: 48, color: colors.ink, fontSize: 16, fontWeight: "800" }, repsInput: { width: 60, height: 46, borderWidth: 1, borderColor: colors.line, borderRadius: 13, backgroundColor: "#F8FAF7", color: colors.ink, textAlign: "center", fontSize: 16, fontWeight: "800" }, repsLabel: { color: colors.muted, fontSize: 16, flex: 1 }, deleteSet: { width: 44, height: 44, alignItems: "center", justifyContent: "center" }, deleteSetText: { color: colors.rust, fontSize: 22 }, addSet: { minHeight: 44, borderRadius: 12 },
  modalShade: { flex: 1, backgroundColor: "rgba(20,32,26,0.48)", justifyContent: "flex-end" }, modal: { maxHeight: "88%", backgroundColor: colors.bone, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, gap: 14 }, modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, modalTitle: { color: colors.ink, fontSize: 21, fontWeight: "800" }, close: { minHeight: 44, paddingHorizontal: 0 }, catalog: { maxHeight: 260 }, catalogItem: { minHeight: 44, justifyContent: "center", paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }, catalogName: { color: colors.ink, fontSize: 16, fontWeight: "800" }, catalogEquipment: { color: colors.muted, fontSize: 16, marginTop: 2 }, custom: { gap: 10, borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14 }, customTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" }, pressed: { opacity: 0.7, transform: [{ scale: 0.985 }] },
});
