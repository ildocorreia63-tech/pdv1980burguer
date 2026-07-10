import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Bell, Search, Clock, CheckCircle2, ChefHat, Receipt, Bike, ShoppingBag, XCircle, Ban } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "pending_payment" | "pending" | "accepted" | "completed" | "rejected";
type Filter = Status | "all";

const CANCEL_REASONS = [
  "Loja fechada / fora do horário",
  "Produto sem estoque",
  "Fora da área de entrega",
  "Cliente não confirmou / não atende",
  "Pagamento não identificado",
  "Outro motivo",
];

type Item = { product_name: string; quantity: number; subtotal: number; unit_price: number };
type Order = {
  id: string;
  order_number: number;
  customer_name: string;
  customer_phone: string;
  status: Status;
  order_type: "pickup" | "delivery";
  payment_method: string | null;
  payment_confirmed_at: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_reference: string | null;
  delivery_zone_name: string | null;
  delivery_fee: number;
  subtotal: number;
  total: number;
  notes: string | null;
  sale_id: string | null;
  created_at: string;
  items?: Item[];
};

const audio = typeof window !== "undefined"
  ? new Audio("data:audio/wav;base64,UklGRnQGAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YVAGAAA=")
  : null;

const beep = () => { try { audio?.play?.().catch(() => {}); } catch {} };

const statusMeta: Record<Status, { label: string; color: string; icon: any }> = {
  pending_payment: { label: "Aguard. PIX", color: "bg-amber-500/15 text-amber-700 border-amber-500/30", icon: Clock },
  pending: { label: "Novo pedido", color: "bg-red-500/15 text-red-700 border-red-500/40", icon: Bell },
  accepted: { label: "Em preparo", color: "bg-blue-500/15 text-blue-700 border-blue-500/40", icon: ChefHat },
  completed: { label: "Faturado", color: "bg-emerald-500/15 text-emerald-700 border-emerald-500/40", icon: CheckCircle2 },
  rejected: { label: "Cancelado", color: "bg-muted text-muted-foreground border-border", icon: Ban },
};

const filters: { key: Filter; label: string }[] = [
  { key: "pending", label: "Pendentes" },
  { key: "pending_payment", label: "Aguard. PIX" },
  { key: "accepted", label: "Em preparo" },
  { key: "completed", label: "Faturados" },
  { key: "rejected", label: "Cancelados" },
  { key: "all", label: "Todos" },
];


export default function Cozinha() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<Filter>("pending");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [soundOn, setSoundOn] = useState(true);

  const load = async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("online_orders")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false });
    const ords = ((data ?? []) as any[]).map((o) => ({
      ...o,
      delivery_fee: Number(o.delivery_fee),
      subtotal: Number(o.subtotal),
      total: Number(o.total),
    })) as Order[];
    if (ords.length) {
      const { data: items } = await supabase
        .from("online_order_items")
        .select("online_order_id, product_name, quantity, unit_price, subtotal")
        .in("online_order_id", ords.map((o) => o.id));
      const by = new Map<string, Item[]>();
      (items ?? []).forEach((i: any) => {
        const arr = by.get(i.online_order_id) ?? [];
        arr.push({ ...i, quantity: Number(i.quantity), unit_price: Number(i.unit_price), subtotal: Number(i.subtotal) });
        by.set(i.online_order_id, arr);
      });
      ords.forEach((o) => (o.items = by.get(o.id) ?? []));
    }
    setOrders(ords);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("cozinha_online_orders")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "online_orders" }, () => {
        if (soundOn) beep();
        toast.info("🔔 Novo pedido recebido!");
        load();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "online_orders" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundOn]);

  const counts = useMemo(() => ({
    pending: orders.filter((o) => o.status === "pending").length,
    pending_payment: orders.filter((o) => o.status === "pending_payment").length,
    accepted: orders.filter((o) => o.status === "accepted").length,
    completed: orders.filter((o) => o.status === "completed").length,
    rejected: orders.filter((o) => o.status === "rejected").length,
    all: orders.length,
  }), [orders]);

  const visible = orders.filter((o) => {
    if (filter !== "all" && o.status !== filter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return String(o.order_number).includes(q) || o.customer_name.toLowerCase().includes(q);
    }
    return true;
  });

  const markAccepted = async (o: Order) => {
    const { error } = await supabase.from("online_orders")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", o.id);
    if (error) return toast.error("Erro ao aceitar");
    toast.success(`Pedido #${o.order_number} em preparo`);
  };

  const markCompleted = async (o: Order) => {
    const { error } = await supabase.from("online_orders").update({ status: "completed" }).eq("id", o.id);
    if (error) return toast.error("Erro ao concluir");
    toast.success(`Pedido #${o.order_number} concluído`);
  };

  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState<string>(CANCEL_REASONS[0]);
  const [cancelDetails, setCancelDetails] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const openCancel = (o: Order) => {
    setCancelTarget(o);
    setCancelReason(CANCEL_REASONS[0]);
    setCancelDetails("");
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    const reasonText = cancelDetails.trim()
      ? `${cancelReason} — ${cancelDetails.trim()}`
      : cancelReason;
    setCancelling(true);
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase.from("online_orders")
      .update({
        status: "rejected",
        cancellation_reason: reasonText,
        cancelled_at: new Date().toISOString(),
        cancelled_by: userRes.user?.id ?? null,
      })
      .eq("id", cancelTarget.id);
    setCancelling(false);
    if (error) return toast.error("Erro ao cancelar: " + error.message);
    toast.success(`Pedido #${cancelTarget.order_number} cancelado`);
    setCancelTarget(null);
  };


  return (
    <AppShell
      title="Cozinha"
      action={
        <Button size="sm" variant={soundOn ? "default" : "outline"} onClick={() => setSoundOn((v) => !v)}>
          <Bell className="h-4 w-4 mr-1" />{soundOn ? "Som on" : "Som off"}
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nº do pedido ou nome"
            className="pl-9"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {filters.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={filter === f.key ? "default" : "outline"}
              onClick={() => setFilter(f.key)}
              className="shrink-0"
            >
              {f.label}
              <Badge variant="secondary" className="ml-2">{(counts as any)[f.key]}</Badge>
            </Button>
          ))}
        </div>

        {loading ? (
          <p className="text-center text-muted-foreground py-10">Carregando...</p>
        ) : visible.length === 0 ? (
          <p className="text-center text-muted-foreground py-10">Nenhum pedido nesta lista.</p>
        ) : (
          <div className="space-y-3">
            {visible.map((o) => {
              const meta = statusMeta[o.status];
              const Icon = meta.icon;
              const isPix = o.payment_method === "pix";
              const paid = !!o.payment_confirmed_at || (isPix && o.status !== "pending_payment");
              return (
                <Card
                  key={o.id}
                  className={cn(
                    "p-4 border-2",
                    o.status === "pending" && "border-red-500/50 shadow-lg animate-pulse-slow",
                    o.status === "accepted" && "border-blue-500/40",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-display text-2xl leading-none">#{o.order_number}</h3>
                        <Badge className={cn("border", meta.color)}>
                          <Icon className="h-3 w-3 mr-1" />{meta.label}
                        </Badge>
                        <Badge variant="outline">
                          {o.order_type === "delivery" ? <><Bike className="h-3 w-3 mr-1" />Entrega</> : <><ShoppingBag className="h-3 w-3 mr-1" />Retirada</>}
                        </Badge>
                        {isPix && (
                          <Badge className={paid ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"}>
                            {paid ? "PIX pago" : "PIX pendente"}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 font-medium">{o.customer_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {o.customer_phone} · {new Date(o.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-xl">R$ {o.total.toFixed(2)}</p>
                      {o.sale_id && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                          <Receipt className="h-3 w-3" />Nota emitida
                        </p>
                      )}
                    </div>
                  </div>

                  {o.order_type === "delivery" && o.address_street && (
                    <p className="mt-2 text-sm">
                      📍 {o.address_street}, {o.address_number}
                      {o.address_complement && ` · ${o.address_complement}`}
                      {o.delivery_zone_name && ` · ${o.delivery_zone_name}`}
                    </p>
                  )}

                  <ul className="mt-3 border-t border-border pt-2 space-y-1 text-sm">
                    {(o.items ?? []).map((i, idx) => (
                      <li key={idx} className="flex justify-between">
                        <span><strong>{i.quantity}x</strong> {i.product_name}</span>
                        <span className="text-muted-foreground">R$ {i.subtotal.toFixed(2)}</span>
                      </li>
                    ))}
                  </ul>

                  {o.notes && (
                    <p className="mt-2 text-sm bg-muted/40 rounded p-2">📝 {o.notes}</p>
                  )}

                  {o.status === "rejected" && (o as any).cancellation_reason && (
                    <p className="mt-2 text-sm bg-destructive/10 text-destructive rounded p-2">
                      <Ban className="inline h-4 w-4 mr-1" />
                      Cancelado: {(o as any).cancellation_reason}
                    </p>
                  )}

                  <div className="mt-3 flex gap-2">
                    {o.status === "pending" && (
                      <Button className="flex-1" onClick={() => markAccepted(o)}>
                        <ChefHat className="h-4 w-4 mr-1" />Iniciar preparo
                      </Button>
                    )}
                    {o.status === "accepted" && (
                      <Button className="flex-1" variant="default" onClick={() => markCompleted(o)}>
                        <CheckCircle2 className="h-4 w-4 mr-1" />Marcar como pronto
                      </Button>
                    )}
                    {(o.status === "pending" || o.status === "pending_payment" || o.status === "accepted") && (
                      <Button variant="outline" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => openCancel(o)}>
                        <XCircle className="h-4 w-4 mr-1" />Cancelar
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!cancelTarget} onOpenChange={(v) => !v && setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar pedido #{cancelTarget?.order_number}</DialogTitle>
            <DialogDescription>
              O cliente será notificado em tempo real na tela de acompanhamento.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Motivo</Label>
              <div className="mt-2 space-y-1">
                {CANCEL_REASONS.map((r) => (
                  <label key={r} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="cancel-reason"
                      value={r}
                      checked={cancelReason === r}
                      onChange={() => setCancelReason(r)}
                    />
                    {r}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="cancel-details">Detalhes (opcional)</Label>
              <Textarea
                id="cancel-details"
                value={cancelDetails}
                onChange={(e) => setCancelDetails(e.target.value.slice(0, 300))}
                placeholder="Ex.: hambúrguer artesanal esgotou"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={cancelling}>
              Voltar
            </Button>
            <Button variant="destructive" onClick={confirmCancel} disabled={cancelling}>
              {cancelling ? "Cancelando..." : "Confirmar cancelamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
