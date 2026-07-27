// Calcula taxa de entrega por KM usando Google Maps (via connector gateway).
// Input: { address: string }
// Output: { distance_km, fee, tier_index, eta, tier_label, no_delivery }
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const GMAPS_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY") ?? "";

const BodySchema = z.object({ address: z.string().min(5).max(300) });

type Tier = {
  max_km: number;
  price: number;
  free_from?: number | null;
  eta?: string | null;
  no_delivery?: boolean | null;
};

function pickTier(tiers: Tier[], km: number): { tier: Tier | null; index: number } {
  const sorted = [...tiers].sort((a, b) => a.max_km - b.max_km);
  for (let i = 0; i < sorted.length; i++) {
    if (km <= Number(sorted[i].max_km)) return { tier: sorted[i], index: i };
  }
  return { tier: null, index: -1 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!LOVABLE_API_KEY || !GMAPS_KEY) throw new Error("Google Maps não configurado");
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Endereço inválido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { address } = parsed.data;

    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(url, key);
    const { data: settings, error: sErr } = await supabase
      .from("store_settings")
      .select("delivery_mode, store_address, store_lat, store_lng, delivery_km_tiers")
      .maybeSingle();
    if (sErr) throw sErr;
    if (!settings) throw new Error("Configurações da loja não encontradas");
    if (settings.delivery_mode !== "km") throw new Error("Modo de entrega não está em KM");
    const tiers = (settings.delivery_km_tiers ?? []) as Tier[];
    if (!Array.isArray(tiers) || tiers.length === 0) throw new Error("Nenhuma faixa de KM configurada");

    // 1) Origem: usa lat/lng cacheados; senão geocoda o endereço da loja e persiste.
    let originLat = settings.store_lat ? Number(settings.store_lat) : null;
    let originLng = settings.store_lng ? Number(settings.store_lng) : null;
    if (originLat == null || originLng == null) {
      if (!settings.store_address) throw new Error("Endereço da loja não configurado");
      const geo = await fetch(
        `${GATEWAY}/maps/api/geocode/json?address=${encodeURIComponent(settings.store_address)}&region=br`,
        { headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "X-Connection-Api-Key": GMAPS_KEY } },
      );
      const gj = await geo.json();
      const loc = gj?.results?.[0]?.geometry?.location;
      if (!loc) throw new Error("Não foi possível localizar o endereço da loja");
      originLat = Number(loc.lat);
      originLng = Number(loc.lng);
      await supabase.from("store_settings")
        .update({ store_lat: originLat, store_lng: originLng })
        .eq("id", (settings as any).id ?? undefined);
    }

    // 2) Geocoda destino do cliente
    const dest = await fetch(
      `${GATEWAY}/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=br`,
      { headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "X-Connection-Api-Key": GMAPS_KEY } },
    );
    if (!dest.ok) {
      const body = await dest.text();
      return new Response(JSON.stringify({ error: "Falha ao geocodificar endereço", details: body }), {
        status: dest.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const dj = await dest.json();
    const dloc = dj?.results?.[0]?.geometry?.location;
    if (!dloc) throw new Error("Endereço do cliente não encontrado");

    // 3) Distância via Routes API (computeRoutes)
    const routes = await fetch(`${GATEWAY}/routes/directions/v2:computeRoutes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GMAPS_KEY,
        "Content-Type": "application/json",
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: originLat, longitude: originLng } } },
        destination: { location: { latLng: { latitude: dloc.lat, longitude: dloc.lng } } },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
      }),
    });
    if (!routes.ok) {
      const body = await routes.text();
      return new Response(JSON.stringify({ error: "Falha ao calcular rota", details: body }), {
        status: routes.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const rj = await routes.json();
    const meters = rj?.routes?.[0]?.distanceMeters;
    if (!meters) throw new Error("Rota não encontrada");
    const km = Number(meters) / 1000;

    const { tier, index } = pickTier(tiers, km);
    if (!tier) {
      return new Response(JSON.stringify({
        distance_km: Number(km.toFixed(2)),
        fee: 0, tier_index: -1, tier_label: null, no_delivery: true,
        error: "Fora da área de entrega",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (tier.no_delivery) {
      return new Response(JSON.stringify({
        distance_km: Number(km.toFixed(2)),
        fee: 0, tier_index: index, tier_label: `Até ${tier.max_km} km`, no_delivery: true,
        error: "Não entregamos nesta distância",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      distance_km: Number(km.toFixed(2)),
      fee: Number(tier.price),
      tier_index: index,
      tier_label: `Até ${tier.max_km} km`,
      eta: tier.eta ?? null,
      no_delivery: false,
      formatted_address: dj?.results?.[0]?.formatted_address ?? null,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("calc-delivery-fee error", err);
    return new Response(JSON.stringify({ error: (err as Error).message ?? "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
