import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAppSettings, useSaveSettings, DEFAULT_SETTINGS, type OurRef, type Forbehold } from "@/hooks/use-app-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Save, Sun, Moon, Monitor, GripVertical, Upload, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

type Theme = "light" | "dark" | "system";

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Lys modus", icon: Sun },
  { value: "dark", label: "Mørk modus", icon: Moon },
  { value: "system", label: "Systemstandard", icon: Monitor },
];

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="border-b px-6 py-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-5 p-6">{children}</div>
    </div>
  );
}

function EditableList({
  items,
  onChange,
  placeholder = "Legg til…",
  minItems = 0,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  minItems?: number;
}) {
  const [newVal, setNewVal] = useState("");

  const add = () => {
    const v = newVal.trim();
    if (!v || items.includes(v)) return;
    onChange([...items, v]);
    setNewVal("");
  };

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
          <Input
            value={item}
            onChange={(e) => onChange(items.map((r, idx) => (idx === i ? e.target.value : r)))}
            className="max-w-xs"
          />
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            disabled={items.length <= minItems}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <div className="w-4 flex-shrink-0" />
        <Input
          placeholder={placeholder}
          value={newVal}
          onChange={(e) => setNewVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          className="max-w-xs"
        />
        <Button size="sm" variant="outline" onClick={add}>
          <Plus className="mr-1 h-4 w-4" />Legg til
        </Button>
      </div>
    </div>
  );
}

function ForbeholdList({ items, onChange }: { items: Forbehold[]; onChange: (items: Forbehold[]) => void }) {
  const upd = (i: number, patch: Partial<Forbehold>) =>
    onChange(items.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <div className="grid grid-cols-[1fr_2fr_auto] gap-2 px-1">
          <p className="text-xs font-medium text-muted-foreground">Tittel</p>
          <p className="text-xs font-medium text-muted-foreground">Beskriving</p>
          <div />
        </div>
      )}
      {items.map((item, i) => (
        <div key={i} className="grid grid-cols-[1fr_2fr_auto] items-center gap-2">
          <Input
            value={item.title}
            onChange={(e) => upd(i, { title: e.target.value })}
            placeholder="T.d. «Grunnforhold»"
          />
          <Input
            value={item.description}
            onChange={(e) => upd(i, { description: e.target.value })}
            placeholder="T.d. «Avvik kan medføre tillegg»"
          />
          <Button size="icon" variant="ghost" onClick={() => onChange(items.filter((_, idx) => idx !== i))}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        onClick={() => onChange([...items, { title: "", description: "" }])}
      >
        <Plus className="mr-1 h-4 w-4" />Legg til forbehold
      </Button>
    </div>
  );
}

function RefList({ refs, onChange }: { refs: OurRef[]; onChange: (refs: OurRef[]) => void }) {
  const upd = (i: number, patch: Partial<OurRef>) =>
    onChange(refs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const handleSignatureUpload = (i: number, file: File) => {
    if (file.size > 200 * 1024) { alert("Signaturbildet er for stort (maks 200 KB)"); return; }
    const reader = new FileReader();
    reader.onload = (e) => upd(i, { signature: e.target?.result as string });
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-4">
      {refs.map((ref, i) => (
        <div key={i} className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <GripVertical className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
            <div className="flex-1 grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Navn</p>
                <Input value={ref.name} onChange={(e) => upd(i, { name: e.target.value })} placeholder="Fullt navn" />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Stilling / rolle</p>
                <Input value={ref.position ?? ""} onChange={(e) => upd(i, { position: e.target.value || undefined })} placeholder="T.d. Daglig leder" />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Telefon</p>
                <Input value={ref.phone} onChange={(e) => upd(i, { phone: e.target.value })} placeholder="+47 000 00 000" />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">E-post</p>
                <Input type="email" value={ref.email} onChange={(e) => upd(i, { email: e.target.value })} placeholder="navn@firma.no" />
              </div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="flex-shrink-0"
              onClick={() => onChange(refs.filter((_, idx) => idx !== i))}
              disabled={refs.length <= 1}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>

          {/* Signatur */}
          <div className="pl-6 space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Signatur (vises på PDF)</p>
            {ref.signature ? (
              <div className="flex items-start gap-3">
                <div className="rounded border bg-white p-2 max-w-[200px]">
                  <img src={ref.signature} alt="Signatur" className="max-h-16 w-auto object-contain" />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => upd(i, { signature: undefined })}
                  className="text-destructive"
                >
                  <X className="mr-1 h-3 w-3" />Fjern
                </Button>
              </div>
            ) : (
              <label className="flex items-center gap-2 cursor-pointer w-fit">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleSignatureUpload(i, f);
                    e.target.value = "";
                  }}
                />
                <Button size="sm" variant="outline" asChild>
                  <span><Upload className="mr-1 h-3 w-3" />Last opp signatur</span>
                </Button>
                <span className="text-xs text-muted-foreground">PNG, JPG — helst kvit/gjennomsiktig bakgrunn</span>
              </label>
            )}
          </div>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={() => onChange([...refs, { name: "", phone: "", email: "" }])}>
        <Plus className="mr-1 h-4 w-4" />Legg til referanseperson
      </Button>
    </div>
  );
}

function SettingsPage() {
  const { tenantId } = useAuth();
  const { data: saved, isLoading } = useAppSettings();
  const saveSettings = useSaveSettings();

  const [validityDays, setValidityDays] = useState(DEFAULT_SETTINGS.offer_validity_days);
  const [ourRefs, setOurRefs] = useState<OurRef[]>(DEFAULT_SETTINGS.our_refs);
  const [companyName, setCompanyName] = useState(DEFAULT_SETTINGS.company_name);
  const [companyTagline, setCompanyTagline] = useState(DEFAULT_SETTINGS.company_tagline);
  const [units, setUnits] = useState<string[]>(DEFAULT_SETTINGS.units);
  const [forbehold, setForbehold] = useState<Forbehold[]>(DEFAULT_SETTINGS.forbehold);
  const [paymentTerms, setPaymentTerms] = useState(DEFAULT_SETTINGS.payment_terms);
  const [defaultOfferText, setDefaultOfferText] = useState(DEFAULT_SETTINGS.default_offer_text);
  const [emailSubject, setEmailSubject] = useState(DEFAULT_SETTINGS.email_subject_template);
  const [vatPct, setVatPct] = useState(DEFAULT_SETTINGS.vat_pct);
  const [closingPageOffsetMm, setClosingPageOffsetMm] = useState(DEFAULT_SETTINGS.closing_page_offset_mm);
  const [theme, setThemeState] = useState<Theme>(() =>
    (typeof window !== "undefined" ? (localStorage.getItem("hm-theme") as Theme) : null) ?? "light"
  );

  useEffect(() => {
    if (!saved) return;
    setValidityDays(saved.offer_validity_days);
    setOurRefs(saved.our_refs);
    setCompanyName(saved.company_name);
    setCompanyTagline(saved.company_tagline);
    setUnits(saved.units);
    setForbehold(saved.forbehold);
    setPaymentTerms(saved.payment_terms);
    setDefaultOfferText(saved.default_offer_text);
    setEmailSubject(saved.email_subject_template);
    setVatPct(saved.vat_pct);
    setClosingPageOffsetMm(saved.closing_page_offset_mm);
  }, [saved]);

  const applyTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem("hm-theme", t);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", t === "dark" || (t === "system" && prefersDark));
  };

  const handleSave = async () => {
    await saveSettings({
      offer_validity_days: validityDays,
      our_refs: ourRefs,
      company_name: companyName,
      company_tagline: companyTagline,
      units,
      forbehold,
      payment_terms: paymentTerms,
      default_offer_text: defaultOfferText,
      email_subject_template: emailSubject,
      vat_pct: vatPct,
      closing_page_offset_mm: closingPageOffsetMm,
    });
  };

  if (isLoading) return <div className="text-muted-foreground">Laster innstillingar…</div>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Innstillingar</h1>
          <p className="mt-1 text-sm text-muted-foreground">Konfigurer standardverdiar og preferansar</p>
        </div>
        <Button onClick={handleSave} disabled={!tenantId}>
          <Save className="mr-2 h-4 w-4" />Lagre
        </Button>
      </div>

      {/* Tilbud-standardar */}
      <SectionCard
        title="Tilbud"
        description="Standardverdiar som vert fylt inn automatisk på nye tilbud"
      >
        <div className="space-y-2">
          <Label>Gyldighetsperiode (dagar)</Label>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={1}
              max={365}
              value={validityDays}
              onChange={(e) => setValidityDays(Number(e.target.value))}
              className="w-24 no-spinner"
              onFocus={(e) => e.target.select()}
            />
            <span className="text-sm text-muted-foreground">
              dagar → gyldig t.o.m. = <strong>i dag + {validityDays} d</strong>
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Standard tilbudstekst</Label>
          <p className="text-xs text-muted-foreground">Vert forhåndsutfylt i tekstfeltet på nye tilbud.</p>
          <Textarea
            value={defaultOfferText}
            onChange={(e) => setDefaultOfferText(e.target.value)}
            placeholder="T.d. «Vi viser til hyggelig samtale og sender herved vårt tilbud på…»"
            rows={4}
            className="max-w-lg"
          />
        </div>

        <div className="space-y-2">
          <Label>«Vår referanse»-alternativ</Label>
          <p className="text-xs text-muted-foreground">
            Namn, telefon og e-post vert henta automatisk inn i PDF-en basert på kven som er vald som referanse.
          </p>
          <RefList refs={ourRefs} onChange={setOurRefs} />
        </div>
      </SectionCard>

      {/* Einingar */}
      <SectionCard
        title="Einingar"
        description="Tilgjengelege einingar i nedtrekkslista på tilbudslinjer"
      >
        <EditableList items={units} onChange={setUnits} placeholder="T.d. km, kg, dag…" minItems={1} />
        <p className="text-xs text-muted-foreground">«Annet…» med fritekst er alltid tilgjengeleg i tillegg til lista.</p>
      </SectionCard>

      {/* Forbehold */}
      <SectionCard
        title="Forbehold"
        description="Faste forbehold som kan veljast per tilbud og visast på PDF"
      >
        <ForbeholdList items={forbehold} onChange={setForbehold} />
        <p className="text-xs text-muted-foreground">
          Forbehold vert valde per tilbud og visast som liten tekst på PDF-en.
        </p>
      </SectionCard>

      {/* Økonomi */}
      <SectionCard
        title="Økonomi"
        description="Standard satsar og vilkår som visast på PDF-ar"
      >
        <div className="space-y-2">
          <Label>MVA-sats (%)</Label>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={0}
              max={100}
              value={vatPct}
              onChange={(e) => setVatPct(Number(e.target.value))}
              className="w-24 no-spinner"
              onFocus={(e) => e.target.select()}
            />
            <span className="text-sm text-muted-foreground">% MVA vert vist på tilbods-PDF</span>
          </div>
          <div className="flex gap-2 mt-1">
            {[0, 12, 25].map((v) => (
              <button
                key={v}
                onClick={() => setVatPct(v)}
                className={`rounded border px-3 py-1 text-xs font-medium transition-colors ${
                  vatPct === v
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {v} %
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Betalingsbetingelsar</Label>
          <Input
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(e.target.value)}
            placeholder="T.d. «30 dager netto»"
            className="max-w-xs"
          />
          <p className="text-xs text-muted-foreground">Visast i botnen av tilbods-PDF.</p>
        </div>

        <div className="space-y-2">
          <Label>Avstand frå topp på avslutningsside (mm)</Label>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={0}
              max={200}
              value={closingPageOffsetMm}
              onChange={(e) => setClosingPageOffsetMm(Number(e.target.value))}
              className="w-24 no-spinner"
              onFocus={(e) => e.target.select()}
            />
            <span className="text-sm text-muted-foreground">mm ned frå toppen (høgare = lenger ned)</span>
          </div>
          <p className="text-xs text-muted-foreground">Juster om totalar/signatur sit for høgt eller lågt på siste side i PDF.</p>
        </div>
      </SectionCard>

      {/* E-post */}
      <SectionCard
        title="E-post"
        description="Mal for emnefeltet når tilbud sendast på e-post"
      >
        <div className="space-y-2">
          <Label>Emne-mal</Label>
          <Input
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
            placeholder="Tilbud #{nr} – {tittel}"
            className="max-w-sm"
          />
          <p className="text-xs text-muted-foreground">
            Variablar: <code className="rounded bg-muted px-1">{"{nr}"}</code> = tilbudsnummer,{" "}
            <code className="rounded bg-muted px-1">{"{tittel}"}</code> = tittel,{" "}
            <code className="rounded bg-muted px-1">{"{kunde}"}</code> = kundenamn
          </p>
        </div>
      </SectionCard>

      {/* Firma-info */}
      <SectionCard
        title="Firmainformasjon"
        description="Visast i overskrift på genererte PDF-ar"
      >
        <div className="space-y-2">
          <Label>Firmanamn</Label>
          <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="max-w-xs" />
        </div>
        <div className="space-y-2">
          <Label>Tagline / undertittel</Label>
          <Input value={companyTagline} onChange={(e) => setCompanyTagline(e.target.value)} className="max-w-sm" />
          <p className="text-xs text-muted-foreground">T.d. «Anlegg · Veiarbeid · Asfaltering»</p>
        </div>
      </SectionCard>

      {/* Utsjånad */}
      <SectionCard title="Utsjånad" description="Visuelle preferansar for denne nettlesaren">
        <div className="space-y-2">
          <Label>Tema</Label>
          <div className="flex gap-2">
            {THEME_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = theme === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => applyTheme(opt.value)}
                  className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </SectionCard>

      <div className="flex justify-end pb-4">
        <Button onClick={handleSave} size="lg" disabled={!tenantId}>
          <Save className="mr-2 h-4 w-4" />Lagre alle innstillingar
        </Button>
      </div>
    </div>
  );
}
