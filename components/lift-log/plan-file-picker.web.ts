import { createElement, forwardRef, useImperativeHandle, useRef } from "react";

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

export const PlanFilePicker = forwardRef<PlanFilePickerHandle, PlanFilePickerProps>(function PlanFilePicker(
  { accept, onFileSelected },
  ref,
) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useImperativeHandle(ref, () => ({
    open: () => inputRef.current?.click(),
  }), []);

  return createElement("input", {
    ref: inputRef,
    type: "file",
    accept,
    // Keep this technically visible for browser accessibility and automation,
    // while the clear app button remains the only visible control.
    style: { position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" },
    onChange: (event: { currentTarget: HTMLInputElement }) => {
      const file = event.currentTarget.files?.[0];
      // Allow selecting the same file again after an import error.
      event.currentTarget.value = "";
      if (file) onFileSelected(file);
    },
  });
});
