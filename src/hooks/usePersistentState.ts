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
      return JSON.parse(raw) as T;
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
