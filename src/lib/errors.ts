import { toast } from "sonner";
import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Translate common backend errors into Portuguese user-friendly messages
 * and surface them via toast. Also logs the raw error for debugging.
 *
 * Usage:
 *   const { data, error } = await supabase.from("x").select();
 *   if (error) return handleError(error, "Não foi possível carregar X");
 */
export function handleError(
  err: unknown,
  fallbackMessage = "Ocorreu um erro inesperado",
): void {
  console.error("[handleError]", err);
  toast.error(friendlyMessage(err, fallbackMessage));
}

export function friendlyMessage(err: unknown, fallback = "Ocorreu um erro inesperado"): string {
  if (!err) return fallback;

  const anyErr = err as Partial<PostgrestError> & { message?: string; code?: string; status?: number };
  const raw = (anyErr.message || "").toLowerCase();
  const code = anyErr.code;

  // Network / offline
  if (raw.includes("failed to fetch") || raw.includes("networkerror") || raw.includes("network request failed")) {
    return "Sem conexão com o servidor. Verifique sua internet e tente novamente.";
  }
  if (raw.includes("timeout")) {
    return "A operação demorou demais. Tente novamente.";
  }

  // Auth
  if (raw.includes("invalid login") || raw.includes("invalid credentials")) {
    return "Email ou senha incorretos.";
  }
  if (raw.includes("email not confirmed")) {
    return "Confirme seu email antes de entrar.";
  }
  if (raw.includes("user already registered") || code === "user_already_exists") {
    return "Este email já está cadastrado.";
  }
  if (raw.includes("jwt") || raw.includes("not authenticated")) {
    return "Sessão expirada. Entre novamente.";
  }

  // Postgres / RLS
  if (code === "23505" || raw.includes("duplicate key")) {
    return "Este registro já existe.";
  }
  if (code === "23503" || raw.includes("foreign key")) {
    return "Não é possível excluir: este item está sendo usado em outro lugar.";
  }
  if (code === "23502" || raw.includes("null value")) {
    return "Preencha todos os campos obrigatórios.";
  }
  if (code === "42501" || raw.includes("permission denied") || raw.includes("row-level security")) {
    return "Você não tem permissão para essa ação.";
  }
  if (code === "PGRST116") {
    return "Registro não encontrado.";
  }

  return anyErr.message || fallback;
}

/** Wrap an async operation with unified error handling. Returns data or null. */
export async function safeAsync<T>(
  op: () => Promise<T>,
  fallbackMessage?: string,
): Promise<T | null> {
  try {
    return await op();
  } catch (err) {
    handleError(err, fallbackMessage);
    return null;
  }
}
