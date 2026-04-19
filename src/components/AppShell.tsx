import { ReactNode } from "react";
import { AppHeader } from "./AppHeader";
import { BottomNav } from "./BottomNav";

export const AppShell = ({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) => (
  <div className="min-h-screen pb-20">
    <AppHeader title={title} action={action} />
    <main className="mx-auto max-w-2xl px-4 py-4">{children}</main>
    <BottomNav />
  </div>
);
