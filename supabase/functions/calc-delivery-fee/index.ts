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

// Distância em linha reta (Haversine) usada como fallback quando a Routes API
// não encontra rota dirigível (endereços novos, vias sem mapeamento, etc.).
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
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
      .select("id, delivery_mode, store_address, store_lat, store_lng, delivery_km_tiers")
      .maybeSingle();
    if (sErr) throw sErr;
    if (!settings) throw new Error("Configurações da loja não encontradas");
    if (settings.delivery_mode !== "km") throw new Error("Modo de entrega não está em KM");
    const tiers = (settings.delivery_km_tiers ?? []) as Tier[];
    if (!Array.isArray(tiers) || tiers.length === 0) throw new Error("Nenhuma faixa de KM configurada");

    // 1) Origem: usa lat/lng cacheados; senão geocoda o endereço da loja e persiste.
    let originLat = settings.store_lat != null ? Number(settings.store_lat) : null;
    let originLng = settings.store_lng != null ? Number(settings.store_lng) : null;
    if (originLat == null || originLng == null || Number.isNaN(originLat) || Number.isNaN(originLng)) {
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
      if (settings.id) {
        await supabase.from("store_settings")
          .update({ store_lat: originLat, store_lng: originLng })
          .eq("id", settings.id);
      }
    }

    // 2) Geocoda destino do cliente
    const dest = await fetch(
      `${GATEWAY}/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=br`,
      { headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "X-Connection-Api-Key": GMAPS_KEY } },
    );
    if (!dest.ok) {
      const body = await dest.text();
      console.error("geocode falhou", dest.status, body);
      return new Response(JSON.stringify({ error: "Falha ao geocodificar endereço", details: body }), {
        status: dest.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const dj = await dest.json();
    const dloc = dj?.results?.[0]?.geometry?.location;
    if (!dloc) {
      return new Response(JSON.stringify({
        error: "Endereço não encontrado. Informe rua, número, bairro e cidade.",
      }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const destLat = Number(dloc.lat);
    const destLng = Number(dloc.lng);

    // 3) Distância via Routes API (computeRoutes); fallback em linha reta.
    let km: number | null = null;
    let approx = false;
    try {
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
          destination: { location: { latLng: { latitude: destLat, longitude: destLng } } },
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_UNAWARE",
        }),
      });
      const rjText = await routes.text();
      if (!routes.ok) {
        console.error("computeRoutes falhou", routes.status, rjText);
      } else {
        const rj = JSON.parse(rjText || "{}");
        const meters = rj?.routes?.[0]?.distanceMeters;
        if (meters != null) km = Number(meters) / 1000;
        else console.error("computeRoutes sem rota", rjText);
      }
    } catch (routeErr) {
      console.error("computeRoutes erro", routeErr);
    }

    if (km == null) {
      // Fallback: linha reta * 1.3 (fator médio de malha viária urbana).
      km = haversineKm(originLat!, originLng!, destLat, destLng) * 1.3;
      approx = true;
    }


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
