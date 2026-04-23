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
import { Plus, Pencil, Trash2, Tag, GripVertical, MapPin, Settings as SettingsIcon, Upload, ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRef } from "react";
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Product = { id: string; name: string; description: string | null; price: number; category_id: string | null; active: boolean; image_url: string | null };
type Category = { id: string; name: string; sort_order: number };

function SortableCategoryRow({ cat, count, onRemove }: { cat: Category & { items: Product[] }; count: number; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1 rounded-md border border-border px-2 py-2 bg-background">
      <button {...attributes} {...listeners} className="touch-none p-1 text-muted-foreground cursor-grab active:cursor-grabbing" aria-label="Arrastar">
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate">{cat.name}</p>
        <p className="text-[11px] text-muted-foreground">{count} produto(s)</p>
      </div>
      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={onRemove}>
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}

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
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [catOpen, setCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");

  // Delivery zones
  const [zonesOpen, setZonesOpen] = useState(false);
  const [zones, setZones] = useState<{ id: string; name: string; fee: number; active: boolean }[]>([]);
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneFee, setNewZoneFee] = useState(0);

  // Store settings
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [welcome, setWelcome] = useState("");
  const [menuOpen, setMenuOpen] = useState(true);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  const load = async () => {
    const [{ data: p }, { data: c }, { data: z }, { data: s }] = await Promise.all([
      supabase.from("products").select("*").order("name"),
      supabase.from("categories").select("*").order("sort_order"),
      supabase.from("delivery_zones").select("*").order("sort_order"),
      supabase.from("store_settings").select("*").maybeSingle(),
    ]);
    setProducts((p ?? []).map((x) => ({ ...x, price: Number(x.price) })));
    setCats((c ?? []) as Category[]);
    setZones((z ?? []).map((x: any) => ({ id: x.id, name: x.name, fee: Number(x.fee), active: x.active })));
    if (s) {
      setSettingsId(s.id);
      setStoreName(s.store_name ?? "");
      setWhatsapp(s.whatsapp_number ?? "");
      setWelcome(s.welcome_message ?? "");
      setMenuOpen(s.menu_open);
    }
  };

  useEffect(() => { load(); }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = cats.findIndex((c) => c.id === active.id);
    const newIndex = cats.findIndex((c) => c.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(cats, oldIndex, newIndex);
    setCats(reordered);
    const results = await Promise.all(
      reordered.map((c, i) => supabase.from("categories").update({ sort_order: i }).eq("id", c.id))
    );
    if (results.find((r) => r.error)) {
      toast.error("Erro ao reordenar");
      load();
    } else {
      toast.success("Ordem salva");
    }
  };

  const openNew = () => {
    setEditing(null);
    setName(""); setDesc(""); setPrice(0); setCatId(cats[0]?.id ?? ""); setActive(true); setImageUrl(null);
    setOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setName(p.name); setDesc(p.description ?? ""); setPrice(p.price);
    setCatId(p.category_id ?? ""); setActive(p.active); setImageUrl(p.image_url);
    setOpen(true);
  };

  const handleImageUpload = async (file: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Imagem muito grande (máx 5MB)");
    if (!file.type.startsWith("image/")) return toast.error("Arquivo deve ser uma imagem");
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("product-images").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
      setImageUrl(data.publicUrl);
      toast.success("Imagem carregada");
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao enviar imagem");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!name.trim() || price < 0) return toast.error("Preencha nome e preço");
    const payload = {
      name: name.trim(),
      description: desc || null,
      price,
      category_id: catId || null,
      active,
      image_url: imageUrl,
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

  const addZone = async () => {
    const n = newZoneName.trim();
    if (!n) return toast.error("Informe o bairro");
    const nextOrder = zones.length;
    const { error } = await supabase.from("delivery_zones").insert({ name: n, fee: newZoneFee, sort_order: nextOrder });
    if (error) return toast.error(error.message);
    setNewZoneName(""); setNewZoneFee(0);
    toast.success("Bairro adicionado");
    load();
  };
  const updateZoneFee = async (id: string, fee: number) => {
    const { error } = await supabase.from("delivery_zones").update({ fee }).eq("id", id);
    if (error) return toast.error(error.message);
    setZones((zs) => zs.map((z) => z.id === id ? { ...z, fee } : z));
  };
  const removeZone = async (id: string) => {
    if (!confirm("Excluir bairro?")) return;
    const { error } = await supabase.from("delivery_zones").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Bairro excluído");
    load();
  };

  const saveSettings = async () => {
    if (!settingsId) return;
    const { error } = await supabase.from("store_settings").update({
      store_name: storeName.trim() || "Minha Loja",
      whatsapp_number: whatsapp.replace(/\D/g, "") || null,
      welcome_message: welcome.trim() || null,
      menu_open: menuOpen,
    }).eq("id", settingsId);
    if (error) return toast.error(error.message);
    toast.success("Configurações salvas");
  };

  return (
    <AppShell
      title="Admin — Produtos"
      action={
        <div className="flex gap-1">
          <Button size="icon" variant="outline" onClick={() => setSettingsOpen(true)} title="Configurações da loja">
            <SettingsIcon className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="outline" onClick={() => setZonesOpen(true)} title="Bairros (entrega)">
            <MapPin className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="outline" onClick={() => setCatOpen(true)} title="Categorias">
            <Tag className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="outline" onClick={openNew} title="Novo produto">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {grouped.map((g) => (
          <div key={g.id}>
            <h3 className="font-display text-lg mb-2 text-primary">{g.name}</h3>
            <div className="space-y-2">
              {g.items.map((p) => (
                <Card key={p.id} className="p-3 shadow-card-retro flex items-center gap-3">
                  <div className="h-12 w-12 shrink-0 rounded-md overflow-hidden bg-muted flex items-center justify-center">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
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
            <div>
              <Label>Imagem do produto</Label>
              <div className="mt-1 flex items-center gap-3">
                <div className="h-20 w-20 shrink-0 rounded-md overflow-hidden bg-muted flex items-center justify-center border border-border">
                  {imageUrl ? (
                    <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="h-7 w-7 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 flex flex-col gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImageUpload(f);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="gap-2"
                  >
                    {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                    {imageUrl ? "Trocar imagem" : "Enviar imagem"}
                  </Button>
                  {imageUrl && (
                    <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setImageUrl(null)}>
                      Remover
                    </Button>
                  )}
                </div>
              </div>
            </div>
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
            <Button className="w-full" onClick={save} disabled={uploading}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Categorias</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Nova categoria"
                value={newCatName}
                maxLength={60}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCategory()}
              />
              <Button onClick={addCategory}>Adicionar</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Arraste para reordenar.</p>
            <div className="space-y-1 max-h-72 overflow-y-auto">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={grouped.map((g) => g.id)} strategy={verticalListSortingStrategy}>
                  {grouped.map((g) => (
                    <SortableCategoryRow
                      key={g.id}
                      cat={g}
                      count={g.items.length}
                      onRemove={() => removeCategory(g.id, g.items.length > 0)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
              {cats.length === 0 && <p className="text-center text-sm text-muted-foreground py-4">Nenhuma categoria.</p>}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bairros / zonas de entrega */}
      <Dialog open={zonesOpen} onOpenChange={setZonesOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Bairros e taxas de entrega</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_100px_auto] gap-2">
              <Input placeholder="Bairro" value={newZoneName} onChange={(e) => setNewZoneName(e.target.value)} />
              <Input type="number" step="0.01" placeholder="Taxa" value={newZoneFee || ""} onChange={(e) => setNewZoneFee(Number(e.target.value) || 0)} />
              <Button onClick={addZone}>+</Button>
            </div>
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {zones.map((z) => (
                <div key={z.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-2 bg-background">
                  <span className="flex-1 truncate text-sm">{z.name}</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={z.fee}
                    onChange={(e) => updateZoneFee(z.id, Number(e.target.value) || 0)}
                    className="h-8 w-24 text-right"
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeZone(z.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              {zones.length === 0 && <p className="text-center text-sm text-muted-foreground py-4">Nenhum bairro.</p>}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Configurações da loja */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Configurações do cardápio online</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome da loja</Label><Input value={storeName} onChange={(e) => setStoreName(e.target.value)} /></div>
            <div>
              <Label>WhatsApp da loja</Label>
              <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="5511999999999" inputMode="tel" />
              <p className="text-[11px] text-muted-foreground mt-1">Apenas números, com DDI (55) e DDD. Ex: 5511988887777</p>
            </div>
            <div><Label>Mensagem de boas-vindas</Label><Textarea rows={2} value={welcome} onChange={(e) => setWelcome(e.target.value)} /></div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <Label htmlFor="menu_open">Cardápio aberto (recebendo pedidos)</Label>
              <Switch id="menu_open" checked={menuOpen} onCheckedChange={setMenuOpen} />
            </div>
            <div className="rounded-md bg-muted/50 p-2 text-xs">
              Link do cardápio: <code className="text-primary">{window.location.origin}/cardapio</code>
            </div>
            <Button className="w-full" onClick={saveSettings}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
