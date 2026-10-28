import { invoke } from "@tauri-apps/api/core";

export const TEXT_SIZES = [90, 100, 110, 120, 130, 140] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
export interface AppearanceTransport {
  read(): Promise<number>;
  set(percent: TextSize): Promise<void>;
}
export const nativeAppearance: AppearanceTransport = {
  read: () => invoke("text_size_read"),
  set: (percent) => invoke("text_size_set", { percent }),
};
export function readTextSize(value: unknown): TextSize {
  if (typeof value !== "number" || !TEXT_SIZES.some(size => size === value)) throw new Error("INVALID_TEXT_SIZE");
  return value as TextSize;
}
