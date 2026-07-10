import { NavLink, useLocation } from "react-router-dom";
import { Home, ShoppingCart, Users, Receipt, Package, Bell, FileBarChart, ChefHat } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const tabs = [
  { to: "/", icon: Home, label: "Início" },
  { to: "/pdv", icon: ShoppingCart, label: "PDV" },
  { to: "/pedidos", icon: Bell, label: "Pedidos", badge: true },
  { to: "/cozinha", icon: ChefHat, label: "Cozinha" },
  { to: "/fiado", icon: Users, label: "Fiados" },
  { to: "/despesas", icon: Receipt, label: "Despesas" },
  { to: "/relatorios", icon: FileBarChart, label: "Relatório" },
];

export const BottomNav = () => {
  const { isAdmin } = useAuth();
  const loc = useLocation();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const fetchCount = async () => {
      const { count } = await supabase
        .from("online_orders")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      setPendingCount(count ?? 0);
    };
    fetchCount();
    const channel = supabase
      .channel("nav_pending_orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "online_orders" }, fetchCount)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const items = [...tabs];
  if (isAdmin) items.push({ to: "/admin", icon: Package, label: "Admin" } as any);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-md shadow-retro">
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
        {items.map(({ to, icon: Icon, label, badge }: any) => {
          const active = to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(to);
          return (
            <li key={to}>
              <NavLink
                to={to}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <div className="relative">
                  <Icon className={cn("h-5 w-5", active && "scale-110")} strokeWidth={active ? 2.5 : 2} />
                  {badge && pendingCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
                      {pendingCount}
                    </span>
                  )}
                </div>
                <span className="font-display text-xs tracking-wide">{label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
