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
import { Plus, Trash2, Save, FileDown, Mail, ArrowLeft, Link2, RotateCcw, CheckCircle2, GripVertical, ArrowUp, ArrowDown, ShieldCheck, Unlock, FilePlus2, MailCheck, MailX, MailWarning, XCircle } from "lucide-react";
import { nok, fmtDate, toISODate, OFFER_WON_STATUSES, UNITS as FALLBACK_UNITS } from "@/lib/format";
import { openAmendmentPdf } from "@/lib/pdf";
import { AttachmentField } from "@/components/attachment-field";
import { useAppSettings, standardRef } from "@/hooks/use-app-settings";
import { useAuth } from "@/hooks/use-auth";
import { Passordbekreftelse } from "@/components/passordbekreftelse";

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
  // Hvordan kunden godkjente. digital = signert i appen; papir/muntlig/epost
  // = registrert manuelt av oss, med begrunnelse.
  signature_method?: string;
  manual_approved_note?: string | null;
  attachment_urls?: Array<{ name: string; url: string }>;
  // Når kravet sist gikk til kunden, og til hvem. Skrives av seg selv når
  // e-posten klargjøres, men kan settes og fjernes for hånd: et krav kan være
  // levert på papir i et byggemøte, og en e-post kan bli avbrutt.
  sent_at?: string | null;
  sent_to?: string | null;
  sent_count?: number | null;
  // Sa byggherren nei via signeringslenken. Et avslått krav er ikke et slettet
  // krav: det er dokumentasjonen på at endringen ble varslet, og hva svaret ble.
  rejected_at?: string | null;
  rejected_by?: string | null;
  rejected_note?: string | null;
}

/** Hvordan kunden godkjente, skrevet ut for dokumentet og skjermen. */
const MAATE_TEKST: Record<string, string> = {
  papir: "signert på papir",
  muntlig: "muntlig godkjent",
  epost: "bekreftet på e-post",
};

function empty(): AState {
  return {
    amendment_number: "", offer_id: null, project_id: null, project_ref: "", internal_description: "",
    is_mass_settlement: false, is_additional_work: false, is_price_increase: false,
    notified_date: toISODate(new Date()), revised_date: null,
    project_manager: "", customer_email: "",
    change_description: "", reason: "", other_notes: "",
    status: "krav", customer_signed_at: null, attachment_urls: [],
    sent_at: null, sent_to: null, sent_count: 0,
    rejected_at: null, rejected_by: null, rejected_note: null,
  };
}

export function AmendmentForm({ amendmentId, initialOfferId, initialProjectId, initialProjectRef }: {
  amendmentId?: string;
  initialOfferId?: string;
  /** Prosjekt og prosjektreferanse fra lenken — se ruten for hvorfor de ligger der. */
  initialProjectId?: string;
  initialProjectRef?: string;
}) {
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
  // Sant mens en vedleggsfil er på vei opp. Se vakten i lagreNaa().
  const lasterOppVedleggRef = useRef(false);
  // Kommer man fra et tilbud, hører utkastet til akkurat den kombinasjonen.
  // Ellers ville utkastet fra ett tilbud dukket opp på et annet.
  // Kommer man uten tilbud, men med et prosjekt, skiller referansen utkastene
  // fra hverandre på samme måte. Ellers deler alle løse krav én plass: et
  // halvskrevet krav på ett prosjekt ble gjenopprettet da man begynte på et
  // krav på et annet, med feil prosjektreferanse — og dermed feil nummerserie.
  const DRAFT_KEY = `amendment-draft-${amendmentId ?? "new"}${
    initialOfferId ? `-${initialOfferId}` : initialProjectRef ? `-p${initialProjectRef}` : ""
  }`;

  // Når kravet opprettes fra inne i et tilbud, hentes tilbudet slik at både
  // tilbudskoblingen og prosjektet kan fylles inn på forhånd.
  const { data: initialOffer, isPending: initialOfferVenter } = useQuery({
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
    // Vent på tilbudet før skjemaet initialiseres, ellers ville det blitt tomt.
    //
    // Det ventes på at spørringen er AVGJORT, ikke på at den henter. Er
    // tilbudet slettet, ender den i feil, og da skal skjemaet komme opp tomt
    // heller enn å bli hengende på «Laster…». Er nettet nede, står den derimot
    // på pause: med `isLoading` (som er «pending og henter») slapp vakten
    // gjennom med én gang, skjemaet ble satt opp tomt, og når nettet kom
    // tilbake sa `init` at det var gjort — kravet ble liggende uten tilbud,
    // uten prosjektreferanse og uten et ord om hvorfor.
    if (!isEdit && initialOfferId && initialOfferVenter) return;

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
          project_id: initialProjectId ?? initialOffer.project_id ?? null,
          // Kom prosjektreferansen med i lenken, er det den som gjelder: den er
          // skrevet av en som satt med denne endringen, mens tilbudets
          // prosjektnummer kan være tomt — og referansen er det løpenummeret
          // regnes ut av.
          project_ref: initialProjectRef || initialOffer.project_number || proj?.project_number || proj?.name || "",
          internal_description: initialOffer.title ?? "",
          customer_email: initialOffer.customer_email ?? "",
          // Tilbudets "Vår referanse" er den samme personen som står som
          // prosjektleder på endringen. Mangler den, brukes standardreferansen
          // fra innstillingene.
          project_manager: initialOffer.our_ref || standardRef(appSettings?.our_refs)?.name || "",
        });
        setInit(true);
        return;
      }

      // Uten tilbud, men med prosjekt fra lenken: en endring kan høre til et
      // prosjekt som ikke har noe tilbud i systemet, og da er prosjektet og
      // referansen hele konteksten som skal følge med.
      if (initialProjectId || initialProjectRef) {
        setA({
          ...empty(),
          project_id: initialProjectId ?? null,
          project_ref: initialProjectRef ?? "",
          project_manager: standardRef(appSettings?.our_refs)?.name || "",
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
          // Det samme gjelder sendingen: den skjedde, og et gammelt utkast skal
          // ikke få skjemaet til å påstå at kravet aldri gikk ut.
          setA({
            ...sa,
            status: la.status,
            customer_signed_at: la.customer_signed_at,
            sent_at: la.sent_at,
            sent_to: la.sent_to,
            sent_count: la.sent_count,
            // Og avslaget: kunden kan ha sagt nei mens utkastet lå og ventet.
            rejected_at: la.rejected_at,
            rejected_by: la.rejected_by,
            rejected_note: la.rejected_note,
          });
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
  }, [isEdit, loaded, init, initialOfferId, initialOffer, initialOfferVenter, initialProjectId, initialProjectRef, appSettings]);

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

  // Byggherren har sagt nei. Statusen bærer det, men rejected_at leses også:
  // en rad kan ha fått statusen satt for hånd, og da mangler datoen.
  const erAvslaatt = a.status === "avslått" || !!a.rejected_at;

  const erSendt = !!a.sent_at;
  // «15.09.2026 14:32 · hst@aseral.kommune.no · 2. gang». Klokkeslettet er med
  // fordi flere krav gjerne sendes samme dag, og da sier datoen alene ikke
  // hvilke av dem som faktisk gikk ut.
  const sendtTekst = (() => {
    const d = a.sent_at ? new Date(a.sent_at) : null;
    if (!d || Number.isNaN(d.getTime())) return "";
    const naar = new Intl.DateTimeFormat("nb-NO", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    }).format(d).replace(",", "");
    const antall = Number(a.sent_count ?? 0);
    return [naar, a.sent_to, antall > 1 ? `${antall}. gang` : ""].filter(Boolean).join(" · ");
  })();

  // En opplåsing som fortsatt gjelder. Leses fra basen, ikke bare fra minnet,
  // så den overlever en oppfriskning av siden — ellers ville skjemaet sett låst
  // ut mens databasen fortsatt slapp gjennom endringer.
  const { data: apenOpplasing } = useQuery({
    queryKey: ["opplasing", amendmentId],
    enabled: isEdit && isSigned,
    queryFn: async () => {
      const { data } = await supabase
        .from("signature_unlocks")
        .select("expires_at")
        .eq("parent_type", "amendments")
        .eq("parent_id", amendmentId!)
        .is("closed_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as any)?.expires_at ?? null;
    },
  });

  const [laastOppTil, setLaastOppTil] = useState<string | null>(null);
  const laastOpp = laastOppTil ?? apenOpplasing ?? null;
  /** Signert OG ikke låst opp = ingenting kan endres. */
  const laast = isSigned && !laastOpp;

  const [godkjennApen, setGodkjennApen] = useState(false);
  const [lasOppApen, setLasOppApen] = useState(false);

  const lasOpp = async (grunn: string) => {
    const { data, error } = await supabase.rpc("las_opp_signert", {
      p_type: "amendments", p_id: amendmentId, p_grunn: grunn,
    });
    if (error) { toast.error(error.message); throw error; }
    setLaastOppTil(data as string);
    qc.invalidateQueries({ queryKey: ["opplasing", amendmentId] });
    toast.success("Låst opp — husk å sende meldingen på nytt hvis tallene endres");
  };

  const lasIgjen = async () => {
    const { error } = await supabase.rpc("las_igjen_signert", {
      p_type: "amendments", p_id: amendmentId,
    });
    if (error) { toast.error(error.message); return; }
    setLaastOppTil(null);
    qc.invalidateQueries({ queryKey: ["opplasing", amendmentId] });
  };

  const godkjennManuelt = async (maate: string, grunn: string) => {
    // Lagre først. Godkjenningen låser linjene i samme øyeblikk, så alt som
    // ligger ulagret i skjemaet ville vært umulig å få inn etterpå.
    const id = await save();
    if (!id) return;

    const { error } = await supabase
      .from("amendments")
      .update({
        customer_signed_at: new Date().toISOString(),
        signature_method: maate,
        manual_approved_note: grunn,
      })
      .eq("id", id);
    if (error) { toast.error(error.message); throw error; }
    // Trigger i basen setter status til 'endringsmelding' og stempler hvem det var
    setA((p) => ({ ...p, customer_signed_at: new Date().toISOString(), status: "endringsmelding",
      signature_method: maate, manual_approved_note: grunn } as any));
    qc.invalidateQueries({ queryKey: ["amendment", amendmentId] });
    toast.success("Registrert som godkjent av kunden");
  };

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

  /**
   * Én lagring om gangen.
   *
   * Nummeret regnes ut ved å lese det høyeste som finnes i basen, og raden
   * skrives først etterpå. To klikk rett etter hverandre rakk derfor begge å
   * lese samme tall, og begge satte inn sin rad: to meldinger med samme
   * løpenummer. Det samme gjelder alle knappene som lagrer — PDF, e-post og
   * signeringslenke — så vakten ligger her og ikke på knappen.
   *
   * Med «Lagre og ny» ble det verre: den tømmer skjemaet, så den ene av de to
   * radene forsvant fra skjermen i samme øyeblikk den ble laget.
   */
  const lagrerRef = useRef(false);
  const save = async (): Promise<string | null> => {
    if (lagrerRef.current) return null;
    lagrerRef.current = true;
    try {
      return await lagreNaa();
    } finally {
      lagrerRef.current = false;
    }
  };

  const lagreNaa = async (): Promise<string | null> => {
    // Et vedlegg som er på vei opp, skrives inn i skjemaet først når det er
    // ferdig. Lagrer vi nå, blir filen liggende utenfor meldingen — og etter et
    // «Lagre og ny» havner den i den neste i stedet, som om den hørte til der.
    if (lasterOppVedleggRef.current) {
      toast.error("Vent til vedlegget er ferdig lastet opp");
      return null;
    }
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
      if (!laast) {
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
    if (!laast && lines.length) {
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

  /**
   * Lagrer denne og setter opp den neste på samme tilbud.
   *
   * Endringer på et prosjekt kommer som regel i klynge, og da er det bare
   * innholdet som skifter: tilbudet, prosjektet, prosjektreferansen,
   * prosjektlederen og kundens e-post er de samme. Uten denne måtte man ut i
   * oversikten, inn i tilbudet og velge «Nytt krav om endring» på nytt for
   * hver eneste melding — og fylle inn den samme konteksten hver gang.
   */
  const lagreOgNy = async () => {
    const id = await save();
    if (!id) return;

    if (!isEdit) {
      // Vi står allerede på skjemaet for et nytt krav, så siden skal ikke
      // byttes ut — bare tømmes. Uten å nullstille referansene her ville neste
      // lagring skrevet oppå meldingen vi nettopp la inn, og nummeret fra den
      // forrige fulgt med inn i PDF-en og e-posten.
      //
      // Konteksten blir stående; innholdet gjør det ikke. Beskrivelse, årsak,
      // merknader, linjer og vedlegg hører til meldingen som nettopp ble
      // lagret. Det gjør «Dato varslet» også: den sier når akkurat denne
      // endringen ble varslet, og i en NS-kontrakt er det nettopp den datoen
      // som avgjør om kravet kom i tide. Den settes derfor til i dag, som på et
      // hvilket som helst annet nytt krav.
      currentAmendmentIdRef.current = undefined;
      currentNumberRef.current = "";
      userEditedRef.current = false;
      sessionStorage.removeItem(DRAFT_KEY);
      setLines([]);
      setA({
        ...empty(),
        offer_id: a.offer_id,
        project_id: a.project_id,
        project_ref: a.project_ref,
        project_manager: a.project_manager,
        customer_email: a.customer_email,
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
      toast.success("Lagret — klar for neste endring");
      return;
    }

    // Fra en lagret melding må vi over på skjemaet for nye krav, og konteksten
    // følger med i adressen. Den lå først i sessionStorage, men en mal appen
    // legger igjen der, blir liggende: forlot man skjemaet uten å lagre, dukket
    // den opp igjen i neste krav — også i et som skulle handlet om et annet
    // prosjekt. Adressen har ingen slik hukommelse.
    navigate({
      to: "/endringsmeldinger/ny",
      search: {
        offer: a.offer_id ?? undefined,
        prosjekt: a.project_id ?? undefined,
        prosjektref: a.project_ref || undefined,
      },
    });
  };
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
  /**
   * Merker kravet som sendt til kunden.
   *
   * E-postprogrammet sier aldri fra om brukeren trykket «Send» til slutt, så
   * dette er akkurat det vi vet: at meldingen ble klargjort herfra med kundens
   * adresse i. Nettopp derfor må merket også kunne fjernes igjen — en avbrutt
   * sending skal ikke bli stående som et varsel byggherren har fått.
   */
  const markerSendt = async (id: string, epost: string | null): Promise<boolean> => {
    // Opptellingen skjer i basen. Regnet vi den ut her og skrev tilbake et
    // absolutt tall, ville to faner — eller to personer — overskrevet
    // hverandres sending, og tallet som skal gi kontroll blitt det man ikke
    // kunne stole på.
    const { data, error } = await supabase.rpc("merk_endring_sendt" as never, {
      p_id: id, p_epost: epost || null,
    } as never);
    if (error) { toast.error(`Kunne ikke merke som sendt: ${error.message}`); return false; }
    const svar = (data ?? {}) as { sent_at?: string; sent_to?: string | null; sent_count?: number };
    setA((p) => ({
      ...p,
      sent_at: svar.sent_at ?? new Date().toISOString(),
      sent_to: svar.sent_to ?? null,
      sent_count: svar.sent_count ?? Number(p.sent_count ?? 0) + 1,
    }));
    qc.invalidateQueries({ queryKey: ["amendments"] });
    qc.invalidateQueries({ queryKey: ["amendment", id] });
    return true;
  };

  const markerIkkeSendt = async () => {
    const id = currentAmendmentIdRef.current ?? amendmentId;
    if (!id) return;
    // Det er den siste sendingen som trekkes fra, ikke hele historikken: er
    // kravet sendt tre ganger og den fjerde avbrutt, er det fortsatt sendt tre
    // ganger. Telleren vises uansett bare mens datoen står der.
    const { data, error } = await supabase.rpc("merk_endring_ikke_sendt" as never, { p_id: id } as never);
    if (error) { toast.error(error.message); return; }
    const svar = (data ?? {}) as { sent_count?: number };
    setA((p) => ({ ...p, sent_at: null, sent_to: null, sent_count: svar.sent_count ?? 0 }));
    qc.invalidateQueries({ queryKey: ["amendments"] });
    qc.invalidateQueries({ queryKey: ["amendment", id] });
    toast.success("Merket som ikke sendt");
  };

  /**
   * Fjerner avslaget og setter kravet tilbake til «krav om endring».
   *
   * Byggherren kan snu, og avslaget kan ha kommet fra feil person. Uten en vei
   * tilbake måtte kravet lages på nytt — og da ville både nummeret og
   * varslingsdatoen, det som viser at endringen ble meldt i tide, blitt et annet.
   */
  const gjenaapne = async () => {
    const id = currentAmendmentIdRef.current ?? amendmentId;
    if (!id) return;
    const { error } = await supabase
      .from("amendments")
      .update({ status: "krav", rejected_at: null, rejected_by: null, rejected_note: null } as never)
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    setA((p) => ({ ...p, status: "krav", rejected_at: null, rejected_by: null, rejected_note: null }));
    qc.invalidateQueries({ queryKey: ["amendments"] });
    qc.invalidateQueries({ queryKey: ["amendment", id] });
    toast.success("Avslaget er fjernet — kravet står som aktivt igjen");
  };

  /** Levert på papir i et byggemøte, eller sendt fra telefonen — da settes det her. */
  const markerSendtManuelt = async () => {
    const id = await save();
    if (!id) return;
    // Ingen mottakeradresse: vi vet ikke hvordan den ble levert. Skrev vi
    // kundens e-post her, ville raden påstått at den gikk dit — og det er
    // nettopp det den ikke gjorde.
    if (await markerSendt(id, null)) toast.success("Merket som sendt til kunden");
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

    // Merket settes før e-postprogrammet åpnes, ikke etter. Det finnes ingen
    // vei tilbake fra mailto-en som sier om den ble sendt, og skrev vi merket
    // etterpå, ville det falt bort hver gang nettleseren stoppet skriptet for å
    // åpne e-postprogrammet — altså akkurat når det trengtes.
    //
    // På et prosjekt med tolv endringer er det ellers umulig å se hvilke
    // byggherren har fått, og et krav som aldri ble sendt, er et krav som ikke
    // er varslet.
    // Gikk ikke merkingen gjennom, sier markerSendt fra selv. E-posten skal
    // åpnes uansett — brukeren skal ikke miste sendingen fordi et merke ikke
    // lot seg skrive.
    if (await markerSendt(id, a.customer_email)) {
      toast.success("Merket som sendt — trykk «Ikke sendt likevel» om du avbryter");
    }

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

  // Også et nytt krav venter på at det er ferdig satt opp. Uten dette sto
  // skjemaet åpent og skrivbart mens tilbudet ble hentet, og det man rakk å
  // skrive ble overskrevet uten varsel i det forhåndsutfyllingen slo inn.
  if (!init) return <div className="text-muted-foreground">Laster…</div>;

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
          {/* Er kravet avslått, skal det ikke gå ut en ny signeringslenke uten
              at noen først har fjernet avslaget. Lenken ville latt byggherren
              signere et krav de nettopp har sagt nei til. */}
          {!isSigned && !erAvslaatt && (
            <Button variant="outline" onClick={handleSigningLink} title="Generer signeringslenke og kopier til utklippstavlen">
              <Link2 className="mr-2 h-4 w-4" />Signeringslenke
            </Button>
          )}
          {/* Kunden signerer ofte på papir, eller sier bare ja i et møte. Da må
              det finnes en vei inn som ikke later som om signaturen var digital. */}
          {isEdit && !isSigned && (
            <Button variant="outline" onClick={() => setGodkjennApen(true)} title="Registrer at kunden har godkjent uten å signere digitalt">
              <ShieldCheck className="mr-2 h-4 w-4" />Godkjenn manuelt
            </Button>
          )}
          {isEdit && isSigned && !laastOpp && (
            <Button variant="outline" onClick={() => setLasOppApen(true)} title="Lås opp for å endre linjer og priser">
              <Unlock className="mr-2 h-4 w-4" />Lås opp for endring
            </Button>
          )}
          {isEdit && isSigned && (
            <Button variant="outline" onClick={handleResetSignature} className="text-destructive border-destructive/50 hover:bg-destructive/10" title="Nullstill kundesignatur">
              <RotateCcw className="mr-2 h-4 w-4" />Nullstill signatur
            </Button>
          )}
          <Button variant="outline" onClick={handleEmail}><Mail className="mr-2 h-4 w-4" />Send på e-post</Button>
          <Button variant="outline" onClick={handlePdf}><FileDown className="mr-2 h-4 w-4" />Lagre og last ned PDF</Button>
          <Button variant="outline" onClick={lagreOgNy} title="Lagrer denne og setter opp et nytt krav med samme tilbud, prosjekt og prosjektreferanse. Beskrivelse, linjer, vedlegg og dato starter på nytt.">
            <FilePlus2 className="mr-2 h-4 w-4" />Lagre og ny
          </Button>
          <Button onClick={handleSave}><Save className="mr-2 h-4 w-4" />Lagre</Button>
        </div>
      </div>

      {/* Byggherren har sagt nei. Det står øverst og i rødt, for det endrer
          alt annet på siden: kravet skal ikke følges opp, ikke faktureres, og
          ikke sendes til signering igjen uten at noen har tatt et nytt valg. */}
      {erAvslaatt && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 p-4">
          <XCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
          <div className="flex-1 space-y-1 text-sm">
            <div className="font-semibold text-red-700 dark:text-red-400">
              Avslått av kunden
              {a.rejected_at ? ` ${fmtDate(a.rejected_at)}` : ""}
              {a.rejected_by ? ` · ${a.rejected_by}` : ""}
            </div>
            {a.rejected_note && (
              <p className="text-muted-foreground">«{a.rejected_note}»</p>
            )}
            <p className="text-muted-foreground">
              Kravet blir stående som dokumentasjon på at endringen ble varslet, og hva svaret ble.
            </p>
          </div>
          {isEdit && (
            <Button size="sm" variant="ghost" className="h-7 flex-shrink-0 text-muted-foreground" onClick={gjenaapne}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" />Fjern avslaget
            </Button>
          )}
        </div>
      )}

      {/* Har kunden fått kravet?
          Står det ingenting her, er svaret «vet ikke», og det er nettopp det
          som ikke går an på et varsel med frist. Linjen står øverst, sammen med
          signaturstatusen, fordi det er de to spørsmålene man har når man åpner
          en gammel endring: er den sendt, og er den godkjent. */}
      {/* Feltet vises så snart raden finnes, ikke bare når siden ble åpnet på
          en lagret melding: «Send på e-post» lagrer og merker kravet også på et
          nytt krav, og da må angreknappen finnes på den siden man faktisk står
          på. Ellers ber toasten om et trykk på noe som ikke er tegnet. */}
      {(isEdit || erSendt) && (
        erSendt ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-emerald-600/40 bg-emerald-600/10 px-4 py-3 text-sm">
            <MailCheck className="h-4 w-4 flex-shrink-0 text-emerald-600" />
            <span>
              <span className="font-semibold text-emerald-700 dark:text-emerald-500">Sendt til kunden</span>
              <span className="text-muted-foreground"> {sendtTekst}</span>
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-7 text-muted-foreground"
              onClick={markerIkkeSendt}
              title="Bruk denne hvis e-posten aldri gikk ut likevel"
            >
              <MailX className="mr-1 h-3.5 w-3.5" />Ikke sendt likevel
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
            <MailWarning className="h-4 w-4 flex-shrink-0 text-amber-600" />
            <span className="font-semibold text-amber-700 dark:text-amber-500">Ikke sendt til kunden ennå</span>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-7 text-muted-foreground"
              onClick={markerSendtManuelt}
              title="Er den levert på papir, i et møte eller fra telefonen, settes merket her"
            >
              <MailCheck className="mr-1 h-3.5 w-3.5" />Marker som sendt
            </Button>
          </div>
        )
      )}

      {isSigned && (
        <div className="flex items-start gap-3 rounded-xl border border-green-600/40 bg-green-600/10 p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" />
          <div className="text-sm">
            <div className="font-semibold text-green-700 dark:text-green-500">
              {a.signature_method && a.signature_method !== "digital"
                ? `Godkjent av kunden${a.customer_signed_at ? ` ${fmtDate(a.customer_signed_at)}` : ""} — ${MAATE_TEKST[a.signature_method] ?? a.signature_method}`
                : `Signert av kunden${a.customer_signed_at ? ` ${fmtDate(a.customer_signed_at)}` : ""}`}
            </div>
            <div className="text-muted-foreground">
              Kravet om endring er nå en endringsmelding.
            </div>
            {/* Er den godkjent uten digital signatur, er begrunnelsen det eneste
                som forklarer hvor dokumentasjonen ligger. Da skal den stå her,
                ikke bare i en tabell ingen åpner. */}
            {a.manual_approved_note && (
              <div className="mt-1 text-muted-foreground">«{a.manual_approved_note}»</div>
            )}
          </div>
        </div>
      )}

      {laastOpp && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/50 bg-amber-500/10 p-4">
          <Unlock className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
          <div className="flex-1 text-sm">
            <div className="font-semibold text-amber-800 dark:text-amber-300">
              Låst opp for endring til {new Date(laastOpp).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div className="text-muted-foreground">
              Kunden har signert på disse tallene. Endrer du dem, gjelder ikke lenger det
              kunden skrev under på — send meldingen på nytt etterpå. Alle endringer arkiveres.
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={lasIgjen}>Lås igjen</Button>
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
            onUploadingChange={(laster) => { lasterOppVedleggRef.current = laster; }}
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
              {laast ? (
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
                        draggable={!laast}
                        onDragStart={() => setDragIndex(i)}
                        onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                        title={laast ? "" : "Dra for å flytte linjen"}
                      >
                        {!laast && <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground active:cursor-grabbing" />}
                      </td>
                      <td className="px-2 py-2"><Input value={l.description} readOnly={laast} onChange={(e) => updLine(i, { description: e.target.value })} /></td>
                      <td className="px-2 py-2"><Input type="number" step="1" className="text-right no-spinner" value={l.quantity || ""} placeholder="0" readOnly={laast} onChange={(e) => updLine(i, { quantity: Number(e.target.value) })} onFocus={(e) => e.target.select()} /></td>
                      <td className="px-2 py-2">
                        <Select
                          value={isCustomUnit ? "__annet__" : l.unit}
                          disabled={laast}
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
                            readOnly={laast}
                            onChange={(e) => updLine(i, { unit: e.target.value })}
                            autoFocus
                          />
                        )}
                      </td>
                      <td className="px-2 py-2"><Input type="number" step="1" className="text-right no-spinner" value={l.unit_price || ""} placeholder="0" readOnly={laast} onChange={(e) => updLine(i, { unit_price: Number(e.target.value) })} onFocus={(e) => e.target.select()} /></td>
                      <td className="px-2 py-2 text-right font-medium">{nok(Number(l.quantity || 0) * Number(l.unit_price || 0))}</td>
                      <td className="px-1 py-2">
                        {!laast && (
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
                      {!laast && (
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
                      <Input value={l.description} readOnly={laast} onChange={(e) => updLine(i, { description: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Antall</Label>
                        <Input type="number" step="1" className="no-spinner" value={l.quantity || ""} placeholder="0" readOnly={laast} onChange={(e) => updLine(i, { quantity: Number(e.target.value) })} onFocus={(e) => e.target.select()} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Enhet</Label>
                        <Select value={isCustomUnit ? "__annet__" : l.unit} disabled={laast} onValueChange={(v) => updLine(i, { unit: v === "__annet__" ? "" : v })}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {units.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                            <SelectItem value="__annet__">Annet…</SelectItem>
                          </SelectContent>
                        </Select>
                        {isCustomUnit && (
                          <Input className="mt-1 h-8 text-sm" placeholder="Skriv enhet…" value={l.unit} readOnly={laast} onChange={(e) => updLine(i, { unit: e.target.value })} autoFocus />
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Pris/enhet</Label>
                        <Input type="number" step="1" className="no-spinner" value={l.unit_price || ""} placeholder="0" readOnly={laast} onChange={(e) => updLine(i, { unit_price: Number(e.target.value) })} onFocus={(e) => e.target.select()} />
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
            {!laast && <Button variant="outline" onClick={addLine}><Plus className="mr-2 h-4 w-4" />Ny linje</Button>}
            <Button variant="outline" onClick={handlePdf}><FileDown className="mr-2 h-4 w-4" />Lagre og last ned PDF</Button>
            <Button variant="outline" onClick={lagreOgNy} title="Lagrer denne og setter opp et nytt krav med samme tilbud, prosjekt og prosjektreferanse. Beskrivelse, linjer, vedlegg og dato starter på nytt.">
              <FilePlus2 className="mr-2 h-4 w-4" />Lagre og ny
            </Button>
            <Button onClick={handleSave}><Save className="mr-2 h-4 w-4" />Lagre</Button>
          </div>
        </div>
      </div>

      <Passordbekreftelse
        open={godkjennApen}
        onOpenChange={setGodkjennApen}
        tittel="Godkjenn uten digital signatur"
        forklaring={`Kravet blir en endringsmelding, som om kunden hadde signert i appen. Det blir stående hvem hos oss som registrerte det, og hvorfor.`}
        knapp="Registrer godkjenning"
        valg={{
          etikett: "Hvordan godkjente kunden?",
          alternativer: [
            { verdi: "papir", tekst: "Signerte på papir" },
            { verdi: "muntlig", tekst: "Muntlig — møte eller telefon" },
            { verdi: "epost", tekst: "Bekreftet på e-post" },
          ],
        }}
        krevGrunn
        grunnEtikett="Begrunnelse"
        grunnHjelp="Skriv hvor dokumentasjonen finnes. Er det papir eller e-post, legg den ved som vedlegg."
        onBekreftet={(grunn, maate) => godkjennManuelt(maate, grunn)}
      />

      <Passordbekreftelse
        open={lasOppApen}
        onOpenChange={setLasOppApen}
        tittel="Lås opp for endring"
        forklaring="Kunden har signert på tallene som står her nå. Endrer du dem, gjelder ikke lenger det kunden skrev under på — da må meldingen sendes på nytt. Opplåsingen varer i 30 minutter."
        knapp="Lås opp"
        krevGrunn
        grunnEtikett="Hva skal rettes?"
        grunnHjelp="Blir stående sammen med hvem som låste opp og når."
        onBekreftet={(grunn) => lasOpp(grunn)}
      />
    </div>
  );
}
