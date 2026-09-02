// Tidsplanleggeren: aktivitetene og tiden i samme tabell.
//
// Første utgave hadde redigeringsfeltene i ett kort og kalenderen i et annet.
// Da måtte man se opp for å skrive navnet og ned for å dra boksen, for hver
// eneste rad — og med tjue aktiviteter blir det uutholdelig. Nå er raden én
// rad: navn, ansvarlig og farge til venstre, tiden til høyre, på samme linje.
//
// Komponenten eier tidsaksen og dra-logikken. Hva som står i venstrekolonnen
// bestemmer skjemaet, gjennom `venstre` — den skal ikke vite noe om
// tekstfelter, og skjemaet skal ikke vite noe om piksler og ukegrenser.

import { useRef, useState, type ReactNode } from "react";
import { finnFarge, plassering, tilDato, isoUke, type Tidsakse } from "@/lib/fremdrift";

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
  onEndre: (index: number, patch: { start_date: string; end_date: string }) => void;
  aktivRad?: number | null;
  onVelgRad?: (index: number) => void;
  /** Innholdet i venstrekolonnen for hver rad — skjemaets felter */
  venstre: (index: number) => ReactNode;
  /** Overskriftene over venstrekolonnen */
  venstreHode: ReactNode;
  /** Bredden på venstrekolonnen i piksler */
  venstreBredde: number;
  /** Radhøyde i piksler. Må stemme med høyden på feltene i venstrekolonnen. */
  radHoyde?: number;
  /** Ekstra innhold under en rad, f.eks. eksakte datofelter */
  under?: (index: number) => ReactNode;
}

type Modus = "ny" | "flytt" | "venstre" | "hoyre";

interface Drag {
  rad: number;
  modus: Modus;
  start: number;
  fra: number;
  til: number;
}

export function FremdriftRutenett({
  akse, aktiviteter, onEndre, aktivRad, onVelgRad,
  venstre, venstreHode, venstreBredde, radHoyde = 44, under,
}: Props) {
  const banenRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [forhaand, setForhaand] = useState<{ rad: number; fra: number; til: number } | null>(null);
  // Kolonnen musa står over. Brukes til å markere uken, så det aldri er tvil om
  // hvilken uke man er i ferd med å treffe.
  const [hoverKol, setHoverKol] = useState<number | null>(null);

  const antall = akse.kolonner.length;

  const kolonneUnder = (klientX: number): number => {
    const bane = banenRef.current;
    if (!bane) return 0;
    const r = bane.getBoundingClientRect();
    const k = Math.floor(((klientX - r.left) / r.width) * antall);
    return Math.max(0, Math.min(antall - 1, k));
  };

  const spenn = (a: RutenettAktivitet): { fra: number; til: number } | null => {
    if (!a.start_date) return null;
    const s = new Date(`${a.start_date}T00:00:00Z`).getTime();
    const e = new Date(`${a.end_date || a.start_date}T00:00:00Z`).getTime();
    let fra = -1;
    let til = -1;
    akse.kolonner.forEach((k, i) => {
      if (s < k.til.getTime() && e >= k.fra.getTime()) {
        if (fra === -1) fra = i;
        til = i;
      }
    });
    return fra === -1 ? null : { fra, til };
  };

  const skrivSpenn = (rad: number, fra: number, til: number) => {
    const a = Math.max(0, Math.min(fra, til));
    const b = Math.min(antall - 1, Math.max(fra, til));
    const erMilepael = aktiviteter[rad]?.is_milestone;
    const start = akse.kolonner[a].fra;
    // En milepæl er én dag. Får den et helt ukespenn, blir rutersymbolet
    // stående til venstre mens «perioden» sier noe annet.
    const slutt = erMilepael ? start : new Date(akse.kolonner[b].til.getTime() - 86400000);
    onEndre(rad, { start_date: tilDato(start), end_date: tilDato(slutt) });
  };

  const startDrag = (
    e: React.PointerEvent, rad: number, modus: Modus, naa: { fra: number; til: number } | null,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const k = kolonneUnder(e.clientX);
    setDrag({ rad, modus, start: k, fra: naa?.fra ?? k, til: naa?.til ?? k });
    setForhaand({ rad, fra: modus === "ny" ? k : (naa?.fra ?? k), til: modus === "ny" ? k : (naa?.til ?? k) });
    onVelgRad?.(rad);
  };

  const underDrag = (e: React.PointerEvent) => {
    setHoverKol(kolonneUnder(e.clientX));
    if (!drag) return;
    const k = kolonneUnder(e.clientX);
    if (drag.modus === "ny") setForhaand({ rad: drag.rad, fra: drag.start, til: k });
    else if (drag.modus === "venstre") setForhaand({ rad: drag.rad, fra: Math.min(k, drag.til), til: drag.til });
    else if (drag.modus === "hoyre") setForhaand({ rad: drag.rad, fra: drag.fra, til: Math.max(k, drag.fra) });
    else {
      const bredde = drag.til - drag.fra;
      const fra = Math.max(0, Math.min(antall - 1 - bredde, drag.fra + (k - drag.start)));
      setForhaand({ rad: drag.rad, fra, til: fra + bredde });
    }
  };

  const slippDrag = () => {
    if (drag && forhaand) skrivSpenn(forhaand.rad, forhaand.fra, forhaand.til);
    setDrag(null);
    setForhaand(null);
  };

  /** Uken markøren står i, skrevet ut — vises i overskriften mens man drar. */
  const hoverTekst = (() => {
    const k = forhaand ? forhaand.til : hoverKol;
    if (k === null || !akse.kolonner[k]) return null;
    const kol = akse.kolonner[k];
    return akse.type === "uke"
      ? `Uke ${kol.etikett}`
      : `${kol.etikett}${kol.overskrift ? " " + kol.overskrift : ""}`;
  })();

  const spennTekst = forhaand
    ? (() => {
        const a = Math.min(forhaand.fra, forhaand.til);
        const b = Math.max(forhaand.fra, forhaand.til);
        const ant = b - a + 1;
        return akse.type === "uke"
          ? `uke ${akse.kolonner[a].etikett}–${akse.kolonner[b].etikett} · ${ant} uke${ant === 1 ? "" : "r"}`
          : `${akse.kolonner[a].etikett}–${akse.kolonner[b].etikett}`;
      })()
    : null;

  return (
    <div
      className="select-none"
      onPointerMove={underDrag}
      onPointerUp={slippDrag}
      onPointerCancel={slippDrag}
      onPointerLeave={() => { setHoverKol(null); if (drag) slippDrag(); }}
    >
      {/* Aksen. Ukenummeret står stort nok til å leses, og måneden over det —
          det er ukenummeret folk snakker i, så det skal ikke være det minste
          på skjermen. */}
      <div className="sticky top-0 z-10 flex border-b-2 border-foreground/70 bg-card">
        <div
          className="flex shrink-0 items-end gap-2 pb-1.5 pr-3"
          style={{ width: venstreBredde }}
        >
          {venstreHode}
        </div>
        <div className="flex flex-1">
          {akse.kolonner.map((k, i) => {
            const markert = (forhaand && i >= Math.min(forhaand.fra, forhaand.til) && i <= Math.max(forhaand.fra, forhaand.til))
              || (!forhaand && hoverKol === i);
            return (
              <div
                key={i}
                className={`min-w-0 flex-1 text-center transition-colors ${
                  k.overskrift ? "border-l border-border" : ""
                } ${markert ? "bg-primary/15" : ""}`}
              >
                <div className="h-4 truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {k.overskrift}
                </div>
                <div
                  className={`pb-1 text-xs font-semibold tabular-nums ${
                    markert ? "text-primary" : "text-foreground/70"
                  }`}
                >
                  {k.etikett}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {aktiviteter.map((a, rad) => {
        const naa = spenn(a);
        const vises = forhaand?.rad === rad ? { fra: forhaand.fra, til: forhaand.til } : naa;
        const f = finnFarge(a.color);
        const eksakt = forhaand?.rad === rad ? null : plassering(akse, a.start_date, a.end_date || a.start_date);
        const bruk = eksakt ?? (vises
          ? {
              venstre: (Math.min(vises.fra, vises.til) / antall) * 100,
              bredde: ((Math.abs(vises.til - vises.fra) + 1) / antall) * 100,
            }
          : null);

        return (
          <div key={rad} className={aktivRad === rad ? "bg-primary/5" : rad % 2 ? "bg-muted/30" : ""}>
            <div className="flex items-center border-b border-border/60" style={{ minHeight: radHoyde }}>
              <div
                className="flex shrink-0 items-center gap-1.5 border-r pr-3"
                style={{ width: venstreBredde }}
                onFocusCapture={() => onVelgRad?.(rad)}
              >
                {venstre(rad)}
              </div>

              <div
                ref={rad === 0 ? banenRef : undefined}
                className="relative flex-1 cursor-crosshair self-stretch"
                onPointerDown={(e) => startDrag(e, rad, "ny", null)}
              >
                <div className="absolute inset-0 flex">
                  {akse.kolonner.map((k, i) => {
                    const markert = (forhaand?.rad === rad
                      && i >= Math.min(forhaand.fra, forhaand.til)
                      && i <= Math.max(forhaand.fra, forhaand.til));
                    return (
                      <div
                        key={i}
                        className={`min-w-0 flex-1 ${
                          k.overskrift ? "border-l border-border" : "border-l border-border/30"
                        } ${markert ? "bg-primary/10" : hoverKol === i ? "bg-foreground/[0.03]" : ""}`}
                      />
                    );
                  })}
                </div>

                {bruk && (a.is_milestone ? (
                  <div
                    className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rotate-45 cursor-grab border shadow-sm active:cursor-grabbing"
                    style={{ left: `${bruk.venstre}%`, background: f.fyll, borderColor: f.kant }}
                    onPointerDown={(e) => startDrag(e, rad, "flytt", vises)}
                    title="Dra for å flytte milepælen"
                  />
                ) : (
                  <div
                    className="group absolute top-1/2 flex h-6 -translate-y-1/2 items-stretch rounded-sm border shadow-sm"
                    style={{
                      left: `${bruk.venstre}%`,
                      width: `${Math.max(bruk.bredde, 1.2)}%`,
                      background: f.fyll,
                      borderColor: f.kant,
                    }}
                  >
                    <span
                      className="w-2 shrink-0 cursor-ew-resize rounded-l-sm bg-black/25 opacity-0 transition-opacity group-hover:opacity-100"
                      onPointerDown={(e) => startDrag(e, rad, "venstre", vises)}
                      title="Dra for å endre start"
                    />
                    <span
                      className="flex-1 cursor-grab active:cursor-grabbing"
                      onPointerDown={(e) => startDrag(e, rad, "flytt", vises)}
                      title="Dra for å flytte"
                    />
                    <span
                      className="w-2 shrink-0 cursor-ew-resize rounded-r-sm bg-black/25 opacity-0 transition-opacity group-hover:opacity-100"
                      onPointerDown={(e) => startDrag(e, rad, "hoyre", vises)}
                      title="Dra for å endre slutt"
                    />
                  </div>
                ))}

                {!bruk && (
                  <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-[11px] text-muted-foreground/60">
                    Dra her for å legge inn
                  </span>
                )}
              </div>
            </div>

            {under?.(rad)}
          </div>
        );
      })}

      {/* Hvilken uke man er i, mens man drar. Uten den må man lese av
          kolonneoverskriften samtidig som man holder musa nede. */}
      {(hoverTekst || spennTekst) && (
        <p className="mt-2 text-xs tabular-nums text-muted-foreground">
          {spennTekst
            ? <><span className="font-medium text-foreground">{spennTekst}</span> — slipp for å lagre</>
            : hoverTekst}
        </p>
      )}
    </div>
  );
}
