import { useEffect, useRef, useState } from "react";
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
import { Plus, Pencil, Trash2, Tag, GripVertical, MapPin, Settings as SettingsIcon, Upload, ImageIcon, Loader2, Clock, Boxes, ClipboardList, Webhook } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { BusinessHours, DEFAULT_HOURS, WEEKDAYS } from "@/lib/businessHours";

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

  // Simulador de webhook Asaas
  const [simOpen, setSimOpen] = useState(false);
  const [simOrderId, setSimOrderId] = useState("");
  const [simEvent, setSimEvent] = useState<"PAYMENT_CONFIRMED" | "PAYMENT_REFUNDED" | "PAYMENT_OVERDUE" | "PAYMENT_RECEIVED">("PAYMENT_CONFIRMED");
  const [simLoading, setSimLoading] = useState(false);
  const [simResult, setSimResult] = useState<any>(null);
  const [recentOrders, setRecentOrders] = useState<{ id: string; order_number: number; status: string; customer_name: string }[]>([]);

  const loadRecentOrders = async () => {
    const { data } = await supabase
      .from("online_orders")
      .select("id, order_number, status, customer_name")
      .order("created_at", { ascending: false })
      .limit(20);
    setRecentOrders((data ?? []) as any);
  };

  const runSimulation = async () => {
    if (!simOrderId) return toast.error("Selecione um pedido");
    setSimLoading(true);
    setSimResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("asaas-simulate-webhook", {
        body: { order_id: simOrderId, event: simEvent },
      });
      if (error) throw error;
      setSimResult(data);
      toast.success(`Evento ${simEvent} simulado`);
    } catch (e: any) {
      toast.error("Falha: " + (e?.message ?? "erro"));
      setSimResult({ error: e?.message });
    } finally {
      setSimLoading(false);
    }
  };

  useEffect(() => { if (simOpen) loadRecentOrders(); }, [simOpen]);


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
  const [pixKey, setPixKey] = useState("");
  const [pixReceiver, setPixReceiver] = useState("");
  const [pixCity, setPixCity] = useState("");
  const [hours, setHours] = useState<BusinessHours>(DEFAULT_HOURS);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [bannerEnabled, setBannerEnabled] = useState(true);
  const [bannerUploading, setBannerUploading] = useState(false);
  const bannerInputRef = useRef<HTMLInputElement>(null);
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
      const sx = s as any;
      setSettingsId(sx.id);
      setStoreName(sx.store_name ?? "");
      setWhatsapp(sx.whatsapp_number ?? "");
      setWelcome(sx.welcome_message ?? "");
      setMenuOpen(sx.menu_open);
      setPixKey(sx.pix_key ?? "");
      setPixReceiver(sx.pix_receiver_name ?? "");
      setPixCity(sx.pix_city ?? "");
      setHours({ ...DEFAULT_HOURS, ...(sx.business_hours ?? {}) });
      setBannerUrl(sx.banner_url ?? null);
      setBannerEnabled(sx.banner_enabled ?? true);
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
      whatsapp_number: (whatsapp ?? "").replace(/\D/g, "") || null,
      welcome_message: welcome.trim() || null,
      menu_open: menuOpen,
      pix_key: pixKey.trim() || null,
      pix_receiver_name: pixReceiver.trim() || null,
      pix_city: pixCity.trim() || null,
      business_hours: hours,
      banner_url: bannerUrl,
      banner_enabled: bannerEnabled,
    } as any).eq("id", settingsId);
    if (error) return toast.error(error.message);
    toast.success("Configurações salvas");
  };

  const handleBannerUpload = async (file: File) => {
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) return toast.error("Imagem muito grande (máx 3MB)");
    if (!file.type.startsWith("image/")) return toast.error("Arquivo deve ser uma imagem");
    setBannerUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `banners/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("product-images").upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
      setBannerUrl(data.publicUrl);
      if (settingsId) {
        await supabase.from("store_settings").update({ banner_url: data.publicUrl } as any).eq("id", settingsId);
      }
      toast.success("Banner atualizado");
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao enviar banner");
    } finally {
      setBannerUploading(false);
    }
  };

  const removeBanner = async () => {
    if (!confirm("Remover banner?")) return;
    setBannerUrl(null);
    if (settingsId) {
      await supabase.from("store_settings").update({ banner_url: null } as any).eq("id", settingsId);
    }
    toast.success("Banner removido");
  };

  const updateDay = (key: string, patch: Partial<BusinessHours[string]>) => {
    setHours((h) => ({ ...h, [key]: { ...h[key], ...patch } }));
  };

  return (
    <AppShell
      title="Admin — Produtos"
      subAction={
        <div className="flex gap-1 flex-wrap">
          <Button asChild size="icon" variant="outline" title="Insumos & Ficha Técnica">
            <Link to="/insumos"><Boxes className="h-4 w-4" /></Link>
          </Button>
          <Button asChild size="icon" variant="outline" title="Lista de Compras">
            <Link to="/lista-compras"><ClipboardList className="h-4 w-4" /></Link>
          </Button>
          <Button size="icon" variant="outline" onClick={() => setSettingsOpen(true)} title="Configurações da loja">
            <SettingsIcon className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="outline" onClick={() => setZonesOpen(true)} title="Bairros (entrega)">
            <MapPin className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="outline" onClick={() => setCatOpen(true)} title="Categorias">
            <Tag className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="outline" onClick={() => setSimOpen(true)} title="Testar webhook Asaas">
            <Webhook className="h-4 w-4" />
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
        <DialogContent className="max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="p-4 pb-2"><DialogTitle>Configurações do cardápio online</DialogTitle></DialogHeader>
          <div className="space-y-3 overflow-y-auto px-4 pb-4 flex-1">
            <div><Label>Nome da loja</Label><Input value={storeName} onChange={(e) => setStoreName(e.target.value)} /></div>
            <div>
              <Label>WhatsApp da loja</Label>
              <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="5511999999999" inputMode="tel" />
              <p className="text-[11px] text-muted-foreground mt-1">Apenas números, com DDI (55) e DDD. Ex: 5511988887777</p>
            </div>
            <div><Label>Mensagem de boas-vindas</Label><Textarea rows={2} value={welcome} onChange={(e) => setWelcome(e.target.value)} /></div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <Label htmlFor="menu_open">Cardápio aberto (recebendo pedidos)</Label>
                <p className="text-[11px] text-muted-foreground">Desative para fechar manualmente.</p>
              </div>
              <Switch id="menu_open" checked={menuOpen} onCheckedChange={setMenuOpen} />
            </div>

            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <p className="font-display text-sm">Horário de funcionamento</p>
              </div>
              <p className="text-[11px] text-muted-foreground">Fora do horário, o cardápio fecha automaticamente. Use 18:00 → 02:00 para virada de dia.</p>
              <div className="space-y-2 pt-1">
                {WEEKDAYS.map((d) => {
                  const cfg = hours[d.key];
                  return (
                    <div key={d.key} className="flex items-center gap-2">
                      <div className="w-12 text-xs font-medium">{d.short}</div>
                      <Switch checked={cfg?.open ?? false} onCheckedChange={(v) => updateDay(d.key, { open: v })} />
                      {cfg?.open ? (
                        <div className="flex items-center gap-1 flex-1">
                          <Input type="time" value={cfg.from} onChange={(e) => updateDay(d.key, { from: e.target.value })} className="h-8 px-2 text-xs" />
                          <span className="text-xs text-muted-foreground">às</span>
                          <Input type="time" value={cfg.to} onChange={(e) => updateDay(d.key, { to: e.target.value })} className="h-8 px-2 text-xs" />
                        </div>
                      ) : (
                        <div className="flex-1 text-xs text-muted-foreground italic">Fechado</div>
                      )}
                    </div>
                  );
                })}
              </div>
              <Button size="sm" className="w-full mt-2" onClick={saveSettings}>
                Salvar horários
              </Button>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-primary" />
                <p className="font-display text-sm">Banner do cardápio</p>
              </div>
              <p className="text-[11px] text-muted-foreground">Imagem exibida no topo do cardápio digital (recomendado 1200×400px, máx 3MB).</p>
              {bannerUrl ? (
                <div className="relative rounded-md overflow-hidden border border-border">
                  <img src={bannerUrl} alt="Banner" className="w-full h-32 object-cover" />
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-border h-24 flex items-center justify-center text-xs text-muted-foreground">
                  Nenhum banner
                </div>
              )}
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBannerUpload(f); e.target.value = ""; }}
              />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" disabled={bannerUploading} onClick={() => bannerInputRef.current?.click()}>
                  {bannerUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                  {bannerUrl ? "Trocar" : "Enviar"}
                </Button>
                {bannerUrl && (
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={removeBanner}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="flex items-center justify-between rounded-md border border-border p-2">
                <Label htmlFor="banner_enabled" className="text-xs">Exibir banner no cardápio</Label>
                <Switch id="banner_enabled" checked={bannerEnabled} onCheckedChange={setBannerEnabled} />
              </div>
            </div>


            <div className="rounded-lg border border-border p-3 space-y-2">
              <p className="font-display text-sm">PIX (para gerar QR Code no cardápio)</p>
              <div>
                <Label>Chave PIX</Label>
                <Input value={pixKey} onChange={(e) => setPixKey(e.target.value)} placeholder="CPF, e-mail, telefone ou aleatória" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Nome do recebedor</Label>
                  <Input value={pixReceiver} onChange={(e) => setPixReceiver(e.target.value)} placeholder="Ex: JOAO DA SILVA" maxLength={25} />
                </div>
                <div>
                  <Label>Cidade</Label>
                  <Input value={pixCity} onChange={(e) => setPixCity(e.target.value)} placeholder="SAO PAULO" maxLength={15} />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">Sem acentos. Limite de 25 e 15 caracteres conforme padrão BR Code.</p>
            </div>
            <div className="rounded-md bg-muted/50 p-2 text-xs">
              Link do cardápio: <code className="text-primary">{window.location.origin}/cardapio</code>
            </div>
          </div>
          <div className="border-t border-border p-3 bg-background">
            <Button className="w-full" onClick={saveSettings}>Salvar todas as configurações</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Simulador de webhook Asaas */}
      <Dialog open={simOpen} onOpenChange={setSimOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Testar webhook Asaas</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Simula o envio de um evento do Asaas para o endpoint <code>asaas-webhook</code> e mostra como o pedido muda de estado. Útil para validar sem depender do pagamento real.
            </p>
            <div>
              <Label>Pedido</Label>
              <select
                className="mt-1 w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={simOrderId}
                onChange={(e) => setSimOrderId(e.target.value)}
              >
                <option value="">— selecione —</option>
                {recentOrders.map((o) => (
                  <option key={o.id} value={o.id}>
                    #{o.order_number} · {o.customer_name} · {o.status}
                  </option>
                ))}
              </select>
              <button type="button" className="mt-1 text-[11px] text-primary underline" onClick={loadRecentOrders}>
                Recarregar pedidos
              </button>
            </div>
            <div>
              <Label>Evento</Label>
              <select
                className="mt-1 w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={simEvent}
                onChange={(e) => setSimEvent(e.target.value as any)}
              >
                <option value="PAYMENT_CONFIRMED">PAYMENT_CONFIRMED (pago)</option>
                <option value="PAYMENT_RECEIVED">PAYMENT_RECEIVED (recebido)</option>
                <option value="PAYMENT_REFUNDED">PAYMENT_REFUNDED (estornado)</option>
                <option value="PAYMENT_OVERDUE">PAYMENT_OVERDUE (vencido)</option>
              </select>
            </div>
            <Button className="w-full" onClick={runSimulation} disabled={simLoading}>
              {simLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Webhook className="h-4 w-4 mr-2" />}
              Disparar simulação
            </Button>
            {simResult && (
              <div className="rounded-md border border-border bg-muted/40 p-2 text-[11px] max-h-64 overflow-auto">
                <pre className="whitespace-pre-wrap break-all">{JSON.stringify(simResult, null, 2)}</pre>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
