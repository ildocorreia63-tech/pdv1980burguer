import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Search, AlertTriangle, ArrowUp, ArrowDown, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const UNITS = ["un", "kg", "g", "L", "ml"];
const MOV_LABEL: Record<string, string> = {
  purchase: "Compra",
  sale: "Venda",
  adjustment: "Ajuste",
  waste: "Perda",
};

type Ingredient = {
  id: string;
  name: string;
  unit: string;
  cost_per_unit: number;
  stock_quantity: number;
  min_stock: number;
  active: boolean;
};
type Product = { id: string; name: string; price: number };
type Recipe = { id: string; product_id: string; ingredient_id: string; quantity: number };
type Movement = {
  id: string;
  ingredient_id: string;
  type: string;
  quantity: number;
  unit_cost: number | null;
  notes: string | null;
  created_at: string;
};

export default function Insumos() {
  const { user } = useAuth();
  const [tab, setTab] = useState("ingredients");
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [search, setSearch] = useState("");

  const load = async () => {
    const [{ data: ing }, { data: prod }, { data: rec }, { data: mov }] = await Promise.all([
      supabase.from("ingredients" as any).select("*").order("name"),
      supabase.from("products").select("id,name,price").eq("active", true).order("name"),
      supabase.from("product_recipes" as any).select("*"),
      supabase.from("ingredient_movements" as any).select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    setIngredients(((ing as any[]) ?? []).map((x) => ({ ...x, cost_per_unit: Number(x.cost_per_unit), stock_quantity: Number(x.stock_quantity), min_stock: Number(x.min_stock) })));
    setProducts((prod ?? []).map((x) => ({ ...x, price: Number(x.price) })));
    setRecipes(((rec as any[]) ?? []).map((x) => ({ ...x, quantity: Number(x.quantity) })));
    setMovements(((mov as any[]) ?? []).map((x) => ({ ...x, quantity: Number(x.quantity), unit_cost: x.unit_cost == null ? null : Number(x.unit_cost) })));
  };

  useEffect(() => {
    load();
  }, []);

  /* ---------------- Ingredient CRUD ---------------- */
  const [ingOpen, setIngOpen] = useState(false);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [fName, setFName] = useState("");
  const [fUnit, setFUnit] = useState("un");
  const [fCost, setFCost] = useState(0);
  const [fStock, setFStock] = useState(0);
  const [fMin, setFMin] = useState(0);

  const openNewIng = () => {
    setEditing(null);
    setFName("");
    setFUnit("un");
    setFCost(0);
    setFStock(0);
    setFMin(0);
    setIngOpen(true);
  };
  const openEditIng = (i: Ingredient) => {
    setEditing(i);
    setFName(i.name);
    setFUnit(i.unit);
    setFCost(i.cost_per_unit);
    setFStock(i.stock_quantity);
    setFMin(i.min_stock);
    setIngOpen(true);
  };
  const saveIng = async () => {
    if (!fName.trim()) return toast.error("Informe o nome");
    const payload = { name: fName.trim(), unit: fUnit, cost_per_unit: fCost, stock_quantity: fStock, min_stock: fMin };
    const isQuantityChanged = editing && editing.stock_quantity !== fStock;
    const { error } = editing
      ? await supabase.from("ingredients" as any).update(payload).eq("id", editing.id)
      : await supabase.from("ingredients" as any).insert(payload);
    if (error) return toast.error(error.message);
    if (editing && isQuantityChanged) {
      toast.success(`Quantidade atualizada para ${fStock.toLocaleString("pt-BR")} ${fUnit}`);
    } else {
      toast.success("Insumo salvo");
    }
    setIngOpen(false);
    load();
  };
  const removeIng = async (i: Ingredient) => {
    if (!confirm(`Excluir insumo "${i.name}"?`)) return;
    const { error } = await supabase.from("ingredients" as any).delete().eq("id", i.id);
    if (error) return toast.error(error.message);
    toast.success("Excluído");
    load();
  };

  /* ---------------- Stock adjustment ---------------- */
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjIng, setAdjIng] = useState<Ingredient | null>(null);
  const [adjType, setAdjType] = useState<"purchase" | "adjustment" | "waste">("purchase");
  const [adjQty, setAdjQty] = useState(0);
  const [adjCost, setAdjCost] = useState(0);
  const [adjNotes, setAdjNotes] = useState("");

  const openAdj = (i: Ingredient) => {
    setAdjIng(i);
    setAdjType("purchase");
    setAdjQty(0);
    setAdjCost(i.cost_per_unit);
    setAdjNotes("");
    setAdjOpen(true);
  };
  const saveAdj = async () => {
    if (!adjIng || adjQty <= 0) return toast.error("Quantidade inválida");
    // purchase = +, waste = -, adjustment = signed by sign of qty input (positive=in)
    let signed = adjQty;
    if (adjType === "waste") signed = -adjQty;
    const { error: mErr } = await supabase.from("ingredient_movements" as any).insert({
      ingredient_id: adjIng.id,
      type: adjType,
      quantity: signed,
      unit_cost: adjType === "purchase" ? adjCost : adjIng.cost_per_unit,
      notes: adjNotes || null,
      created_by: user?.id,
    });
    if (mErr) return toast.error(mErr.message);

    const newStock = adjIng.stock_quantity + signed;
    const update: any = { stock_quantity: newStock };
    if (adjType === "purchase" && adjCost > 0) update.cost_per_unit = adjCost;
    const { error: uErr } = await supabase.from("ingredients" as any).update(update).eq("id", adjIng.id);
    if (uErr) return toast.error(uErr.message);
    toast.success(`Quantidade ajustada para ${newStock.toLocaleString("pt-BR")} ${adjIng.unit}`);
    setAdjOpen(false);
    load();
  };

  /* ---------------- Recipe (technical sheet) ---------------- */
  const [selProduct, setSelProduct] = useState<string>("");
  const productRecipes = useMemo(
    () => recipes.filter((r) => r.product_id === selProduct),
    [recipes, selProduct],
  );
  const selProductObj = products.find((p) => p.id === selProduct);
  const productCost = useMemo(() => {
    return productRecipes.reduce((s, r) => {
      const ing = ingredients.find((i) => i.id === r.ingredient_id);
      return s + (ing ? ing.cost_per_unit * r.quantity : 0);
    }, 0);
  }, [productRecipes, ingredients]);
  const profitBRL = selProductObj ? selProductObj.price - productCost : 0;
  const profitPct = selProductObj && selProductObj.price > 0 ? (profitBRL / selProductObj.price) * 100 : 0;

  const [recIng, setRecIng] = useState("");
  const [recQty, setRecQty] = useState(0);
  const addRecipe = async () => {
    if (!selProduct || !recIng || recQty <= 0) return toast.error("Preencha o ingrediente e quantidade");
    const { error } = await supabase.from("product_recipes" as any).upsert(
      { product_id: selProduct, ingredient_id: recIng, quantity: recQty },
      { onConflict: "product_id,ingredient_id" },
    );
    if (error) return toast.error(error.message);
    const ingObj = ingredients.find((i) => i.id === recIng);
    toast.success(
      `Ingrediente adicionado · ${recQty.toLocaleString("pt-BR")}${ingObj ? ` ${ingObj.unit}` : ""}`,
    );
    setRecIng("");
    setRecQty(0);
    load();
  };
  const updateRecipeQty = async (id: string, quantity: number) => {
    if (quantity <= 0) return;
    const { error } = await supabase.from("product_recipes" as any).update({ quantity }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Quantidade atualizada para ${quantity.toLocaleString("pt-BR")}`);
    load();
  };
  const removeRecipe = async (id: string) => {
    const { error } = await supabase.from("product_recipes" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Ingrediente removido da ficha técnica");
    load();
  };

  /* ---------------- Filtered list ---------------- */
  const filteredIng = ingredients.filter((i) =>
    !search || i.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <AppShell title="Insumos & Ficha Técnica">
      <Tabs value={tab} onValueChange={setTab} className="space-y-3">
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="ingredients">Insumos</TabsTrigger>
          <TabsTrigger value="recipes">Ficha Técnica</TabsTrigger>
          <TabsTrigger value="movements">Movimentações</TabsTrigger>
        </TabsList>

        {/* ============ INGREDIENTS ============ */}
        <TabsContent value="ingredients" className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar insumo..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Button onClick={openNewIng} size="icon"><Plus className="h-4 w-4" /></Button>
          </div>

          <div className="space-y-2">
            {filteredIng.map((i) => {
              const low = i.stock_quantity <= i.min_stock;
              return (
                <Card key={i.id} className="p-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-display text-base leading-tight truncate">{i.name}</p>
                        {low && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive text-[10px] px-1.5 py-0.5">
                            <AlertTriangle className="h-3 w-3" /> baixo
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Custo: <strong>{formatBRL(i.cost_per_unit)}</strong> / {i.unit} · Estoque:{" "}
                        <strong className={cn(low && "text-destructive")}>
                          {i.stock_quantity.toLocaleString("pt-BR")} {i.unit}
                        </strong>{" "}
                        · Mín: {i.min_stock.toLocaleString("pt-BR")}
                      </p>
                    </div>
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => openAdj(i)} title="Movimentar">
                      <ClipboardList className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => openEditIng(i)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeIng(i)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Card>
              );
            })}
            {filteredIng.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">Nenhum insumo cadastrado.</p>
            )}
          </div>
        </TabsContent>

        {/* ============ RECIPES ============ */}
        <TabsContent value="recipes" className="space-y-3">
          <Select value={selProduct} onValueChange={setSelProduct}>
            <SelectTrigger><SelectValue placeholder="Escolha um produto..." /></SelectTrigger>
            <SelectContent>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selProductObj && (
            <>
              <Card className="p-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-[11px] text-muted-foreground">Preço de venda</p>
                  <p className="font-display text-lg text-primary">{formatBRL(selProductObj.price)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Custo total da ficha</p>
                  <p className="font-display text-lg">{formatBRL(productCost)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Lucro (R$)</p>
                  <p className={cn("font-display text-lg", profitBRL >= 0 ? "text-green-600" : "text-destructive")}>
                    {formatBRL(profitBRL)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Margem (%)</p>
                  <p className={cn("font-display text-lg", profitPct >= 0 ? "text-green-600" : "text-destructive")}>
                    {profitPct.toFixed(1)}%
                  </p>
                </div>
              </Card>

              <Card className="p-3 space-y-2">
                <p className="font-display text-sm">Adicionar ingrediente</p>
                <div className="flex gap-2">
                  <Select value={recIng} onValueChange={setRecIng}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Insumo..." /></SelectTrigger>
                    <SelectContent>
                      {ingredients
                        .filter((i) => !productRecipes.some((r) => r.ingredient_id === i.id))
                        .map((i) => (
                          <SelectItem key={i.id} value={i.id}>{i.name} ({i.unit})</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    step="0.001"
                    placeholder="Qtd"
                    value={recQty || ""}
                    onChange={(e) => setRecQty(Number(e.target.value))}
                    className="w-24"
                  />
                  <Button onClick={addRecipe} className="gap-1">
                    <Plus className="h-4 w-4" /> Adicionar
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Selecione o insumo, informe a quantidade e toque em <strong>Adicionar</strong> para salvar.
                </p>
              </Card>

              <div className="space-y-2">
                {productRecipes.map((r) => {
                  const ing = ingredients.find((i) => i.id === r.ingredient_id);
                  if (!ing) return null;
                  const itemCost = ing.cost_per_unit * r.quantity;
                  return (
                    <Card key={r.id} className="p-3 flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{ing.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatBRL(ing.cost_per_unit)} / {ing.unit} · Total:{" "}
                          <strong>{formatBRL(itemCost)}</strong>
                        </p>
                      </div>
                      <Input
                        type="number"
                        step="0.001"
                        defaultValue={r.quantity}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v > 0 && v !== r.quantity) updateRecipeQty(r.id, v);
                        }}
                        className="w-20 h-8"
                        title={`Quantidade em ${ing.unit}`}
                      />
                      <span className="text-xs text-muted-foreground">{ing.unit}</span>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeRecipe(r.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </Card>
                  );
                })}
                {productRecipes.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-4">Sem ingredientes na ficha.</p>
                )}
              </div>
            </>
          )}
        </TabsContent>

        {/* ============ MOVEMENTS ============ */}
        <TabsContent value="movements" className="space-y-2">
          {movements.map((m) => {
            const ing = ingredients.find((i) => i.id === m.ingredient_id);
            const isOut = m.quantity < 0;
            return (
              <Card key={m.id} className="p-3 flex items-center gap-3">
                <div className={cn("h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                  isOut ? "bg-destructive/10 text-destructive" : "bg-green-500/10 text-green-600")}>
                  {isOut ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{ing?.name ?? "—"}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {MOV_LABEL[m.type]} · {formatDate(m.created_at)}
                    {m.notes ? ` · ${m.notes}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className={cn("font-display text-sm", isOut ? "text-destructive" : "text-green-600")}>
                    {m.quantity > 0 ? "+" : ""}{m.quantity.toLocaleString("pt-BR")} {ing?.unit}
                  </p>
                  {m.unit_cost != null && (
                    <p className="text-[10px] text-muted-foreground">{formatBRL(m.unit_cost)} / {ing?.unit}</p>
                  )}
                </div>
              </Card>
            );
          })}
          {movements.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">Sem movimentações ainda.</p>
          )}
        </TabsContent>
      </Tabs>

      {/* ============ Ingredient Dialog ============ */}
      <Dialog open={ingOpen} onOpenChange={setIngOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar insumo" : "Novo insumo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={fName} onChange={(e) => setFName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Unidade</Label>
                <Select value={fUnit} onValueChange={setFUnit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Custo por unidade (R$)</Label>
                <Input type="number" step="0.0001" value={fCost || ""} onChange={(e) => setFCost(Number(e.target.value))} />
              </div>
              <div>
                <Label>Estoque atual</Label>
                <Input type="number" step="0.001" value={fStock || ""} onChange={(e) => setFStock(Number(e.target.value))} />
              </div>
              <div>
                <Label>Estoque mínimo</Label>
                <Input type="number" step="0.001" value={fMin || ""} onChange={(e) => setFMin(Number(e.target.value))} />
              </div>
            </div>
            <Button className="w-full" onClick={saveIng}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ============ Adjustment Dialog ============ */}
      <Dialog open={adjOpen} onOpenChange={setAdjOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Movimentar — {adjIng?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Tipo</Label>
              <Select value={adjType} onValueChange={(v: any) => setAdjType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="purchase">Compra (entrada)</SelectItem>
                  <SelectItem value="adjustment">Ajuste (entrada)</SelectItem>
                  <SelectItem value="waste">Perda (saída)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantidade ({adjIng?.unit})</Label>
              <Input type="number" step="0.001" value={adjQty || ""} onChange={(e) => setAdjQty(Number(e.target.value))} />
            </div>
            {adjType === "purchase" && (
              <div>
                <Label>Custo unitário pago (R$)</Label>
                <Input type="number" step="0.0001" value={adjCost || ""} onChange={(e) => setAdjCost(Number(e.target.value))} />
                <p className="text-[11px] text-muted-foreground mt-1">Atualizará o custo do insumo.</p>
              </div>
            )}
            <div>
              <Label>Observação (opcional)</Label>
              <Input value={adjNotes} onChange={(e) => setAdjNotes(e.target.value)} />
            </div>
            <Button className="w-full" onClick={saveAdj}>Registrar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
