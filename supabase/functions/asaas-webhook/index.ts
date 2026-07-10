// Receives Asaas webhook events. Public endpoint — validated via shared token in URL/header.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, asaas-access-token",
};

// deno-lint-ignore no-explicit-any
type ClientFactory = () => any;

const defaultFactory: ClientFactory = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

export function makeHandler(clientFactory: ClientFactory = defaultFactory) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    try {
      const expectedToken = Deno.env.get("ASAAS_WEBHOOK_TOKEN");
      const got = req.headers.get("asaas-access-token") || new URL(req.url).searchParams.get("token");
      if (!expectedToken || got !== expectedToken) {
        console.warn("Asaas webhook rejected: missing or invalid token");
        return new Response("unauthorized", { status: 401, headers: corsHeaders });
      }

      const body = await req.json();
      const event = body.event as string;
      const payment = body.payment;
      if (!payment?.id) return json({ ok: true });

      const supabase = clientFactory();
      const isPaid = ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"].includes(event);

      if (isPaid) {
        const { data: order } = await supabase
          .from("online_orders")
          .select("*")
          .eq("asaas_payment_id", payment.id)
          .maybeSingle();

        if (order && !order.payment_confirmed_at) {
          await supabase.from("online_orders").update({
            payment_confirmed_at: new Date().toISOString(),
            status: order.status === "pending_payment" ? "pending" : order.status,
          }).eq("id", order.id);
        }
      }

      return json({ ok: true });
    } catch (e) {
      console.error(e);
      return json({ error: (e as Error).message }, 500);
    }
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Only auto-serve when running as the deployed function, not during tests.
if (!(globalThis as { __ASAAS_WEBHOOK_TEST__?: boolean }).__ASAAS_WEBHOOK_TEST__) {
  Deno.serve(makeHandler());
}
