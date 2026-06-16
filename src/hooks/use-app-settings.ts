import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

export interface Forbehold {
  title: string;
  description: string;
}

export interface OurRef {
  name: string;
  position?: string; // stilling, t.d. "Daglig leder"
  phone: string;
  email: string;
  signature?: string; // base64 dataURL
}

export interface AppSettings {
  id: string;
  offer_validity_days: number;
  our_refs: OurRef[];
  company_name: string;
  company_tagline: string;
  units: string[];
  forbehold: Forbehold[];
  payment_terms: string;
  default_offer_text: string;
  email_subject_template: string;
  vat_pct: number;
  closing_page_offset_mm: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  id: SETTINGS_ID,
  offer_validity_days: 60,
  our_refs: [{ name: "", phone: "", email: "" }],
  company_name: "Tilbudssystem",
  company_tagline: "",
  units: ["stk", "m", "m²", "m³", "tonn", "time", "LS", "RS"],
  forbehold: [],
  payment_terms: "30 dager netto",
  default_offer_text: "",
  email_subject_template: "Tilbud #{nr} – {tittel}",
  vat_pct: 25,
  closing_page_offset_mm: 90,
};

function parseOurRefs(v: unknown): OurRef[] {
  const raw: unknown[] = Array.isArray(v) ? v : (typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return []; } })() : []);
  if (!raw.length) return DEFAULT_SETTINGS.our_refs;
  return raw.map((r) => {
    if (typeof r === "string") return { name: r, phone: "", email: "" };
    const obj = r as Record<string, unknown>;
    return { name: String(obj.name ?? ""), position: obj.position ? String(obj.position) : undefined, phone: String(obj.phone ?? ""), email: String(obj.email ?? ""), signature: obj.signature ? String(obj.signature) : undefined };
  });
}

function parseForbehold(v: unknown): Forbehold[] {
  const raw: unknown[] = Array.isArray(v) ? v : (typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return []; } })() : []);
  if (!raw.length) return [];
  return raw.map((r) => {
    if (typeof r === "string") return { title: r, description: "" };
    const obj = r as Record<string, unknown>;
    return { title: String(obj.title ?? ""), description: String(obj.description ?? "") };
  });
}

function parseStringArray(v: unknown, fallback: string[]): string[] {
  if (Array.isArray(v)) return v as string[];
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch { return fallback; }
  }
  return fallback;
}

export function useAppSettings() {
  return useQuery({
    queryKey: ["app-settings"],
    queryFn: async (): Promise<AppSettings> => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .eq("id", SETTINGS_ID)
        .maybeSingle();
      if (error) throw error;
      if (!data) return DEFAULT_SETTINGS;
      return {
        ...DEFAULT_SETTINGS,
        ...data,
        our_refs: parseOurRefs(data.our_refs),
        units: parseStringArray(data.units, DEFAULT_SETTINGS.units),
        forbehold: parseForbehold(data.forbehold),
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return async (patch: Partial<Omit<AppSettings, "id">>) => {
    const { error } = await supabase
      .from("app_settings")
      .upsert({ id: SETTINGS_ID, ...patch });
    if (error) { toast.error(error.message); return false; }
    qc.invalidateQueries({ queryKey: ["app-settings"] });
    toast.success("Innstillingar lagra");
    return true;
  };
}
