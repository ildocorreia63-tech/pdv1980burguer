import defaultLogo from "@/assets/logo-1980.jpg";
import { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut, ClipboardList, Users, Cake, Boxes, Tag, Settings as SettingsIcon, MapPin, RotateCcw, Plus, LayoutDashboard, UserRoundCog } from "lucide-react";
import { useStoreLogo } from "@/hooks/useStoreLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Link, useLocation } from "react-router-dom";

export const AppHeader = ({ title, action, subAction }: { title?: string; action?: ReactNode; subAction?: ReactNode }) => {
  const { signOut, user } = useAuth();
  const storeLogo = useStoreLogo();
  const location = useLocation();
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur-md">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-black ring-2 ring-primary/30 flex items-center justify-center p-1">
          <img src={storeLogo ?? defaultLogo} alt="Logo da loja" className="h-full w-full object-contain" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-2xl leading-none text-foreground uppercase tracking-tight">
            {title ?? "1980 Burguer"}
          </h1>
        </div>
        {action}
        <ThemeToggle />
        <Button size="icon" variant="ghost" onClick={signOut} aria-label="Sair">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
      {(subAction || (location.pathname !== "/pdv" && location.pathname !== "/" && location.pathname !== "/cozinha")) && (
        <div className="px-4 pb-3 flex gap-1 overflow-x-auto no-scrollbar">
          {(location.pathname.startsWith("/admin") ||
           location.pathname === "/equipe" ||
           location.pathname === "/relatorios" ||
           location.pathname === "/clientes" ||
           location.pathname === "/aniversariantes" ||
           location.pathname === "/insumos" ||
           location.pathname === "/lista-compras") ? (
            <>
              <Link to="/admin">
                <Button 
                  variant={location.pathname === "/admin" ? "default" : "outline"} 
                  size="icon" 
                  className="h-10 w-10 shrink-0" 
                  title="Painel Admin"
                >
                  <LayoutDashboard className="h-5 w-5" />
                </Button>
              </Link>
              <Link to="/equipe"><Button variant={location.pathname === "/equipe" ? "default" : "outline"} size="icon" className="h-10 w-10 shrink-0" title="Operadores e turnos"><UserRoundCog className="h-5 w-5" /></Button></Link>
              <Link to="/relatorios">
                <Button 
                  variant={location.pathname === "/relatorios" ? "default" : "outline"} 
                  size="icon" 
                  className="h-10 w-10 shrink-0" 
                  title="Relatórios"
                >
                  <ClipboardList className="h-5 w-5" />
                </Button>
              </Link>
              <Link to="/clientes">
                <Button 
                  variant={location.pathname === "/clientes" ? "default" : "outline"} 
                  size="icon" 
                  className="h-10 w-10 shrink-0" 
                  title="Clientes"
                >
                  <Users className="h-5 w-5" />
                </Button>
              </Link>
              <Link to="/aniversariantes">
                <Button 
                  variant={location.pathname === "/aniversariantes" ? "default" : "outline"} 
                  size="icon" 
                  className="h-10 w-10 shrink-0" 
                  title="Aniversariantes"
                >
                  <Cake className="h-5 w-5" />
                </Button>
              </Link>
              <Link to="/insumos">
                <Button 
                  variant={location.pathname === "/insumos" ? "default" : "outline"} 
                  size="icon" 
                  className="h-10 w-10 shrink-0" 
                  title="Insumos"
                >
                  <Boxes className="h-5 w-5" />
                </Button>
              </Link>
              <Link to="/lista-compras">
                <Button 
                  variant={location.pathname === "/lista-compras" ? "default" : "outline"} 
                  size="icon" 
                  className="h-10 w-10 shrink-0" 
                  title="Lista de Compras"
                >
                  <Tag className="h-5 w-5" />
                </Button>
              </Link>
            </>
          ) : null}
          {subAction}
        </div>
      )}
    </header>
  );
};
