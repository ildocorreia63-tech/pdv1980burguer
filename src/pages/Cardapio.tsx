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
import { Plus, Minus, Trash2, ShoppingCart, Search, MapPin, Store, MessageCircle, QrCode, Copy, Download, Check } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import QRCode from "qrcode";
import { buildPixPayload } from "@/lib/pix";
import { BusinessHours, isOpenNow, nextOpeningLabel } from "@/lib/businessHours";
import { usePersistentState, clearPersistentState } from "@/hooks/usePersistentState";

const CART_KEY = "cardapio:cart:v1";
const CHECKOUT_KEY = "cardapio:checkout:v1";

type Product = { id: string; name: string; price: number; description: string | null; category_id: string | null; image_url: string | null; active: boolean };
type Category = { id: string; name: string };
type Zone = { id: string; name: string; fee: number };
type CartItem = { product: Product; qty: number; unavailable?: boolean };
type Settings = { store_name: string; whatsapp_number: string | null; welcome_message: string | null; menu_open: boolean; business_hours: BusinessHours | null; banner_url: string | null; banner_enabled: boolean };

export default function Cardapio() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [activeCat, setActiveCat] = useState("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = usePersistentState<CartItem[]>(CART_KEY, []);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  // checkout fields (persisted as a single object)
  type CheckoutData = {
    name: string; phone: string;
    orderType: "delivery" | "pickup";
    zoneId: string;
    street: string; number: string; complement: string; reference: string;
    notes: string;
    paymentMethod: "cash" | "pix" | "card_delivery";
    changeFor: string;
  };
  const defaultCheckout: CheckoutData = {
    name: "", phone: "", orderType: "delivery", zoneId: "",
    street: "", number: "", complement: "", reference: "",
    notes: "", paymentMethod: "pix", changeFor: "",
  };
  const [checkout, setCheckout] = usePersistentState<CheckoutData>(CHECKOUT_KEY, defaultCheckout);
  const { name, phone, orderType, zoneId, street, number, complement, reference, notes, paymentMethod, changeFor } = checkout;
  const setName = (v: string) => setCheckout((c) => ({ ...c, name: v }));
  const setPhone = (v: string) => setCheckout((c) => ({ ...c, phone: v }));
  const setOrderType = (v: "delivery" | "pickup") => setCheckout((c) => ({ ...c, orderType: v }));
  const setZoneId = (v: string) => setCheckout((c) => ({ ...c, zoneId: v }));
  const setStreet = (v: string) => setCheckout((c) => ({ ...c, street: v }));
  const setNumber = (v: string) => setCheckout((c) => ({ ...c, number: v }));
  const setComplement = (v: string) => setCheckout((c) => ({ ...c, complement: v }));
  const setReference = (v: string) => setCheckout((c) => ({ ...c, reference: v }));
  const setNotes = (v: string) => setCheckout((c) => ({ ...c, notes: v }));
  const setPaymentMethod = (v: "cash" | "pix" | "card_delivery") => setCheckout((c) => ({ ...c, paymentMethod: v }));
  const setChangeFor = (v: string) => setCheckout((c) => ({ ...c, changeFor: v }));
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastOrderNum, setLastOrderNum] = useState<number | null>(null);
  const [pixOpen, setPixOpen] = useState(false);
  const [pixPayload, setPixPayload] = useState("");
  const [pixQrDataUrl, setPixQrDataUrl] = useState("");
  const [pixCopied, setPixCopied] = useState(false);
  const [pixPaid, setPixPaid] = useState(false);
  const [pixChecking, setPixChecking] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<{ id: string; order_number: number } | null>(null);

  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const loadProducts = async () => {
    const { data } = await supabase
      .from("products")
      .select("id,name,price,description,category_id,image_url,active")
      .order("name");
    const list = (data ?? []).map((x) => ({ ...x, price: Number(x.price) }));
    setProducts(list);
    // Sync cart items: update fresh data; mark unavailable when product not found or inactive.
    setCart((c) =>
      c.map((it) => {
        const fresh = list.find((p) => p.id === it.product.id);
        if (!fresh) return { ...it, unavailable: true };
        return { ...it, product: fresh, unavailable: !fresh.active };
      })
    );
  };

  useEffect(() => {
    (async () => {
      const [c, z, s] = await Promise.all([
        supabase.from("categories").select("id,name").order("sort_order"),
        supabase.from("delivery_zones").select("id,name,fee").eq("active", true).order("sort_order"),
        supabase.from("public_store_settings" as any).select("store_name,whatsapp_number,welcome_message,menu_open,business_hours,banner_url,banner_enabled").maybeSingle(),
      ]);
      setCats(c.data ?? []);
      setZones((z.data ?? []).map((x) => ({ ...x, fee: Number(x.fee) })));
      setSettings(s.data as unknown as Settings | null);
    })();
    loadProducts();

    const channel = supabase
      .channel("cardapio_products")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => loadProducts())
      .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, async () => {
        const { data } = await supabase.from("categories").select("id,name").order("sort_order");
        setCats(data ?? []);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => products.filter((p) => {
    const inCart = cart.some((c) => c.product.id === p.id);
    if (!p.active && !inCart) return false;
    if (activeCat !== "all" && p.category_id !== activeCat) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [products, activeCat, search, cart]);


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

  const unavailableCount = cart.filter((x) => x.unavailable).length;
  const subtotal = cart.reduce((s, x) => s + (x.unavailable ? 0 : x.product.price * x.qty), 0);
  const totalQty = cart.reduce((s, x) => s + (x.unavailable ? 0 : x.qty), 0);
  const selectedZone = zones.find((z) => z.id === zoneId);
  const deliveryFee = orderType === "delivery" ? (selectedZone?.fee ?? 0) : 0;
  const total = subtotal + deliveryFee;

  const paymentLabel = (m: string) => m === "cash" ? "Dinheiro" : m === "pix" ? "PIX" : "Cartão na entrega";

  const copyPix = async () => {
    try {
      await navigator.clipboard.writeText(pixPayload);
      setPixCopied(true);
      toast.success("Código PIX copiado");
      setTimeout(() => setPixCopied(false), 2500);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const downloadPixQr = () => {
    const a = document.createElement("a");
    a.href = pixQrDataUrl;
    a.download = `pix-${formatBRL(total).replace(/\D/g, "")}.png`;
    a.click();
  };

  // Poll Asaas for payment confirmation while QR dialog is open
  useEffect(() => {
    if (!pixOpen || !pendingOrder || pixPaid) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      setPixChecking(true);
      try {
        const { data } = await supabase.functions.invoke("asaas-check-payment", {
          body: { order_id: pendingOrder.id },
        });
        if (!cancelled && data?.paid) {
          setPixPaid(true);
          toast.success("Pagamento confirmado! ✅");
        }
      } catch {/* ignore */}
      setPixChecking(false);
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [pixOpen, pendingOrder, pixPaid]);

  const buildWhatsappMessage = (orderNumber: number, paid: boolean) => {
    const lines: string[] = [];
    lines.push(`*Novo Pedido #${orderNumber}*`);
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
    cart.filter((c) => !c.unavailable).forEach((c) => lines.push(`• ${c.qty}x ${c.product.name} — ${formatBRL(c.product.price * c.qty)}`));
    lines.push("");
    lines.push(`*Subtotal:* ${formatBRL(subtotal)}`);
    if (deliveryFee > 0) lines.push(`*Taxa entrega:* ${formatBRL(deliveryFee)}`);
    lines.push(`*Total:* ${formatBRL(total)}`);
    lines.push("");
    lines.push("━━━━━━━━━━━━━━━");
    const changeForNum = paymentMethod === "cash" && changeFor ? Number(changeFor.replace(",", ".")) : null;
    if (paymentMethod === "pix") {
      lines.push(paid ? `💸 *PIX PAGO E CONFIRMADO PELO BANCO* ✅` : `💸 *PIX — aguardando pagamento*`);
    } else if (paymentMethod === "cash") {
      lines.push(`💵 *PAGAMENTO: DINHEIRO NA ENTREGA*`);
      if (changeForNum) lines.push(`*Troco para:* ${formatBRL(changeForNum)} (levar ${formatBRL(changeForNum - total)})`);
      else lines.push(`*Não precisa de troco*`);
    } else {
      lines.push(`💳 *PAGAMENTO: CARTÃO NA ENTREGA*`);
    }
    lines.push("━━━━━━━━━━━━━━━");
    if (notes) { lines.push(""); lines.push(`*Obs:* ${notes}`); }
    return lines.join("\n");
  };

  const sendWhatsapp = (orderNumber: number, paid: boolean) => {
    const msg = encodeURIComponent(buildWhatsappMessage(orderNumber, paid));
    const wpp = (settings?.whatsapp_number ?? "").replace(/\D/g, "");
    const url = wpp ? `https://wa.me/${wpp}?text=${msg}` : `https://wa.me/?text=${msg}`;
    window.open(url, "_blank");
  };

  const finishAndReset = (orderNumber: number) => {
    setLastOrderNum(orderNumber);
    setConfirmOpen(true);
    setPixOpen(false);
    setCheckoutOpen(false);
    setCartOpen(false);
    setCart([]);
    setCheckout(defaultCheckout);
    clearPersistentState(CART_KEY);
    clearPersistentState(CHECKOUT_KEY);
    setPendingOrder(null); setPixPaid(false); setPixPayload(""); setPixQrDataUrl("");
  };

  const submitOrder = async () => {
    const availableCart = cart.filter((x) => !x.unavailable);
    if (availableCart.length === 0) return toast.error("Nenhum item disponível no carrinho");
    if (!name.trim()) return toast.error("Informe seu nome");
    if (!phone.trim()) return toast.error("Informe o telefone");
    if (orderType === "delivery") {
      if (!zoneId) return toast.error("Selecione o bairro");
      if (!street.trim() || !number.trim()) return toast.error("Informe rua e número");
    }
    const changeForNum = paymentMethod === "cash" && changeFor ? Number(changeFor.replace(",", ".")) : null;
    if (paymentMethod === "cash" && changeForNum !== null && (isNaN(changeForNum) || changeForNum < total)) {
      return toast.error("Troco para um valor maior que o total");
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
          payment_method: paymentMethod,
          payment_change_for: changeForNum,
          status: paymentMethod === "pix" ? "pending_payment" : "pending",
        } as any)
        .select("id, order_number")
        .single();
      if (error) throw error;

      const items = availableCart.map((c) => ({
        online_order_id: order.id,
        product_id: c.product.id,
        product_name: c.product.name,
        unit_price: c.product.price,
        quantity: c.qty,
        subtotal: c.product.price * c.qty,
      }));
      const { error: e2 } = await supabase.from("online_order_items").insert(items);
      if (e2) throw e2;

      if (paymentMethod === "pix") {
        // Create Asaas charge and open QR dialog
        const { data: pix, error: pixErr } = await supabase.functions.invoke("asaas-create-pix", {
          body: { order_id: order.id },
        });
        if (pixErr || pix?.error) throw new Error(pix?.error || pixErr?.message || "Erro ao gerar PIX");
        setPixPayload(pix.payload);
        setPixQrDataUrl(`data:image/png;base64,${pix.qr_code}`);
        setPendingOrder({ id: order.id, order_number: order.order_number });
        setPixPaid(false);
        setPixCopied(false);
        setPixOpen(true);
      } else {
        sendWhatsapp(order.order_number, false);
        finishAndReset(order.order_number);
      }
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao enviar pedido");
    } finally {
      setSubmitting(false);
    }
  };


  const openByHours = isOpenNow(settings?.business_hours ?? null);
  const isClosed = settings ? (!settings.menu_open || !openByHours) : false;
  const closedReason = settings && !settings.menu_open
    ? "Estamos fechados no momento. Volte mais tarde!"
    : nextOpeningLabel(settings?.business_hours ?? null) || "Estamos fora do horário de atendimento.";

  if (isClosed) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <img src={logo} alt={settings?.store_name} className="h-24 w-24 rounded-2xl mb-4" />
        <h1 className="font-display text-3xl">{settings?.store_name}</h1>
        <p className="mt-3 text-muted-foreground">{closedReason}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 bg-background">
      {/* Hero */}
      <header className="bg-gradient-to-br from-primary to-primary-glow text-primary-foreground">
        {settings?.banner_enabled && settings?.banner_url && (
          <div className="mx-auto max-w-2xl px-4 pt-4">
            <img
              src={settings.banner_url}
              alt={`Banner ${settings?.store_name ?? ""}`}
              className="w-full h-40 sm:h-56 object-cover rounded-xl ring-2 ring-white/30 shadow-lg"
              loading="eager"
            />
          </div>
        )}
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
            <button
              key={p.id}
              onClick={() => p.active && addToCart(p)}
              disabled={!p.active}
              className={cn(
                "text-left rounded-xl border border-border bg-card overflow-hidden shadow-card-retro transition flex flex-col relative",
                p.active ? "active:scale-[0.97]" : "opacity-60 cursor-not-allowed"
              )}
            >
              <div className="aspect-square w-full bg-muted overflow-hidden relative">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} loading="lazy" className={cn("h-full w-full object-cover", !p.active && "grayscale")} />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-muted-foreground text-[10px]">Sem foto</div>
                )}
                {!p.active && (
                  <span className="absolute top-2 left-2 rounded-full bg-destructive text-destructive-foreground text-[10px] font-display px-2 py-0.5">
                    Indisponível
                  </span>
                )}
              </div>
              <div className="p-3 flex-1 flex flex-col">
                <p className="font-display text-base leading-tight line-clamp-2">{p.name}</p>
                <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2 min-h-[28px]">{p.description}</p>
                <p className="mt-2 font-display text-lg text-primary">{formatBRL(p.price)}</p>
              </div>
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
          {unavailableCount > 0 && (
            <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 text-destructive p-3 text-sm">
              {unavailableCount === 1 ? "1 item está indisponível" : `${unavailableCount} itens estão indisponíveis`} e não será incluído no pedido. Remova ou aguarde a reposição.
            </div>
          )}
          <div className="mt-3 space-y-2">
            {cart.map((it) => (
              <Card key={it.product.id} className={cn("p-3 flex items-center gap-3", it.unavailable && "opacity-70 border-destructive/40")}>
                <div className="h-12 w-12 shrink-0 rounded-md overflow-hidden bg-muted">
                  {it.product.image_url ? (
                    <img src={it.product.image_url} alt={it.product.name} loading="lazy" className={cn("h-full w-full object-cover", it.unavailable && "grayscale")} />
                  ) : null}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{it.product.name}</p>
                  {it.unavailable ? (
                    <p className="text-xs font-medium text-destructive">Indisponível no momento</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">{formatBRL(it.product.price)} × {it.qty} = {formatBRL(it.product.price * it.qty)}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setQty(it.product.id, -1)} disabled={it.unavailable}><Minus className="h-3 w-3" /></Button>
                  <span className="w-7 text-center font-display text-lg">{it.qty}</span>
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setQty(it.product.id, 1)} disabled={it.unavailable}><Plus className="h-3 w-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeItem(it.product.id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </Card>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
            <span className="font-display text-lg">Subtotal</span>
            <span className="font-display text-2xl text-primary">{formatBRL(subtotal)}</span>
          </div>
          <Button className="w-full mt-3 h-12 font-display text-lg" onClick={() => { setCartOpen(false); setCheckoutOpen(true); }} disabled={totalQty === 0}>
            Continuar
          </Button>
          <Button
            variant="outline"
            className="w-full mt-2 text-destructive"
            onClick={() => {
              if (!confirm("Limpar carrinho e dados do pedido?")) return;
              setCart([]);
              setCheckout(defaultCheckout);
              clearPersistentState(CART_KEY);
              clearPersistentState(CHECKOUT_KEY);
              setCartOpen(false);
              toast.success("Dados do pedido apagados");
            }}
          >
            <Trash2 className="h-4 w-4 mr-1" /> Limpar dados do pedido
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

            {/* Forma de pagamento */}
            <div className="space-y-2">
              <Label>Forma de pagamento *</Label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { v: "pix", label: "PIX", icon: "💸" },
                  { v: "cash", label: "Dinheiro", icon: "💵" },
                  { v: "card_delivery", label: "Cartão", icon: "💳" },
                ] as const).map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setPaymentMethod(opt.v)}
                    className={cn(
                      "rounded-lg border-2 p-2 flex flex-col items-center gap-0.5 transition",
                      paymentMethod === opt.v ? "border-primary bg-primary/10" : "border-border bg-card"
                    )}
                  >
                    <span className="text-lg leading-none">{opt.icon}</span>
                    <span className="font-display text-xs">{opt.label}</span>
                  </button>
                ))}
              </div>
              {paymentMethod === "cash" && (
                <div>
                  <Label className="text-xs">Troco para (opcional)</Label>
                  <Input
                    inputMode="decimal"
                    placeholder="Ex: 50"
                    value={changeFor}
                    onChange={(e) => setChangeFor(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">Deixe vazio se não precisar de troco.</p>
                </div>
              )}
              {paymentMethod === "pix" && (
                <div className="rounded-md bg-primary/5 border border-primary/20 p-2 space-y-1">
                  <p className="text-[11px] text-muted-foreground">
                    💡 Após enviar, geramos um QR Code PIX. <strong>O pagamento é confirmado automaticamente pelo banco</strong> e o pedido segue para o WhatsApp.
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatBRL(subtotal)}</span></div>
              {orderType === "delivery" && <div className="flex justify-between"><span>Taxa de entrega</span><span>{formatBRL(deliveryFee)}</span></div>}
              <div className="flex justify-between font-display text-lg pt-2 border-t border-border"><span>Total</span><span className="text-primary">{formatBRL(total)}</span></div>
            </div>

            <Button className="w-full h-12 font-display text-lg gap-2" onClick={submitOrder} disabled={submitting}>
              {paymentMethod === "pix" ? <><QrCode className="h-5 w-5" /> Gerar PIX e enviar</> : <><MessageCircle className="h-5 w-5" /> Enviar pedido pelo WhatsApp</>}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              {paymentMethod === "pix"
                ? "Pague o PIX para o pedido seguir automaticamente para o WhatsApp."
                : "Confirme detalhes do pagamento na conversa do WhatsApp."}
            </p>
          </div>
        </SheetContent>
      </Sheet>

      {/* Confirmação */}
      {/* PIX QR Code */}
      <Dialog open={pixOpen} onOpenChange={(o) => { if (!o && !pixPaid) return; setPixOpen(o); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              {pixPaid ? "Pagamento confirmado ✅" : "Pague com PIX"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {!pixPaid && pixQrDataUrl && (
              <div className="rounded-lg bg-white p-3 flex items-center justify-center">
                <img src={pixQrDataUrl} alt="QR Code PIX" className="w-full max-w-[260px] h-auto" />
              </div>
            )}
            <div className="rounded-md bg-muted/60 p-2 text-center">
              <p className="text-xs text-muted-foreground">Valor</p>
              <p className="font-display text-2xl text-primary">{formatBRL(total)}</p>
              {pendingOrder && <p className="text-[11px] text-muted-foreground mt-1">Pedido #{pendingOrder.order_number}</p>}
            </div>

            {!pixPaid && (
              <>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">PIX Copia e Cola</p>
                  <div className="rounded-md border border-border bg-muted/40 p-2 text-[11px] font-mono break-all max-h-24 overflow-y-auto">
                    {pixPayload}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={copyPix} className="gap-2">
                    {pixCopied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                    {pixCopied ? "Copiado" : "Copiar código"}
                  </Button>
                  <Button variant="outline" onClick={downloadPixQr} className="gap-2">
                    <Download className="h-4 w-4" /> Baixar QR
                  </Button>
                </div>
                <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-2 text-center">
                  <p className="text-xs">
                    {pixChecking ? "🔄 Verificando pagamento..." : "⏳ Aguardando pagamento (verifica a cada 5s)"}
                  </p>
                </div>
              </>
            )}

            {pixPaid && pendingOrder && (
              <>
                <div className="rounded-md bg-success/10 border border-success/30 p-3 text-center">
                  <p className="text-sm">Recebemos seu pagamento! Clique para enviar o pedido para a loja pelo WhatsApp.</p>
                </div>
                <Button
                  className="w-full h-12 font-display text-lg gap-2"
                  onClick={() => { sendWhatsapp(pendingOrder.order_number, true); finishAndReset(pendingOrder.order_number); }}
                >
                  <MessageCircle className="h-5 w-5" /> Enviar para o WhatsApp
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

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
