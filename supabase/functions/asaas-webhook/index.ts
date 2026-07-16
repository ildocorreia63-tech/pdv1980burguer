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

function log(stage: string, message: string, data?: unknown) {
  try { console.log(JSON.stringify({ fn: "asaas-webhook", stage, message, data })); }
  catch { console.log("asaas-webhook", stage, message); }
}

const PAID_EVENTS = new Set([
  "PAYMENT_RECEIVED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED_IN_CASH",
]);
const FAILED_EVENTS = new Set([
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
  "PAYMENT_REFUNDED",
  "PAYMENT_REFUND_IN_PROGRESS",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
  "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
  "PAYMENT_DUNNING_REQUESTED",
  "PAYMENT_DUNNING_RECEIVED",
]);

export function makeHandler(clientFactory: ClientFactory = defaultFactory) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    try {
      const expectedToken = Deno.env.get("ASAAS_WEBHOOK_TOKEN");
      const got = req.headers.get("asaas-access-token") || new URL(req.url).searchParams.get("token");
      if (!expectedToken || got !== expectedToken) {
        log("auth", "Token inválido ou ausente");
        return new Response("unauthorized", { status: 401, headers: corsHeaders });
      }

      const body = await req.json();
      const event = body.event as string;
      const payment = body.payment;
      log("received", "Evento recebido", { event, payment_id: payment?.id, status: payment?.status });

      if (!payment?.id) return json({ ok: true });

      const supabase = clientFactory();

      const { data: order } = await supabase
        .from("online_orders")
        .select("*")
        .eq("asaas_payment_id", payment.id)
        .maybeSingle();

      if (!order) {
        log("lookup", "Pedido não encontrado para esse asaas_payment_id", { payment_id: payment.id });
        return json({ ok: true, matched: false });
      }

      if (PAID_EVENTS.has(event)) {
        if (order.payment_confirmed_at) {
          log("paid", "Pagamento já confirmado — ignorando", { order_id: order.id });
        } else {
          const upd = await supabase.from("online_orders").update({
            payment_confirmed_at: new Date().toISOString(),
            status: order.status === "pending_payment" ? "pending" : order.status,
          }).eq("id", order.id);
          if (upd.error) log("paid:update", "Falha ao atualizar pedido", { message: upd.error.message });
          else log("paid:update", "Pedido marcado como pago", { order_id: order.id });
        }
      } else if (FAILED_EVENTS.has(event)) {
        // Only mark as rejected if the order hasn't advanced (still awaiting payment and not yet turned into a sale)
        if (!order.sale_id && !order.accepted_at && order.status === "pending_payment") {
          const upd = await supabase.from("online_orders").update({
            status: "rejected",
            cancelled_at: new Date().toISOString(),
            cancellation_reason: `Asaas: ${event}`,
          }).eq("id", order.id);
          if (upd.error) log("failed:update", "Falha ao atualizar pedido", { message: upd.error.message });
          else log("failed:update", "Pedido marcado como rejeitado", { order_id: order.id, event });
        } else {
          log("failed:skip", "Pedido já avançou — mantendo status atual", { order_id: order.id, status: order.status });
        }
      } else {
        log("ignored", "Evento não tratado", { event });
      }

      return json({ ok: true, matched: true });
    } catch (e) {
      log("catch", (e as Error).message, { stack: (e as Error).stack });
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
