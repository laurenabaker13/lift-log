import { describe, expect, it } from "vitest";
import { EQUIPMENT_OPTIONS, isEquipmentOption } from "../shared/equipment";

describe("equipment options", () => {
  it("includes fast common gym choices for a lift", () => {
    expect(EQUIPMENT_OPTIONS).toEqual(expect.arrayContaining([
      "Barbell",
      "Dumbbell",
      "Kettlebell",
      "Machine",
      "Cable",
      "Smith Machine",
      "Bodyweight",
    ]));
  });

  it("recognizes the selectable equipment options", () => {
    expect(isEquipmentOption("Kettlebell")).toBe(true);
    expect(isEquipmentOption("Machine")).toBe(true);
    expect(isEquipmentOption("Plate-loaded machine")).toBe(false);
  });
});
