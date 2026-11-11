import { Link } from "@tanstack/react-router";
import { ArrowRight, Building2 } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DashboardData, Jobb } from "@/lib/dashboard-typer";
import { BlokkTittel, Kort, dempet, knappKlasse, tekstFarge } from "./felles";
import { antall, kr, mill } from "./format";

// «Hvor ligger pengene jeg har til gode?» De 8 jobbene med mest igjen, tegnet
// som bygg som reises: grønt nedenfra er fakturert, stillaset er det som er
// igjen. Tre faste høyder i stedet for en skala, siden beløpet står skrevet
// under. Dette er det eneste 3D-elementet på siden.

const ANTALL_BYGG = 8;

// --- Geometri (viewBox 120 × 192, isometrisk 30°) ---------------------------
const VB_B = 120;
const VB_H = 192;
const CX = 60; // midten
const FY = 178; // fremste hjørne på bakken
const SIDE = 40; // lengden på hver bakkekant
const DX = SIDE * Math.cos(Math.PI / 6); // 34,64
const DY = SIDE * Math.sin(Math.PI / 6); // 20
const MIDT_Y = FY - DY; // midten av grunnflaten

type P = readonly [number, number];
const F: P = [CX, FY];
const V: P = [CX - DX, FY - DY];
const H: P = [CX + DX, FY - DY];
const B: P = [CX, FY - 2 * DY];

/** Høyde i tre trinn etter kontraktsummen: lav, middels, høy. */
function byggHoyde(kontrakt: number): number {
  if (kontrakt < 100_000) return 38;
  if (kontrakt < 1_000_000) return 70;
  return 106;
}

const opp = ([x, y]: P, h: number): P => [x, y - h];
const pkt = (...p: P[]) => p.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
/** Loddrett flate mellom to bakkepunkt, fra høyde h0 til h1. */
const flate = (a: P, b: P, h0: number, h1: number) => pkt(opp(a, h0), opp(b, h0), opp(b, h1), opp(a, h1));
const topp = (h: number) => pkt(opp(F, h), opp(H, h), opp(B, h), opp(V, h));
const midt = (a: P, b: P): P => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

function Bygg({ jobb, valgt }: { jobb: Jobb; valgt: boolean }) {
  const klippId = `bp-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const h = byggHoyde(jobb.kontrakt);
  const andel = jobb.kontrakt > 0 ? Math.min(1, Math.max(0, jobb.fakturert / jobb.kontrakt)) : 0;
  const g = Math.round(h * andel);
  const harStillas = g < h;

  // Stillasplanker for hver «etasje» og en stender midt på hver side.
  const etasjer: number[] = [];
  for (let y = g + 16; y < h - 4; y += 16) etasjer.push(y);
  const mv = midt(V, F);
  const mh = midt(F, H);
  const tomt = (luft: number) => {
    const bx = DX + luft;
    const by = DY + luft * Math.tan(Math.PI / 6);
    return pkt([CX - bx, MIDT_Y], [CX, MIDT_Y - by], [CX + bx, MIDT_Y], [CX, MIDT_Y + by]);
  };

  return (
    <svg
      viewBox={`0 0 ${VB_B} ${VB_H}`}
      className="h-auto w-full max-w-[112px] sm:max-w-[136px]"
      aria-hidden
      focusable="false"
    >
      <defs>
        {/* Alt under bakkekantene skjules, så det grønne kan «reise seg» med en ren transform. */}
        <clipPath id={klippId}>
          <polygon points={pkt([0, 0], [VB_B, 0], [VB_B, V[1]], H, F, V, [0, V[1]])} />
        </clipPath>
      </defs>

      {/* Tomta og grunnmuren */}
      <polygon points={tomt(9)} className={valgt ? "fill-[var(--bp-tomt-valgt)]" : "fill-[var(--bp-tomt)]"} />
      <polygon points={pkt(F, H, B, V)} className="fill-[var(--bp-grunn)]" />

      {/* Fakturert: massivt, grønt, lys topp og to sider med samme lysretning */}
      {g > 0 && (
        <g clipPath={`url(#${klippId})`}>
          <g className="bp-gronn" style={{ "--bp-h": `${g}px` } as CSSProperties}>
            <polygon points={flate(V, F, 0, g)} className="fill-[var(--bp-venstre)]" />
            <polygon points={flate(F, H, 0, g)} className="fill-[var(--bp-hoyre)]" />
            <polygon points={topp(g)} className="fill-[var(--bp-topp)]" />
          </g>
        </g>
      )}

      {/* Igjen: stillas med svakt fyll og stiplet omriss */}
      {harStillas && (
        <g>
          <polygon points={flate(V, F, g, h)} className="fill-[var(--bp-stillas-venstre)]" />
          <polygon points={flate(F, H, g, h)} className="fill-[var(--bp-stillas-hoyre)]" />
          <polygon points={topp(h)} className="fill-[var(--bp-stillas-topp)]" />
          <g className="bp-strek" fill="none" strokeWidth={1}>
            {/* bakre stender, sett gjennom stillaset */}
            <line x1={B[0]} y1={B[1] - g} x2={B[0]} y2={B[1] - h} strokeDasharray="2 3" opacity={0.45} />
            {/* stendere midt på sidene og planker per etasje */}
            <g opacity={0.6}>
              <line x1={mv[0]} y1={mv[1] - g} x2={mv[0]} y2={mv[1] - h} />
              <line x1={mh[0]} y1={mh[1] - g} x2={mh[0]} y2={mh[1] - h} />
              {etasjer.map((y) => (
                <polyline key={y} points={pkt(opp(V, y), opp(F, y), opp(H, y))} />
              ))}
            </g>
            {/* ytterkanter */}
            <g strokeDasharray="4 2.5">
              <polygon points={flate(V, F, g, h)} />
              <polygon points={flate(F, H, g, h)} />
              <polygon points={topp(h)} />
            </g>
          </g>
        </g>
      )}

      {/* Fakturert for mye: rødt flagg på toppen */}
      {jobb.fakturertForMye > 0 && (
        <g>
          <line
            x1={CX}
            y1={MIDT_Y - h}
            x2={CX}
            y2={MIDT_Y - h - 28}
            className="stroke-foreground"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={`M ${CX} ${MIDT_Y - h - 28} L ${CX + 22} ${MIDT_Y - h - 22} L ${CX} ${MIDT_Y - h - 16} Z`}
            className="fill-red-600"
          />
        </g>
      )}
    </svg>
  );
}

/** «ingenting fakturert» / «86 % fakturert» */
function fakturertTekst(j: Jobb): string {
  return j.fakturert <= 0 ? "ingenting fakturert" : `${Math.round(j.prosentFakturert)} % fakturert`;
}

export function Byggeplass({
  jobber,
  faser,
  className,
  indeks,
}: {
  jobber: Jobb[];
  faser: DashboardData["faser"];
  className?: string;
  indeks?: number;
}) {
  const medIgjen = jobber.filter((j) => j.igjen > 0);
  const bygg = medIgjen.slice(0, ANTALL_BYGG);
  const resten = medIgjen.slice(ANTALL_BYGG);
  const restSum = resten.reduce((s, j) => s + j.igjen, 0);
  const totalt = faser.ikkeStartet + faser.iGang + faser.ferdig;

  const [valgtIndeks, setValgtIndeks] = useState(0);
  const valgt = bygg[Math.min(valgtIndeks, bygg.length - 1)];

  // Det grønne reiser seg første gang feltet kommer til syne. Står feltet
  // allerede på skjermen, starter det med en gang (før første tegning).
  const feltRef = useRef<HTMLDivElement>(null);
  const [fase, setFase] = useState<"ferdig" | "vent" | "synlig">("ferdig");
  useLayoutEffect(() => {
    const el = feltRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) {
      setFase("synlig");
      return;
    }
    setFase("vent");
    const io = new IntersectionObserver(
      (oppf) => {
        if (oppf.some((o) => o.isIntersecting)) {
          setFase("synlig");
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Kort className={className} indeks={indeks} aria-labelledby="db-bygg-tittel">
      <BlokkTittel ikon={Building2} id="db-bygg-tittel">
        Jobbene våre
      </BlokkTittel>
      <p className={cn("mt-1 text-sm sm:text-[15px] sm:leading-[22px]", dempet)}>
        {bygg.length > 0
          ? `De ${bygg.length === 1 ? "" : `${bygg.length} `}jobbene med mest igjen å fakturere. Grønt er fakturert, stillaset er det som er igjen.`
          : "Alt er fakturert. Ingen jobber har noe igjen."}
      </p>

      {bygg.length > 0 && valgt && (
        <>
          <div
            ref={feltRef}
            role="group"
            aria-label="Velg en jobb for å se mer"
            className={cn(
              // To i bredden på mobil, så ekte navn kan leses uten å brytes midt i ordet.
              "mt-4 grid grid-cols-2 gap-y-3 sm:grid-cols-4 lg:grid-cols-8",
              fase === "vent" && "bp-vent",
              fase === "synlig" && "bp-synlig",
            )}
          >
            {bygg.map((j, i) => {
              const erValgt = j.id === valgt.id;
              return (
                <button
                  key={j.id}
                  type="button"
                  onClick={() => setValgtIndeks(i)}
                  aria-pressed={erValgt}
                  style={{ "--db-i": i } as CSSProperties}
                  className={cn(
                    "flex min-h-[120px] min-w-0 cursor-pointer flex-col items-center rounded-lg px-0.5 pb-2 pt-1 text-center sm:px-2",
                    "transition-colors duration-100 ease-linear motion-reduce:transition-none",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    erValgt ? "bg-foreground/[0.07] ring-1 ring-foreground/20" : "hover:bg-foreground/[0.04]",
                  )}
                >
                  <Bygg jobb={j} valgt={erValgt} />
                  <span
                    className={cn(
                      "mt-1 line-clamp-2 w-full break-normal text-[15px] leading-5 sm:text-sm",
                      erValgt ? "font-semibold" : "font-normal",
                    )}
                  >
                    {j.tittel}
                  </span>
                  <span className="mt-0.5 text-sm leading-5 sm:text-[15px]">
                    <span className={dempet}>igjen </span>
                    {/* «2,0 mill» fra 1 mill og opp, ellers hele kroner: «882 198 kr». */}
                    <span className="whitespace-nowrap font-semibold">{mill(j.igjen)}</span>
                  </span>
                  {j.fakturertForMye > 0 && (
                    <span className={cn("text-sm font-medium leading-5", tekstFarge.haster)}>fakturert for mye</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Linjen for valgt bygg */}
          <div
            aria-live="polite"
            className="mt-4 flex flex-col gap-3 rounded-lg bg-foreground/[0.04] p-3 sm:flex-row sm:items-center sm:justify-between sm:px-4 dark:bg-white/[0.05]"
          >
            <p className="min-w-0 text-base leading-6 sm:text-[15px] sm:leading-[22px]">
              <span className="font-semibold">
                #{valgt.nummer} {valgt.tittel}
              </span>
              {valgt.kunde && <span> · {valgt.kunde}</span>}
              {": "}
              <span className="font-semibold">{mill(valgt.igjen)} igjen</span>, {fakturertTekst(valgt)}
              {valgt.fakturertForMye > 0 && (
                <span className={cn("font-medium", tekstFarge.haster)}>
                  . Fakturert {kr(valgt.fakturertForMye)} for mye
                </span>
              )}
            </p>
            <Button asChild variant="outline" className={cn(knappKlasse, "shrink-0 self-start sm:self-auto")}>
              <Link to="/tilbud/$id" params={{ id: valgt.id }}>
                Åpne jobben
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>

          {/* Samme jobber som lenker, for skjermleser */}
          <ul className="sr-only">
            {bygg.map((j) => (
              <li key={j.id}>
                <Link to="/tilbud/$id" params={{ id: j.id }}>
                  #{j.nummer} {j.tittel}
                  {j.kunde ? `, ${j.kunde}` : ""}: {kr(j.igjen)} igjen, {fakturertTekst(j)}
                  {j.fakturertForMye > 0 ? `, fakturert ${kr(j.fakturertForMye)} for mye` : ""}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-4 flex flex-col gap-1 text-[15px] leading-[22px] sm:flex-row sm:flex-wrap sm:gap-x-6">
        {totalt > 0 && (
          <p>
            <span className="font-semibold">{antall(totalt, "jobb", "jobber")}:</span> {faser.ikkeStartet} ikke startet ·{" "}
            {faser.iGang} i gang · {faser.ferdig} ferdige
          </p>
        )}
        {resten.length > 0 && (
          <p className={dempet}>
            + {antall(resten.length, "mindre jobb", "mindre jobber")}, {mill(restSum)} igjen
          </p>
        )}
      </div>
    </Kort>
  );
}
