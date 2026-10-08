import { invokeLLM } from "./llm";

export type LiftGuidance = {
  safetyReminders: string[];
  howTo: string[];
  caution: string;
};

const guidanceSchema = {
  type: "object",
  properties: {
    safetyReminders: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 },
    howTo: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
    caution: { type: "string" },
  },
  required: ["safetyReminders", "howTo", "caution"],
  additionalProperties: false,
} as const;

function validateGuidance(value: unknown): LiftGuidance {
  if (!value || typeof value !== "object") throw new Error("Lift guidance was unavailable.");
  const guidance = value as LiftGuidance;
  if (!Array.isArray(guidance.safetyReminders) || !Array.isArray(guidance.howTo) || typeof guidance.caution !== "string") {
    throw new Error("Lift guidance was unavailable.");
  }
  return guidance;
}

export async function getLiftGuidance(input: { name: string; equipment: string }) {
  const response = await invokeLLM({
    model: "gemini-3-flash-preview",
    maxTokens: 1600,
    messages: [{
      role: "user",
      content: `Give concise, beginner-friendly general fitness guidance for a ${input.name} using ${input.equipment}. Include 2–4 short general safety reminders and 3–5 clear form steps. Do not diagnose, treat, or give medical advice. Do not make claims about preventing injury. The caution must tell the person to stop for pain and talk with a qualified coach or clinician for pain, injury, or health concerns.`,
    }],
    responseFormat: { type: "json_schema", json_schema: { name: "lift_guidance", strict: true, schema: guidanceSchema } },
  });
  const content = response.choices[0]?.message.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("Lift guidance was unavailable.");
  return validateGuidance(JSON.parse(content));
}
