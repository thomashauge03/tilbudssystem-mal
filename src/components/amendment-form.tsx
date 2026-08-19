import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Trash2, Save, FileDown, Mail, ArrowLeft, Link2, RotateCcw, CheckCircle2, GripVertical, ArrowUp, ArrowDown } from "lucide-react";
import { nok, fmtDate, toISODate, OFFER_WON_STATUSES, UNITS as FALLBACK_UNITS } from "@/lib/format";
import { openAmendmentPdf } from "@/lib/pdf";
import { AttachmentField } from "@/components/attachment-field";
import { useAppSettings } from "@/hooks/use-app-settings";
import { useAuth } from "@/hooks/use-auth";

interface ALine { id?: string; sort_order: number; description: string; quantity: number; unit: string; unit_price: number; }
interface AState {
  id?: string; amendment_number: string; offer_id: string | null; project_id: string | null; project_ref: string; internal_description: string;
  is_mass_settlement: boolean; is_additional_work: boolean; is_price_increase: boolean;
  notified_date: string; revised_date: string | null; project_manager: string; customer_email: string;
  change_description: string; reason: string; other_notes: string;
  // Livssyklus: 'krav' ved oppretting, 'endringsmelding' når kunden har signert.
  // Begge feltene ligger her slik at de overlever lagring og lasting av skjemaet.
  status?: string;
  customer_signed_at?: string | null;
  attachment_urls?: Array<{ name: string; url: string }>;
}

function empty(): AState {
  return {
    amendment_number: "", offer_id: null, project_id: null, project_ref: "", internal_description: "",
    is_mass_settlement: false, is_additional_work: false, is_price_increase: false,
    notified_date: toISODate(new Date()), revised_date: null,
    project_manager: "", customer_email: "",
    change_description: "", reason: "", other_notes: "",
    status: "krav", customer_signed_at: null, attachment_urls: [],
  };
}

export function AmendmentForm({ amendmentId, initialOfferId }: { amendmentId?: string; initialOfferId?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isEdit = !!amendmentId;
  const { tenantId } = useAuth();
  const { data: appSettings } = useAppSettings();
  const units = appSettings?.units ?? FALLBACK_UNITS;

  const { data: loaded } = useQuery({
    queryKey: ["amendment", amendmentId],
    enabled: isEdit,
    queryFn: async () => {
      const [a, l] = await Promise.all([
        supabase.from("amendments").select("*").eq("id", amendmentId!).single(),
        supabase.from("amendment_lines").select("*").eq("amendment_id", amendmentId!).order("sort_order"),
      ]);
      if (a.error) throw a.error;
      return { amendment: a.data, lines: (l.data ?? []) as ALine[] };
    },
  });

  const { data: projects } = useQuery({
    queryKey: ["projects-simple"],
    queryFn: async () => {
      const { data } = await supabase
        .from("projects")
        .select("id, name, project_number, status")
        .eq("status", "aktiv")
        .order("name");
      return data ?? [];
    },
  });

  const { data: offers } = useQuery({
    queryKey: ["offers-for-amendment", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("offers")
        .select("id, offer_number, title, customer_name, project_number, status")
        .eq("tenant_id", tenantId!)
        .in("status", OFFER_WON_STATUSES)
        .order("offer_number", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  const [a, setA] = useState<AState>(() => empty());
  const [lines, setLines] = useState<ALine[]>([]);
  const [init, setInit] = useState(false);
  // Knappene lagrer før de gjør noe annet. Uten denne referansen ville en ny
  // melding blitt lagt inn på nytt for hver knapp man trykket på, og
  // signeringslenken ville pekt på den første av kopiene.
  const currentAmendmentIdRef = useRef<string | undefined>(amendmentId);
  // Nummeret genereres inne i save(), og setA() rekker ikke å slå gjennom før
  // PDF-en og e-posten leses av. Uten dette ville et nytt krav fått tomt
  // nummer i dokumentet.
  const currentNumberRef = useRef<string>("");
  // Utkastet skal bare skrives når brukeren faktisk har endret noe. Uten denne
  // ville et utkast blitt skrevet i det meldingen ble åpnet, og et senere besøk
  // gjenopprettet det øyeblikksbildet — hadde kunden signert i mellomtiden,
  // rullet en lagring linjene tilbake uten varsel. Den nullstilles ved
  // vellykket lagring, ellers ville save() sin setA() skrevet utkastet tilbake
  // rett etter at det ble fjernet.
  const userEditedRef = useRef(false);
  // Kommer man fra et tilbud, hører utkastet til akkurat den kombinasjonen.
  // Ellers ville utkastet fra ett tilbud dukket opp på et annet.
  const DRAFT_KEY = `amendment-draft-${amendmentId ?? "new"}${initialOfferId ? `-${initialOfferId}` : ""}`;

  // Når kravet opprettes fra inne i et tilbud, hentes tilbudet slik at både
  // tilbudskoblingen og prosjektet kan fylles inn på forhånd.
  const { data: initialOffer } = useQuery({
    queryKey: ["offer-for-new-amendment", initialOfferId],
    enabled: !!initialOfferId && !amendmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offers")
        .select("id, offer_number, title, our_ref, project_id, project_number, customer_email, projects(project_number, name)")
        .eq("id", initialOfferId!)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  useEffect(() => {
    // Vent på tilbudet før skjemaet initialiseres, ellers ville det blitt tomt
    if (!isEdit && initialOfferId && !initialOffer) return;

    if (!isEdit && !init) {
      // Utkastet har forrang framfor forhåndsutfyllingen fra tilbudet. Ellers
      // ville alt man hadde skrevet blitt overskrevet hver gang man forlot
      // siden og kom tilbake til det samme kravet.
      const saved = sessionStorage.getItem(DRAFT_KEY);
      if (saved) {
        try {
          const { a: sa, lines: sl } = JSON.parse(saved);
          setA(sa);
          setLines(sl ?? []);
          setInit(true);
          return;
        } catch { sessionStorage.removeItem(DRAFT_KEY); }
      }

      if (initialOfferId && initialOffer) {
        const proj = initialOffer.projects;
        setA({
          ...empty(),
          offer_id: initialOffer.id,
          project_id: initialOffer.project_id ?? null,
          project_ref: initialOffer.project_number || proj?.project_number || proj?.name || "",
          internal_description: initialOffer.title ?? "",
          customer_email: initialOffer.customer_email ?? "",
          // Tilbudets "Vår referanse" er den samme personen som står som
          // prosjektleder på endringen. Mangler den, brukes firmaets første
          // referanse fra innstillingene.
          project_manager: initialOffer.our_ref || appSettings?.our_refs?.[0]?.name || "",
        });
        setInit(true);
        return;
      }

      setA(empty()); setInit(true);
    }
    if (isEdit && loaded && !init) {
      const la = loaded.amendment as any;
      // Utkastet gjelder også redigering. Uten dette var alt man hadde skrevet
      // borte uten varsel om man navigerte bort eller trykte F5 før lagring.
      const saved = sessionStorage.getItem(DRAFT_KEY);
      if (saved) {
        try {
          const { a: sa, lines: sl } = JSON.parse(saved);
          // Signaturen leses alltid fra databasen: har kunden signert mens
          // utkastet lå og ventet, ville et gammelt øyeblikksbilde ellers vist
          // meldingen som usignert og forsøkt å skrive linjene på nytt.
          const signert = !!la.customer_signed_at || la.status === "endringsmelding";
          setA({ ...sa, status: la.status, customer_signed_at: la.customer_signed_at });
          // Og har kunden rukket å signere, er det de signerte linjene som
          // gjelder — ikke de vi hadde liggende i et utkast. Ellers ville PDF-en
          // og e-posten vist andre tall enn dem kunden faktisk skrev under på,
          // uten at noe sa fra: linjene er jo låst og ser dermed autoritative ut.
          setLines(signert ? loaded.lines : (sl ?? []));
          setInit(true);
          return;
        } catch { sessionStorage.removeItem(DRAFT_KEY); }
      }
      setA({
        ...la,
        // Kolonnene er nullbare, men feltene er bundet til kontrollerte felt og
        // leses med .includes(). Uten normaliseringen her krasjet «Send på
        // e-post» på en melding som var lagret uten prosjektleder.
        project_ref: la.project_ref ?? "",
        internal_description: la.internal_description ?? "",
        project_manager: la.project_manager ?? "",
        customer_email: la.customer_email ?? "",
        change_description: la.change_description ?? "",
        reason: la.reason ?? "",
        other_notes: la.other_notes ?? "",
        attachment_urls: Array.isArray(la.attachment_urls) ? la.attachment_urls : [],
      });
      setLines(loaded.lines);
      setInit(true);
    }
  }, [isEdit, loaded, init, initialOfferId, initialOffer, appSettings]);

  // Lagre skjematilstand i sessionStorage ved hver endring
  useEffect(() => {
    if (!init) return;
    if (!userEditedRef.current) return;
    // Er et nytt krav alt lagt inn (PDF-, e-post- og lenkeknappene lagrer uten å
    // navigere bort), ville utkastet blitt en skygge av en rad som finnes:
    // neste «Nytt krav» gjenopprettet alt, og «Lagre» laget krav nummer to.
    if (!isEdit && currentAmendmentIdRef.current) return;
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ a, lines }));
  }, [a, lines, init, isEdit]);

  const subtotal = useMemo(() => lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unit_price || 0), 0), [lines]);
  const set = <K extends keyof AState>(k: K, v: AState[K]) => {
    userEditedRef.current = true;
    setA((p) => ({ ...p, [k]: v }));
  };

  // Et krav om endring blir en endringsmelding først når kunden har signert.
  // Statusen settes av en trigger i databasen, men vi leser begge feltene her
  // slik at visningen stemmer også rett etter en nullstilling.
  // Kunden ligger på det koblede tilbudet — endringen har bare e-postadressen
  const kundeNavn = (offers ?? []).find((o: any) => o.id === a.offer_id)?.customer_name ?? "";

  const isSigned = !!a.customer_signed_at || a.status === "endringsmelding";
  const docLabel = isSigned ? "Endringsmelding" : "Krav om endring";

  const pickProject = (id: string) => {
    userEditedRef.current = true;
    if (id === "__none") { setA((p) => ({ ...p, project_id: null, project_ref: "" })); return; }
    const proj = (projects ?? []).find((x: any) => x.id === id);
    if (!proj) return;
    setA((p) => ({
      ...p,
      project_id: proj.id,
      project_ref: proj.project_number ?? proj.name ?? "",
      customer_email: p.customer_email || "",
    }));
  };

  const pickOffer = (id: string) => {
    userEditedRef.current = true;
    if (id === "__none") { setA((p) => ({ ...p, offer_id: null })); return; }
    const o = (offers ?? []).find((x: any) => x.id === id);
    if (!o) return;
    setA((p) => ({
      ...p,
      offer_id: o.id,
      project_ref: p.project_ref || o.project_number || String(o.offer_number),
      internal_description: p.internal_description || o.title || "",
    }));
  };

  const addLine = () => { userEditedRef.current = true; setLines((p) => [...p, { sort_order: p.length, description: "", quantity: 1, unit: "stk", unit_price: 0 }]); };
  const removeLine = (i: number) => { userEditedRef.current = true; setLines((p) => p.filter((_, idx) => idx !== i)); };
  const updLine = (i: number, patch: Partial<ALine>) => { userEditedRef.current = true; setLines((p) => p.map((l, idx) => idx === i ? { ...l, ...patch } : l)); };

  // Flytt en linje fra en posisjon til en annen og oppdater sort_order
  const moveLine = (from: number, to: number) => {
    userEditedRef.current = true;
    setLines((p) => {
      if (from === to || to < 0 || to >= p.length) return p;
      const next = [...p];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next.map((l, idx) => ({ ...l, sort_order: idx }));
    });
  };

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dropOn = (i: number) => {
    if (dragIndex !== null) moveLine(dragIndex, i);
    setDragIndex(null);
    setDragOverIndex(null);
  };

  // Generer endringsmeldingsnummer: [prosjekt]-[løpenummer]
  async function nextNumber(project: string): Promise<string> {
    const prefix = (project || "0").trim();
    const { data, error } = await supabase.from("amendments").select("amendment_number").like("amendment_number", `${prefix}-%`);
    // Uten dette ville en feil her stilltiende gi nummer 1 på nytt, og to
    // endringsmeldinger på samme prosjekt kunne få samme nummer.
    if (error) throw error;
    const nums = (data ?? []).map((r) => {
      const m = String(r.amendment_number ?? "").match(/-(\d+)$/);
      return m ? parseInt(m[1]) : 0;
    });
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return `${prefix}-${next}`;
  }

  const save = async (): Promise<string | null> => {
    // Feltene kan komme tilbake som null fra databasen, så .trim() må skjermes
    const projectRef = (a.project_ref ?? "").trim();
    const internalDesc = (a.internal_description ?? "").trim();
    if (!projectRef) { toast.error("Prosjekt er påkrevd"); return null; }
    let number = a.amendment_number;
    if (!isEdit && !number) {
      try {
        number = await nextNumber(projectRef);
      } catch (e: any) {
        toast.error(`Kunne ikke generere nummer: ${e?.message ?? e}`);
        return null;
      }
    }
    currentNumberRef.current = number;

    // Status er bevisst utelatt fra payload: den styres av signeringen (triggeren
    // i databasen setter 'endringsmelding'). Ville vi sendt a.status med her,
    // kunne en lagring av en signert melding skrevet 'krav' tilbake over den.
    const payload = {
      // amendments.title er NOT NULL uten default. Appen viser den ingen steder
      // — den bruker internal_description og project_ref — men uten en verdi her
      // feilet hver eneste innsetting på not-null-constraint.
      title: internalDesc || `${docLabel} ${number}`,
      amendment_number: number, offer_id: a.offer_id || null, project_id: a.project_id || null,
      project_ref: projectRef, internal_description: a.internal_description,
      is_mass_settlement: a.is_mass_settlement, is_additional_work: a.is_additional_work, is_price_increase: a.is_price_increase,
      notified_date: a.notified_date, revised_date: a.revised_date || null,
      project_manager: a.project_manager || null, customer_email: a.customer_email || null,
      change_description: a.change_description, reason: a.reason, other_notes: a.other_notes,
      attachment_urls: a.attachment_urls ?? [],
    };
    let id = currentAmendmentIdRef.current ?? amendmentId;
    const editing = isEdit || !!currentAmendmentIdRef.current;
    if (editing && id) {
      const { error } = await supabase.from("amendments").update(payload).eq("id", id);
      if (error) { toast.error(error.message); return null; }
      // Linjene på en signert melding er låst i databasen og kan uansett ikke
      // endres. Skrev vi dem likevel, avviste låsen både slettingen og
      // innsettingen, og save() returnerte null — da stoppet PDF, e-post og
      // lagring av overskriftsfeltene også, siden alt går gjennom save().
      if (!isSigned) {
        // Linjene skrives som slett-og-sett-inn. Går slettingen galt uten at vi
        // merker det, legges linjene inn dobbelt; går innsettingen galt etterpå,
        // er linjene borte i basen mens skjermen fortsatt viser dem.
        const { error: deleteError } = await supabase.from("amendment_lines").delete().eq("amendment_id", id);
        if (deleteError) { toast.error(deleteError.message); return null; }
      }
    } else {
      const { data, error } = await supabase.from("amendments").insert({ ...payload, status: "krav", tenant_id: tenantId }).select("id").single();
      if (error) { toast.error(error.message); return null; }
      id = data.id;
      currentAmendmentIdRef.current = id;
      setA((p) => ({ ...p, amendment_number: number, status: "krav" }));
    }
    // Er meldingen signert, står linjene urørt — de er alt skrevet, låst, og
    // vises uendret i PDF-en og i e-posten.
    if (!isSigned && lines.length) {
      // En linje som er beskrevet, men summerer til 0, er nesten alltid et
      // uhell. Både antall og pris markeres ved klikk, så ett tastetrykk tømmer
      // feltet — og Number("") er 0. Da ble 0 skrevet til basen uten et ord.
      //
      // Vakten ser på summen, ikke på ett av feltene: blir prisen nullet, eller
      // begge, er tapet like reelt. Er linjen bevisst uprist, bekrefter man og
      // går videre.
      const mistenkelige = lines.filter(
        (l) => l.description.trim() && Number(l.quantity || 0) * Number(l.unit_price || 0) === 0,
      );
      if (mistenkelige.length) {
        const liste = mistenkelige
          .map((l) => `• ${l.description} — ${Number(l.quantity || 0)} × ${Number(l.unit_price || 0)}`)
          .join("\n");
        if (!window.confirm(
          `${mistenkelige.length} linje(r) summerer til 0 kr:\n\n${liste}\n\n` +
          `Lagrer du nå, er tallene borte. Trykk Avbryt for å fylle dem inn først.`,
        )) return null;
      }

      const ins = lines.map((l, idx) => ({
        amendment_id: id!,
        tenant_id: tenantId,
        sort_order: idx,
        description: l.description,
        quantity: Number(l.quantity || 0),
        unit: l.unit,
        unit_price: Number(l.unit_price || 0),
      }));
      const { error } = await supabase.from("amendment_lines").insert(ins);
      if (error) { toast.error(error.message); return null; }
    }
    qc.invalidateQueries({ queryKey: ["amendments"] });
    qc.invalidateQueries({ queryKey: ["amendment", id] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    toast.success(`${docLabel} lagret`);
    // Slå av utkastlagringen først, ellers skriver effekten under setA() over
    // det vi nettopp fjernet.
    userEditedRef.current = false;
    sessionStorage.removeItem(DRAFT_KEY);
    return id!;
  };

  const handleSave = async () => { const id = await save(); if (id && !isEdit) navigate({ to: "/endringsmeldinger/$id", params: { id } }); };
  // Uten firmainnstillingene får dokumentet feil (eller manglende) firmanavn
  const requireSettings = () => {
    if (!appSettings) { toast.error("Firmainnstillingene er ikke lastet enda – prøv igjen om et øyeblikk"); return false; }
    return true;
  };

  const handlePdf = async () => {
    if (!requireSettings()) return;
    const id = await save();
    if (!id) return;
    // Referansen som hører til prosjektlederen — samme oppslag som tilbudet gjør
    const refObj = (appSettings?.our_refs ?? []).find((r) => r.name === a.project_manager);
    // Kundens signaturbilde ligger på tokenet han signerte med, ikke på selve
    // meldingen. Samme oppslag som kontrakten gjør. Feiler det, skal PDF-en
    // likevel komme — da står datolinjen alene, som før.
    let kundesignatur = "";
    if (a.customer_signed_at) {
      const { data: tok } = await supabase
        .from("amendment_signing_tokens")
        .select("signer_signature, used_at")
        .eq("amendment_id", id)
        .not("used_at", "is", null)
        .order("used_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      kundesignatur = (tok as any)?.signer_signature ?? "";
    }
    openAmendmentPdf(
      {
        amendment_number: a.amendment_number || currentNumberRef.current,
        project_ref: a.project_ref,
        internal_description: a.internal_description,
        change_description: a.change_description,
        reason: a.reason,
        other_notes: a.other_notes,
        notified_date: a.notified_date,
        revised_date: a.revised_date,
        project_manager: a.project_manager,
        // Kunden og prosjektlederens adresse skal stå i dokumentet, ikke bare i e-posten
        project_manager_email: (appSettings?.our_refs ?? []).find((r) => r.name === a.project_manager)?.email ?? "",
        customer_name: kundeNavn,
        customer_email: a.customer_email,
        is_mass_settlement: a.is_mass_settlement,
        is_additional_work: a.is_additional_work,
        is_price_increase: a.is_price_increase,
        status: a.status,
        customer_signed_at: a.customer_signed_at,
        customer_signature: kundesignatur,
      },
      lines.map((l) => ({
        description: l.description,
        quantity: Number(l.quantity || 0),
        unit: l.unit,
        unit_price: Number(l.unit_price || 0),
      })),
      // Endringsmeldingen har ingen adm.påslag, så totalen er summen av linjene
      { subtotal, total: subtotal },
      {
        company_name: appSettings?.company_name ?? "",
        company_tagline: appSettings?.company_tagline ?? "",
        logo_url: appSettings?.logo_url ?? "",
        company_org_nr: appSettings?.company_org_nr ?? "",
        vat_pct: appSettings?.vat_pct ?? 25,
        payment_terms: appSettings?.payment_terms ?? "30 dager netto",
        ref_phone: refObj?.phone ?? "",
        ref_email: refObj?.email ?? "",
        ref_position: refObj?.position ?? "",
        ref_signature: refObj?.signature ?? "",
      },
    );
  };
  const handleEmail = async () => {
    if (!requireSettings()) return;
    const id = await save(); if (!id) return;
    if (!a.customer_email) { toast.error("Mangler kunde-e-post"); return; }

    // Er kravet ikke signert, legger vi ved en signeringslenke slik tilbudene
    // gjør. Feiler den, sier vi fra og lar være å love en lenke i teksten som
    // likevel ikke ble med.
    let signingLink = "";
    if (!isSigned) {
      if (!tenantId) {
        toast.error("Ingen tenant – e-posten blir uten signeringslenke");
      } else {
        const { data: tokenData, error: tokenError } = await supabase
          .from("amendment_signing_tokens" as never)
          .insert({ amendment_id: id, tenant_id: tenantId } as never)
          .select("token")
          .single();
        if (tokenError || !tokenData) {
          toast.error(tokenError?.message ?? "Kunne ikke opprette signeringslenke");
        } else {
          signingLink = `\n\nSigner kravet digitalt her:\n${window.location.origin}/signer-endring/${(tokenData as any).token}`;
        }
      }
    }
    // Setningen om signeringslenken faller bort når lenken ikke ble med
    const signingInfo = signingLink
      ? "\n\nVia signeringslenken kan du lese gjennom kravet før du signerer digitalt. Når kravet er signert, blir det en endringsmelding."
      : "";

    const senderName = appSettings?.company_name ?? "Tilbudssystem";
    // Nummeret ligger bare i referansen når kravet nettopp ble opprettet
    const number = a.amendment_number || currentNumberRef.current;
    const subject = isSigned
      ? `Endringsmelding nr. ${number} – Prosjekt ${a.project_ref}`
      : `Krav om endring nr. ${number} – Prosjekt ${a.project_ref}`;
    const body = isSigned
      ? `Hei,\n\nVedlagt finner du endringsmelding nr. ${number} for prosjekt ${a.project_ref}.\n\nMed vennlig hilsen\n${senderName}`
      : `Hei,\n\nVi sender herved krav om endring nr. ${number} for prosjekt ${a.project_ref}.${signingLink}${signingInfo}\n\nTa gjerne kontakt om du har spørsmål.\n\nMed vennlig hilsen\n${senderName}`;
    // Prosjektlederfeltet inneholder et navn, ikke en adresse, så den gamle
    // sjekken på "@" traff aldri og kopien ble aldri sendt. Adressen slås nå opp
    // blant referansene i innstillingene, med feltet selv som reserve dersom
    // noen har skrevet en e-postadresse rett inn.
    const pmRef = (appSettings?.our_refs ?? []).find((r) => r.name === a.project_manager);
    // Feltet kan komme tilbake som null fra databasen, så oppslaget må skjermes
    const pmNavn = a.project_manager ?? "";
    const pmEpost = pmRef?.email || (pmNavn.includes("@") ? pmNavn : "");
    const cc = pmEpost ? `&cc=${encodeURIComponent(pmEpost)}` : "";
    window.location.href = `mailto:${encodeURIComponent(a.customer_email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}${cc}`;
  };

  const handleSigningLink = async () => {
    const id = await save();
    if (!id) return;
    if (!tenantId) { toast.error("Ingen tenant"); return; }
    const { data: tokenData, error } = await supabase
      .from("amendment_signing_tokens" as never)
      .insert({ amendment_id: id, tenant_id: tenantId } as never)
      .select("token")
      .single();
    if (error || !tokenData) { toast.error("Kunne ikke opprette signeringslenke"); return; }
    const link = `${window.location.origin}/signer-endring/${(tokenData as any).token}`;
    await navigator.clipboard.writeText(link);
    toast.success("Signeringslenke kopiert til utklippstavlen!");
  };

  const handleResetSignature = async () => {
    if (!amendmentId) return;
    if (!window.confirm("Er du sikker på at du vil nullstille kundesignaturen? Meldingen blir da et krav om endring igjen, og alle signeringslenker slutter å fungere.")) return;
    await supabase.from("amendment_signing_tokens" as never).delete().eq("amendment_id" as never, amendmentId as never);
    // Triggeren i databasen setter bare status ved signering, ikke ved
    // nullstilling — derfor må status settes eksplisitt tilbake til 'krav' her.
    const { error } = await supabase
      .from("amendments")
      .update({ customer_signed_at: null, status: "krav" } as any)
      .eq("id", amendmentId);
    if (error) { toast.error(error.message); return; }
    setA((p) => ({ ...p, customer_signed_at: null, status: "krav" }));
    qc.invalidateQueries({ queryKey: ["amendment", amendmentId] });
    qc.invalidateQueries({ queryKey: ["amendments"] });
    toast.success("Signatur nullstilt. Du kan nå sende ut en ny signeringslenke.");
  };

  if (isEdit && !init) return <div className="text-muted-foreground">Laster…</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild><Link to="/endringsmeldinger"><ArrowLeft className="mr-1 h-4 w-4" />Tilbake</Link></Button>
          <h1 className="text-2xl font-bold">
            {isEdit ? `${docLabel} #${a.amendment_number}` : "Nytt krav om endring"}
          </h1>
        </div>
        <div className="flex gap-2 flex-wrap lg:justify-end">
          {/* Er den alt signert, skal det ikke gå an å be om en ny signatur —
              da ville customer_signed_at blitt overskrevet. Nullstill først. */}
          {!isSigned && (
            <Button variant="outline" onClick={handleSigningLink} title="Generer signeringslenke og kopier til utklippstavlen">
              <Link2 className="mr-2 h-4 w-4" />Signeringslenke
            </Button>
          )}
          {isEdit && isSigned && (
            <Button variant="outline" onClick={handleResetSignature} className="text-destructive border-destructive/50 hover:bg-destructive/10" title="Nullstill kundesignatur">
              <RotateCcw className="mr-2 h-4 w-4" />Nullstill signatur
            </Button>
          )}
          <Button variant="outline" onClick={handleEmail}><Mail className="mr-2 h-4 w-4" />Send på e-post</Button>
          <Button variant="outline" onClick={handlePdf}><FileDown className="mr-2 h-4 w-4" />Lagre og last ned PDF</Button>
          <Button onClick={handleSave}><Save className="mr-2 h-4 w-4" />Lagre</Button>
        </div>
      </div>

      {isSigned && (
        <div className="flex items-start gap-3 rounded-xl border border-green-600/40 bg-green-600/10 p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" />
          <div className="text-sm">
            <div className="font-semibold text-green-700 dark:text-green-500">
              Signert av kunden{a.customer_signed_at ? ` ${fmtDate(a.customer_signed_at)}` : ""}
            </div>
            <div className="text-muted-foreground">
              Kravet om endring er nå en endringsmelding.
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Endringsinfo</h2>
          <div className="space-y-2">
            <Label>Knytt til tilbud</Label>
            <Select value={a.offer_id ?? "__none"} onValueChange={pickOffer}>
              <SelectTrigger><SelectValue placeholder="Velg tilbud…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Ikke knyttet til tilbud —</SelectItem>
                {(offers ?? []).map((o: any) => (
                  <SelectItem key={o.id} value={o.id}>
                    #{o.offer_number} – {o.title}{o.customer_name ? ` (${o.customer_name})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Knytt til prosjekt</Label>
            <Select value={a.project_id ?? "__none"} onValueChange={pickProject}>
              <SelectTrigger><SelectValue placeholder="Velg prosjekt…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Ikke knyttet til prosjekt —</SelectItem>
                {(projects ?? []).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}{p.project_number ? ` (#${p.project_number})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Prosjektreferanse *</Label>
            <Input value={a.project_ref} onChange={(e) => set("project_ref", e.target.value)} placeholder="f.eks. 2011600" />
          </div>
          <div className="space-y-2">
            <Label>Intern beskrivelse</Label>
            <Input value={a.internal_description} onChange={(e) => set("internal_description", e.target.value)} />
          </div>
          <div className="space-y-3 rounded-md border bg-muted/30 p-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type</div>
            {[
              { k: "is_mass_settlement", l: "Masseavregning" },
              { k: "is_additional_work", l: "Tilleggsarbeid" },
              { k: "is_price_increase", l: "Prisstigning" },
            ].map((x) => (
              <label key={x.k} className="flex items-center gap-2 text-sm">
                <Checkbox checked={(a as any)[x.k]} onCheckedChange={(v) => set(x.k as any, !!v)} />
                {x.l}
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Dato varslet</Label><Input type="date" value={a.notified_date} onChange={(e) => set("notified_date", e.target.value)} /></div>
            <div className="space-y-2"><Label>Dato revidert</Label><Input type="date" value={a.revised_date ?? ""} onChange={(e) => set("revised_date", e.target.value || null)} /></div>
          </div>
          {/* ?? "" fordi begge kolonnene er nullbare — uten det bytter feltet fra
              kontrollert til ukontrollert på en melding lagret uten verdi */}
          <div className="space-y-2"><Label>Prosjektleder</Label><Input value={a.project_manager ?? ""} onChange={(e) => set("project_manager", e.target.value)} /></div>
          <div className="space-y-2"><Label>E-post kunde</Label><Input type="email" value={a.customer_email ?? ""} onChange={(e) => set("customer_email", e.target.value)} /></div>

          {/* Vedlegg — samme komponent som tilbudet bruker */}
          <AttachmentField
            value={a.attachment_urls ?? []}
            onChange={(next) => set("attachment_urls", next)}
            pathPrefix={`${tenantId}/amendment/${currentAmendmentIdRef.current ?? amendmentId ?? "ny"}`}
          />
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
            <div><Label>Beskrivelse av endring</Label><Textarea rows={4} value={a.change_description} onChange={(e) => set("change_description", e.target.value)} /></div>
            <div><Label>Årsak</Label><Textarea rows={3} value={a.reason} onChange={(e) => set("reason", e.target.value)} /></div>
            <div><Label>Andre konsekvenser / merknader</Label><Textarea rows={3} value={a.other_notes} onChange={(e) => set("other_notes", e.target.value)} /></div>
          </div>

          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Prisoverslag</h2>
              {/* Linjene er låst i databasen etter signering. Uten dette kunne
                  man skrive i feltene og få «lagret» tilbake, mens tallene i
                  basen sto igjen uendret. */}
              {isSigned ? (
                <span className="text-xs text-muted-foreground">Låst — linjene kan ikke endres etter at kunden har signert</span>
              ) : (
                <Button size="sm" variant="outline" onClick={addLine}><Plus className="mr-1 h-4 w-4" />Ny linje</Button>
              )}
            </div>
            <table className="hidden w-full text-sm md:table">
              <thead className="border-b text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="w-6 px-1 py-2"></th>
                  <th className="px-2 py-2 text-left">Beskrivelse</th>
                  <th className="w-20 px-2 py-2 text-right">Antall</th>
                  <th className="w-24 px-2 py-2">Enhet</th>
                  <th className="w-32 px-2 py-2 text-right">Pris/enhet</th>
                  <th className="w-32 px-2 py-2 text-right">Sum</th>
                  <th className="w-24 px-1 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr><td colSpan={7} className="px-2 py-6 text-center text-muted-foreground">Ingen linjer ennå.</td></tr>
                ) : lines.map((l, i) => {
                  const isCustomUnit = !!l.unit && !units.includes(l.unit);
                  return (
                    <tr
                      key={i}
                      className={`border-b align-top transition-colors ${dragIndex === i ? "opacity-40" : ""} ${dragOverIndex === i && dragIndex !== i ? "bg-accent/40" : ""}`}
                      onDragOver={(e) => { e.preventDefault(); setDragOverIndex(i); }}
                      onDrop={(e) => { e.preventDefault(); dropOn(i); }}
                    >
                      <td
                        className="px-1 pt-3.5"
                        draggable={!isSigned}
                        onDragStart={() => setDragIndex(i)}
                        onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                        title={isSigned ? "" : "Dra for å flytte linjen"}
                      >
                        {!isSigned && <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground active:cursor-grabbing" />}
                      </td>
                      <td className="px-2 py-2"><Input value={l.description} readOnly={isSigned} onChange={(e) => updLine(i, { description: e.target.value })} /></td>
                      <td className="px-2 py-2"><Input type="number" step="1" className="text-right no-spinner" value={l.quantity || ""} placeholder="0" readOnly={isSigned} onChange={(e) => updLine(i, { quantity: Number(e.target.value) })} onFocus={(e) => e.target.select()} /></td>
                      <td className="px-2 py-2">
                        <Select
                          value={isCustomUnit ? "__annet__" : l.unit}
                          disabled={isSigned}
                          onValueChange={(v) => updLine(i, { unit: v === "__annet__" ? "" : v })}
                        >
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {units.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                            <SelectItem value="__annet__">Annet…</SelectItem>
                          </SelectContent>
                        </Select>
                        {isCustomUnit && (
                          <Input
                            className="mt-1 h-8 text-sm"
                            placeholder="Skriv enhet…"
                            value={l.unit}
                            readOnly={isSigned}
                            onChange={(e) => updLine(i, { unit: e.target.value })}
                            autoFocus
                          />
                        )}
                      </td>
                      <td className="px-2 py-2"><Input type="number" step="1" className="text-right no-spinner" value={l.unit_price || ""} placeholder="0" readOnly={isSigned} onChange={(e) => updLine(i, { unit_price: Number(e.target.value) })} onFocus={(e) => e.target.select()} /></td>
                      <td className="px-2 py-2 text-right font-medium">{nok(Number(l.quantity || 0) * Number(l.unit_price || 0))}</td>
                      <td className="px-1 py-2">
                        {!isSigned && (
                          <div className="flex items-center justify-end gap-0.5">
                            <div className="flex flex-col">
                              <Button size="icon" variant="ghost" className="h-5 w-6" disabled={i === 0} onClick={() => moveLine(i, i - 1)} title="Flytt opp">
                                <ArrowUp className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-5 w-6" disabled={i === lines.length - 1} onClick={() => moveLine(i, i + 1)} title="Flytt ned">
                                <ArrowDown className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            <Button size="icon" variant="ghost" onClick={() => removeLine(i)} title="Slett linje"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Mobil: hver linje som et kort med stablede felt */}
            <div className="space-y-3 md:hidden">
              {lines.length === 0 ? (
                <p className="px-2 py-6 text-center text-muted-foreground">Ingen linjer ennå.</p>
              ) : lines.map((l, i) => {
                const isCustomUnit = !!l.unit && !units.includes(l.unit);
                return (
                  <div key={i} className="space-y-3 rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Linje {i + 1}</span>
                      {!isSigned && (
                        <div className="flex items-center gap-0.5">
                          <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === 0} onClick={() => moveLine(i, i - 1)} title="Flytt opp">
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === lines.length - 1} onClick={() => moveLine(i, i + 1)} title="Flytt ned">
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => removeLine(i)} title="Slett linje"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Beskrivelse</Label>
                      <Input value={l.description} readOnly={isSigned} onChange={(e) => updLine(i, { description: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Antall</Label>
                        <Input type="number" step="1" className="no-spinner" value={l.quantity || ""} placeholder="0" readOnly={isSigned} onChange={(e) => updLine(i, { quantity: Number(e.target.value) })} onFocus={(e) => e.target.select()} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Enhet</Label>
                        <Select value={isCustomUnit ? "__annet__" : l.unit} disabled={isSigned} onValueChange={(v) => updLine(i, { unit: v === "__annet__" ? "" : v })}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {units.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                            <SelectItem value="__annet__">Annet…</SelectItem>
                          </SelectContent>
                        </Select>
                        {isCustomUnit && (
                          <Input className="mt-1 h-8 text-sm" placeholder="Skriv enhet…" value={l.unit} readOnly={isSigned} onChange={(e) => updLine(i, { unit: e.target.value })} autoFocus />
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Pris/enhet</Label>
                        <Input type="number" step="1" className="no-spinner" value={l.unit_price || ""} placeholder="0" readOnly={isSigned} onChange={(e) => updLine(i, { unit_price: Number(e.target.value) })} onFocus={(e) => e.target.select()} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Sum</Label>
                        <div className="flex h-9 items-center justify-end px-1 font-medium">{nok(Number(l.quantity || 0) * Number(l.unit_price || 0))}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 ml-auto max-w-sm border-t pt-4">
              <div className="flex justify-between text-lg font-bold"><span>Total eks. mva</span><span className="text-primary">{nok(subtotal)}</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* Handlingslinje som alltid ligger i bunnen — nyttig på lange endringer */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <span className="text-muted-foreground">Total eks. mva </span>
            <span className="font-bold text-primary">{nok(subtotal)}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {!isSigned && <Button variant="outline" onClick={addLine}><Plus className="mr-2 h-4 w-4" />Ny linje</Button>}
            <Button variant="outline" onClick={handlePdf}><FileDown className="mr-2 h-4 w-4" />Lagre og last ned PDF</Button>
            <Button onClick={handleSave}><Save className="mr-2 h-4 w-4" />Lagre</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
