// Polls Asaas to check if a payment was confirmed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ASAAS_BASE = "https://api-sandbox.asaas.com/v3";

function newTraceId() {
  return `chk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function log(trace_id: string, stage: string, message: string, data?: unknown) {
  try { console.log(JSON.stringify({ fn: "asaas-check-payment", trace_id, stage, message, data })); }
  catch { console.log("asaas-check-payment", trace_id, stage, message); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  let trace_id = newTraceId();
  let stage = "parse_body";
  try {
    const body = await req.json().catch(() => ({}));
    const order_id = body?.order_id;
    if (typeof body?.trace_id === "string" && body.trace_id) trace_id = body.trace_id;
    log(trace_id, stage, "Body recebido", { order_id });

    const apiKey = Deno.env.get("ASAAS_API_KEY");
    if (!apiKey) {
      log(trace_id, "check_secret", "ASAAS_API_KEY ausente");
      return json({ error: "ASAAS_API_KEY não configurada", trace_id }, 500);
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    stage = "load_order";
    const { data: order, error } = await supabase.from("online_orders").select("*").eq("id", order_id).single();
    if (error || !order) {
      log(trace_id, stage, "Pedido não encontrado", { error: error?.message });
      return json({ paid: false, trace_id, error: "Pedido não encontrado" });
    }
    if (!order.asaas_payment_id) {
      log(trace_id, stage, "Sem asaas_payment_id");
      return json({ paid: false, trace_id, reason: "no_charge" });
    }
    if (order.payment_confirmed_at) {
      log(trace_id, stage, "Já estava confirmado no banco");
      return json({ paid: true, trace_id, source: "db" });
    }

    stage = "fetch_asaas";
    const r = await fetch(`${ASAAS_BASE}/payments/${order.asaas_payment_id}`, {
      headers: { "access_token": apiKey },
    });
    const p = await r.json();
    if (!r.ok) {
      log(trace_id, stage, "Falha ao consultar Asaas", { status: r.status, body: p });
      return json({ paid: false, trace_id, error: p?.errors?.[0]?.description || "Erro ao consultar Asaas" }, 502);
    }
    const paid = ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(p.status);
    log(trace_id, stage, "Status Asaas", { status: p.status, paid });

    if (paid && !order.payment_confirmed_at) {
      stage = "update_order";
      // Só avança para "pending" quando estava aguardando pagamento.
      // Se cozinha já aceitou/faturou/cancelou, preservamos o status atual
      // e apenas marcamos a data de confirmação.
      const nextStatus = order.status === "pending_payment" ? "pending" : order.status;
      const upd = await supabase.from("online_orders").update({
        payment_confirmed_at: new Date().toISOString(),
        status: nextStatus,
      }).eq("id", order_id);
      if (upd.error) log(trace_id, stage, "Falha ao atualizar pedido", { message: upd.error.message });
      else log(trace_id, stage, "Pedido marcado como pago", { nextStatus });
    }
    return json({ paid, status: p.status, trace_id });
  } catch (e) {
    log(trace_id, `${stage}:catch`, (e as Error).message, { stack: (e as Error).stack });
    return json({ error: (e as Error).message, trace_id, stage }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
