// Creates a PIX charge in Asaas for an existing online_order and returns QR data.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ASAAS_BASE = "https://api.asaas.com/v3";

function newTraceId() {
  return `pix_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function log(trace_id: string, stage: string, message: string, data?: unknown) {
  try {
    console.log(JSON.stringify({ fn: "asaas-create-pix", trace_id, stage, message, data }));
  } catch {
    console.log("asaas-create-pix", trace_id, stage, message);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let trace_id = newTraceId();
  let stage = "parse_body";
  try {
    const body = await req.json().catch(() => ({}));
    const order_id = body?.order_id;
    if (typeof body?.trace_id === "string" && body.trace_id) trace_id = body.trace_id;
    log(trace_id, stage, "Body recebido", { order_id, has_client_trace: !!body?.trace_id });

    if (!order_id || typeof order_id !== "string") {
      log(trace_id, stage, "order_id ausente/ inválido", null);
      return json({ error: "order_id obrigatório", trace_id }, 400);
    }

    stage = "check_secret";
    const apiKey = Deno.env.get("ASAAS_API_KEY");
    if (!apiKey) {
      log(trace_id, stage, "ASAAS_API_KEY não configurada");
      return json({ error: "ASAAS_API_KEY não configurada", trace_id }, 500);
    }

    stage = "load_order";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: order, error } = await supabase
      .from("online_orders")
      .select("*")
      .eq("id", order_id)
      .single();
    if (error || !order) {
      log(trace_id, stage, "Pedido não encontrado", { error: error?.message });
      return json({ error: "Pedido não encontrado", trace_id }, 404);
    }
    log(trace_id, stage, "Pedido carregado", { status: order.status, payment_method: order.payment_method, total: order.total, has_charge: !!order.asaas_payment_id });

    stage = "eligibility";
    const createdMs = new Date(order.created_at).getTime();
    const ageMin = (Date.now() - createdMs) / 60000;
    const allowedStatus = order.status === "pending" || order.status === "pending_payment";
    if (
      !allowedStatus ||
      order.payment_method !== "pix" ||
      order.payment_confirmed_at ||
      order.sale_id ||
      ageMin > 15
    ) {
      if (order.asaas_payment_id && order.asaas_invoice_url) {
        // fall through to QR refetch
      } else {
        log(trace_id, stage, "Pedido não elegível", { allowedStatus, payment_method: order.payment_method, payment_confirmed_at: order.payment_confirmed_at, sale_id: order.sale_id, ageMin });
        return json({ error: "Pedido não elegível para cobrança PIX", trace_id }, 403);
      }
    }

    if (order.asaas_payment_id && order.asaas_invoice_url) {
      stage = "refetch_qr";
      log(trace_id, stage, "Cobrança já existe — recarregando QR", { payment_id: order.asaas_payment_id });
      const qr = await fetchPixQr(order.asaas_payment_id, apiKey);
      return json({
        payment_id: order.asaas_payment_id,
        invoice_url: order.asaas_invoice_url,
        qr_code: qr.encodedImage,
        payload: qr.payload,
        expiration_date: qr.expirationDate,
        trace_id,
      });
    }

    stage = "create_customer";
    const cpfCnpj = String(body?.cpf ?? "").replace(/\D/g, "");
    if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14) {
      log(trace_id, stage, "CPF/CNPJ ausente ou inválido", { len: cpfCnpj.length });
      return json({ error: "CPF do cliente é obrigatório para gerar a cobrança PIX", trace_id }, 400);
    }

    log(trace_id, stage, "Criando cliente Asaas", { name: order.customer_name });
    const customerRes = await fetch(`${ASAAS_BASE}/customers`, {
      method: "POST",
      headers: { "access_token": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: order.customer_name,
        mobilePhone: (order.customer_phone || "").replace(/\D/g, ""),
        cpfCnpj,
      }),
    });
    const customer = await customerRes.json();
    if (!customerRes.ok) {
      log(trace_id, stage, "Falha ao criar cliente Asaas", { status: customerRes.status, body: customer });
      return json({ error: customer?.errors?.[0]?.description || "Erro ao criar cliente Asaas", trace_id }, 502);
    }
    log(trace_id, stage, "Cliente criado", { customer_id: customer.id });

    stage = "create_payment";
    const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    log(trace_id, stage, "Criando cobrança PIX", { value: Number(order.total), dueDate });
    const paymentRes = await fetch(`${ASAAS_BASE}/payments`, {
      method: "POST",
      headers: { "access_token": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        customer: customer.id,
        billingType: "PIX",
        value: Number(order.total),
        dueDate,
        description: `Pedido #${order.order_number}`,
        externalReference: order.id,
      }),
    });
    const payment = await paymentRes.json();
    if (!paymentRes.ok) {
      log(trace_id, stage, "Falha ao criar cobrança PIX", { status: paymentRes.status, body: payment });
      return json({ error: payment?.errors?.[0]?.description || "Erro ao criar cobrança PIX", trace_id }, 502);
    }
    log(trace_id, stage, "Cobrança criada", { payment_id: payment.id, invoice_url: payment.invoiceUrl });

    stage = "fetch_qr";
    const qr = await fetchPixQr(payment.id, apiKey);
    log(trace_id, stage, "QR obtido", { has_payload: !!qr.payload, has_image: !!qr.encodedImage });

    stage = "update_order";
    const upd = await supabase.from("online_orders").update({
      status: "pending_payment",
      asaas_payment_id: payment.id,
      asaas_invoice_url: payment.invoiceUrl,
    }).eq("id", order.id);
    if (upd.error) log(trace_id, stage, "Falha ao atualizar pedido com dados do PIX", { message: upd.error.message });
    else log(trace_id, stage, "Pedido atualizado");

    return json({
      payment_id: payment.id,
      invoice_url: payment.invoiceUrl,
      qr_code: qr.encodedImage,
      payload: qr.payload,
      expiration_date: qr.expirationDate,
      trace_id,
    });
  } catch (e) {
    log(trace_id, `${stage}:catch`, (e as Error).message, { stack: (e as Error).stack });
    return json({ error: (e as Error).message, trace_id, stage }, 500);
  }
});

async function fetchPixQr(paymentId: string, apiKey: string) {
  const r = await fetch(`${ASAAS_BASE}/payments/${paymentId}/pixQrCode`, {
    headers: { "access_token": apiKey },
  });
  return await r.json();
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
