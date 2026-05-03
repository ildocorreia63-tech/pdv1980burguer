import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, paymentLabels } from "@/lib/format";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  AlertCircle,
  ShoppingCart,
  Receipt,
  Users,
  Package,
  Clock,
  CheckCircle2,
  CreditCard,
  Hourglass,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

type Period = "today" | "7d" | "30d";

const periodLabel: Record<Period, string> = {
  today: "Hoje",
  "7d": "7 dias",
  "30d": "30 dias",
};

export default function Home() {
  const nav = useNavigate();
  const [period, setPeriod] = useState<Period>("today");
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState({
    sales: 0,
    salesCount: 0,
    expenses: 0,
    openCredit: 0,
    creditReceived: 0,
    avgTicket: 0,
  });
  const [chart, setChart] = useState<{ label: string; vendas: number; despesas: number }[]>([]);
  const [topProducts, setTopProducts] = useState<{ name: string; qty: number; total: number }[]>([]);
  const [byMethod, setByMethod] = useState<{ method: string; total: number }[]>([]);
  const [onlineCounts, setOnlineCounts] = useState({
    pending_payment: 0,
    pending: 0,
    accepted: 0,
    completed: 0,
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const now = new Date();
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      if (period === "7d") start.setDate(start.getDate() - 6);
      if (period === "30d") start.setDate(start.getDate() - 29);
      const startIso = start.toISOString();
      const startDate = start.toISOString().slice(0, 10);

      const [
        { data: sales },
        { data: saleItems },
        { data: exps },
        { data: creds },
        { data: creditPays },
        { data: methodPays },
        { data: onlineOrders },
      ] = await Promise.all([
        supabase
          .from("sales")
          .select("id, total, paid_amount, status, created_at")
          .gte("created_at", startIso)
          .neq("status", "cancelled"),
        supabase
          .from("sale_items")
          .select("product_name, quantity, subtotal, sale_id, created_at")
          .gte("created_at", startIso),
        supabase
          .from("expenses")
          .select("amount, expense_date")
          .gte("expense_date", startDate),
        supabase.from("customers").select("credit_balance").gt("credit_balance", 0),
        supabase
          .from("payments")
          .select("amount, paid_at")
          .is("sale_id", null)
          .not("customer_id", "is", null)
          .eq("status", "paid")
          .gte("paid_at", startIso),
        supabase
          .from("payments")
          .select("amount, method, status")
          .eq("status", "paid")
          .not("sale_id", "is", null)
          .gte("paid_at", startIso),
        supabase.from("online_orders").select("status").gte("created_at", startIso),
      ]);

      // KPIs
      const salesPaid = (sales ?? []).reduce((s, r) => s + Number(r.paid_amount), 0);
      const creditReceived = (creditPays ?? []).reduce((s, r) => s + Number(r.amount), 0);
      const expensesTotal = (exps ?? []).reduce((s, r) => s + Number(r.amount), 0);
      const totalRevenue = salesPaid + creditReceived;
      const salesCount = sales?.length ?? 0;

      setStats({
        sales: totalRevenue,
        salesCount,
        expenses: expensesTotal,
        openCredit: (creds ?? []).reduce((s, r) => s + Number(r.credit_balance), 0),
        creditReceived,
        avgTicket: salesCount ? totalRevenue / salesCount : 0,
      });

      // Chart data
      const days = period === "today" ? 1 : period === "7d" ? 7 : 30;
      const buckets: { label: string; key: string; vendas: number; despesas: number }[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - i);
        buckets.push({
          label: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
          key: d.toISOString().slice(0, 10),
          vendas: 0,
          despesas: 0,
        });
      }
      const idxByKey = new Map(buckets.map((b, i) => [b.key, i]));
      (sales ?? []).forEach((s) => {
        const k = new Date(s.created_at).toISOString().slice(0, 10);
        const i = idxByKey.get(k);
        if (i != null) buckets[i].vendas += Number(s.paid_amount);
      });
      (creditPays ?? []).forEach((p) => {
        if (!p.paid_at) return;
        const k = new Date(p.paid_at).toISOString().slice(0, 10);
        const i = idxByKey.get(k);
        if (i != null) buckets[i].vendas += Number(p.amount);
      });
      (exps ?? []).forEach((e) => {
        const i = idxByKey.get(e.expense_date as unknown as string);
        if (i != null) buckets[i].despesas += Number(e.amount);
      });
      setChart(buckets.map(({ label, vendas, despesas }) => ({ label, vendas, despesas })));

      // Top produtos (filtra somente itens de vendas válidas)
      const validSaleIds = new Set((sales ?? []).map((s) => s.id));
      const prodMap = new Map<string, { qty: number; total: number }>();
      (saleItems ?? []).forEach((it) => {
        if (!validSaleIds.has(it.sale_id)) return;
        const cur = prodMap.get(it.product_name) ?? { qty: 0, total: 0 };
        cur.qty += Number(it.quantity);
        cur.total += Number(it.subtotal);
        prodMap.set(it.product_name, cur);
      });
      setTopProducts(
        Array.from(prodMap.entries())
          .map(([name, v]) => ({ name, ...v }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 5),
      );

      // Por método de pagamento
      const methodMap = new Map<string, number>();
      (methodPays ?? []).forEach((p) => {
        methodMap.set(p.method, (methodMap.get(p.method) ?? 0) + Number(p.amount));
      });
      setByMethod(
        Array.from(methodMap.entries())
          .map(([method, total]) => ({ method, total }))
          .sort((a, b) => b.total - a.total),
      );

      // Pedidos online por status
      const counts = { pending_payment: 0, pending: 0, accepted: 0, completed: 0 };
      (onlineOrders ?? []).forEach((o) => {
        const s = o.status as keyof typeof counts;
        if (s in counts) counts[s] += 1;
      });
      setOnlineCounts(counts);

      setLoading(false);
    };
    load();
  }, [period]);

  const profit = stats.sales - stats.expenses;
  const maxMethod = Math.max(...byMethod.map((m) => m.total), 1);

  return (
    <AppShell>
      <div className="mb-3 flex items-end justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Dashboard</p>
          <h2 className="font-display text-3xl">Visão geral</h2>
        </div>
      </div>

      {/* Period selector */}
      <div className="mb-4 inline-flex rounded-lg border border-border bg-card p-1 shadow-sm">
        {(["today", "7d", "30d"] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
              period === p
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {periodLabel[p]}
          </button>
        ))}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card
          role="button"
          tabIndex={0}
          onClick={() => nav(`/pedidos?period=${period}`)}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && nav(`/pedidos?period=${period}`)}
          className="p-4 shadow-card-retro border-l-4 border-l-success cursor-pointer hover:shadow-md active:scale-[0.98] transition"
        >
          <div className="flex items-center gap-2 text-success">
            <TrendingUp className="h-4 w-4" />
            <span className="text-[11px] font-semibold uppercase">Vendas</span>
          </div>
          <p className="mt-1 font-display text-2xl">{formatBRL(stats.sales)}</p>
          <p className="text-[11px] text-muted-foreground">
            {stats.salesCount} pedidos
            {stats.creditReceived > 0 && ` · fiado: ${formatBRL(stats.creditReceived)}`}
          </p>
          <p className="mt-1 text-[10px] font-semibold text-success">Ver pedidos →</p>
        </Card>
        <Card
          role="button"
          tabIndex={0}
          onClick={() => nav(`/despesas?period=${period}`)}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && nav(`/despesas?period=${period}`)}
          className="p-4 shadow-card-retro border-l-4 border-l-destructive cursor-pointer hover:shadow-md active:scale-[0.98] transition"
        >
          <div className="flex items-center gap-2 text-destructive">
            <TrendingDown className="h-4 w-4" />
            <span className="text-[11px] font-semibold uppercase">Despesas</span>
          </div>
          <p className="mt-1 font-display text-2xl">{formatBRL(stats.expenses)}</p>
          <p className="mt-1 text-[10px] font-semibold text-destructive">Ver despesas →</p>
        </Card>
        <Card className="p-4 shadow-card-retro border-l-4 border-l-primary">
          <div className="flex items-center gap-2 text-primary">
            <Wallet className="h-4 w-4" />
            <span className="text-[11px] font-semibold uppercase">Saldo</span>
          </div>
          <p className="mt-1 font-display text-2xl">{formatBRL(profit)}</p>
        </Card>
        <Card className="p-4 shadow-card-retro border-l-4 border-l-accent">
          <div className="flex items-center gap-2 text-accent-foreground">
            <AlertCircle className="h-4 w-4" />
            <span className="text-[11px] font-semibold uppercase">Em fiado</span>
          </div>
          <p className="mt-1 font-display text-2xl">{formatBRL(stats.openCredit)}</p>
        </Card>
      </div>

      {/* Ticket médio */}
      <Card className="mt-3 p-4 shadow-card-retro flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase text-muted-foreground">Ticket médio</p>
          <p className="font-display text-xl">{formatBRL(stats.avgTicket)}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground">Pedidos</p>
          <p className="font-display text-xl">{stats.salesCount}</p>
        </div>
      </Card>

      {/* Gráfico vendas vs despesas */}
      {period !== "today" && (
        <Card className="mt-4 p-4 shadow-card-retro">
          <h3 className="font-display text-base mb-3">Vendas x Despesas</h3>
          <div className="h-48 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={period === "30d" ? 4 : 0} />
                <YAxis tick={{ fontSize: 10 }} width={40} />
                <Tooltip
                  formatter={(v: number) => formatBRL(v)}
                  contentStyle={{
                    background: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="vendas" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="despesas" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Pedidos online por status */}
      <Card className="mt-4 p-4 shadow-card-retro">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-base">Pedidos online</h3>
          <button
            onClick={() => nav("/pedidos")}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Ver todos →
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <StatusPill
            icon={<CreditCard className="h-3.5 w-3.5" />}
            label="Aguardando pgto."
            value={onlineCounts.pending_payment}
            color="text-amber-600"
          />
          <StatusPill
            icon={<Hourglass className="h-3.5 w-3.5" />}
            label="Pendentes"
            value={onlineCounts.pending}
            color="text-blue-600"
          />
          <StatusPill
            icon={<Clock className="h-3.5 w-3.5" />}
            label="Aceitos"
            value={onlineCounts.accepted}
            color="text-primary"
          />
          <StatusPill
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            label="Concluídos"
            value={onlineCounts.completed}
            color="text-success"
          />
        </div>
      </Card>

      {/* Top produtos */}
      <Card className="mt-4 p-4 shadow-card-retro">
        <h3 className="font-display text-base mb-3 flex items-center gap-2">
          <Package className="h-4 w-4" /> Top produtos
        </h3>
        {topProducts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma venda no período.</p>
        ) : (
          <ul className="space-y-2">
            {topProducts.map((p, i) => (
              <li key={p.name} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                    {i + 1}
                  </span>
                  <span className="truncate text-sm">{p.name}</span>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold">{formatBRL(p.total)}</p>
                  <p className="text-[10px] text-muted-foreground">{p.qty} un.</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Por forma de pagamento */}
      <Card className="mt-4 p-4 shadow-card-retro">
        <h3 className="font-display text-base mb-3">Formas de pagamento</h3>
        {byMethod.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem pagamentos no período.</p>
        ) : (
          <ul className="space-y-2">
            {byMethod.map((m) => (
              <li key={m.method}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span>{paymentLabels[m.method] ?? m.method}</span>
                  <span className="font-semibold">{formatBRL(m.total)}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${(m.total / maxMethod) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Atalhos */}
      <div className="mt-6">
        <h3 className="font-display text-lg mb-2">Atalhos</h3>
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => nav("/pdv")}
            className="rounded-xl bg-primary text-primary-foreground p-4 shadow-retro flex flex-col items-center gap-2 active:scale-95 transition"
          >
            <ShoppingCart className="h-6 w-6" />
            <span className="font-display text-sm">Nova Venda</span>
          </button>
          <button
            onClick={() => nav("/fiado")}
            className="rounded-xl bg-secondary text-secondary-foreground p-4 shadow-retro flex flex-col items-center gap-2 active:scale-95 transition"
          >
            <Users className="h-6 w-6" />
            <span className="font-display text-sm">Fiados</span>
          </button>
          <button
            onClick={() => nav("/despesas")}
            className="rounded-xl bg-accent text-accent-foreground p-4 shadow-retro flex flex-col items-center gap-2 active:scale-95 transition"
          >
            <Receipt className="h-6 w-6" />
            <span className="font-display text-sm">Despesa</span>
          </button>
        </div>
      </div>

      {loading && <p className="mt-4 text-center text-xs text-muted-foreground">Atualizando…</p>}
    </AppShell>
  );
}

function StatusPill({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-border p-2.5">
      <div className={`flex items-center gap-1.5 ${color}`}>
        {icon}
        <span className="text-[10px] font-semibold uppercase">{label}</span>
      </div>
      <p className="font-display text-2xl mt-0.5">{value}</p>
    </div>
  );
}
