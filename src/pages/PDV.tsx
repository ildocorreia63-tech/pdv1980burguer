import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Plus, Minus, Trash2, ShoppingCart, Search } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { CheckoutSheet } from "@/components/pdv/CheckoutSheet";
import { ReceiptDialog } from "@/components/pdv/ReceiptDialog";
import type { ReceiptData } from "@/lib/receipt";
import { usePersistentState, clearPersistentState } from "@/hooks/usePersistentState";

const PDV_CART_KEY = "pdv:cart:v1";

type Product = { id: string; name: string; price: number; description: string | null; category_id: string | null };
type Category = { id: string; name: string };
type CartItem = { product: Product; qty: number };

export default function PDV() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [activeCat, setActiveCat] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [openCheckout, setOpenCheckout] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [openReceipt, setOpenReceipt] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: c }] = await Promise.all([
        supabase.from("products").select("id,name,price,description,category_id").eq("active", true).order("name"),
        supabase.from("categories").select("id,name").order("sort_order"),
      ]);
      setProducts((p ?? []).map((x) => ({ ...x, price: Number(x.price) })));
      setCats(c ?? []);
    })();
  }, []);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (activeCat !== "all" && p.category_id !== activeCat) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [products, activeCat, search]);

  const addToCart = (p: Product) => {
    setCart((c) => {
      const ex = c.find((x) => x.product.id === p.id);
      if (ex) return c.map((x) => (x.product.id === p.id ? { ...x, qty: x.qty + 1 } : x));
      return [...c, { product: p, qty: 1 }];
    });
  };

  const setQty = (id: string, delta: number) => {
    setCart((c) =>
      c
        .map((x) => (x.product.id === id ? { ...x, qty: x.qty + delta } : x))
        .filter((x) => x.qty > 0)
    );
  };

  const removeItem = (id: string) => setCart((c) => c.filter((x) => x.product.id !== id));

  const subtotal = cart.reduce((s, x) => s + x.product.price * x.qty, 0);
  const totalQty = cart.reduce((s, x) => s + x.qty, 0);

  const handleConfirmed = (r: ReceiptData) => {
    setCart([]);
    setOpenCheckout(false);
    setReceipt(r);
    setOpenReceipt(true);
    toast.success("Venda registrada com sucesso!");
  };

  return (
    <AppShell title="PDV — Nova venda">
      <div className="sticky top-[64px] z-20 -mx-4 bg-background/95 backdrop-blur px-4 pb-2 pt-1">
        <div className="relative mb-2">
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

      <div className="grid grid-cols-2 gap-3 mt-3">
        {filtered.map((p) => (
          <button
            key={p.id}
            onClick={() => addToCart(p)}
            className="text-left rounded-xl border border-border bg-card p-3 shadow-card-retro active:scale-[0.97] transition"
          >
            <p className="font-display text-base leading-tight line-clamp-2">{p.name}</p>
            <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2 min-h-[28px]">{p.description}</p>
            <p className="mt-2 font-display text-lg text-primary">{formatBRL(p.price)}</p>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-2 text-center text-sm text-muted-foreground py-8">Nenhum produto encontrado.</p>
        )}
      </div>

      {/* Floating cart */}
      <Sheet>
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
            <SheetTitle className="font-display text-2xl text-left">Carrinho</SheetTitle>
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
