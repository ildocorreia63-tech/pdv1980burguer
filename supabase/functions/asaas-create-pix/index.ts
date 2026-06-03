// Creates a PIX charge in Asaas for an existing online_order and returns QR data.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ASAAS_BASE = "https://api.asaas.com/v3";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { order_id } = await req.json();
    if (!order_id || typeof order_id !== "string") {
      return json({ error: "order_id obrigatório" }, 400);
    }

    const apiKey = Deno.env.get("ASAAS_API_KEY");
    if (!apiKey) return json({ error: "ASAAS_API_KEY não configurada" }, 500);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: order, error } = await supabase
      .from("online_orders")
      .select("*")
      .eq("id", order_id)
      .single();
    if (error || !order) return json({ error: "Pedido não encontrado" }, 404);

    // Only allow PIX charge creation for fresh, pending orders that opted into PIX
    // and don't already have a charge. Prevents anonymous abuse via guessed order IDs.
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
        // fall through to QR refetch below
      } else {
        return json({ error: "Pedido não elegível para cobrança PIX" }, 403);
      }
    }

    if (order.asaas_payment_id && order.asaas_invoice_url) {
      // Already created — re-fetch QR
      const qr = await fetchPixQr(order.asaas_payment_id, apiKey);
      return json({
        payment_id: order.asaas_payment_id,
        invoice_url: order.asaas_invoice_url,
        qr_code: qr.encodedImage,
        payload: qr.payload,
        expiration_date: qr.expirationDate,
      });
    }

    // 1) Get-or-create customer in Asaas
    const cpfCnpj = "00000000000"; // placeholder — Asaas accepts test value; real CPF not required for PIX
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
      console.error("Asaas customer error", customer);
      return json({ error: customer?.errors?.[0]?.description || "Erro ao criar cliente Asaas" }, 502);
    }

    // 2) Create PIX payment
    const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
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
      console.error("Asaas payment error", payment);
      return json({ error: payment?.errors?.[0]?.description || "Erro ao criar cobrança PIX" }, 502);
    }

    // 3) Fetch QR
    const qr = await fetchPixQr(payment.id, apiKey);

    await supabase.from("online_orders").update({
      status: "pending_payment",
      asaas_payment_id: payment.id,
      asaas_invoice_url: payment.invoiceUrl,
    }).eq("id", order.id);

    return json({
      payment_id: payment.id,
      invoice_url: payment.invoiceUrl,
      qr_code: qr.encodedImage,
      payload: qr.payload,
      expiration_date: qr.expirationDate,
    });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
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
