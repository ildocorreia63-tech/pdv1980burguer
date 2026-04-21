import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { formatBRL, formatDate } from "@/lib/format";
import { Check, X, MapPin, Store, Phone, Clock, MessageCircle } from "lucide-react";
import { toast } from "sonner";

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
  status: "pending" | "accepted" | "rejected" | "completed";
  sale_id: string | null;
  created_at: string;
  items?: OrderItem[];
};

export default function PedidosOnline() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase
      .from("online_orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
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

  const visible = orders.filter((o) => filter === "all" ? true : o.status === "pending");

  return (
    <AppShell title="Pedidos Online">
      <div className="flex gap-2 mb-3">
        <Button size="sm" variant={filter === "pending" ? "default" : "outline"} onClick={() => setFilter("pending")}>
          Pendentes ({orders.filter((o) => o.status === "pending").length})
        </Button>
        <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
          Todos
        </Button>
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
            {filter === "pending" ? "Nenhum pedido pendente." : "Nenhum pedido ainda."}
          </p>
        )}
      </div>
    </AppShell>
  );
}

const StatusBadge = ({ status }: { status: Order["status"] }) => {
  const map = {
    pending: { label: "Pendente", cls: "bg-accent text-accent-foreground" },
    accepted: { label: "Aceito", cls: "bg-success text-success-foreground" },
    rejected: { label: "Recusado", cls: "bg-destructive text-destructive-foreground" },
    completed: { label: "Finalizado", cls: "bg-muted text-muted-foreground" },
  };
  const m = map[status];
  return <span className={`text-[10px] font-display tracking-wide px-2 py-0.5 rounded-full ${m.cls}`}>{m.label}</span>;
};
