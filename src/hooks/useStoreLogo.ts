import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Busca o logo configurado em store_settings.
 * Retorna null quando não há logo personalizado (usa-se o logo padrão do app).
 * Cache em módulo para evitar refetch a cada navegação.
 */
let cached: string | null | undefined;

export const useStoreLogo = () => {
  const [logo, setLogo] = useState<string | null>(cached ?? null);

  useEffect(() => {
    let alive = true;
    if (cached !== undefined) return;
    (async () => {
      try {
        const { data } = await supabase
          .from("store_settings")
          .select("logo_url")
          .maybeSingle();
        const url = (data as { logo_url?: string | null } | null)?.logo_url ?? null;
        cached = url;
        if (alive) setLogo(url);
      } catch {
        cached = null;
      }
    })();
    return () => { alive = false; };
  }, []);

  return logo;
};
