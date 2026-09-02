// Tidsplanleggeren: aktivitetene tegnes rett inn i kalenderen.
//
// Å taste to datoer per rad er tungvint når planen har tjue aktiviteter, og
// resultatet er vanskelig å se for seg før man skriver ut. Her tegner man i
// stedet boksen der den skal være, drar den dit den hører hjemme, og drar i
// endene for å gjøre den lengre eller kortere.
//
// Boksene snapper til hele kolonner — hele uker, eller hele måneder på en lang
// plan. Det er slik fremdriftsplaner lages i praksis, og uten snapping ville
// hver boks blitt et par piksler feil og planen sett rotete ut. Datoer som
// alt ligger inne tegnes nøyaktig; snappingen gjelder bare det man drar på.

import { useRef, useState } from "react";
import { finnFarge, plassering, tilDato, type Tidsakse } from "@/lib/fremdrift";

export interface RutenettAktivitet {
  name: string;
  color: string;
  start_date: string;
  end_date: string;
  is_milestone: boolean;
}

interface Props {
  akse: Tidsakse;
  aktiviteter: RutenettAktivitet[];
  /** Radhøyden må stemme med raden i skjemaet ved siden av */
  onEndre: (index: number, patch: { start_date: string; end_date: string }) => void;
  /** Raden som er markert i skjemaet, så de to visningene henger sammen */
  aktivRad?: number | null;
  onVelgRad?: (index: number) => void;
}

type Modus = "ny" | "flytt" | "venstre" | "hoyre";

interface Drag {
  rad: number;
  modus: Modus;
  /** Kolonnen pekeren var i da draget startet */
  start: number;
  /** Kolonnespennet boksen hadde da draget startet */
  fra: number;
  til: number;
}

export function FremdriftRutenett({ akse, aktiviteter, onEndre, aktivRad, onVelgRad }: Props) {
  const banenRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  // Det som vises mens man drar, før det er sluppet
  const [forhaand, setForhaand] = useState<{ rad: number; fra: number; til: number } | null>(null);

  const antall = akse.kolonner.length;

  /** Hvilken kolonne pekeren står i. */
  const kolonneUnder = (klientX: number): number => {
    const bane = banenRef.current;
    if (!bane) return 0;
    const r = bane.getBoundingClientRect();
    const k = Math.floor(((klientX - r.left) / r.width) * antall);
    return Math.max(0, Math.min(antall - 1, k));
  };

  /** Kolonnespennet en aktivitet dekker i dag, eller null. */
  const spenn = (a: RutenettAktivitet): { fra: number; til: number } | null => {
    if (!a.start_date) return null;
    const s = new Date(`${a.start_date}T00:00:00Z`).getTime();
    const e = new Date(`${(a.end_date || a.start_date)}T00:00:00Z`).getTime();
    let fra = -1;
    let til = -1;
    akse.kolonner.forEach((k, i) => {
      const kf = k.fra.getTime();
      const kt = k.til.getTime();
      if (s < kt && e >= kf) {
        if (fra === -1) fra = i;
        til = i;
      }
    });
    return fra === -1 ? null : { fra, til };
  };

  const skrivSpenn = (rad: number, fra: number, til: number) => {
    const a = Math.max(0, Math.min(fra, til));
    const b = Math.min(antall - 1, Math.max(fra, til));
    const start = akse.kolonner[a].fra;
    // Sluttdatoen er siste dag i kolonnen, ikke første dag i den neste
    const slutt = new Date(akse.kolonner[b].til.getTime() - 86400000);
    onEndre(rad, { start_date: tilDato(start), end_date: tilDato(slutt) });
  };

  const startDrag = (e: React.PointerEvent, rad: number, modus: Modus, naa: { fra: number; til: number } | null) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const k = kolonneUnder(e.clientX);
    const fra = naa?.fra ?? k;
    const til = naa?.til ?? k;
    setDrag({ rad, modus, start: k, fra, til });
    setForhaand({ rad, fra: modus === "ny" ? k : fra, til: modus === "ny" ? k : til });
    onVelgRad?.(rad);
  };

  const underDrag = (e: React.PointerEvent) => {
    if (!drag) return;
    const k = kolonneUnder(e.clientX);
    if (drag.modus === "ny") {
      setForhaand({ rad: drag.rad, fra: drag.start, til: k });
    } else if (drag.modus === "venstre") {
      setForhaand({ rad: drag.rad, fra: Math.min(k, drag.til), til: drag.til });
    } else if (drag.modus === "hoyre") {
      setForhaand({ rad: drag.rad, fra: drag.fra, til: Math.max(k, drag.fra) });
    } else {
      // Flytting beholder lengden — det er hele poenget med å flytte
      const skift = k - drag.start;
      const bredde = drag.til - drag.fra;
      let fra = drag.fra + skift;
      fra = Math.max(0, Math.min(antall - 1 - bredde, fra));
      setForhaand({ rad: drag.rad, fra, til: fra + bredde });
    }
  };

  const slippDrag = () => {
    if (drag && forhaand) skrivSpenn(forhaand.rad, forhaand.fra, forhaand.til);
    setDrag(null);
    setForhaand(null);
  };

  return (
    <div
      className="select-none"
      onPointerMove={underDrag}
      onPointerUp={slippDrag}
      onPointerCancel={slippDrag}
      onPointerLeave={() => { if (drag) slippDrag(); }}
    >
      {/* Aksen */}
      <div className="flex border-b-2 border-foreground/70 pb-1">
        <div className="w-48 shrink-0 pr-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          Aktivitet
        </div>
        <div className="flex flex-1">
          {akse.kolonner.map((k, i) => (
            <div key={i} className="min-w-0 flex-1 text-center">
              <div className="h-3 truncate text-[9px] font-semibold uppercase text-muted-foreground">
                {k.overskrift}
              </div>
              <div className="text-[10px] font-medium tabular-nums text-muted-foreground">
                {k.etikett}
              </div>
            </div>
          ))}
        </div>
      </div>

      {aktiviteter.map((a, rad) => {
        const naa = spenn(a);
        const vises = forhaand?.rad === rad ? { fra: forhaand.fra, til: forhaand.til } : naa;
        const f = finnFarge(a.color);
        // Er raden urørt, tegnes den nøyaktig etter datoene. Er den under
        // redigering, tegnes den etter kolonnene som er markert.
        const eksakt = !vises || forhaand?.rad === rad ? null : plassering(akse, a.start_date, a.end_date || a.start_date);
        const venstrePst = vises ? (vises.fra / antall) * 100 : 0;
        const breddePst = vises ? ((Math.abs(vises.til - vises.fra) + 1) / antall) * 100 : 0;
        const bruk = eksakt ?? (vises ? { venstre: venstrePst, bredde: breddePst } : null);

        return (
          <div
            key={rad}
            className={`flex items-center border-b border-border/60 transition-colors ${
              aktivRad === rad ? "bg-primary/5" : rad % 2 ? "bg-muted/30" : ""
            }`}
            style={{ height: 34 }}
          >
            <div
              className="flex w-48 shrink-0 cursor-pointer items-center gap-2 border-r pr-2"
              onClick={() => onVelgRad?.(rad)}
            >
              <span className="h-4 w-1 shrink-0 rounded-sm" style={{ background: f.fyll }} />
              <span className="truncate text-xs font-medium">
                {a.name || <span className="text-muted-foreground">Uten navn</span>}
              </span>
            </div>

            <div
              ref={rad === 0 ? banenRef : undefined}
              className="relative h-full flex-1 cursor-crosshair"
              onPointerDown={(e) => startDrag(e, rad, "ny", null)}
            >
              {/* Rutenettet */}
              <div className="absolute inset-0 flex">
                {akse.kolonner.map((k, i) => (
                  <div
                    key={i}
                    className={`min-w-0 flex-1 border-r last:border-r-0 ${
                      k.overskrift ? "border-border" : "border-border/40"
                    }`}
                  />
                ))}
              </div>

              {bruk && (a.is_milestone ? (
                <div
                  className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rotate-45 cursor-grab border active:cursor-grabbing"
                  style={{ left: `${bruk.venstre}%`, background: f.fyll, borderColor: f.kant }}
                  onPointerDown={(e) => startDrag(e, rad, "flytt", vises)}
                  title="Dra for å flytte milepælen"
                />
              ) : (
                <div
                  className="group absolute top-1/2 flex h-5 -translate-y-1/2 items-stretch rounded-sm border shadow-sm"
                  style={{ left: `${bruk.venstre}%`, width: `${Math.max(bruk.bredde, 1.2)}%`, background: f.fyll, borderColor: f.kant }}
                >
                  {/* Håndtakene er egne felt i hver ende. Uten dem ville et drag
                      i kanten flyttet hele boksen i stedet for å endre lengden. */}
                  <span
                    className="w-1.5 shrink-0 cursor-ew-resize rounded-l-sm bg-black/20 opacity-0 transition-opacity group-hover:opacity-100"
                    onPointerDown={(e) => startDrag(e, rad, "venstre", vises)}
                    title="Dra for å endre start"
                  />
                  <span
                    className="flex-1 cursor-grab active:cursor-grabbing"
                    onPointerDown={(e) => startDrag(e, rad, "flytt", vises)}
                    title="Dra for å flytte"
                  />
                  <span
                    className="w-1.5 shrink-0 cursor-ew-resize rounded-r-sm bg-black/20 opacity-0 transition-opacity group-hover:opacity-100"
                    onPointerDown={(e) => startDrag(e, rad, "hoyre", vises)}
                    title="Dra for å endre slutt"
                  />
                </div>
              ))}

              {!bruk && (
                <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-[10px] text-muted-foreground/70">
                  Dra her for å legge inn
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
