import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "operator";

type AuthCtx = {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  isAdmin: boolean;
  isStaff: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({} as AuthCtx);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let requestId = 0;
    let receivedAuthEvent = false;

    const resolveSession = async (nextSession: Session | null) => {
      const currentRequestId = ++requestId;
      const nextUser = nextSession?.user ?? null;

      setSession(nextSession);
      setUser(nextUser);
      setRole(null);
      setLoading(Boolean(nextUser));

      if (!nextUser) {
        if (active && currentRequestId === requestId) setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", nextUser.id);

        if (!active || currentRequestId !== requestId) return;
        if (error) {
          console.error("Could not verify the signed-in user's role:", error);
          setRole(null);
        } else {
          const roles = data?.map((row) => row.role) ?? [];
          setRole(roles.includes("admin") ? "admin" : roles.includes("operator") ? "operator" : null);
        }
      } catch (error) {
        if (!active || currentRequestId !== requestId) return;
        console.error("Could not verify the signed-in user's role:", error);
        setRole(null);
      } finally {
        if (active && currentRequestId === requestId) setLoading(false);
      }
    };

    const { data: authSubscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      receivedAuthEvent = true;
      // Defer database work until Supabase finishes its auth callback.
      void Promise.resolve().then(() => resolveSession(nextSession));
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (receivedAuthEvent || !active) return;
      if (error) {
        console.error("Could not restore the Supabase session:", error);
        setSession(null);
        setUser(null);
        setRole(null);
        setLoading(false);
        return;
      }
      void resolveSession(data.session);
    }).catch((error: unknown) => {
      if (!active || receivedAuthEvent) return;
      console.error("Could not restore the Supabase session:", error);
      setSession(null);
      setUser(null);
      setRole(null);
      setLoading(false);
    });

    return () => {
      active = false;
      requestId += 1;
      authSubscription.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const isAdmin = role === "admin";
  const isStaff = role === "admin" || role === "operator";

  return (
    <Ctx.Provider value={{ user, session, role, isAdmin, isStaff, loading, signOut }}>
      {children}
    </Ctx.Provider>
  );
};

export const useAuth = () => useContext(Ctx);
