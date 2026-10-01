import { useEffect, useState } from "react";

export function useLocalState<T>(
  key: string,
  initial: T,
  validate?: (value: unknown) => boolean,
) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(`atlas:${key}`);
      const parsed: unknown = stored ? JSON.parse(stored) : initial;
      return !validate || validate(parsed) ? (parsed as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`atlas:${key}`, JSON.stringify(value));
    } catch {
      window.dispatchEvent(new Event("atlas-storage-error"));
    }
  }, [key, value]);
  return [value, setValue] as const;
}

export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
