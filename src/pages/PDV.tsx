import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Plus, Minus, Trash2, ShoppingCart, Search, ImageIcon, Utensils, Store, RotateCcw } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { CheckoutSheet } from "@/components/pdv/CheckoutSheet";
import { ReceiptDialog } from "@/components/pdv/ReceiptDialog";
import type { ReceiptData } from "@/lib/receipt";
import { usePersistentState, clearPersistentState } from "@/hooks/usePersistentState";

const CARTS_KEY = "pdv:carts:v2";
const ACTIVE_TABLE_KEY = "pdv:activeTable:v1";
const TABLE_COUNT = 8;

type Product = { id: string; name: string; price: number; description: string | null; category_id: string | null; image_url: string | null };
type Category = { id: string; name: string };
type CartItem = { product: Product; qty: number };
type CartsByTable = Record<number, CartItem[]>; // 0 = Balcão, 1..8 = Mesas

const tableLabel = (n: number) => (n === 0 ? "Balcão" : `Mesa ${n}`);

export default function PDV() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [activeCat, setActiveCat] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [carts, setCarts] = usePersistentState<CartsByTable>(CARTS_KEY, {});
  const [activeTable, setActiveTable] = usePersistentState<number>(ACTIVE_TABLE_KEY, 0);
  const [openCheckout, setOpenCheckout] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [openReceipt, setOpenReceipt] = useState(false);
  const [openCart, setOpenCart] = useState(false);

  useEffect(() => {
    const loadProducts = async () => {
      const { data } = await supabase
        .from("products")
        .select("id,name,price,description,category_id,image_url")
        .eq("active", true)
        .order("name");
      setProducts((data ?? []).map((x) => ({ ...x, price: Number(x.price) })));
    };
    (async () => {
      const { data: c } = await supabase.from("categories").select("id,name").order("sort_order");
      setCats(c ?? []);
      await loadProducts();
    })();

    const channel = supabase
      .channel("pdv_products")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => loadProducts())
      .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, async () => {
        const { data } = await supabase.from("categories").select("id,name").order("sort_order");
        setCats(data ?? []);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (activeCat !== "all" && p.category_id !== activeCat) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [products, activeCat, search]);

  const cart: CartItem[] = carts[activeTable] ?? [];

  const updateActiveCart = (updater: (c: CartItem[]) => CartItem[]) => {
    setCarts((prev) => {
      const current = prev[activeTable] ?? [];
      const next = updater(current);
      return { ...prev, [activeTable]: next };
    });
  };

  const addToCart = (p: Product) => {
    updateActiveCart((c) => {
      const ex = c.find((x) => x.product.id === p.id);
      if (ex) return c.map((x) => (x.product.id === p.id ? { ...x, qty: x.qty + 1 } : x));
      return [...c, { product: p, qty: 1 }];
    });
  };

  const setQty = (id: string, delta: number) => {
    updateActiveCart((c) =>
      c.map((x) => (x.product.id === id ? { ...x, qty: x.qty + delta } : x)).filter((x) => x.qty > 0)
    );
  };

  const removeItem = (id: string) =>
    updateActiveCart((c) => c.filter((x) => x.product.id !== id));

  const subtotal = cart.reduce((s, x) => s + x.product.price * x.qty, 0);
  const totalQty = cart.reduce((s, x) => s + x.qty, 0);

  const handleConfirmed = (r: ReceiptData) => {
    setCarts((prev) => {
      const next = { ...prev };
      delete next[activeTable];
      return next;
    });
    setOpenCheckout(false);
    setOpenCart(false);
    setReceipt(r);
    setOpenReceipt(true);
    toast.success(`Venda registrada (${tableLabel(activeTable)})`);
    if (activeTable !== 0) setActiveTable(0);
  };

  return (
    <AppShell title={`PDV — ${tableLabel(activeTable)}`}>
      <div className="sticky top-[64px] z-20 -mx-4 bg-background/95 backdrop-blur px-4 pb-2 pt-1 space-y-2">
        {/* Table selector */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
          <TableChip
            label="Balcão"
            icon={<Store className="h-3 w-3" />}
            count={(carts[0] ?? []).reduce((s, x) => s + x.qty, 0)}
            active={activeTable === 0}
            onClick={() => setActiveTable(0)}
          />
          {Array.from({ length: TABLE_COUNT }, (_, i) => i + 1).map((n) => (
            <TableChip
              key={n}
              label={`Mesa ${n}`}
              icon={<Utensils className="h-3 w-3" />}
              count={(carts[n] ?? []).reduce((s, x) => s + x.qty, 0)}
              active={activeTable === n}
              onClick={() => setActiveTable(n)}
            />
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
          <CatChip label="Tudo" active={activeCat === "all"} onClick={() => setActiveCat("all")} />
          {cats.map((c) => (
            <CatChip key={c.id} label={c.name} active={activeCat === c.id} onClick={() => setActiveCat(c.id)} />
          ))}
        </div>
      </div>

      {/* Pedidos estacionados */}
      {activeTable === 0 && (
        <div className="mt-3 space-y-2">
          {Array.from({ length: TABLE_COUNT }, (_, i) => i + 1)
            .filter((n) => (carts[n] ?? []).length > 0)
            .map((n) => {
              const items = carts[n] ?? [];
              const total = items.reduce((s, x) => s + x.product.price * x.qty, 0);
              return (
                <Card key={n} className="p-3 flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent">
                    <Utensils className="h-5 w-5 text-accent-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-base leading-tight">{tableLabel(n)}</p>
                    <p className="text-xs text-muted-foreground">
                      {items.length} item{items.length > 1 ? "s" : ""} · {formatBRL(total)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => {
                      setActiveTable(n);
                      toast.info(`Reaberto ${tableLabel(n)}`);
                    }}
                  >
                    <RotateCcw className="h-4 w-4 mr-1" /> Reabrir
                  </Button>
                </Card>
              );
            })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mt-3">
        {filtered.map((p) => (
          <button
            key={p.id}
            onClick={() => addToCart(p)}
            className="text-left rounded-xl border border-border bg-card overflow-hidden shadow-card-retro active:scale-[0.97] transition flex flex-col"
          >
            <div className="aspect-square w-full bg-muted flex items-center justify-center overflow-hidden">
              {p.image_url ? (
                <img src={p.image_url} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <div className="p-3">
              <p className="font-display text-base leading-tight line-clamp-2">{p.name}</p>
              <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2 min-h-[28px]">{p.description}</p>
              <p className="mt-2 font-display text-lg text-primary">{formatBRL(p.price)}</p>
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-2 text-center text-sm text-muted-foreground py-8">Nenhum produto encontrado.</p>
        )}
      </div>

      {/* Floating cart */}
      <Sheet open={openCart} onOpenChange={setOpenCart}>
        <SheetTrigger asChild>
          <button
            disabled={cart.length === 0}
            className={cn(
              "fixed bottom-20 right-4 z-30 flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-3 shadow-retro font-display text-base transition",
              cart.length === 0 && "opacity-0 pointer-events-none scale-90"
            )}
          >
            <ShoppingCart className="h-5 w-5" />
            <span>{totalQty}</span>
            <span className="text-sm font-semibold">{formatBRL(subtotal)}</span>
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-display text-2xl text-left flex items-center gap-2">
              {activeTable === 0 ? <Store className="h-5 w-5" /> : <Utensils className="h-5 w-5" />}
              {tableLabel(activeTable)}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-3 space-y-2">
            {cart.map((it) => (
              <Card key={it.product.id} className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium leading-tight truncate">{it.product.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatBRL(it.product.price)} × {it.qty} = {formatBRL(it.product.price * it.qty)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setQty(it.product.id, -1)}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-7 text-center font-display text-lg">{it.qty}</span>
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setQty(it.product.id, 1)}>
                    <Plus className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeItem(it.product.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
            <span className="font-display text-lg">Total</span>
            <span className="font-display text-2xl text-primary">{formatBRL(subtotal)}</span>
          </div>
          <Button className="w-full mt-3 h-12 font-display text-lg" onClick={() => setOpenCheckout(true)} disabled={!user}>
            Receber Pagamento
          </Button>
          {activeTable !== 0 && (
            <Button
              variant="outline"
              className="w-full mt-2"
              onClick={() => {
                setOpenCart(false);
                toast.info(`${tableLabel(activeTable)} estacionada — pode iniciar nova venda`);
                setActiveTable(0);
              }}
            >
              Estacionar pedido e abrir Balcão
            </Button>
          )}
          <Button
            variant="outline"
            className="w-full mt-2 text-destructive"
            onClick={() => {
              if (!confirm(`Limpar ${tableLabel(activeTable)}?`)) return;
              setCarts((prev) => {
                const next = { ...prev };
                delete next[activeTable];
                return next;
              });
              toast.success("Pedido apagado");
            }}
          >
            <Trash2 className="h-4 w-4 mr-1" /> Limpar dados do pedido
          </Button>
        </SheetContent>
      </Sheet>

      <CheckoutSheet
        open={openCheckout}
        onOpenChange={setOpenCheckout}
        cart={cart}
        subtotal={subtotal}
        onConfirmed={handleConfirmed}
      />

      <ReceiptDialog open={openReceipt} onOpenChange={setOpenReceipt} receipt={receipt} />
    </AppShell>
  );
}

const CatChip = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={cn(
      "shrink-0 rounded-full border px-3 py-1.5 text-xs font-display tracking-wide transition",
      active
        ? "bg-primary text-primary-foreground border-primary shadow-card-retro"
        : "bg-card text-foreground border-border"
    )}
  >
    {label}
  </button>
);

const TableChip = ({
  label, icon, count, active, onClick,
}: { label: string; icon: React.ReactNode; count: number; active: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={cn(
      "relative shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-display tracking-wide transition flex items-center gap-1.5",
      active
        ? "bg-primary text-primary-foreground border-primary shadow-card-retro"
        : count > 0
          ? "bg-accent/30 text-foreground border-accent"
          : "bg-card text-muted-foreground border-border"
    )}
  >
    {icon}
    {label}
    {count > 0 && (
      <span className={cn(
        "ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold",
        active ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground"
      )}>
        {count}
      </span>
    )}
  </button>
);
