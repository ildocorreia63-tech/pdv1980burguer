import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, paymentLabels } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CalendarIcon, Download, Printer, FileText } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";

type Period = "today" | "7d" | "30d" | "custom";
const periodLabel: Record<Period, string> = { today: "Hoje", "7d": "7 dias", "30d": "30 dias", custom: "Personalizado" };

export default function Relatorios() {
  const [period, setPeriod] = useState<Period>("7d");
  const [range, setRange] = useState<DateRange | undefined>(() => {
    const to = new Date(); const from = new Date(); from.setDate(from.getDate() - 6);
    return { from, to };
  });
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    salesPaid: 0, creditReceived: 0, expenses: 0, openCredit: 0,
    salesCount: 0, avgTicket: 0,
    byMethod: [] as { method: string; total: number }[],
    topProducts: [] as { name: string; qty: number; total: number }[],
    byCategory: [] as { category: string; total: number; count: number; pct: number }[],
  });

  const { startDate, endDate } = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(23, 59, 59, 999);
    if (period === "7d") start.setDate(start.getDate() - 6);
    else if (period === "30d") start.setDate(start.getDate() - 29);
    else if (period === "custom" && range?.from) {
      start.setTime(range.from.getTime()); start.setHours(0, 0, 0, 0);
      const t = range.to ?? range.from;
      end.setTime(t.getTime()); end.setHours(23, 59, 59, 999);
    }
    return { startDate: start, endDate: end };
  }, [period, range]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const startIso = startDate.toISOString();
      const endIso = endDate.toISOString();
      const startStr = startDate.toISOString().slice(0, 10);
      const endStr = endDate.toISOString().slice(0, 10);

      const [{ data: sales }, { data: items }, { data: exps }, { data: creds }, { data: creditPays }, { data: methodPays }] = await Promise.all([
        supabase.from("sales").select("id, paid_amount, status, created_at").gte("created_at", startIso).lte("created_at", endIso).neq("status", "cancelled"),
        supabase.from("sale_items").select("product_name, quantity, subtotal, sale_id, created_at").gte("created_at", startIso).lte("created_at", endIso),
        supabase.from("expenses").select("amount, expense_date, description, category").gte("expense_date", startStr).lte("expense_date", endStr),
        supabase.from("customers").select("credit_balance").gt("credit_balance", 0),
        supabase.from("payments").select("amount, paid_at").is("sale_id", null).not("customer_id", "is", null).eq("status", "paid").gte("paid_at", startIso).lte("paid_at", endIso),
        supabase.from("payments").select("amount, method, status").eq("status", "paid").not("sale_id", "is", null).gte("paid_at", startIso).lte("paid_at", endIso),
      ]);

      const salesPaid = (sales ?? []).reduce((s, r) => s + Number(r.paid_amount), 0);
      const creditReceived = (creditPays ?? []).reduce((s, r) => s + Number(r.amount), 0);
      const expenses = (exps ?? []).reduce((s, r) => s + Number(r.amount), 0);
      const openCredit = (creds ?? []).reduce((s, r) => s + Number(r.credit_balance), 0);
      const salesCount = sales?.length ?? 0;
      const total = salesPaid + creditReceived;

      const validIds = new Set((sales ?? []).map((s) => s.id));
      const prodMap = new Map<string, { qty: number; total: number }>();
      (items ?? []).forEach((it) => {
        if (!validIds.has(it.sale_id)) return;
        const c = prodMap.get(it.product_name) ?? { qty: 0, total: 0 };
        c.qty += Number(it.quantity); c.total += Number(it.subtotal);
        prodMap.set(it.product_name, c);
      });
      const topProducts = Array.from(prodMap.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total).slice(0, 10);

      const mMap = new Map<string, number>();
      (methodPays ?? []).forEach((p) => mMap.set(p.method, (mMap.get(p.method) ?? 0) + Number(p.amount)));
      const byMethod = Array.from(mMap.entries()).map(([method, total]) => ({ method, total })).sort((a, b) => b.total - a.total);

      setData({
        salesPaid, creditReceived, expenses, openCredit, salesCount,
        avgTicket: salesCount ? total / salesCount : 0,
        byMethod, topProducts,
      });
      setLoading(false);
    };
    load();
  }, [startDate, endDate]);

  const total = data.salesPaid + data.creditReceived;
  const profit = total - data.expenses;
  const periodStr = `${format(startDate, "dd/MM/yyyy", { locale: ptBR })} a ${format(endDate, "dd/MM/yyyy", { locale: ptBR })}`;

  const downloadCSV = () => {
    const lines: string[] = [];
    lines.push(`Relatório - ${periodStr}`);
    lines.push("");
    lines.push("Resumo");
    lines.push(`Vendas (recebido);${data.salesPaid.toFixed(2)}`);
    lines.push(`Fiado recebido;${data.creditReceived.toFixed(2)}`);
    lines.push(`Total recebido;${total.toFixed(2)}`);
    lines.push(`Despesas;${data.expenses.toFixed(2)}`);
    lines.push(`Saldo;${profit.toFixed(2)}`);
    lines.push(`Em fiado (aberto);${data.openCredit.toFixed(2)}`);
    lines.push(`Pedidos;${data.salesCount}`);
    lines.push(`Ticket médio;${data.avgTicket.toFixed(2)}`);
    lines.push("");
    lines.push("Formas de pagamento");
    lines.push("Método;Total");
    data.byMethod.forEach((m) => lines.push(`${paymentLabels[m.method] ?? m.method};${m.total.toFixed(2)}`));
    lines.push("");
    lines.push("Top produtos");
    lines.push("Produto;Quantidade;Total");
    data.topProducts.forEach((p) => lines.push(`${p.name};${p.qty};${p.total.toFixed(2)}`));

    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `relatorio_${format(startDate, "yyyy-MM-dd")}_${format(endDate, "yyyy-MM-dd")}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const downloadHTML = () => {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Relatório ${periodStr}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;max-width:720px;margin:24px auto;padding:0 16px;color:#111}
  h1{margin:0 0 4px;font-size:22px}
  .sub{color:#666;font-size:13px;margin-bottom:24px}
  h2{font-size:15px;margin:24px 0 8px;border-bottom:2px solid #111;padding-bottom:4px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  td,th{padding:6px 8px;border-bottom:1px solid #eee;text-align:left}
  td.r,th.r{text-align:right}
  .kpi{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .kpi div{border:1px solid #ddd;border-radius:8px;padding:10px}
  .kpi b{display:block;font-size:18px}
  .kpi span{font-size:11px;color:#666;text-transform:uppercase}
  .pos{color:#0a7d3b}.neg{color:#b00020}
  @media print{.noprint{display:none}}
</style></head><body>
<h1>Relatório financeiro</h1>
<div class="sub">${periodStr}</div>
<div class="kpi">
  <div><span>Total recebido</span><b>${formatBRL(total)}</b></div>
  <div><span>Despesas</span><b class="neg">${formatBRL(data.expenses)}</b></div>
  <div><span>Saldo</span><b class="${profit >= 0 ? "pos" : "neg"}">${formatBRL(profit)}</b></div>
  <div><span>Em fiado (aberto)</span><b>${formatBRL(data.openCredit)}</b></div>
  <div><span>Pedidos</span><b>${data.salesCount}</b></div>
  <div><span>Ticket médio</span><b>${formatBRL(data.avgTicket)}</b></div>
</div>
<h2>Detalhamento de recebimentos</h2>
<table><tbody>
  <tr><td>Vendas (recebido no período)</td><td class="r">${formatBRL(data.salesPaid)}</td></tr>
  <tr><td>Fiado recebido</td><td class="r">${formatBRL(data.creditReceived)}</td></tr>
  <tr><th>Total</th><th class="r">${formatBRL(total)}</th></tr>
</tbody></table>
<h2>Formas de pagamento</h2>
<table><thead><tr><th>Método</th><th class="r">Total</th></tr></thead><tbody>
  ${data.byMethod.map((m) => `<tr><td>${paymentLabels[m.method] ?? m.method}</td><td class="r">${formatBRL(m.total)}</td></tr>`).join("") || `<tr><td colspan="2" style="color:#999">Sem pagamentos</td></tr>`}
</tbody></table>
<h2>Top produtos</h2>
<table><thead><tr><th>#</th><th>Produto</th><th class="r">Qtd</th><th class="r">Total</th></tr></thead><tbody>
  ${data.topProducts.map((p, i) => `<tr><td>${i + 1}</td><td>${p.name}</td><td class="r">${p.qty}</td><td class="r">${formatBRL(p.total)}</td></tr>`).join("") || `<tr><td colspan="4" style="color:#999">Sem vendas</td></tr>`}
</tbody></table>
<div class="noprint" style="margin-top:24px;text-align:center">
  <button onclick="window.print()" style="padding:10px 20px;font-size:14px;border:1px solid #111;background:#111;color:#fff;border-radius:8px;cursor:pointer">Imprimir / Salvar PDF</button>
</div>
</body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `relatorio_${format(startDate, "yyyy-MM-dd")}_${format(endDate, "yyyy-MM-dd")}.html`;
    a.click(); URL.revokeObjectURL(url);
  };

  const printReport = () => {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Relatório ${periodStr}</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:24px auto;padding:0 16px}h1{margin:0;font-size:22px}.sub{color:#666;font-size:13px;margin-bottom:20px}h2{font-size:15px;margin:20px 0 8px;border-bottom:2px solid #111;padding-bottom:4px}table{width:100%;border-collapse:collapse;font-size:13px}td,th{padding:6px 8px;border-bottom:1px solid #eee;text-align:left}.r{text-align:right}.kpi{display:grid;grid-template-columns:1fr 1fr;gap:8px}.kpi div{border:1px solid #ddd;border-radius:8px;padding:10px}.kpi b{display:block;font-size:18px}.kpi span{font-size:11px;color:#666;text-transform:uppercase}.pos{color:#0a7d3b}.neg{color:#b00020}</style></head><body>
<h1>Relatório financeiro</h1><div class="sub">${periodStr}</div>
<div class="kpi">
  <div><span>Total recebido</span><b>${formatBRL(total)}</b></div>
  <div><span>Despesas</span><b class="neg">${formatBRL(data.expenses)}</b></div>
  <div><span>Saldo</span><b class="${profit >= 0 ? "pos" : "neg"}">${formatBRL(profit)}</b></div>
  <div><span>Em fiado</span><b>${formatBRL(data.openCredit)}</b></div>
  <div><span>Pedidos</span><b>${data.salesCount}</b></div>
  <div><span>Ticket médio</span><b>${formatBRL(data.avgTicket)}</b></div>
</div>
<h2>Recebimentos</h2><table><tr><td>Vendas</td><td class="r">${formatBRL(data.salesPaid)}</td></tr><tr><td>Fiado recebido</td><td class="r">${formatBRL(data.creditReceived)}</td></tr></table>
<h2>Formas de pagamento</h2><table><thead><tr><th>Método</th><th class="r">Total</th></tr></thead><tbody>${data.byMethod.map((m) => `<tr><td>${paymentLabels[m.method] ?? m.method}</td><td class="r">${formatBRL(m.total)}</td></tr>`).join("") || `<tr><td colspan="2" style="color:#999">—</td></tr>`}</tbody></table>
<h2>Top produtos</h2><table><thead><tr><th>#</th><th>Produto</th><th class="r">Qtd</th><th class="r">Total</th></tr></thead><tbody>${data.topProducts.map((p, i) => `<tr><td>${i + 1}</td><td>${p.name}</td><td class="r">${p.qty}</td><td class="r">${formatBRL(p.total)}</td></tr>`).join("") || `<tr><td colspan="4" style="color:#999">—</td></tr>`}</tbody></table>
<script>window.onload=()=>setTimeout(()=>window.print(),300)</script>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html); w.document.close();
  };

  return (
    <AppShell title="Relatórios">
      <div className="mb-3">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Relatório</p>
        <h2 className="font-display text-3xl">Resumo do período</h2>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border bg-card p-1 shadow-sm">
          {(["today", "7d", "30d"] as Period[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${period === p ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {periodLabel[p]}
            </button>
          ))}
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant={period === "custom" ? "default" : "outline"} size="sm" className="h-9 text-xs">
              <CalendarIcon className="h-3.5 w-3.5" />
              {period === "custom" && range?.from
                ? range.to && range.to.getTime() !== range.from.getTime()
                  ? `${format(range.from, "dd/MM", { locale: ptBR })} – ${format(range.to, "dd/MM", { locale: ptBR })}`
                  : format(range.from, "dd/MM/yyyy", { locale: ptBR })
                : "Datas"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="range" selected={range} onSelect={(r) => { setRange(r); if (r?.from) setPeriod("custom"); }}
              numberOfMonths={1} locale={ptBR} initialFocus className={cn("p-3 pointer-events-auto")} />
          </PopoverContent>
        </Popover>
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">{periodStr}</p>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <Button onClick={printReport} variant="default" className="gap-2"><Printer className="h-4 w-4" />Imprimir / PDF</Button>
        <Button onClick={downloadCSV} variant="outline" className="gap-2"><Download className="h-4 w-4" />CSV</Button>
        <Button onClick={downloadHTML} variant="outline" className="gap-2 col-span-2"><FileText className="h-4 w-4" />Baixar HTML (abre e salva como PDF)</Button>
      </div>

      <Card className="p-4 shadow-card-retro">
        <h3 className="font-display text-base mb-3">Resumo</h3>
        <Row label="Vendas (recebido)" value={formatBRL(data.salesPaid)} />
        <Row label="Fiado recebido" value={formatBRL(data.creditReceived)} />
        <Row label="Total recebido" value={formatBRL(total)} bold />
        <Row label="Despesas" value={formatBRL(data.expenses)} className="text-destructive" />
        <Row label="Saldo" value={formatBRL(profit)} bold className={profit >= 0 ? "text-success" : "text-destructive"} />
        <Row label="Em fiado (aberto)" value={formatBRL(data.openCredit)} />
        <Row label="Pedidos" value={String(data.salesCount)} />
        <Row label="Ticket médio" value={formatBRL(data.avgTicket)} />
      </Card>

      <Card className="mt-4 p-4 shadow-card-retro">
        <h3 className="font-display text-base mb-3">Formas de pagamento</h3>
        {data.byMethod.length === 0 ? <p className="text-sm text-muted-foreground">Sem pagamentos.</p> : (
          <ul className="space-y-1">
            {data.byMethod.map((m) => (
              <li key={m.method} className="flex justify-between text-sm py-1 border-b border-border last:border-0">
                <span>{paymentLabels[m.method] ?? m.method}</span>
                <span className="font-semibold">{formatBRL(m.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-4 p-4 shadow-card-retro">
        <h3 className="font-display text-base mb-3">Top produtos</h3>
        {data.topProducts.length === 0 ? <p className="text-sm text-muted-foreground">Sem vendas.</p> : (
          <ul className="space-y-2">
            {data.topProducts.map((p, i) => (
              <li key={p.name} className="flex justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">{i + 1}</span>
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

      {loading && <p className="mt-4 text-center text-xs text-muted-foreground">Atualizando…</p>}
    </AppShell>
  );
}

function Row({ label, value, bold, className = "" }: { label: string; value: string; bold?: boolean; className?: string }) {
  return (
    <div className={`flex justify-between py-1.5 border-b border-border last:border-0 text-sm ${className}`}>
      <span>{label}</span>
      <span className={bold ? "font-bold" : "font-semibold"}>{value}</span>
    </div>
  );
}
