// Creates a PIX charge in Asaas for an existing online_order and returns QR data.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";

const ASAAS_BASE = "https://api.asaas.com/v3";
const RequestSchema = z.object({
  order_id: z.string().uuid(),
  trace_id: z.string().trim().min(1).max(120).optional(),
  cpf: z.string().transform((value) => value.replace(/\D/g, "")).refine(
    (value) => value.length === 11 || value.length === 14,
    "CPF/CNPJ inválido",
  ),
});

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
    const rawBody = await req.json().catch(() => ({}));
    if (typeof rawBody?.trace_id === "string" && rawBody.trace_id) trace_id = rawBody.trace_id;
    const parsed = RequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      log(trace_id, stage, "Dados inválidos", { fields: parsed.error.flatten().fieldErrors });
      return json({ error: "Pedido ou CPF inválido", fields: parsed.error.flatten().fieldErrors, trace_id, stage }, 400);
    }
    const { order_id, cpf: cpfCnpj } = parsed.data;
    log(trace_id, stage, "Body recebido", { order_id, has_client_trace: !!parsed.data.trace_id });

    stage = "check_secret";
    const apiKey = Deno.env.get("ASAAS_API_KEY")?.trim();
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
      if (order.asaas_payment_id) {
        // fall through to QR refetch
      } else {
        log(trace_id, stage, "Pedido não elegível", { allowedStatus, payment_method: order.payment_method, payment_confirmed_at: order.payment_confirmed_at, sale_id: order.sale_id, ageMin });
        return json({ error: "Pedido não elegível para cobrança PIX", trace_id }, 403);
      }
    }

    if (order.asaas_payment_id) {
      stage = "refetch_qr";
      log(trace_id, stage, "Cobrança já existe — recarregando QR", { payment_id: order.asaas_payment_id });
      const qr = await fetchPixQr(order.asaas_payment_id, apiKey);
      return json({
        payment_id: order.asaas_payment_id,
        invoice_url: order.asaas_invoice_url ?? null,
        qr_code: qr.encodedImage,
        payload: qr.payload,
        expiration_date: qr.expirationDate,
        trace_id,
      });
    }

    stage = "create_customer";
    log(trace_id, stage, "Criando cliente Asaas", { name: order.customer_name });
    const phoneDigits = String(order.customer_phone ?? "").replace(/\D/g, "");
    if (phoneDigits.length !== 10 && phoneDigits.length !== 11) {
      return json({ error: "Telefone inválido. Informe DDD + número para gerar o PIX.", trace_id, stage }, 400);
    }
    const customer = await asaasRequest(`${ASAAS_BASE}/customers`, apiKey, {
      method: "POST",
      body: JSON.stringify({
        name: order.customer_name,
        mobilePhone: phoneDigits,
        cpfCnpj,
      }),
    });
    log(trace_id, stage, "Cliente criado", { customer_id: customer.id });

    stage = "create_payment";
    const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    log(trace_id, stage, "Criando cobrança PIX", { value: Number(order.total), dueDate });
    const payment = await asaasRequest(`${ASAAS_BASE}/payments`, apiKey, {
      method: "POST",
      body: JSON.stringify({
        customer: customer.id,
        billingType: "PIX",
        value: Number(order.total),
        dueDate,
        description: `Pedido #${order.order_number}`,
        externalReference: order.id,
      }),
    });
    log(trace_id, stage, "Cobrança criada", { payment_id: payment.id, invoice_url: payment.invoiceUrl });

    stage = "update_order";
    const upd = await supabase.from("online_orders").update({
      status: "pending_payment",
      asaas_payment_id: payment.id,
      asaas_invoice_url: payment.invoiceUrl,
    }).eq("id", order.id);
    if (upd.error) log(trace_id, stage, "Falha ao atualizar pedido com dados do PIX", { message: upd.error.message });
    else log(trace_id, stage, "Pedido atualizado");

    stage = "fetch_qr";
    const qr = await fetchPixQr(payment.id, apiKey);
    log(trace_id, stage, "QR obtido", { has_payload: !!qr.payload, has_image: !!qr.encodedImage });

    return json({
      payment_id: payment.id,
      invoice_url: payment.invoiceUrl,
      qr_code: qr.encodedImage,
      payload: qr.payload,
      expiration_date: qr.expirationDate,
      trace_id,
    });
  } catch (e) {
    const error = e as Error & { status?: number; details?: unknown };
    log(trace_id, `${stage}:catch`, error.message, { status: error.status, details: error.details, stack: error.stack });
    const message = error.status === 401
      ? "Chave do Asaas inválida ou ambiente incorreto. Atualize a ASAAS_API_KEY."
      : error.message;
    return json({ error: message, trace_id, stage }, error.status && error.status < 500 ? 400 : 502);
  }
});

async function fetchPixQr(paymentId: string, apiKey: string) {
  const qr = await asaasRequest(`${ASAAS_BASE}/payments/${paymentId}/pixQrCode`, apiKey);
  if (!qr?.encodedImage || !qr?.payload) {
    const error = new Error("O Asaas criou a cobrança, mas não retornou o QR Code PIX.") as Error & { status?: number; details?: unknown };
    error.status = 502;
    error.details = qr;
    throw error;
  }
  return qr;
}

async function asaasRequest(url: string, apiKey: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "access_token": apiKey,
      "Content-Type": "application/json",
      "User-Agent": "PDV-1980-Burguer/1.0",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 500) }; }
  if (!response.ok) {
    const error = new Error(data?.errors?.[0]?.description || data?.error || `Asaas respondeu HTTP ${response.status}`) as Error & { status?: number; details?: unknown };
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
