import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, PenLine, RotateCcw } from "lucide-react";
import { nok, num, fmtDate } from "@/lib/format";

export const Route = createFileRoute("/signer-endring/$token")({
  component: SignerAmendmentPage,
});

interface AmendmentLine {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
}

interface AmendmentInfo {
  token_id: string;
  used_at: string | null;
  amendment_id: string;
  amendment_number: string;
  project_ref: string;
  internal_description: string | null;
  change_description: string | null;
  reason: string | null;
  other_notes: string | null;
  notified_date: string | null;
  status: string;
  company_name: string | null;
  lines: AmendmentLine[];
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
            Tegn signaturen din her
          </div>
        )}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={clear} disabled={!hasSignature}>
        <RotateCcw className="mr-1 h-3.5 w-3.5" />Slett og prøv igjen
      </Button>
    </div>
  );
}

function SignerAmendmentPage() {
  const { token } = Route.useParams();
  const [info, setInfo] = useState<AmendmentInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signerName, setSignerName] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [done, setDone] = useState(false);
  const [signedInfo, setSignedInfo] = useState<{ amendment_number: string; project_ref: string } | null>(null);

  useEffect(() => {
    supabase.rpc("get_amendment_by_token" as never, { p_token: token } as never)
      .then(({ data, error: e }) => {
        if (e) { setError(e.message); }
        else { setInfo(data as AmendmentInfo); }
        setLoading(false);
      });
  }, [token]);

  const lines = info?.lines ?? [];
  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unit_price || 0), 0),
    [lines]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signerName.trim()) { alert("Skriv inn fullt navn"); return; }
    if (!signatureDataUrl) { alert("Tegn signaturen din"); return; }
    if (!accepted) { alert("Du må bekrefte at du aksepterer kravet om endring før du kan signere"); return; }
    setSubmitting(true);
    const { data, error: signErr } = await supabase.rpc("sign_amendment" as never, {
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

  if (error || !info) {
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

  if (info.used_at) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm text-center space-y-3">
          <CheckCircle2 className="mx-auto h-14 w-14 text-green-500" />
          <h1 className="text-xl font-semibold text-gray-900">Kravet er allerede signert</h1>
          <p className="text-sm text-gray-500">
            Dette kravet om endring er allerede signert og registrert som endringsmelding.
            Lenken er en engangslenke og kan ikke brukes igjen.
          </p>
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
            Krav om endring {signedInfo?.amendment_number} er signert av <strong>{signerName}</strong>.
          </p>
          <p className="text-gray-600">Kravet er nå signert og er registrert som endringsmelding.</p>
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
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
            Krav om endring {info.amendment_number}
          </p>
          <h1 className="text-xl font-bold text-gray-900">
            {info.internal_description || `Krav om endring ${info.amendment_number}`}
          </h1>
          {info.company_name && (
            <p className="text-sm text-gray-500 mt-0.5">Fra: {info.company_name}</p>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm border-t pt-4">
            <div>
              <p className="text-xs text-gray-400 font-medium mb-0.5">Prosjektreferanse</p>
              <p className="font-medium text-gray-700">{info.project_ref || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium mb-0.5">Dato varslet</p>
              <p className="font-medium text-gray-700">{fmtDate(info.notified_date) || "—"}</p>
            </div>
          </div>

          {info.change_description && (
            <div className="mt-4 border-t pt-4">
              <p className="text-xs text-gray-400 font-medium mb-1">Beskrivelse av endring</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{info.change_description}</p>
            </div>
          )}

          {info.reason && (
            <div className="mt-4 border-t pt-4">
              <p className="text-xs text-gray-400 font-medium mb-1">Årsak</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{info.reason}</p>
            </div>
          )}

          {info.other_notes && (
            <div className="mt-4 border-t pt-4">
              <p className="text-xs text-gray-400 font-medium mb-1">Andre konsekvenser / merknader</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{info.other_notes}</p>
            </div>
          )}
        </div>

        {/* Prisoverslag */}
        <div className="rounded-xl border bg-white shadow-sm p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-3">Prisoverslag</h2>
          {lines.length === 0 ? (
            <p className="text-sm text-gray-500">Ingen linjer.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-xs uppercase tracking-wider text-gray-400">
                  <tr>
                    <th className="px-2 py-2 text-left">Beskrivelse</th>
                    <th className="w-16 px-2 py-2 text-right">Antall</th>
                    <th className="w-16 px-2 py-2 text-left">Enhet</th>
                    <th className="w-28 px-2 py-2 text-right">Pris/enhet</th>
                    <th className="w-28 px-2 py-2 text-right">Sum</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-2 py-2 text-gray-700">{l.description}</td>
                      <td className="px-2 py-2 text-right text-gray-700">{num(l.quantity)}</td>
                      <td className="px-2 py-2 text-gray-700">{l.unit}</td>
                      <td className="px-2 py-2 text-right text-gray-700">{nok(l.unit_price)}</td>
                      <td className="px-2 py-2 text-right font-medium text-gray-900">
                        {nok(Number(l.quantity || 0) * Number(l.unit_price || 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 flex items-center justify-between border-t pt-4">
            <span className="text-sm font-medium text-gray-500">Sum eks. mva</span>
            <span className="text-lg font-bold text-gray-900">{nok(subtotal)}</span>
          </div>
        </div>

        {/* Signeringsskjema */}
        <form onSubmit={handleSubmit} className="rounded-xl border bg-white shadow-sm p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Signer kravet om endring</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Ved å signere aksepterer du kravet om endring, og det blir en bindende endringsmelding.
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

          {/* Bekreftelse — må hukes av før innsending */}
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-gray-50 p-3.5">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 h-5 w-5 flex-shrink-0 accent-gray-900"
            />
            <span className="text-sm leading-snug text-gray-600">
              Jeg bekrefter at jeg har lest og forstått krav om endring {info.amendment_number}
              {info.project_ref ? ` for prosjekt ${info.project_ref}` : ""}, og at jeg{" "}
              <strong className="text-gray-900">aksepterer kravet om endring, som dermed blir en
              bindende endringsmelding</strong> med prisoverslaget som er oppgitt over.
            </span>
          </label>

          <Button type="submit" className="w-full" disabled={submitting || !signerName.trim() || !signatureDataUrl || !accepted}>
            {submitting ? "Signerer…" : "Godkjenn og signer krav om endring"}
          </Button>

          <p className="text-xs text-gray-400 text-center">
            Denne lenken er en engangslenke og vil ikke virke etter signering.
          </p>
        </form>
      </div>
    </div>
  );
}
