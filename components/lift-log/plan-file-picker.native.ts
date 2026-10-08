import { forwardRef, useImperativeHandle } from "react";

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

// Native file selection uses Expo's document and photo pickers. This component
// exists only to keep the web-only DOM input isolated from the native bundle.
export const PlanFilePicker = forwardRef<PlanFilePickerHandle, PlanFilePickerProps>(function PlanFilePicker(
  _props,
  ref,
) {
  useImperativeHandle(ref, () => ({ open: () => undefined }), []);
  return null;
});
