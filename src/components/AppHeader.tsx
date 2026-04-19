import logo from "@/assets/logo-1980.jpg";
import { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export const AppHeader = ({ title, action }: { title?: string; action?: ReactNode }) => {
  const { signOut, user } = useAuth();
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur-md">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-foreground/5 ring-2 ring-primary/30">
          <img src={logo} alt="Logo 1980 Burguer" className="h-full w-full object-cover" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-xl leading-none text-foreground">
            {title ?? "1980 Burguer"}
          </h1>
          <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
        </div>
        {action}
        <Button size="icon" variant="ghost" onClick={signOut} aria-label="Sair">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
};
