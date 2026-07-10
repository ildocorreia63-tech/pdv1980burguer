// Creates a CREDIT_CARD or DEBIT_CARD charge in Asaas and returns the hosted invoiceUrl.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ASAAS_BASE = "https://api.asaas.com/v3";

function newTraceId() {
  return `card_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function log(trace_id: string, stage: string, message: string, data?: unknown) {
  try { console.log(JSON.stringify({ fn: "asaas-create-card", trace_id, stage, message, data })); }
  catch { console.log("asaas-create-card", trace_id, stage, message); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let trace_id = newTraceId();
  let stage = "parse_body";
  try {
    const body = await req.json().catch(() => ({}));
    const order_id = body?.order_id;
    const kind: "credit" | "debit" = body?.kind === "debit" ? "debit" : "credit";
    if (typeof body?.trace_id === "string" && body.trace_id) trace_id = body.trace_id;
    log(trace_id, stage, "Body recebido", { order_id, kind });

    if (!order_id || typeof order_id !== "string") {
      return json({ error: "order_id obrigatório", trace_id }, 400);
    }

    stage = "check_secret";
    const apiKey = Deno.env.get("ASAAS_API_KEY");
    if (!apiKey) return json({ error: "ASAAS_API_KEY não configurada", trace_id }, 500);

    stage = "load_order";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: order, error } = await supabase
      .from("online_orders").select("*").eq("id", order_id).single();
    if (error || !order) return json({ error: "Pedido não encontrado", trace_id }, 404);

    stage = "eligibility";
    const ageMin = (Date.now() - new Date(order.created_at).getTime()) / 60000;
    const allowedStatus = order.status === "pending" || order.status === "pending_payment";
    const allowedMethod = order.payment_method === "credit" || order.payment_method === "debit";
    if (!allowedStatus || !allowedMethod || order.payment_confirmed_at || order.sale_id || ageMin > 30) {
      if (order.asaas_payment_id && order.asaas_invoice_url) {
        return json({ payment_id: order.asaas_payment_id, invoice_url: order.asaas_invoice_url, trace_id });
      }
      return json({ error: "Pedido não elegível para cobrança em cartão", trace_id }, 403);
    }

    if (order.asaas_payment_id && order.asaas_invoice_url) {
      return json({ payment_id: order.asaas_payment_id, invoice_url: order.asaas_invoice_url, trace_id });
    }

    stage = "create_customer";
    const customerRes = await fetch(`${ASAAS_BASE}/customers`, {
      method: "POST",
      headers: { "access_token": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: order.customer_name,
        mobilePhone: (order.customer_phone || "").replace(/\D/g, ""),
        cpfCnpj: "00000000000",
      }),
    });
    const customer = await customerRes.json();
    if (!customerRes.ok) {
      log(trace_id, stage, "Falha ao criar cliente", { status: customerRes.status, body: customer });
      return json({ error: customer?.errors?.[0]?.description || "Erro ao criar cliente Asaas", trace_id }, 502);
    }

    stage = "create_payment";
    const billingType = kind === "debit" ? "DEBIT_CARD" : "CREDIT_CARD";
    const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const paymentRes = await fetch(`${ASAAS_BASE}/payments`, {
      method: "POST",
      headers: { "access_token": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        customer: customer.id,
        billingType,
        value: Number(order.total),
        dueDate,
        description: `Pedido #${order.order_number}`,
        externalReference: order.id,
      }),
    });
    const payment = await paymentRes.json();
    if (!paymentRes.ok) {
      log(trace_id, stage, "Falha ao criar cobrança cartão", { status: paymentRes.status, body: payment });
      return json({ error: payment?.errors?.[0]?.description || "Erro ao criar cobrança em cartão", trace_id }, 502);
    }
    log(trace_id, stage, "Cobrança criada", { payment_id: payment.id, invoice_url: payment.invoiceUrl });

    stage = "update_order";
    await supabase.from("online_orders").update({
      status: "pending_payment",
      asaas_payment_id: payment.id,
      asaas_invoice_url: payment.invoiceUrl,
    }).eq("id", order.id);

    return json({ payment_id: payment.id, invoice_url: payment.invoiceUrl, trace_id });
  } catch (e) {
    log(trace_id, `${stage}:catch`, (e as Error).message);
    return json({ error: (e as Error).message, trace_id, stage }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
