import type { ForwardRefExoticComponent, RefAttributes } from "react";

export type BrowserPlanFile = {
  name: string;
  size: number;
  type: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

export type PlanFilePickerHandle = {
  open: () => void;
};

type PlanFilePickerProps = {
  accept: string;
  onFileSelected: (file: BrowserPlanFile) => void;
};

// Metro resolves the .web or .native implementation at runtime. This type-only
// fallback lets TypeScript resolve the shared import without pulling DOM code
// into a native bundle.
export declare const PlanFilePicker: ForwardRefExoticComponent<PlanFilePickerProps & RefAttributes<PlanFilePickerHandle>>;
