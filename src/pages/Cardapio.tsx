import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo-1980.jpg";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, Minus, Trash2, ShoppingCart, Search, MapPin, Store, MessageCircle } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Product = { id: string; name: string; price: number; description: string | null; category_id: string | null };
type Category = { id: string; name: string };
type Zone = { id: string; name: string; fee: number };
type CartItem = { product: Product; qty: number };
type Settings = { store_name: string; whatsapp_number: string | null; welcome_message: string | null; menu_open: boolean };

export default function Cardapio() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [activeCat, setActiveCat] = useState("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  // checkout fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [orderType, setOrderType] = useState<"delivery" | "pickup">("delivery");
  const [zoneId, setZoneId] = useState<string>("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastOrderNum, setLastOrderNum] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const [p, c, z, s] = await Promise.all([
        supabase.from("products").select("id,name,price,description,category_id").eq("active", true).order("name"),
        supabase.from("categories").select("id,name").order("sort_order"),
        supabase.from("delivery_zones").select("id,name,fee").eq("active", true).order("sort_order"),
        supabase.from("store_settings").select("store_name,whatsapp_number,welcome_message,menu_open").maybeSingle(),
      ]);
      setProducts((p.data ?? []).map((x) => ({ ...x, price: Number(x.price) })));
      setCats(c.data ?? []);
      setZones((z.data ?? []).map((x) => ({ ...x, fee: Number(x.fee) })));
      setSettings(s.data as Settings | null);
    })();
  }, []);

  const filtered = useMemo(() => products.filter((p) => {
    if (activeCat !== "all" && p.category_id !== activeCat) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [products, activeCat, search]);

  const addToCart = (p: Product) => {
    setCart((c) => {
      const ex = c.find((x) => x.product.id === p.id);
      if (ex) return c.map((x) => x.product.id === p.id ? { ...x, qty: x.qty + 1 } : x);
      return [...c, { product: p, qty: 1 }];
    });
    toast.success(`${p.name} adicionado`, { duration: 1000 });
  };
  const setQty = (id: string, delta: number) => setCart((c) => c.map((x) => x.product.id === id ? { ...x, qty: x.qty + delta } : x).filter((x) => x.qty > 0));
  const removeItem = (id: string) => setCart((c) => c.filter((x) => x.product.id !== id));

  const subtotal = cart.reduce((s, x) => s + x.product.price * x.qty, 0);
  const totalQty = cart.reduce((s, x) => s + x.qty, 0);
  const selectedZone = zones.find((z) => z.id === zoneId);
  const deliveryFee = orderType === "delivery" ? (selectedZone?.fee ?? 0) : 0;
  const total = subtotal + deliveryFee;

  const submitOrder = async () => {
    if (cart.length === 0) return toast.error("Carrinho vazio");
    if (!name.trim()) return toast.error("Informe seu nome");
    if (!phone.trim()) return toast.error("Informe o telefone");
    if (orderType === "delivery") {
      if (!zoneId) return toast.error("Selecione o bairro");
      if (!street.trim() || !number.trim()) return toast.error("Informe rua e número");
    }
    setSubmitting(true);
    try {
      const { data: order, error } = await supabase
        .from("online_orders")
        .insert({
          customer_name: name.trim(),
          customer_phone: phone.trim(),
          order_type: orderType,
          delivery_zone_id: orderType === "delivery" ? zoneId : null,
          delivery_zone_name: orderType === "delivery" ? selectedZone?.name : null,
          delivery_fee: deliveryFee,
          address_street: orderType === "delivery" ? street.trim() : null,
          address_number: orderType === "delivery" ? number.trim() : null,
          address_complement: orderType === "delivery" ? (complement.trim() || null) : null,
          address_reference: orderType === "delivery" ? (reference.trim() || null) : null,
          subtotal,
          total,
          notes: notes.trim() || null,
        })
        .select("id, order_number")
        .single();
      if (error) throw error;

      const items = cart.map((c) => ({
        online_order_id: order.id,
        product_id: c.product.id,
        product_name: c.product.name,
        unit_price: c.product.price,
        quantity: c.qty,
        subtotal: c.product.price * c.qty,
      }));
      const { error: e2 } = await supabase.from("online_order_items").insert(items);
      if (e2) throw e2;

      // Build WhatsApp message
      const lines: string[] = [];
      lines.push(`*Novo Pedido #${order.order_number}*`);
      lines.push(`*Cliente:* ${name.trim()}`);
      lines.push(`*Telefone:* ${phone.trim()}`);
      lines.push("");
      lines.push(orderType === "delivery" ? "*Entrega*" : "*Retirada no local*");
      if (orderType === "delivery") {
        lines.push(`Bairro: ${selectedZone?.name} (${formatBRL(deliveryFee)})`);
        lines.push(`Endereço: ${street}, ${number}${complement ? ` - ${complement}` : ""}`);
        if (reference) lines.push(`Referência: ${reference}`);
      }
      lines.push("");
      lines.push("*Itens:*");
      cart.forEach((c) => lines.push(`• ${c.qty}x ${c.product.name} — ${formatBRL(c.product.price * c.qty)}`));
      lines.push("");
      lines.push(`*Subtotal:* ${formatBRL(subtotal)}`);
      if (deliveryFee > 0) lines.push(`*Taxa entrega:* ${formatBRL(deliveryFee)}`);
      lines.push(`*Total:* ${formatBRL(total)}`);
      if (notes) {
        lines.push("");
        lines.push(`*Obs:* ${notes}`);
      }
      const msg = encodeURIComponent(lines.join("\n"));
      const wpp = (settings?.whatsapp_number ?? "").replace(/\D/g, "");
      const url = wpp ? `https://wa.me/${wpp}?text=${msg}` : `https://wa.me/?text=${msg}`;
      window.open(url, "_blank");

      setLastOrderNum(order.order_number);
      setConfirmOpen(true);
      setCheckoutOpen(false);
      setCartOpen(false);
      setCart([]);
      setName(""); setPhone(""); setStreet(""); setNumber(""); setComplement(""); setReference(""); setNotes(""); setZoneId("");
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao enviar pedido");
    } finally {
      setSubmitting(false);
    }
  };

  if (settings && !settings.menu_open) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <img src={logo} alt={settings.store_name} className="h-24 w-24 rounded-2xl mb-4" />
        <h1 className="font-display text-3xl">{settings.store_name}</h1>
        <p className="mt-3 text-muted-foreground">Estamos fechados no momento. Volte mais tarde!</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 bg-background">
      {/* Hero */}
      <header className="bg-gradient-to-br from-primary to-primary-glow text-primary-foreground">
        <div className="mx-auto max-w-2xl px-4 pt-6 pb-8 flex items-center gap-4">
          <div className="h-20 w-20 rounded-2xl bg-black/30 ring-2 ring-white/30 overflow-hidden flex items-center justify-center p-1 shrink-0">
            <img src={logo} alt={settings?.store_name ?? "Loja"} className="h-full w-full object-contain" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-3xl leading-none">{settings?.store_name ?? "Cardápio"}</h1>
            <p className="text-sm opacity-90 mt-1">{settings?.welcome_message}</p>
          </div>
        </div>
      </header>

      {/* Search + Categories */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border">
        <div className="mx-auto max-w-2xl px-4 py-3 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
            <Chip label="Tudo" active={activeCat === "all"} onClick={() => setActiveCat("all")} />
            {cats.map((c) => <Chip key={c.id} label={c.name} active={activeCat === c.id} onClick={() => setActiveCat(c.id)} />)}
          </div>
        </div>
      </div>

      {/* Products */}
      <main className="mx-auto max-w-2xl px-4 py-4">
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((p) => (
            <button key={p.id} onClick={() => addToCart(p)} className="text-left rounded-xl border border-border bg-card p-3 shadow-card-retro active:scale-[0.97] transition">
              <p className="font-display text-base leading-tight line-clamp-2">{p.name}</p>
              <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2 min-h-[28px]">{p.description}</p>
              <p className="mt-2 font-display text-lg text-primary">{formatBRL(p.price)}</p>
            </button>
          ))}
        </div>
        {filtered.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Nenhum produto.</p>}
      </main>

      {/* Floating cart */}
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetTrigger asChild>
          <button
            disabled={cart.length === 0}
            className={cn(
              "fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 rounded-full bg-primary text-primary-foreground px-6 py-3.5 shadow-retro font-display text-base transition",
              cart.length === 0 && "opacity-0 pointer-events-none scale-90"
            )}
          >
            <ShoppingCart className="h-5 w-5" />
            <span>{totalQty} {totalQty === 1 ? "item" : "itens"}</span>
            <span className="font-semibold">{formatBRL(subtotal)}</span>
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader><SheetTitle className="font-display text-2xl text-left">Seu pedido</SheetTitle></SheetHeader>
          <div className="mt-3 space-y-2">
            {cart.map((it) => (
              <Card key={it.product.id} className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{it.product.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBRL(it.product.price)} × {it.qty} = {formatBRL(it.product.price * it.qty)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setQty(it.product.id, -1)}><Minus className="h-3 w-3" /></Button>
                  <span className="w-7 text-center font-display text-lg">{it.qty}</span>
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setQty(it.product.id, 1)}><Plus className="h-3 w-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeItem(it.product.id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </Card>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
            <span className="font-display text-lg">Subtotal</span>
            <span className="font-display text-2xl text-primary">{formatBRL(subtotal)}</span>
          </div>
          <Button className="w-full mt-3 h-12 font-display text-lg" onClick={() => { setCartOpen(false); setCheckoutOpen(true); }}>
            Continuar
          </Button>
        </SheetContent>
      </Sheet>

      {/* Checkout */}
      <Sheet open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
          <SheetHeader><SheetTitle className="font-display text-2xl text-left">Finalizar pedido</SheetTitle></SheetHeader>

          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setOrderType("delivery")}
                className={cn("rounded-lg border-2 p-3 flex flex-col items-center gap-1 transition",
                  orderType === "delivery" ? "border-primary bg-primary/10" : "border-border bg-card")}
              >
                <MapPin className="h-5 w-5" />
                <span className="font-display text-sm">Entrega</span>
              </button>
              <button
                onClick={() => setOrderType("pickup")}
                className={cn("rounded-lg border-2 p-3 flex flex-col items-center gap-1 transition",
                  orderType === "pickup" ? "border-primary bg-primary/10" : "border-border bg-card")}
              >
                <Store className="h-5 w-5" />
                <span className="font-display text-sm">Retirada</span>
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div><Label>Nome *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" /></div>
              <div><Label>Telefone (WhatsApp) *</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" inputMode="tel" /></div>
            </div>

            {orderType === "delivery" && (
              <div className="space-y-3 rounded-lg border border-border p-3">
                <div>
                  <Label>Bairro *</Label>
                  {zones.length === 0 ? (
                    <p className="text-xs text-destructive mt-1">Nenhum bairro cadastrado.</p>
                  ) : (
                    <RadioGroup value={zoneId} onValueChange={setZoneId} className="mt-2">
                      {zones.map((z) => (
                        <label key={z.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2 cursor-pointer">
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value={z.id} id={z.id} />
                            <span className="text-sm">{z.name}</span>
                          </div>
                          <span className="text-xs font-medium">{formatBRL(z.fee)}</span>
                        </label>
                      ))}
                    </RadioGroup>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2"><Label>Rua *</Label><Input value={street} onChange={(e) => setStreet(e.target.value)} /></div>
                  <div><Label>Nº *</Label><Input value={number} onChange={(e) => setNumber(e.target.value)} /></div>
                </div>
                <div><Label>Complemento</Label><Input value={complement} onChange={(e) => setComplement(e.target.value)} placeholder="Apto, bloco..." /></div>
                <div><Label>Referência</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Próximo a..." /></div>
              </div>
            )}

            <div><Label>Observação</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Sem cebola, ponto da carne..." /></div>

            <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatBRL(subtotal)}</span></div>
              {orderType === "delivery" && <div className="flex justify-between"><span>Taxa de entrega</span><span>{formatBRL(deliveryFee)}</span></div>}
              <div className="flex justify-between font-display text-lg pt-2 border-t border-border"><span>Total</span><span className="text-primary">{formatBRL(total)}</span></div>
            </div>

            <Button className="w-full h-12 font-display text-lg gap-2" onClick={submitOrder} disabled={submitting}>
              <MessageCircle className="h-5 w-5" />
              Enviar pedido pelo WhatsApp
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">Pagamento combinado pelo WhatsApp.</p>
          </div>
        </SheetContent>
      </Sheet>

      {/* Confirmação */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Pedido enviado! 🎉</DialogTitle></DialogHeader>
          <p className="text-sm">Seu pedido <strong>#{lastOrderNum}</strong> foi recebido pela loja. Continue a conversa pelo WhatsApp para combinar o pagamento.</p>
          <Button onClick={() => setConfirmOpen(false)}>Fechar</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Chip = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <button onClick={onClick} className={cn(
    "shrink-0 rounded-full border px-3 py-1.5 text-xs font-display tracking-wide transition",
    active ? "bg-primary text-primary-foreground border-primary shadow-card-retro" : "bg-card text-foreground border-border"
  )}>{label}</button>
);
