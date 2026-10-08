export const EQUIPMENT_OPTIONS = [
  "Barbell",
  "Dumbbell",
  "Kettlebell",
  "Machine",
  "Cable",
  "Smith Machine",
  "Trap Bar",
  "Bodyweight",
  "Other",
] as const;

export type EquipmentOption = (typeof EQUIPMENT_OPTIONS)[number];

export function isEquipmentOption(value: string): value is EquipmentOption {
  return EQUIPMENT_OPTIONS.includes(value as EquipmentOption);
}
