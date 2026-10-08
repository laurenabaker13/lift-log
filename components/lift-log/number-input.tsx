import { useEffect, useRef, useState } from "react";
import { TextInput, type TextInputProps } from "react-native";

/** Keep partial decimals while typing; selecting on focus replaces the old number. */
export function NumberInput({ value = "", onChangeText, onFocus, onBlur, ...props }: TextInputProps) {
  const [text, setText] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    setText((current) => !focused.current || (current !== value && Number(current.replace(",", ".")) !== Number(value)) ? value : current);
  }, [value]);
  return <TextInput {...props} keyboardType={props.keyboardType ?? "decimal-pad"}
    selectTextOnFocus value={text}
    onFocus={(event) => {
      focused.current = true;
      const target = event.nativeEvent.target as unknown as { select?: () => void };
      target?.select?.();
      onFocus?.(event);
    }}
    onChangeText={(next) => {
      if (!/^\d*(?:[.,]\d*)?$/.test(next)) return;
      setText(next);
      onChangeText?.(next.replace(",", "."));
    }}
    onBlur={(event) => { focused.current = false; setText(value); onBlur?.(event); }} />;
}
