import { useEffect, useState } from "react";

/** Prefer FinanceBro values; retain and migrate valid settings from Atlas. */
export function readWorkspaceValue<T>(
  storage: Pick<Storage, "getItem">,
  key: string,
  initial: T,
  validate?: (value: unknown) => boolean,
): T {
  for (const prefix of ["financebro", "atlas"]) {
    try {
      const stored = storage.getItem(`${prefix}:${key}`);
      if (stored === null) continue;
      const parsed: unknown = JSON.parse(stored);
      if (!validate || validate(parsed)) return parsed as T;
    } catch {
      /* A malformed entry must not erase an older valid workspace. */
    }
  }
  return initial;
}
export function useLocalState<T>(
  key: string,
  initial: T,
  validate?: (value: unknown) => boolean,
) {
  const [value, setValue] = useState<T>(() => {
    try {
      return readWorkspaceValue(localStorage, key, initial, validate);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`financebro:${key}`, JSON.stringify(value));
    } catch {
      window.dispatchEvent(new Event("financebro-storage-error"));
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
