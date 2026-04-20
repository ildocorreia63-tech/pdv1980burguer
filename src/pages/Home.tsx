import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import { TrendingUp, TrendingDown, Wallet, AlertCircle, ShoppingCart, Receipt, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Home() {
  const nav = useNavigate();
  const [stats, setStats] = useState({ todaySales: 0, todayCount: 0, todayExpenses: 0, openCredit: 0, todayCreditReceived: 0 });

  useEffect(() => {
    const load = async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const iso = today.toISOString();
      const todayDate = today.toISOString().slice(0, 10);

      const [{ data: sales }, { data: exps }, { data: creds }, { data: creditPays }] = await Promise.all([
        supabase.from("sales").select("total, paid_amount, status").gte("created_at", iso).neq("status", "cancelled"),
        supabase.from("expenses").select("amount").gte("expense_date", todayDate),
        supabase.from("customers").select("credit_balance").gt("credit_balance", 0),
        supabase
          .from("payments")
          .select("amount")
          .is("sale_id", null)
          .not("customer_id", "is", null)
          .eq("status", "paid")
          .gte("paid_at", iso),
      ]);

      // Receita do dia = parte recebida das vendas do dia + baixas de fiado recebidas hoje
      const salesPaidToday = (sales ?? []).reduce((s, r) => s + Number(r.paid_amount), 0);
      const creditReceivedToday = (creditPays ?? []).reduce((s, r) => s + Number(r.amount), 0);

      setStats({
        todaySales: salesPaidToday + creditReceivedToday,
        todayCount: sales?.length ?? 0,
        todayExpenses: (exps ?? []).reduce((s, r) => s + Number(r.amount), 0),
        openCredit: (creds ?? []).reduce((s, r) => s + Number(r.credit_balance), 0),
        todayCreditReceived: creditReceivedToday,
      });
    };
    load();
  }, []);

  const profit = stats.todaySales - stats.todayExpenses;

  return (
    <AppShell>
      <div className="mb-4">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Resumo de hoje</p>
        <h2 className="font-display text-3xl">Caixa do dia</h2>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 shadow-card-retro border-l-4 border-l-success">
          <div className="flex items-center gap-2 text-success">
            <TrendingUp className="h-4 w-4" />
            <span className="text-[11px] font-semibold uppercase">Vendas</span>
          </div>
          <p className="mt-1 font-display text-2xl">{formatBRL(stats.todaySales)}</p>
          <p className="text-[11px] text-muted-foreground">{stats.todayCount} pedidos</p>
        </Card>
        <Card className="p-4 shadow-card-retro border-l-4 border-l-destructive">
          <div className="flex items-center gap-2 text-destructive">
            <TrendingDown className="h-4 w-4" />
            <span className="text-[11px] font-semibold uppercase">Despesas</span>
          </div>
          <p className="mt-1 font-display text-2xl">{formatBRL(stats.todayExpenses)}</p>
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

      <div className="mt-6">
        <h3 className="font-display text-lg mb-2">Atalhos</h3>
        <div className="grid grid-cols-3 gap-3">
          <button onClick={() => nav("/pdv")} className="rounded-xl bg-primary text-primary-foreground p-4 shadow-retro flex flex-col items-center gap-2 active:scale-95 transition">
            <ShoppingCart className="h-6 w-6" />
            <span className="font-display text-sm">Nova Venda</span>
          </button>
          <button onClick={() => nav("/fiado")} className="rounded-xl bg-secondary text-secondary-foreground p-4 shadow-retro flex flex-col items-center gap-2 active:scale-95 transition">
            <Users className="h-6 w-6" />
            <span className="font-display text-sm">Fiados</span>
          </button>
          <button onClick={() => nav("/despesas")} className="rounded-xl bg-accent text-accent-foreground p-4 shadow-retro flex flex-col items-center gap-2 active:scale-95 transition">
            <Receipt className="h-6 w-6" />
            <span className="font-display text-sm">Despesa</span>
          </button>
        </div>
      </div>
    </AppShell>
  );
}
