import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Clock, CreditCard, Package, Receipt, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Order = {
  id: string;
  order_number: number;
  customer_name: string;
  status: string;
  payment_method: string | null;
  payment_confirmed_at: string | null;
  accepted_at: string | null;
  accepted_by: string | null;
  sale_id: string | null;
  total: number;
  subtotal: number;
  delivery_fee: number;
  order_type: string;
  created_at: string;
  cancellation_reason: string | null;
  cancelled_at: string | null;
};

type Item = { id: string; product_name: string; quantity: number; subtotal: number };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Acompanhar() {
  const { orderId } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    let mounted = true;

    const load = async () => {
      const { data, error } = await supabase
        .from("online_orders")
        .select("id, order_number, customer_name, status, payment_method, payment_confirmed_at, accepted_at, accepted_by, sale_id, total, subtotal, delivery_fee, order_type, created_at, cancellation_reason, cancelled_at")
        .eq("id", orderId)
        .maybeSingle();
      if (!mounted) return;
      if (error || !data) { setNotFound(true); setLoading(false); return; }
      setOrder(data as Order);

      const { data: its } = await supabase
        .from("online_order_items")
        .select("id, product_name, quantity, subtotal")
        .eq("online_order_id", orderId);
      if (mounted) setItems((its as Item[]) ?? []);
      setLoading(false);
    };

    load();

    const channel = supabase
      .channel(`order-${orderId}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "online_orders", filter: `id=eq.${orderId}` },
        (payload) => { setOrder(payload.new as Order); }
      )
      .subscribe();

    return () => { mounted = false; supabase.removeChannel(channel); };
  }, [orderId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <h1 className="font-display text-2xl mb-2">Pedido não encontrado</h1>
        <p className="text-sm text-muted-foreground mb-4">O link pode ter expirado (pedidos ficam disponíveis por 7 dias).</p>
        <Button asChild><Link to="/cardapio">Voltar ao cardápio</Link></Button>
      </div>
    );
  }

  const isPix = order.payment_method === "pix";
  const paid = !!order.payment_confirmed_at || (!isPix && !!order.accepted_by);
  const accepted = !!order.accepted_by;
  const invoiced = !!order.sale_id;
  const rejected = order.status === "rejected";

  const steps = [
    { key: "received", label: "Recebido", icon: Clock, done: true },
    { key: "paid", label: isPix ? "Pago" : "Pagamento na entrega", icon: CreditCard, done: paid || !isPix },
    { key: "accepted", label: "Aceito pela loja", icon: Package, done: accepted },
    { key: "invoiced", label: "Faturado", icon: Receipt, done: invoiced },
  ];

  const activeIndex = rejected ? -1 : steps.findIndex((s) => !s.done);
  const currentIdx = activeIndex === -1 ? steps.length - 1 : activeIndex;

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="bg-gradient-to-br from-primary to-primary-glow text-primary-foreground px-4 py-6 shadow-md">
        <div className="mx-auto max-w-xl">
          <p className="text-xs opacity-80 font-display tracking-wide">ACOMPANHE SEU PEDIDO</p>
          <h1 className="font-display text-3xl mt-1">Pedido #{order.order_number}</h1>
          <p className="text-sm opacity-90 mt-1">Olá, {order.customer_name}!</p>
        </div>
      </header>

      <div className="mx-auto max-w-xl px-4 mt-6 space-y-4">
        {rejected ? (
          <Card className="p-4 border-destructive/50 bg-destructive/5">
            <p className="font-semibold text-destructive">Pedido cancelado pela loja</p>
            {order.cancellation_reason && (
              <p className="text-sm mt-2"><span className="font-medium">Motivo:</span> {order.cancellation_reason}</p>
            )}
            <p className="text-sm text-muted-foreground mt-2">Entre em contato via WhatsApp para mais informações.</p>
          </Card>
        ) : (
          <Card className="p-4">
            <div className="space-y-4">
              {steps.map((step, idx) => {
                const isDone = step.done;
                const isCurrent = idx === currentIdx && !isDone;
                const Icon = step.icon;
                return (
                  <div key={step.key} className="flex items-center gap-3">
                    <div className={cn(
                      "h-10 w-10 rounded-full flex items-center justify-center shrink-0 border-2 transition",
                      isDone && "bg-primary border-primary text-primary-foreground",
                      isCurrent && "border-primary text-primary animate-pulse",
                      !isDone && !isCurrent && "border-muted text-muted-foreground",
                    )}>
                      {isDone ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                    </div>
                    <div className="flex-1">
                      <p className={cn(
                        "font-display",
                        isDone && "text-foreground",
                        isCurrent && "text-primary font-semibold",
                        !isDone && !isCurrent && "text-muted-foreground",
                      )}>{step.label}</p>
                      {isCurrent && <p className="text-xs text-muted-foreground">Em andamento...</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        <Card className="p-4">
          <h2 className="font-display text-lg mb-3">Itens</h2>
          <ul className="space-y-2 text-sm">
            {items.map((i) => (
              <li key={i.id} className="flex justify-between">
                <span>{i.quantity}× {i.product_name}</span>
                <span className="text-muted-foreground">{brl(i.subtotal)}</span>
              </li>
            ))}
          </ul>
          <div className="border-t mt-3 pt-3 space-y-1 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>{brl(order.subtotal)}</span></div>
            {order.order_type === "delivery" && (
              <div className="flex justify-between"><span>Entrega</span><span>{brl(order.delivery_fee)}</span></div>
            )}
            <div className="flex justify-between font-display text-lg pt-1"><span>Total</span><span>{brl(order.total)}</span></div>
          </div>
        </Card>

        {invoiced && (
          <Card className="p-4 bg-primary/5 border-primary/30">
            <p className="text-sm">
              <Receipt className="inline h-4 w-4 mr-1" />
              Nota do pedido: <span className="font-mono">{order.sale_id?.slice(0, 8).toUpperCase()}</span>
            </p>
          </Card>
        )}

        <div className="flex gap-2">
          <Button asChild variant="outline" className="flex-1">
            <Link to="/cardapio">Voltar ao cardápio</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
