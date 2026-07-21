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
        return { ...(initial as object), ...(parsed as object) } as T;
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
