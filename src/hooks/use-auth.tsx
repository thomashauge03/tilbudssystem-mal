import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface TenantBranding {
  company_name: string;
  company_tagline: string;
  primary_color: string;
  logo_url: string;
}

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: "admin" | "member" | null;
  isAdmin: boolean;
  tenantId: string | null;
  hasTenant: boolean;
  branding: TenantBranding | null;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<"admin" | "member" | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [branding, setBranding] = useState<TenantBranding | null>(null);

  const fetchRole = async (userId: string) => {
    const { data } = await supabase
      .from("tenant_users")
      .select("role, tenant_id")
      .eq("user_id", userId)
      .single();
    setRole((data?.role as "admin" | "member") ?? null);
    const tid = data?.tenant_id ?? null;
    setTenantId(tid);

    if (tid) {
      const { data: settings } = await supabase
        .from("app_settings")
        .select("company_name, company_tagline, primary_color, logo_url")
        .eq("tenant_id", tid)
        .single();
      if (settings) {
        setBranding({
          company_name: settings.company_name ?? "",
          company_tagline: (settings as any).company_tagline ?? "",
          primary_color: (settings as any).primary_color ?? "#dc2626",
          logo_url: (settings as any).logo_url ?? "",
        });
      }
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) fetchRole(s.user.id);
      else { setRole(null); setTenantId(null); setBranding(null); }
    });
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) await fetchRole(data.session.user.id);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? { error: error.message } : {};
  };
  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    return error ? { error: error.message } : {};
  };
  const signOut = async () => { await supabase.auth.signOut(); };

  return (
    <Ctx.Provider value={{
      user, session, loading, role,
      isAdmin: role === "admin",
      tenantId,
      hasTenant: tenantId !== null,
      branding,
      signIn, signUp, signOut,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
};
