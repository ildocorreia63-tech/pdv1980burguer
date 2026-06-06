import { ReactNode } from "react";
import { AppHeader } from "./AppHeader";
import { BottomNav } from "./BottomNav";

export const AppShell = ({ title, action, subAction, children }: { title?: string; action?: ReactNode; subAction?: ReactNode; children: ReactNode }) => (
  <div className="min-h-screen pb-20">
    <AppHeader title={title} action={action} subAction={subAction} />
    <main className="mx-auto max-w-2xl px-4 py-4">{children}</main>
    <BottomNav />
  </div>
);
