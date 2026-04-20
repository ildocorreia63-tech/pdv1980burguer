import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import { Plus, Pencil, Trash2, Tag } from "lucide-react";
import { toast } from "sonner";

type Product = { id: string; name: string; description: string | null; price: number; category_id: string | null; active: boolean };
type Category = { id: string; name: string };

export default function Admin() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState(0);
  const [catId, setCatId] = useState<string>("");
  const [active, setActive] = useState(true);
  const [catOpen, setCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");

  const load = async () => {
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from("products").select("*").order("name"),
      supabase.from("categories").select("*").order("sort_order"),
    ]);
    setProducts((p ?? []).map((x) => ({ ...x, price: Number(x.price) })));
    setCats(c ?? []);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setName(""); setDesc(""); setPrice(0); setCatId(cats[0]?.id ?? ""); setActive(true);
    setOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setName(p.name); setDesc(p.description ?? ""); setPrice(p.price);
    setCatId(p.category_id ?? ""); setActive(p.active);
    setOpen(true);
  };

  const save = async () => {
    if (!name.trim() || price < 0) return toast.error("Preencha nome e preço");
    const payload = {
      name: name.trim(),
      description: desc || null,
      price,
      category_id: catId || null,
      active,
    };
    const { error } = editing
      ? await supabase.from("products").update(payload).eq("id", editing.id)
      : await supabase.from("products").insert(payload);
    if (error) return toast.error(error.message);
    setOpen(false);
    load();
    toast.success("Salvo!");
  };

  const addCategory = async () => {
    const n = newCatName.trim();
    if (!n) return toast.error("Informe o nome da categoria");
    if (n.length > 60) return toast.error("Nome muito longo");
    const nextOrder = (cats[cats.length - 1]?.["sort_order" as keyof Category] as unknown as number ?? cats.length) + 1;
    const { error } = await supabase.from("categories").insert({ name: n, sort_order: nextOrder });
    if (error) return toast.error(error.message);
    setNewCatName("");
    toast.success("Categoria criada");
    load();
  };

  const removeCategory = async (id: string, hasItems: boolean) => {
    if (hasItems) return toast.error("Remova ou mova os produtos desta categoria antes");
    if (!confirm("Excluir categoria?")) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Categoria excluída");
    load();
  };

  const grouped = cats.map((c) => ({ ...c, items: products.filter((p) => p.category_id === c.id) }));

  return (
    <AppShell
      title="Admin — Produtos"
      action={<Button size="icon" variant="outline" onClick={openNew}><Plus className="h-4 w-4" /></Button>}
    >
      <div className="space-y-4">
        {grouped.map((g) => (
          <div key={g.id}>
            <h3 className="font-display text-lg mb-2 text-primary">{g.name}</h3>
            <div className="space-y-2">
              {g.items.map((p) => (
                <Card key={p.id} className="p-3 shadow-card-retro flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className={`font-medium truncate ${!p.active && "line-through text-muted-foreground"}`}>{p.name}</p>
                    <p className="text-[11px] text-muted-foreground line-clamp-1">{p.description}</p>
                  </div>
                  <p className="font-display text-base text-primary">{formatBRL(p.price)}</p>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(p)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar produto" : "Novo produto"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><Label>Descrição</Label><Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Preço</Label><Input type="number" step="0.01" value={price || ""} onChange={(e) => setPrice(Number(e.target.value) || 0)} /></div>
              <div>
                <Label>Categoria</Label>
                <select value={catId} onChange={(e) => setCatId(e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-2 text-sm">
                  <option value="">— sem —</option>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <Label htmlFor="active">Produto ativo</Label>
              <Switch id="active" checked={active} onCheckedChange={setActive} />
            </div>
            <Button className="w-full" onClick={save}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
