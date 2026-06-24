import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, FileText, FileSignature, PenLine, RotateCcw } from "lucide-react";
import { openOfferPdf, openContractPdf } from "@/lib/pdf";

export const Route = createFileRoute("/signer/$token")({
  component: SignerPage,
});

interface OfferInfo {
  token_id: string;
  used_at: string | null;
  offer_id: string;
  offer_number: number;
  title: string;
  customer_name: string;
  offer_date: string;
  valid_until: string;
  offer_text: string;
  status: string;
}

function fmtDate(d: string) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("nb-NO", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(d));
}

function SignatureCanvas({ onSign }: { onSign: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    setHasSignature(true);
  };

  const end = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    drawing.current = false;
    if (hasSignature) {
      onSign(canvasRef.current!.toDataURL("image/png"));
    }
  };

  const clear = () => {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onSign("");
  };

  return (
    <div className="space-y-2">
      <div className="relative rounded-lg border-2 border-dashed border-gray-300 bg-white overflow-hidden" style={{ touchAction: "none" }}>
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          className="w-full cursor-crosshair"
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
        {!hasSignature && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-400 gap-2">
            <PenLine className="h-4 w-4" />
            Teikn signaturen din her
          </div>
        )}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={clear} disabled={!hasSignature}>
        <RotateCcw className="mr-1 h-3.5 w-3.5" />Slett og prøv igjen
      </Button>
    </div>
  );
}

function SignerPage() {
  const { token } = Route.useParams();
  const [offerInfo, setOfferInfo] = useState<OfferInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signerName, setSignerName] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [done, setDone] = useState(false);
  const [signedInfo, setSignedInfo] = useState<{ offer_number: number; title: string } | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [loadingContract, setLoadingContract] = useState(false);

  useEffect(() => {
    supabase.rpc("get_offer_by_token" as never, { p_token: token } as never)
      .then(({ data, error: e }) => {
        if (e) { setError(e.message); }
        else { setOfferInfo(data as OfferInfo); }
        setLoading(false);
      });
  }, [token]);

  const handleViewPdf = async () => {
    if (!offerInfo) return;
    setLoadingPdf(true);
    try {
      const { data } = await supabase.rpc("get_offer_pdf_by_token" as never, { p_token: token } as never);
      if (!data) { alert("Kunne ikke laste tilbudet."); return; }
      const d = data as any;
      const lines = d.lines ?? [];
      const settings = d.settings ?? {};
      const offer = d.offer ?? {};
      const subtotal = lines
        .filter((l: any) => l.included !== false)
        .reduce((s: number, l: any) => {
          const gross = Number(l.quantity) * Number(l.unit_price);
          return s + gross * (1 - (Number(l.discount_pct) || 0) / 100);
        }, 0);
      const admin = subtotal * ((Number(offer.admin_cost_pct) || 0) / 100);
      openOfferPdf(offer, lines, { subtotal, admin, total: subtotal + admin }, settings);
    } finally {
      setLoadingPdf(false);
    }
  };

  const handleViewContract = async () => {
    if (!offerInfo) return;
    setLoadingContract(true);
    try {
      const { data } = await supabase.rpc("get_offer_pdf_by_token" as never, { p_token: token } as never);
      if (!data) { alert("Kunne ikke laste kontrakten."); return; }
      const d = data as any;
      const lines = (d.lines ?? []).filter((l: any) => l.included !== false);
      const settings = d.settings ?? {};
      const offer = d.offer ?? {};
      const subtotal = lines.reduce((s: number, l: any) => {
        const gross = Number(l.quantity) * Number(l.unit_price);
        return s + gross * (1 - (Number(l.discount_pct) || 0) / 100);
      }, 0);
      const admin = subtotal * ((Number(offer.admin_cost_pct) || 0) / 100);
      const total = subtotal + admin;
      const vatPct = Number(settings.vat_pct ?? 25);
      const totalInclVat = total * (1 + vatPct / 100);

      const ourRefs: any[] = settings.our_refs ?? [];
      const refObj = ourRefs.find((r: any) => r.name === offer.our_ref) ?? ourRefs[0] ?? {};

      openContractPdf({
        offer_number: offer.offer_number,
        title: offer.title,
        offer_date: offer.offer_date,
        customer_name: offer.customer_name,
        project_number: offer.project_number,
        offer_text: offer.offer_text,
        total_incl_vat: totalInclVat,
        company_name: settings.company_name,
        company_address: settings.company_address,
        company_phone: settings.company_phone,
        logo_url: settings.logo_url,
        ref_name: refObj.name,
        ref_position: refObj.position,
        ref_phone: refObj.phone,
        ref_signature: refObj.signature,
        forbehold: (settings.forbehold ?? []).map((f: any) =>
          typeof f === "string" ? { title: f, description: "" } : f
        ),
      });
    } finally {
      setLoadingContract(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signerName.trim()) { alert("Skriv inn fullt navn"); return; }
    if (!signatureDataUrl) { alert("Teikn signaturen din"); return; }
    if (!accepted) { alert("Du må bekrefte at du aksepterer tilbudet før du kan signere"); return; }
    setSubmitting(true);
    const { data, error: signErr } = await supabase.rpc("sign_offer" as never, {
      p_token: token,
      p_signer_name: signerName.trim(),
      p_signer_signature: signatureDataUrl || null,
    } as never);
    if (signErr) { alert((signErr as any).message); setSubmitting(false); return; }
    setSignedInfo(data as any);
    setDone(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-500">Laster…</div>
      </div>
    );
  }

  if (error || !offerInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm text-center space-y-3">
          <div className="text-4xl">🔒</div>
          <h1 className="text-xl font-semibold text-gray-900">Ugyldig lenke</h1>
          <p className="text-sm text-gray-500">{error ?? "Denne signeringslenken er ikke gyldig eller er allerede brukt."}</p>
        </div>
      </div>
    );
  }

  if (offerInfo.used_at) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm text-center space-y-3">
          <CheckCircle2 className="mx-auto h-14 w-14 text-green-500" />
          <h1 className="text-xl font-semibold text-gray-900">Tilbud allerede signert</h1>
          <p className="text-sm text-gray-500">Dette tilbudet er allerede signert. Lenken er engangslenkje og kan ikke brukes igjen.</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm text-center space-y-4">
          <CheckCircle2 className="mx-auto h-16 w-16 text-green-500" />
          <h1 className="text-2xl font-bold text-gray-900">Takk for signeringen!</h1>
          <p className="text-gray-600">
            Tilbud #{signedInfo?.offer_number} – {signedInfo?.title} er no godkjent og signert av{" "}
            <strong>{signerName}</strong>.
          </p>
          <p className="text-sm text-gray-400">Du kan lukke dette vinduet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="mx-auto max-w-xl space-y-6">
        {/* Header */}
        <div className="rounded-xl border bg-white shadow-sm p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Tilbud #{offerInfo.offer_number}</p>
              <h1 className="text-xl font-bold text-gray-900">{offerInfo.title}</h1>
              <p className="text-sm text-gray-500 mt-0.5">Til: {offerInfo.customer_name}</p>
            </div>
            <div className="flex flex-col gap-2 flex-shrink-0">
              <Button type="button" variant="outline" size="sm" onClick={handleViewPdf} disabled={loadingPdf}>
                <FileText className="mr-1.5 h-4 w-4" />
                {loadingPdf ? "Laster…" : "Se tilbud"}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={handleViewContract} disabled={loadingContract}>
                <FileSignature className="mr-1.5 h-4 w-4" />
                {loadingContract ? "Laster…" : "Se kontrakt"}
              </Button>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm border-t pt-4">
            <div>
              <p className="text-xs text-gray-400 font-medium mb-0.5">Tilbudsdato</p>
              <p className="font-medium text-gray-700">{fmtDate(offerInfo.offer_date)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium mb-0.5">Gyldig til</p>
              <p className="font-medium text-gray-700">{fmtDate(offerInfo.valid_until)}</p>
            </div>
          </div>
          {offerInfo.offer_text && (
            <div className="mt-4 border-t pt-4">
              <p className="text-xs text-gray-400 font-medium mb-1">Tilbudstekst</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{offerInfo.offer_text}</p>
            </div>
          )}
        </div>

        {/* Signeringsskjema */}
        <form onSubmit={handleSubmit} className="rounded-xl border bg-white shadow-sm p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Signer tilbudet</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Ved å signere aksepterer du tilbudet på vegne av {offerInfo.customer_name}.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="signer-name">Fullt navn *</Label>
            <Input
              id="signer-name"
              placeholder="Skriv inn ditt fulle navn"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Signatur *</Label>
            <SignatureCanvas onSign={setSignatureDataUrl} />
          </div>

          {/* Bekreftelse — må hakast av før innsending */}
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-gray-50 p-3.5">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 h-5 w-5 flex-shrink-0 accent-gray-900"
            />
            <span className="text-sm leading-snug text-gray-600">
              Jeg bekrefter at jeg har lest og forstått tilbud #{offerInfo.offer_number} – {offerInfo.title},
              og at jeg på vegne av {offerInfo.customer_name} <strong className="text-gray-900">aksepterer
              tilbudet og inngår en bindende avtale</strong> i samsvar med de oppgitte vilkårene.
            </span>
          </label>

          <Button type="submit" className="w-full" disabled={submitting || !signerName.trim() || !signatureDataUrl || !accepted}>
            {submitting ? "Signerer…" : "Godkjenn og signer tilbud"}
          </Button>

          <p className="text-xs text-gray-400 text-center">
            Denne lenken er engangslenkje og vil ikkje virke etter signering.
          </p>
        </form>
      </div>
    </div>
  );
}
