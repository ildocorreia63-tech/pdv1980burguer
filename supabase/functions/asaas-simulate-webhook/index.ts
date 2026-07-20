// Admin-only: simulate an Asaas webhook event against a real order to validate state transitions.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_EVENTS = new Set([
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_RECEIVED_IN_CASH",
  "PAYMENT_REFUNDED",
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "missing auth" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userRes, error: userErr } = await authClient.auth.getUser();
    if (userErr || !userRes.user) return json({ error: "invalid session" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: userRes.user.id });
    if (!isAdmin) return json({ error: "forbidden — admins only" }, 403);

    const body = await req.json().catch(() => ({}));
    const orderId = String(body.order_id ?? "");
    const event = String(body.event ?? "");
    if (!orderId || !ALLOWED_EVENTS.has(event)) {
      return json({ error: "order_id e event válidos são obrigatórios", allowed: [...ALLOWED_EVENTS] }, 400);
    }

    const { data: order, error: oErr } = await admin
      .from("online_orders")
      .select("id, order_number, status, asaas_payment_id")
      .eq("id", orderId)
      .maybeSingle();
    if (oErr || !order) return json({ error: "pedido não encontrado" }, 404);

    const paymentId = order.asaas_payment_id ?? `sim_${order.id}`;

    // If simulating an order that never went through Asaas, temporarily set a payment id so the webhook can match it.
    let injected = false;
    if (!order.asaas_payment_id) {
      const { error: upd } = await admin
        .from("online_orders")
        .update({ asaas_payment_id: paymentId })
        .eq("id", order.id);
      if (upd) return json({ error: "não foi possível preparar simulação: " + upd.message }, 500);
      injected = true;
    }

    const token = Deno.env.get("ASAAS_WEBHOOK_TOKEN");
    if (!token) return json({ error: "ASAAS_WEBHOOK_TOKEN não configurado" }, 500);

    const webhookUrl = `${supabaseUrl}/functions/v1/asaas-webhook?token=${encodeURIComponent(token)}`;
    const payload = {
      event,
      payment: { id: paymentId, status: event, value: 0 },
    };

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "asaas-access-token": token },
      body: JSON.stringify(payload),
    });
    const webhookText = await res.text();

    const { data: after } = await admin
      .from("online_orders")
      .select("id, order_number, status, payment_confirmed_at, cancelled_at, cancellation_reason")
      .eq("id", orderId)
      .maybeSingle();

    return json({
      ok: true,
      simulated_event: event,
      webhook_status: res.status,
      webhook_response: webhookText,
      injected_payment_id: injected ? paymentId : null,
      order_before: {
        status: order.status,
      },
      order_after: after,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
