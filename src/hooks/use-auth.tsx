import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
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
  roleLoading: boolean;
  role: "admin" | "member" | null;
  isAdmin: boolean;
  tenantId: string | null;
  hasTenant: boolean;
  branding: TenantBranding | null;
  authError: string | null;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(false);
  const [role, setRole] = useState<"admin" | "member" | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [branding, setBranding] = useState<TenantBranding | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // C2: cancel flag prevents stale async results from applying after unmount/sign-out
  const cancelRef = useRef(false);

  const fetchRole = async (userId: string) => {
    setRoleLoading(true);
    setAuthError(null);
    try {
      const { data, error } = await supabase
        .from("tenant_users")
        .select("role, tenant_id")
        .eq("user_id", userId)
        .single();

      if (cancelRef.current) return;

      // M2: explicit error handling — network failure vs no tenant are different
      if (error && error.code !== "PGRST116") {
        // PGRST116 = no rows found (not an error, just no tenant yet)
        setAuthError("Kunne ikke laste brukerdata. Prøv å laste siden på nytt.");
        return;
      }

      setRole((data?.role as "admin" | "member") ?? null);
      const tid = data?.tenant_id ?? null;
      setTenantId(tid);

      if (tid) {
        const { data: settings } = await supabase
          .from("app_settings")
          .select("company_name, company_tagline, primary_color, logo_url")
          .eq("tenant_id", tid)
          .single();

        if (cancelRef.current) return;

        if (settings) {
          setBranding({
            company_name: settings.company_name ?? "",
            company_tagline: (settings as any).company_tagline ?? "",
            primary_color: (settings as any).primary_color ?? "#dc2626",
            logo_url: (settings as any).logo_url ?? "",
          });
        }
      }
    } catch {
      if (!cancelRef.current) {
        setAuthError("Noe gikk galt ved innlasting. Prøv igjen.");
      }
    } finally {
      if (!cancelRef.current) {
        setRoleLoading(false);
      }
    }
  };

  useEffect(() => {
    cancelRef.current = false;

    // C2/H2: rely solely on onAuthStateChange (fires INITIAL_SESSION on mount),
    // so fetchRole is only called from one place and never races with getSession.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);

      if (s?.user) {
        fetchRole(s.user.id);
      } else {
        setRole(null);
        setTenantId(null);
        setBranding(null);
        setAuthError(null);
      }

      // Mark initial load done after first auth event
      setLoading(false);
    });

    return () => {
      cancelRef.current = true;
      subscription.unsubscribe();
    };
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
      user, session, loading, roleLoading, role,
      isAdmin: role === "admin",
      tenantId,
      hasTenant: tenantId !== null,
      branding,
      authError,
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
