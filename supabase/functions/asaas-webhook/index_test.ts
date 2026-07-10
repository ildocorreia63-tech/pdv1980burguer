// Tests for asaas-webhook: token validation, unsupported events, order updates.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const TOKEN = "test-token-123";
Deno.env.set("ASAAS_WEBHOOK_TOKEN", TOKEN);
Deno.env.set("SUPABASE_URL", "http://localhost");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "svc");
(globalThis as { __ASAAS_WEBHOOK_TEST__?: boolean }).__ASAAS_WEBHOOK_TEST__ = true;

const { makeHandler } = await import("./index.ts");

type Order = {
  id: string;
  asaas_payment_id: string;
  status: string;
  payment_confirmed_at: string | null;
};

const state: { orders: Order[]; updates: Array<Record<string, unknown>> } = {
  orders: [],
  updates: [],
};

function seed(orders: Order[] = []) {
  state.orders = orders.map((o) => ({ ...o }));
  state.updates = [];
}

function fakeClient() {
  return {
    from(_table: string) {
      let filterCol = "";
      let filterVal: unknown = null;
      const api = {
        select() { return api; },
        eq(col: string, val: unknown) { filterCol = col; filterVal = val; return api; },
        async maybeSingle() {
          const row = state.orders.find((o) => (o as Record<string, unknown>)[filterCol] === filterVal) ?? null;
          return { data: row, error: null };
        },
        update(patch: Record<string, unknown>) {
          return {
            async eq(col: string, val: unknown) {
              const row = state.orders.find((o) => (o as Record<string, unknown>)[col] === val);
              if (row) Object.assign(row, patch);
              state.updates.push({ col, val, patch });
              return { data: null, error: null };
            },
          };
        },
      };
      return api;
    },
  };
}

const handler = makeHandler(fakeClient);

function post(body: unknown, opts: { token?: string; query?: boolean } = {}) {
  const url = new URL("http://localhost/asaas-webhook");
  if (opts.query && opts.token) url.searchParams.set("token", opts.token);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.token && !opts.query) headers["asaas-access-token"] = opts.token;
  return handler(new Request(url, { method: "POST", headers, body: JSON.stringify(body) }));
}

Deno.test("rejects missing token", async () => {
  const res = await post({ event: "PAYMENT_RECEIVED", payment: { id: "p1" } });
  assertEquals(res.status, 401);
  await res.text();
});

Deno.test("rejects invalid token", async () => {
  const res = await post({ event: "PAYMENT_RECEIVED", payment: { id: "p1" } }, { token: "wrong" });
  assertEquals(res.status, 401);
  await res.text();
});

Deno.test("accepts token via query param", async () => {
  seed();
  const res = await post({ event: "PAYMENT_RECEIVED", payment: { id: "none" } }, { token: TOKEN, query: true });
  assertEquals(res.status, 200);
  await res.text();
});

Deno.test("handles OPTIONS preflight", async () => {
  const res = await handler(new Request("http://localhost/asaas-webhook", { method: "OPTIONS" }));
  assertEquals(res.status, 200);
  await res.text();
});

Deno.test("ignores payload without payment.id", async () => {
  seed();
  const res = await post({ event: "PAYMENT_RECEIVED" }, { token: TOKEN });
  assertEquals(res.status, 200);
  assertEquals(state.updates.length, 0);
  await res.text();
});

Deno.test("ignores unsupported event (PAYMENT_CREATED)", async () => {
  seed([{ id: "o1", asaas_payment_id: "pay_1", status: "pending_payment", payment_confirmed_at: null }]);
  const res = await post({ event: "PAYMENT_CREATED", payment: { id: "pay_1" } }, { token: TOKEN });
  assertEquals(res.status, 200);
  assertEquals(state.updates.length, 0);
  assertEquals(state.orders[0].payment_confirmed_at, null);
  await res.text();
});

Deno.test("PAYMENT_RECEIVED updates pending_payment -> pending + confirms", async () => {
  seed([{ id: "o1", asaas_payment_id: "pay_1", status: "pending_payment", payment_confirmed_at: null }]);
  const res = await post({ event: "PAYMENT_RECEIVED", payment: { id: "pay_1" } }, { token: TOKEN });
  assertEquals(res.status, 200);
  assertEquals(state.orders[0].status, "pending");
  assertEquals(typeof state.orders[0].payment_confirmed_at, "string");
  await res.text();
});

Deno.test("PAYMENT_CONFIRMED preserves non-pending_payment status", async () => {
  seed([{ id: "o2", asaas_payment_id: "pay_2", status: "accepted", payment_confirmed_at: null }]);
  const res = await post({ event: "PAYMENT_CONFIRMED", payment: { id: "pay_2" } }, { token: TOKEN });
  assertEquals(res.status, 200);
  assertEquals(state.orders[0].status, "accepted");
  assertEquals(typeof state.orders[0].payment_confirmed_at, "string");
  await res.text();
});

Deno.test("does not re-confirm already confirmed order", async () => {
  const prev = "2024-01-01T00:00:00.000Z";
  seed([{ id: "o3", asaas_payment_id: "pay_3", status: "pending", payment_confirmed_at: prev }]);
  const res = await post({ event: "PAYMENT_RECEIVED", payment: { id: "pay_3" } }, { token: TOKEN });
  assertEquals(res.status, 200);
  assertEquals(state.updates.length, 0);
  assertEquals(state.orders[0].payment_confirmed_at, prev);
  await res.text();
});

Deno.test("no matching order is a no-op", async () => {
  seed([{ id: "o4", asaas_payment_id: "other", status: "pending_payment", payment_confirmed_at: null }]);
  const res = await post({ event: "PAYMENT_RECEIVED", payment: { id: "missing" } }, { token: TOKEN });
  assertEquals(res.status, 200);
  assertEquals(state.updates.length, 0);
  await res.text();
});
