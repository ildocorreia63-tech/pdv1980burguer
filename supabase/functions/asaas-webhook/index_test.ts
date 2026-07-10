// Tests for asaas-webhook: token validation, unsupported events, order update.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const TOKEN = "test-token-123";

// ---- In-memory fake for Supabase client ----
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

function resetState(seed: Order[] = []) {
  state.orders = seed.map((o) => ({ ...o }));
  state.updates = [];
}

function fakeClient() {
  return {
    from(_table: string) {
      let filterCol = ""; let filterVal: unknown = null;
      const api = {
        select() { return api; },
        eq(col: string, val: unknown) { filterCol = col; filterVal = val; return api; },
        async maybeSingle() {
          const row = state.orders.find((o) => (o as any)[filterCol] === filterVal) ?? null;
          return { data: row, error: null };
        },
        update(patch: Record<string, unknown>) {
          return {
            async eq(col: string, val: unknown) {
              const row = state.orders.find((o) => (o as any)[col] === val);
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

// ---- Stub deps before import ----
Deno.env.set("ASAAS_WEBHOOK_TOKEN", TOKEN);
Deno.env.set("SUPABASE_URL", "http://localhost");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "svc");

// Intercept the esm.sh import via import map isn't available here; instead we
// monkey-patch by loading the module fresh with a mocked fetch to esm.sh is
// too heavy. Simpler: import the module and stub createClient at runtime by
// replacing globalThis before first request. The module reads createClient at
// call time, so we shadow the esm.sh module by writing a local shim import.

// Dynamically import the handler through Deno.serve capture:
let handler: (req: Request) => Promise<Response>;
const origServe = Deno.serve;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (h: any) => { handler = h; return { finished: Promise.resolve() } as any; };

// Patch createClient by intercepting the module. We use import maps via a
// dynamic module that re-exports our fake:
const shimUrl = "data:application/typescript," + encodeURIComponent(
  `export const createClient = () => (globalThis as any).__fakeSupabase();`
);
// Rewrite module cache: replace esm.sh URL via import map is not trivial; use
// a network intercept via Deno.serve is out of scope. Instead we expose the
// fake and patch the import through a global before importing:
(globalThis as any).__fakeSupabase = fakeClient;

// Replace fetch to esm.sh with our shim
const origFetch = globalThis.fetch;
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input.toString();
  if (url.includes("esm.sh/@supabase/supabase-js")) {
    return Promise.resolve(new Response(
      `export const createClient = () => (globalThis).__fakeSupabase();`,
      { headers: { "content-type": "application/typescript" } },
    ));
  }
  return origFetch(input as any, init);
}) as typeof fetch;

await import("./index.ts");
(Deno as any).serve = origServe;

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
  resetState();
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
  resetState();
  const res = await post({ event: "PAYMENT_RECEIVED" }, { token: TOKEN });
  assertEquals(res.status, 200);
  assertEquals(state.updates.length, 0);
  await res.text();
});

Deno.test("ignores unsupported event (PAYMENT_CREATED)", async () => {
  resetState([{ id: "o1", asaas_payment_id: "pay_1", status: "pending_payment", payment_confirmed_at: null }]);
  const res = await post({ event: "PAYMENT_CREATED", payment: { id: "pay_1" } }, { token: TOKEN });
  assertEquals(res.status, 200);
  assertEquals(state.updates.length, 0);
  assertEquals(state.orders[0].payment_confirmed_at, null);
  await res.text();
});

Deno.test("PAYMENT_RECEIVED updates order to pending + confirms", async () => {
  resetState([{ id: "o1", asaas_payment_id: "pay_1", status: "pending_payment", payment_confirmed_at: null }]);
  const res = await post({ event: "PAYMENT_RECEIVED", payment: { id: "pay_1" } }, { token: TOKEN });
  assertEquals(res.status, 200);
  assertEquals(state.orders[0].status, "pending");
  assertEquals(typeof state.orders[0].payment_confirmed_at, "string");
  await res.text();
});

Deno.test("PAYMENT_CONFIRMED preserves non-pending_payment status", async () => {
  resetState([{ id: "o2", asaas_payment_id: "pay_2", status: "accepted", payment_confirmed_at: null }]);
  const res = await post({ event: "PAYMENT_CONFIRMED", payment: { id: "pay_2" } }, { token: TOKEN });
  assertEquals(res.status, 200);
  assertEquals(state.orders[0].status, "accepted");
  assertEquals(typeof state.orders[0].payment_confirmed_at, "string");
  await res.text();
});

Deno.test("does not re-confirm already confirmed order", async () => {
  const prev = "2024-01-01T00:00:00.000Z";
  resetState([{ id: "o3", asaas_payment_id: "pay_3", status: "pending", payment_confirmed_at: prev }]);
  const res = await post({ event: "PAYMENT_RECEIVED", payment: { id: "pay_3" } }, { token: TOKEN });
  assertEquals(res.status, 200);
  assertEquals(state.updates.length, 0);
  assertEquals(state.orders[0].payment_confirmed_at, prev);
  await res.text();
});

Deno.test("no matching order is a no-op", async () => {
  resetState([{ id: "o4", asaas_payment_id: "other", status: "pending_payment", payment_confirmed_at: null }]);
  const res = await post({ event: "PAYMENT_RECEIVED", payment: { id: "missing" } }, { token: TOKEN });
  assertEquals(res.status, 200);
  assertEquals(state.updates.length, 0);
  await res.text();
});
