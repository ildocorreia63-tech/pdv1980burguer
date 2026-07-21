import { useEffect, useRef, useState } from "react";

/**
 * useState que persiste no localStorage.
 * Os dados sobrevivem a refresh, troca de aba, minimização do app, etc.
 */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return initial;
      const parsed = JSON.parse(raw) as T;
      // Merge object defaults so new fields added later are never undefined.
      if (
        parsed && typeof parsed === "object" && !Array.isArray(parsed) &&
        initial && typeof initial === "object" && !Array.isArray(initial)
      ) {
        const defaults = initial as Record<string, unknown>;
        const saved = parsed as Record<string, unknown>;
        const normalized = { ...defaults, ...saved };

        // Old persisted versions can contain null/undefined for fields that are
        // strings today. Restore the current default instead of letting those
        // stale values crash formatters such as trim/replace.
        for (const [field, defaultValue] of Object.entries(defaults)) {
          if (typeof defaultValue === "string" && typeof normalized[field] !== "string") {
            normalized[field] = defaultValue;
          }
        }

        return normalized as T;
      }
      return parsed;
    } catch {
      return initial;
    }
  });

  const first = useRef(true);
  useEffect(() => {
    // evita escrita inicial desnecessária
    if (first.current) {
      first.current = false;
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore quota errors */
    }
  }, [key, value]);

  return [value, setValue] as const;
}

export function clearPersistentState(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
