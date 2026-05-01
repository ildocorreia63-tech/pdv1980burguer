// Polls Asaas to check if a payment was confirmed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { order_id } = await req.json();
    const apiKey = Deno.env.get("ASAAS_API_KEY")!;
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: order } = await supabase.from("online_orders").select("*").eq("id", order_id).single();
    if (!order?.asaas_payment_id) return json({ paid: false });

    if (order.payment_confirmed_at) return json({ paid: true });

    const r = await fetch(`https://api.asaas.com/v3/payments/${order.asaas_payment_id}`, {
      headers: { "access_token": apiKey },
    });
    const p = await r.json();
    const paid = ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(p.status);
    if (paid && !order.payment_confirmed_at) {
      await supabase.from("online_orders").update({
        payment_confirmed_at: new Date().toISOString(),
        status: "pending",
      }).eq("id", order_id);
    }
    return json({ paid, status: p.status });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
