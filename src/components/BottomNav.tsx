import { NavLink, useLocation } from "react-router-dom";
import { Home, ShoppingCart, Users, Receipt, Package, BarChart3 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/", icon: Home, label: "Início" },
  { to: "/pdv", icon: ShoppingCart, label: "PDV" },
  { to: "/fiado", icon: Users, label: "Fiados" },
  { to: "/despesas", icon: Receipt, label: "Despesas" },
];

export const BottomNav = () => {
  const { isAdmin } = useAuth();
  const loc = useLocation();
  const items = [...tabs];
  if (isAdmin) items.push({ to: "/admin", icon: Package, label: "Admin" });

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-md shadow-retro">
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
        {items.map(({ to, icon: Icon, label }) => {
          const active = to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(to);
          return (
            <li key={to}>
              <NavLink
                to={to}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className={cn("h-5 w-5", active && "scale-110")} strokeWidth={active ? 2.5 : 2} />
                <span className="font-display text-xs tracking-wide">{label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
