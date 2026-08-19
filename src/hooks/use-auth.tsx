import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  refreshBranding: () => Promise<void>;
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
  /** Hvem rollen sist ble hentet for — se den stille grenen i fetchRole. */
  const sisteBrukerRef = useRef<string | null>(null);

  const qc = useQueryClient();

  const loadBranding = async (tid: string) => {
    const { data: settings } = await supabase
      .from("app_settings")
      .select("company_name, company_tagline, primary_color, logo_url")
      .eq("tenant_id", tid)
      .single();

    if (cancelRef.current || !settings) return;

    setBranding({
      company_name: settings.company_name ?? "",
      company_tagline: (settings as any).company_tagline ?? "",
      primary_color: (settings as any).primary_color ?? "#dc2626",
      logo_url: (settings as any).logo_url ?? "",
    });
  };

  /**
   * @param stille Hent rollen uten å slå på roleLoading.
   *
   * Rota bytter hele siden ut med en lasteskjerm så lenge roleLoading er sann,
   * og det unmonterer alt som står i et skjema. onAuthStateChange fyrer ikke
   * bare ved innlogging: den fyrer også når tokenet fornyes, og når passordet
   * kontrolleres på nytt før en låst endring. Uten denne skilnaden ville et
   * halvferdig tilbud blitt kastet midt i arbeidet, uten at noe forklarte hvorfor.
   */
  const fetchRole = async (userId: string, stille = false) => {
    if (!stille) setRoleLoading(true);
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
        await loadBranding(tid);
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
        // Samme bruker som sist betyr at rollen alt er lastet. Da hentes den
        // på nytt i bakgrunnen, uten å blokkere skjermen.
        const samme = sisteBrukerRef.current === s.user.id;
        sisteBrukerRef.current = s.user.id;
        fetchRole(s.user.id, samme);
      } else {
        sisteBrukerRef.current = null;
        setRole(null);
        setTenantId(null);
        setBranding(null);
        setAuthError(null);
        setRoleLoading(false); // reset if fetchRole was in-flight when sign-out fired

        // Både utlogging og innlogging er ren SPA-navigasjon, så query-cachen
        // overlever byttet. Uten denne tømmingen viser anbud, endringsmeldinger
        // og dashbordet forrige firmas tall og konkurrentpriser til refetchen er
        // ferdig. Den ligger her og ikke i signOut, så også en utløpt økt og en
        // utlogging fra en annen fane blir dekket.
        qc.clear();
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

  // Firmanavn, logo og primærfarge leses bare ved innlogging. Uten en måte å
  // hente dem på nytt ble toppmenyen stående med gamle verdier til neste
  // sidelasting etter at de ble endret i Innstillinger.
  const refreshBranding = async () => {
    if (!tenantId) return;
    try {
      await loadBranding(tenantId);
    } catch {
      // Branding er kosmetikk — lagringen er allerede bekreftet for brukeren.
    }
  };

  return (
    <Ctx.Provider value={{
      user, session, loading, roleLoading, role,
      isAdmin: role === "admin",
      tenantId,
      hasTenant: tenantId !== null,
      branding,
      refreshBranding,
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
