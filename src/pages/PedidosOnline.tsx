import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/contexts/AuthContext";
import { formatBRL, formatDate } from "@/lib/format";
import { Check, X, MapPin, Store, Phone, Clock, MessageCircle, CalendarIcon, Trash2, ShoppingBag, Globe } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";

type Period = "today" | "7d" | "30d" | "all" | "custom";
const periodLabel: Record<Period, string> = { today: "Hoje", "7d": "7d", "30d": "30d", all: "Tudo", custom: "Período" };


type OrderItem = { id: string; product_id: string | null; product_name: string; unit_price: number; quantity: number; subtotal: number };
type Order = {
  id: string;
  order_number: number;
  customer_name: string;
  customer_phone: string;
  order_type: "delivery" | "pickup";
  delivery_zone_name: string | null;
  delivery_fee: number;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_reference: string | null;
  subtotal: number;
  total: number;
  notes: string | null;
  status: "pending" | "accepted" | "rejected" | "completed" | "pending_payment";
  sale_id: string | null;
  created_at: string;
  payment_method: string | null;
  payment_change_for: number | null;
  payment_confirmed_at: string | null;
  asaas_invoice_url: string | null;
  items?: OrderItem[];
};

const paymentInfo = (m: string | null, paid: boolean) => {
  if (m === "pix") {
    return paid
      ? { label: "PIX PAGO ✅", icon: "💸", cls: "bg-success text-success-foreground" }
      : { label: "PIX AGUARDANDO", icon: "⏳", cls: "bg-amber-500 text-white" };
  }
  if (m === "cash") return { label: "DINHEIRO NA ENTREGA", icon: "💵", cls: "bg-accent text-accent-foreground" };
  if (m === "card_delivery") return { label: "CARTÃO NA ENTREGA", icon: "💳", cls: "bg-accent text-accent-foreground" };
  return { label: "A COMBINAR", icon: "❓", cls: "bg-muted text-muted-foreground" };
};

export default function PedidosOnline() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  type Filter = "pending_payment" | "pending" | "accepted" | "completed" | "all";
  const [filter, setFilter] = useState<Filter>("pending");
  const [period, setPeriod] = useState<Period>("30d");
  const [range, setRange] = useState<DateRange | undefined>();
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<"online" | "pdv">("online");
  type PdvSale = { id: string; created_at: string; total: number; paid_amount: number; status: string; notes: string | null; operator_name?: string; items: { product_name: string; quantity: number; subtotal: number }[] };
  const [pdvSales, setPdvSales] = useState<PdvSale[]>([]);
  const [cleaning, setCleaning] = useState(false);



  const load = async () => {
    const { data } = await supabase
      .from("online_orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    const ords = (data ?? []).map((o: any) => ({
      ...o,
      delivery_fee: Number(o.delivery_fee),
      subtotal: Number(o.subtotal),
      total: Number(o.total),
    })) as Order[];
    // load items for each
    if (ords.length > 0) {
      const { data: items } = await supabase
        .from("online_order_items")
        .select("*")
        .in("online_order_id", ords.map((o) => o.id));
      const byOrder = new Map<string, OrderItem[]>();
      (items ?? []).forEach((i: any) => {
        const arr = byOrder.get(i.online_order_id) ?? [];
        arr.push({ ...i, unit_price: Number(i.unit_price), quantity: Number(i.quantity), subtotal: Number(i.subtotal) });
        byOrder.set(i.online_order_id, arr);
      });
      ords.forEach((o) => (o.items = byOrder.get(o.id) ?? []));
    }
    setOrders(ords);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("online_orders_live")
      .on("postgres_changes", { event: "*", schema: "public", table: "online_orders" }, () => {
        load();
        toast.info("📦 Atualização de pedidos");
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadPdvSales = async (startIso: string, endIso: string) => {
    const { data: sales } = await supabase
      .from("sales")
      .select("id, created_at, total, paid_amount, status, notes")
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(500);
    const filtered = (sales ?? []).filter((s: any) => !(s.notes ?? "").startsWith("Pedido online"));
    if (filtered.length === 0) { setPdvSales([]); return; }
    const { data: items } = await supabase
      .from("sale_items")
      .select("sale_id, product_name, quantity, subtotal")
      .in("sale_id", filtered.map((s: any) => s.id));
    const byId = new Map<string, PdvSale["items"]>();
    (items ?? []).forEach((it: any) => {
      const arr = byId.get(it.sale_id) ?? [];
      arr.push({ product_name: it.product_name, quantity: Number(it.quantity), subtotal: Number(it.subtotal) });
      byId.set(it.sale_id, arr);
    });
    setPdvSales(filtered.map((s: any) => ({
      ...s, total: Number(s.total), paid_amount: Number(s.paid_amount),
      items: byId.get(s.id) ?? [],
    })));
  };

  const cleanStuck = async () => {
    const stuck = orders.filter((o) =>
      (o.status === "pending" || o.status === "pending_payment") &&
      Date.now() - new Date(o.created_at).getTime() > 30 * 60 * 1000
    );
    if (stuck.length === 0) return toast.info("Nenhum pedido parado há mais de 30 min");
    if (!confirm(`Recusar ${stuck.length} pedido(s) parado(s) há mais de 30 min?`)) return;
    setCleaning(true);
    const { error } = await supabase
      .from("online_orders")
      .update({ status: "rejected" })
      .in("id", stuck.map((o) => o.id));
    setCleaning(false);
    if (error) return toast.error(error.message);
    toast.success(`${stuck.length} pedido(s) limpo(s)`);
    load();
  };


  const accept = async (o: Order) => {
    if (!user) return;
    if (!o.items || o.items.length === 0) return toast.error("Pedido sem itens");
    try {
      // Create sale (open status, awaiting payment confirmation in PDV checkout flow if needed)
      const { data: sale, error } = await supabase
        .from("sales")
        .insert({
          operator_id: user.id,
          subtotal: o.subtotal,
          discount: 0,
          total: o.total,
          paid_amount: 0,
          credit_amount: 0,
          status: "open",
          notes: `Pedido online #${o.order_number} • ${o.customer_name} • ${o.order_type === "delivery" ? `Entrega (${o.delivery_zone_name})` : "Retirada"}${o.notes ? ` • ${o.notes}` : ""}`,
        })
        .select()
        .single();
      if (error) throw error;

      const items = o.items.map((it) => ({
        sale_id: sale.id,
        product_id: it.product_id,
        product_name: it.product_name,
        unit_price: it.unit_price,
        quantity: it.quantity,
        subtotal: it.subtotal,
      }));
      // include delivery fee as a virtual item if > 0
      if (o.delivery_fee > 0) {
        items.push({
          sale_id: sale.id,
          product_id: null,
          product_name: `Taxa de entrega (${o.delivery_zone_name})`,
          unit_price: o.delivery_fee,
          quantity: 1,
          subtotal: o.delivery_fee,
        });
      }
      const { error: e2 } = await supabase.from("sale_items").insert(items);
      if (e2) throw e2;

      const { error: e3 } = await supabase
        .from("online_orders")
        .update({ status: "accepted", sale_id: sale.id, accepted_by: user.id, accepted_at: new Date().toISOString() })
        .eq("id", o.id);
      if (e3) throw e3;

      toast.success(`Pedido #${o.order_number} aceito — venda criada no PDV`);
      load();
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao aceitar pedido");
    }
  };

  const reject = async (o: Order) => {
    if (!confirm(`Recusar pedido #${o.order_number}?`)) return;
    const { error } = await supabase.from("online_orders").update({ status: "rejected" }).eq("id", o.id);
    if (error) return toast.error(error.message);
    toast.success("Pedido recusado");
    load();
  };

  const complete = async (o: Order) => {
    const { error } = await supabase.from("online_orders").update({ status: "completed" }).eq("id", o.id);
    if (error) return toast.error(error.message);
    toast.success("Pedido finalizado");
    load();
  };

  const openWhats = (o: Order) => {
    const phone = o.customer_phone.replace(/\D/g, "");
    window.open(`https://wa.me/55${phone}`, "_blank");
  };

  const { startMs, endMs } = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(23, 59, 59, 999);
    if (period === "all") return { startMs: 0, endMs: Number.MAX_SAFE_INTEGER };
    if (period === "7d") start.setDate(start.getDate() - 6);
    else if (period === "30d") start.setDate(start.getDate() - 29);
    else if (period === "custom" && range?.from) {
      start.setTime(range.from.getTime()); start.setHours(0, 0, 0, 0);
      const t = range.to ?? range.from;
      end.setTime(t.getTime()); end.setHours(23, 59, 59, 999);
    }
    return { startMs: start.getTime(), endMs: end.getTime() };
  }, [period, range]);

  useEffect(() => {
    if (source === "pdv") {
      const startIso = new Date(startMs).toISOString();
      const endIso = new Date(Math.min(endMs, Date.now() + 86400000)).toISOString();
      loadPdvSales(startIso, endIso);
    }
  }, [source, startMs, endMs]);


  const inPeriod = (o: Order) => {
    const t = new Date(o.created_at).getTime();
    return t >= startMs && t <= endMs;
  };
  const periodOrders = orders.filter(inPeriod);

  const counts = {
    pending_payment: periodOrders.filter((o) => o.status === "pending_payment").length,
    pending: periodOrders.filter((o) => o.status === "pending").length,
    accepted: periodOrders.filter((o) => o.status === "accepted").length,
    completed: periodOrders.filter((o) => o.status === "completed").length,
    all: periodOrders.length,
  };
  const visible = periodOrders.filter((o) => filter === "all" ? true : o.status === filter);
  const periodTotal = visible.reduce((s, o) => s + o.total, 0);

  const filterBtns: { key: Filter; label: string }[] = [
    { key: "pending_payment", label: "Aguard. PIX" },
    { key: "pending", label: "Pendentes" },
    { key: "accepted", label: "Aceitos" },
    { key: "completed", label: "Concluídos" },
    { key: "all", label: "Todos" },
  ];

  return (
    <AppShell title="Pedidos Online">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border bg-card p-1 shadow-sm">
          {(["today", "7d", "30d", "all"] as Period[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${period === p ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {periodLabel[p]}
            </button>
          ))}
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant={period === "custom" ? "default" : "outline"} size="sm" className="h-8 text-xs">
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
      <p className="mb-2 text-[11px] text-muted-foreground flex justify-between">
        <span>{visible.length} pedidos</span>
        <span className="font-semibold text-primary">{formatBRL(periodTotal)}</span>
      </p>

      <div className="flex gap-2 mb-3 overflow-x-auto pb-1 -mx-1 px-1">
        {filterBtns.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? "default" : "outline"}
            onClick={() => setFilter(f.key)}
            className="shrink-0"
          >
            {f.label} ({counts[f.key]})
          </Button>
        ))}
      </div>


      {loading && <p className="text-center text-sm text-muted-foreground py-8">Carregando...</p>}

      <div className="space-y-3">
        {visible.map((o) => (
          <Card key={o.id} className="p-4 shadow-card-retro">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-display text-xl text-primary">#{o.order_number}</h3>
                  <StatusBadge status={o.status} />
                </div>
                <p className="font-medium mt-1">{o.customer_name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Phone className="h-3 w-3" /> {o.customer_phone}
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Clock className="h-3 w-3" /> {formatDate(o.created_at)}
                </p>
              </div>
              <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={() => openWhats(o)} title="WhatsApp">
                <MessageCircle className="h-4 w-4 text-success" />
              </Button>
            </div>

            <div className="mt-3 rounded-md bg-muted/50 p-2 text-xs flex items-start gap-2">
              {o.order_type === "delivery" ? <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <Store className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
              <div className="min-w-0">
                {o.order_type === "delivery" ? (
                  <>
                    <p className="font-medium">{o.delivery_zone_name} — {formatBRL(o.delivery_fee)}</p>
                    <p>{o.address_street}, {o.address_number}{o.address_complement ? ` - ${o.address_complement}` : ""}</p>
                    {o.address_reference && <p className="text-muted-foreground">Ref: {o.address_reference}</p>}
                  </>
                ) : <p className="font-medium">Retirada no local</p>}
              </div>
            </div>

            {/* Payment highlight */}
            {(() => {
              const pi = paymentInfo(o.payment_method, !!o.payment_confirmed_at);
              return (
                <div className={`mt-2 rounded-md px-3 py-2 ${pi.cls} flex items-center justify-between gap-2`}>
                  <span className="font-display text-sm tracking-wide flex items-center gap-2">
                    <span className="text-base">{pi.icon}</span> {pi.label}
                  </span>
                  {o.payment_method === "cash" && o.payment_change_for && (
                    <span className="text-xs font-semibold">
                      Troco p/ {formatBRL(o.payment_change_for)}
                    </span>
                  )}
                </div>
              );
            })()}

            <div className="mt-3 space-y-1">
              {o.items?.map((it) => (
                <div key={it.id} className="flex justify-between text-sm">
                  <span>{it.quantity}x {it.product_name}</span>
                  <span>{formatBRL(it.subtotal)}</span>
                </div>
              ))}
            </div>

            {o.notes && <p className="mt-2 text-xs italic text-muted-foreground">Obs: {o.notes}</p>}

            <div className="mt-3 flex justify-between items-center border-t border-border pt-2">
              <span className="font-display text-base">Total</span>
              <span className="font-display text-xl text-primary">{formatBRL(o.total)}</span>
            </div>

            {o.status === "pending" && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="outline" className="text-destructive" onClick={() => reject(o)}>
                  <X className="h-4 w-4 mr-1" /> Recusar
                </Button>
                <Button onClick={() => accept(o)}>
                  <Check className="h-4 w-4 mr-1" /> Aceitar
                </Button>
              </div>
            )}
            {o.status === "accepted" && (
              <Button variant="outline" className="w-full mt-3" onClick={() => complete(o)}>
                Marcar como finalizado
              </Button>
            )}
          </Card>
        ))}
        {!loading && visible.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">
            Nenhum pedido neste filtro.
          </p>
        )}
      </div>
    </AppShell>
  );
}

const StatusBadge = ({ status }: { status: Order["status"] }) => {
  const map = {
    pending_payment: { label: "Aguard. PIX", cls: "bg-amber-500 text-white" },
    pending: { label: "Pendente", cls: "bg-accent text-accent-foreground" },
    accepted: { label: "Aceito", cls: "bg-success text-success-foreground" },
    rejected: { label: "Recusado", cls: "bg-destructive text-destructive-foreground" },
    completed: { label: "Finalizado", cls: "bg-muted text-muted-foreground" },
  };
  const m = map[status];
  return <span className={`text-[10px] font-display tracking-wide px-2 py-0.5 rounded-full ${m.cls}`}>{m.label}</span>;
};
