import { AuthGate } from "@/components/lift-log/auth-gate";
import { EquipmentPicker } from "@/components/lift-log/equipment-picker";
import { useInteractiveTour } from "@/components/lift-log/interactive-tour";
import { NumberInput } from "@/components/lift-log/number-input";
import { PlanFilePicker, type BrowserPlanFile, type PlanFilePickerHandle } from "@/components/lift-log/plan-file-picker";
import { WeightInput } from "@/components/lift-log/weight-input";
import { AppButton, AppInput, AppScreen, Card, LoadingState, colors, ui } from "@/components/lift-log/ui";
import * as Api from "@/lib/_core/api";
import { trpc } from "@/lib/trpc";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const ACCEPTED_PLAN_FILES = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";

type ImportSet = { targetReps: number };
type ImportExercise = { name: string; equipment: string; prescriptionMode: "percent" | "weight"; intensityPercent: number | null; plannedWeight: number | null; weightUnit: "lb" | "kg" | null; targetRpe: number | null; sets: ImportSet[] };
type ImportWorkout = { dayOfWeek: number; name: string; exercises: ImportExercise[] };
type ImportWeek = { name: string; workouts: ImportWorkout[] };
type ImportDraft = { importId: number; name: string; trainerNotes: string; weeks: ImportWeek[]; uncertainItems: string[] };
type ImportStage = "idle" | "uploading" | "reading";
type SelectedPlanFile = {
  fileName: string;
  mimeType?: string | null;
  size?: number | null;
  readBase64: () => Promise<string>;
};

const blankExercise = (): ImportExercise => ({ name: "", equipment: "Barbell", prescriptionMode: "weight", intensityPercent: null, plannedWeight: null, weightUnit: "lb", targetRpe: null, sets: [{ targetReps: 8 }] });
const blankWorkout = (): ImportWorkout => ({ dayOfWeek: 1, name: "", exercises: [blankExercise()] });

function inferMimeType(name: string, mimeType?: string | null) {
  if (mimeType && (mimeType === "application/pdf" || mimeType === "text/plain" || mimeType.startsWith("image/"))) return mimeType;
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  return "image/jpeg";
}

async function readWebPlanAsBase64(file: BrowserPlanFile) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  if (typeof globalThis.btoa !== "function") throw new Error("This browser cannot read the selected file.");
  return globalThis.btoa(binary);
}

function numberFromText(value: string) {
  const parsed = Number(value);
  return value.trim() && Number.isFinite(parsed) ? parsed : null;
}

function ImportPlan() {
  const router = useRouter();
  const { isTourStep } = useInteractiveTour();
  const params = useLocalSearchParams<{ appendToProgramId?: string; programName?: string; appendAfterWeek?: string }>();
  const utils = trpc.useUtils();
  const webFilePicker = useRef<PlanFilePickerHandle>(null);
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [pastedPlanText, setPastedPlanText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [importStage, setImportStage] = useState<ImportStage>("idle");
  const appendProgramId = Number(params.appendToProgramId);
  const isAppending = Number.isSafeInteger(appendProgramId) && appendProgramId > 0;
  const appendAfterWeek = Number(params.appendAfterWeek);
  const targetPlanName = params.programName?.trim() || "your active plan";
  const createPlan = trpc.program.createFromImport.useMutation({
    onSuccess: () => { utils.program.getActive.invalidate(); router.replace("/plans" as never); },
    onError: (error) => setMessage(error.message),
  });
  const appendWeeks = trpc.program.appendFromImport.useMutation({
    onSuccess: () => { utils.program.getActive.invalidate(); router.replace("/plans" as never); },
    onError: (error) => setMessage(error.message),
  });

  const setImportedDraft = (result: Api.PlanImportAnalysis) => {
    const importedWeeks = isAppending && Number.isSafeInteger(appendAfterWeek) && appendAfterWeek > 0
      ? result.weeks.map((week, index) => /^week\s*\d+$/i.test(week.name.trim()) ? { ...week, name: `Week ${appendAfterWeek + index + 1}` } : week)
      : result.weeks;
    setDraft({
      importId: result.importId,
      name: result.planName || "",
      trainerNotes: result.trainerNotes || "",
      weeks: importedWeeks.map((week) => ({ ...week, workouts: week.workouts.map((workout) => ({ ...workout, exercises: workout.exercises.map((exercise) => ({ ...exercise, prescriptionMode: "weight", intensityPercent: null })) })) })),
      uncertainItems: result.uncertainItems,
    });
  };

  const importPlanFile = async (file: SelectedPlanFile) => {
    if (file.size && file.size > MAX_UPLOAD_BYTES) {
      setMessage("Use a photo or PDF smaller than 12 MB.");
      return;
    }

    try {
      setMessage(null);
      setImportStage("uploading");
      const base64 = await file.readBase64();
      const uploaded = await Api.uploadPlanDocument({
        fileName: file.fileName || "trainer-plan",
        mimeType: inferMimeType(file.fileName || "trainer-plan", file.mimeType),
        base64,
      });
      setImportStage("reading");
      const result = await Api.analyzePlanDocument(uploaded.id);
      setImportedDraft(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not import this plan. Please try a clearer image or PDF.");
    } finally {
      setImportStage("idle");
    }
  };

  const importPastedText = async () => {
    if (!pastedPlanText.trim()) {
      setMessage("Paste your trainer's workout text first.");
      return;
    }
    try {
      setMessage(null);
      setImportStage("uploading");
      const uploaded = await Api.uploadPastedPlanText(pastedPlanText);
      setImportStage("reading");
      const result = await Api.analyzePlanDocument(uploaded.id);
      setImportedDraft(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not read that text. Please try again.");
    } finally {
      setImportStage("idle");
    }
  };

  const handleWebFile = (file: BrowserPlanFile) => {
    void importPlanFile({
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
      readBase64: () => readWebPlanAsBase64(file),
    });
  };

  const pickPdf = async () => {
    if (Platform.OS === "web") {
      webFilePicker.current?.open();
      return;
    }
    try {
      setMessage(null);
      const picked = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true, multiple: false });
      if (picked.canceled || !picked.assets?.[0]) return;
      const asset = picked.assets[0];
      await importPlanFile({
        fileName: asset.name || "trainer-plan.pdf",
        mimeType: asset.mimeType || "application/pdf",
        size: asset.size,
        readBase64: () => FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 }),
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not open this PDF.");
    }
  };

  const pickPhoto = async () => {
    if (Platform.OS === "web") {
      webFilePicker.current?.open();
      return;
    }
    try {
      setMessage(null);
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setMessage("Allow photo access to choose a workout plan image.");
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", allowsEditing: false, quality: 0.9, selectionLimit: 1 });
      if (picked.canceled || !picked.assets?.[0]) return;
      const asset = picked.assets[0];
      await importPlanFile({
        fileName: asset.fileName || `workout-plan-${Date.now()}.jpg`,
        mimeType: asset.mimeType || "image/jpeg",
        size: asset.fileSize,
        readBase64: () => FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 }),
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not open this photo.");
    }
  };

  const updateWeek = (weekIndex: number, change: Partial<ImportWeek>) => setDraft((current) => current ? ({ ...current, weeks: current.weeks.map((week, index) => index === weekIndex ? { ...week, ...change } : week) }) : current);
  const updateWorkout = (weekIndex: number, workoutIndex: number, change: Partial<ImportWorkout>) => setDraft((current) => current ? ({ ...current, weeks: current.weeks.map((week, wi) => wi === weekIndex ? { ...week, workouts: week.workouts.map((workout, oi) => oi === workoutIndex ? { ...workout, ...change } : workout) } : week) }) : current);
  const updateExercise = (weekIndex: number, workoutIndex: number, exerciseIndex: number, change: Partial<ImportExercise>) => setDraft((current) => current ? ({ ...current, weeks: current.weeks.map((week, wi) => wi === weekIndex ? { ...week, workouts: week.workouts.map((workout, oi) => oi === workoutIndex ? { ...workout, exercises: workout.exercises.map((exercise, ei) => ei === exerciseIndex ? { ...exercise, ...change } : exercise) } : workout) } : week) }) : current);
  const updateSet = (weekIndex: number, workoutIndex: number, exerciseIndex: number, setIndex: number, targetReps: number) => updateExercise(weekIndex, workoutIndex, exerciseIndex, { sets: draft?.weeks[weekIndex]?.workouts[workoutIndex]?.exercises[exerciseIndex]?.sets.map((set, index) => index === setIndex ? { ...set, targetReps } : set) ?? [] });
  const removeWorkout = (weekIndex: number, workoutIndex: number) => updateWeek(weekIndex, { workouts: draft?.weeks[weekIndex]?.workouts.filter((_, index) => index !== workoutIndex) ?? [] });
  const addWorkout = (weekIndex: number) => updateWeek(weekIndex, { workouts: [...(draft?.weeks[weekIndex]?.workouts ?? []), blankWorkout()] });
  const removeExercise = (weekIndex: number, workoutIndex: number, exerciseIndex: number) => updateWorkout(weekIndex, workoutIndex, { exercises: draft?.weeks[weekIndex]?.workouts[workoutIndex]?.exercises.filter((_, index) => index !== exerciseIndex) ?? [] });
  const addExercise = (weekIndex: number, workoutIndex: number) => updateWorkout(weekIndex, workoutIndex, { exercises: [...(draft?.weeks[weekIndex]?.workouts[workoutIndex]?.exercises ?? []), blankExercise()] });
  const removeSet = (weekIndex: number, workoutIndex: number, exerciseIndex: number, setIndex: number) => updateExercise(weekIndex, workoutIndex, exerciseIndex, { sets: draft?.weeks[weekIndex]?.workouts[workoutIndex]?.exercises[exerciseIndex]?.sets.filter((_, index) => index !== setIndex) ?? [] });
  const addSet = (weekIndex: number, workoutIndex: number, exerciseIndex: number) => updateExercise(weekIndex, workoutIndex, exerciseIndex, { sets: [...(draft?.weeks[weekIndex]?.workouts[workoutIndex]?.exercises[exerciseIndex]?.sets ?? []), { targetReps: 8 }] });
  const saveImportedWeeks = () => {
    if (!draft) return;
    const input = { importId: draft.importId, name: draft.name.trim(), trainerNotes: draft.trainerNotes.trim() || null, weeks: draft.weeks };
    if (isAppending) appendWeeks.mutate({ ...input, programId: appendProgramId });
    else createPlan.mutate(input);
  };
  const isSaving = createPlan.isPending || appendWeeks.isPending;

  if (importStage !== "idle") return <AppScreen scroll={false}><LoadingState label={importStage === "uploading" ? "Uploading your plan…" : "Reading your workout plan…"} /></AppScreen>;
  if (!draft) {
    return <AppScreen>
      <PlanFilePicker ref={webFilePicker} accept={ACCEPTED_PLAN_FILES} onFileSelected={handleWebFile} />
      <AppButton variant="ghost" style={styles.back} onPress={() => router.back()}>‹ Back to plan</AppButton>
      <View style={styles.header}><Text style={ui.title}>{isAppending ? "Add weeks to your plan" : "Import a trainer plan"}</Text><Text style={ui.subtitle}>{isAppending ? "Upload a photo, screenshot, or PDF, or paste trainer text. Review it before adding it to your plan." : "Upload a photo, screenshot, or PDF, or paste trainer text. Review everything before saving."}</Text></View>
      {message ? <Card style={styles.error}><Text style={styles.errorText}>{message}</Text></Card> : null}
      <Card style={[styles.uploadCard, isTourStep("plans_upload") && styles.tourTarget]}>
        <Text style={styles.uploadTitle}>{isAppending ? "Add the next week without starting over." : "Save time entering your plan."}</Text>
        <Text style={styles.uploadText}>{isAppending ? "Use a clear PDF, photo, or screenshot. Your current plan and logged workouts will stay unchanged." : "Use a clear photo, screenshot, or PDF. We will point out anything hard to read instead of guessing."}</Text>
        {Platform.OS === "web" ? <AppButton onPress={pickPdf}>Upload a PDF or photo</AppButton> : <View style={styles.uploadActions}><AppButton style={styles.uploadAction} onPress={pickPdf}>Upload PDF</AppButton><AppButton variant="secondary" style={styles.uploadAction} onPress={pickPhoto}>Choose photo</AppButton></View>}
        {Platform.OS !== "web" ? <Text style={styles.sourceHint}>PDFs open in Files; photos open in your photo library.</Text> : null}
      </Card>
      <Card style={styles.pasteCard}>
        <Text style={styles.pasteTitle}>Paste trainer text</Text>
        <Text style={styles.pasteText}>Copy a workout plan from a message, email, or note, then review it before saving.</Text>
        <AppInput value={pastedPlanText} onChangeText={setPastedPlanText} multiline textAlignVertical="top" style={styles.pasteInput} placeholder="Paste the workout plan here" />
        <AppButton variant="secondary" onPress={() => void importPastedText()}>Read pasted text</AppButton>
      </Card>
      <Card style={styles.safetyCard}><Text style={styles.safetyTitle}>Review before saving</Text><Text style={styles.safetyText}>Review and edit every detail before saving. Nothing is added to your plan until you save it.</Text></Card>
    </AppScreen>;
  }

  return <AppScreen>
    <AppButton variant="ghost" style={styles.back} onPress={() => setDraft(null)}>‹ Choose a different source</AppButton>
    <View style={styles.header}><Text style={ui.title}>{isAppending ? "Review added weeks" : "Review imported plan"}</Text><Text style={ui.subtitle}>{`We found ${draft.weeks.reduce((count, week) => count + week.workouts.length, 0)} workout${draft.weeks.reduce((count, week) => count + week.workouts.length, 0) === 1 ? "" : "s"}. Check them, then Save.`}</Text></View>
    {message ? <Card style={styles.error}><Text style={styles.errorText}>{message}</Text></Card> : null}
    {draft.uncertainItems.length ? <Card style={styles.warning}><Text style={styles.warningTitle}>Please double-check these</Text>{draft.uncertainItems.map((item, index) => <Text key={`${item}-${index}`} style={styles.warningText}>• {item}</Text>)}</Card> : <Card style={styles.success}><Text style={styles.successText}>No unclear details found. Review the plan before saving.</Text></Card>}
    {isAppending ? <Card style={styles.appendNote}><Text style={styles.appendLabel}>Adding weeks to</Text><Text style={styles.appendName}>{targetPlanName}</Text><Text style={styles.appendText}>Your plan name, existing weeks, and logged workouts won’t change.</Text></Card> : <AppInput label="Plan name" value={draft.name} onChangeText={(name) => setDraft((current) => current ? { ...current, name } : current)} placeholder="Name this plan" />}
    <AppInput label={isAppending ? "Notes" : "Trainer notes"} value={draft.trainerNotes} onChangeText={(trainerNotes) => setDraft((current) => current ? { ...current, trainerNotes } : current)} multiline placeholder="Notes from the trainer" />
    {draft.weeks.map((week, weekIndex) => <Card key={weekIndex} style={styles.weekCard}>
      <AppButton variant="ghost" onPress={() => setDraft((current) => current ? { ...current, weeks: current.weeks.filter((_, index) => index !== weekIndex) } : current)}>Remove week</AppButton>
      <AppInput label="Week name" value={week.name} onChangeText={(name) => updateWeek(weekIndex, { name })} />
      {week.workouts.map((workout, workoutIndex) => <View key={workoutIndex} style={styles.workoutBlock}>
        <View style={styles.row}><TextInput accessibilityLabel="Workout name" value={workout.name} onChangeText={(name) => updateWorkout(weekIndex, workoutIndex, { name })} style={styles.workoutInput} placeholder="Workout name" placeholderTextColor="#9A9A90" /><AppButton variant="ghost" style={styles.removeButton} onPress={() => removeWorkout(weekIndex, workoutIndex)}>Remove</AppButton></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>{DAYS.map((day, dayIndex) => <AppButton key={day} variant={workout.dayOfWeek === dayIndex ? "primary" : "secondary"} style={styles.dayButton} onPress={() => updateWorkout(weekIndex, workoutIndex, { dayOfWeek: dayIndex })}>{day}</AppButton>)}</ScrollView>
        {workout.exercises.map((exercise, exerciseIndex) => <View key={exerciseIndex} style={styles.exerciseBlock}>
          <View style={styles.row}><Text style={styles.exerciseLabel}>Exercise {exerciseIndex + 1}</Text><AppButton variant="ghost" style={styles.removeButton} onPress={() => removeExercise(weekIndex, workoutIndex, exerciseIndex)}>Remove</AppButton></View>
          <AppInput label="Exercise" value={exercise.name} onChangeText={(name) => updateExercise(weekIndex, workoutIndex, exerciseIndex, { name })} />
          <EquipmentPicker value={exercise.equipment} onChange={(equipment) => updateExercise(weekIndex, workoutIndex, exerciseIndex, { equipment })} />
          <WeightInput label={`Weight (${exercise.weightUnit ?? "lb"})`} value={exercise.plannedWeight} unit={exercise.weightUnit ?? "lb"} onChange={(plannedWeight) => updateExercise(weekIndex, workoutIndex, exerciseIndex, { prescriptionMode: "weight", plannedWeight, weightUnit: exercise.weightUnit ?? "lb" })} />
          <View style={styles.unitRow}><AppButton variant={(exercise.weightUnit ?? "lb") === "lb" ? "primary" : "secondary"} style={styles.unitButton} onPress={() => updateExercise(weekIndex, workoutIndex, exerciseIndex, { weightUnit: "lb" })}>lb</AppButton><AppButton variant={exercise.weightUnit === "kg" ? "primary" : "secondary"} style={styles.unitButton} onPress={() => updateExercise(weekIndex, workoutIndex, exerciseIndex, { weightUnit: "kg" })}>kg</AppButton></View>
          <Text style={styles.fieldLabel}>How should it feel? (optional)</Text>
          <View style={styles.modeRow}>{[{ label: "Easy", value: 6 }, { label: "Good", value: 8 }, { label: "Hard", value: 10 }].map((feeling) => <AppButton key={feeling.label} variant={exercise.targetRpe === feeling.value ? "primary" : "secondary"} style={styles.modeButton} onPress={() => updateExercise(weekIndex, workoutIndex, exerciseIndex, { targetRpe: exercise.targetRpe === feeling.value ? null : feeling.value })}>{feeling.label}</AppButton>)}</View>
          {exercise.sets.map((set, setIndex) => <View key={setIndex} style={styles.setRow}><Text style={styles.setLabel}>Set {setIndex + 1}</Text><NumberInput accessibilityLabel={`Reps for set ${setIndex + 1}`} value={String(set.targetReps)} onChangeText={(value) => updateSet(weekIndex, workoutIndex, exerciseIndex, setIndex, numberFromText(value) ?? 0)} keyboardType="decimal-pad" style={styles.repsInput} /><Text style={styles.repText}>reps</Text><AppButton variant="ghost" style={styles.removeButton} onPress={() => removeSet(weekIndex, workoutIndex, exerciseIndex, setIndex)}>Remove</AppButton></View>)}
          <AppButton variant="secondary" style={styles.smallButton} onPress={() => addSet(weekIndex, workoutIndex, exerciseIndex)}>Add set</AppButton>
        </View>)}
        <AppButton variant="secondary" style={styles.smallButton} onPress={() => addExercise(weekIndex, workoutIndex)}>Add exercise</AppButton>
      </View>)}
      <AppButton variant="secondary" style={styles.smallButton} onPress={() => addWorkout(weekIndex)}>Add workout day</AppButton>
    </Card>)}
    <AppButton variant="secondary" onPress={() => setDraft((current) => current ? { ...current, weeks: [...current.weeks, { name: `Week ${current.weeks.length + 1}`, workouts: [blankWorkout()] }] } : current)}>Add week</AppButton>
    <AppButton onPress={saveImportedWeeks} disabled={isSaving}>{isSaving ? (isAppending ? "Adding weeks…" : "Creating plan…") : isAppending ? "Save" : "Save"}</AppButton>
    <Text style={styles.footnote}>{isAppending ? "New weeks are added after the current final week. Existing weeks and logged workouts will never be changed." : "After saving, you can keep editing future weeks. Logged workouts will never be changed."}</Text>
  </AppScreen>;
}

export default function ImportPlanScreen() { return <AuthGate><ImportPlan /></AuthGate>; }

const styles = StyleSheet.create({
  back: { minHeight: 44, paddingHorizontal: 0, alignSelf: "flex-start" },
  header: { gap: 3 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  uploadCard: { gap: 12, backgroundColor: colors.ink, borderColor: colors.ink },
  uploadTitle: { color: colors.panel, fontSize: 22, fontWeight: "800" },
  uploadText: { color: "#D0D0C9", fontSize: 16, lineHeight: 21 },
  uploadActions: { flexDirection: "row", gap: 8 },
  uploadAction: { flex: 1, paddingHorizontal: 8 },
  sourceHint: { color: "#D0D0C9", fontSize: 16, lineHeight: 18, textAlign: "center" },
  pasteCard: { gap: 12 },
  pasteTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  pasteText: { color: colors.muted, fontSize: 16, lineHeight: 21 },
  pasteInput: { minHeight: 144, backgroundColor: "#F8FAF7", color: colors.ink, borderRadius: 15, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 15, paddingTop: 13, fontSize: 16, fontWeight: "600" },
  safetyCard: { gap: 6, backgroundColor: colors.paleInk },
  safetyTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  safetyText: { color: colors.muted, fontSize: 16, lineHeight: 19 },
  error: { backgroundColor: "#FCEAE5", borderColor: "#F3C4B7" },
  errorText: { color: colors.rust, fontWeight: "700", fontSize: 16, lineHeight: 19 },
  warning: { gap: 5, backgroundColor: "#FFF3D5", borderColor: "#F0D89A" },
  warningTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  warningText: { color: colors.ink, fontSize: 16, lineHeight: 18 },
  success: { backgroundColor: colors.paleLime, borderColor: "#DCEAB4" },
  successText: { color: colors.limeDark, fontSize: 16, fontWeight: "700", lineHeight: 19 },
  appendNote: { gap: 4, backgroundColor: colors.paleInk },
  appendLabel: { color: colors.limeDark, fontSize: 16, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" },
  appendName: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  appendText: { color: colors.muted, fontSize: 16, lineHeight: 19 },
  weekCard: { gap: 14 },
  workoutBlock: { gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 13 },
  workoutInput: { minHeight: 44, color: colors.ink, fontSize: 16, fontWeight: "800", padding: 0, flex: 1 },
  dayRow: { gap: 7 },
  dayButton: { minWidth: 52, minHeight: 44, borderRadius: 12, paddingHorizontal: 10 },
  exerciseBlock: { gap: 8, backgroundColor: colors.paleInk, padding: 10, borderRadius: 12 },
  exerciseLabel: { color: colors.ink, fontSize: 16, fontWeight: "800", flex: 1 },
  modeRow: { flexDirection: "row", gap: 7 },
  modeButton: { flex: 1, minHeight: 44, borderRadius: 12, paddingHorizontal: 8 },
  unitRow: { flexDirection: "row", gap: 7 },
  unitButton: { minWidth: 56, minHeight: 44, borderRadius: 12, paddingHorizontal: 12 },
  numberField: { gap: 7 },
  fieldLabel: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  percentageInput: { width: 112, minHeight: 44, borderColor: colors.line, borderWidth: 1, borderRadius: 9, backgroundColor: colors.panel, color: colors.ink, textAlign: "center", fontSize: 16, fontWeight: "700" },
  effortInput: { width: 80, minHeight: 44, borderColor: colors.line, borderWidth: 1, borderRadius: 9, backgroundColor: colors.panel, color: colors.ink, textAlign: "center", fontSize: 16, fontWeight: "700" },
  setRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  setLabel: { color: colors.ink, fontSize: 16, fontWeight: "800", width: 46 },
  repsInput: { width: 58, minHeight: 44, borderColor: colors.line, borderWidth: 1, borderRadius: 9, backgroundColor: colors.panel, color: colors.ink, textAlign: "center", fontSize: 16, fontWeight: "700" },
  repText: { color: colors.muted, fontSize: 16, flex: 1 },
  smallButton: { minHeight: 44, borderRadius: 10 },
  removeButton: { minHeight: 44, paddingHorizontal: 0 },
  footnote: { color: colors.muted, fontSize: 16, lineHeight: 18, textAlign: "center" },
  tourTarget: { borderColor: colors.lime, borderWidth: 2, boxShadow: "0px 0px 0px 4px rgba(191, 232, 102, 0.22)" },
});
