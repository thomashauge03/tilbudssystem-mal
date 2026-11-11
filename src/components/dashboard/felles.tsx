import { useEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { delBelop } from "./format";

// Byggeklosser som alle blokkene på dashbordet deler: kortet, tittelen, de store
// beløpene og knappene. Fargene her er faste og følger aldri firmaets --primary.

export type Tone = "noytral" | "haster" | "venter";

/** Kort: myk skygge i lyst tema, tydelig lysere enn bakgrunnen i mørkt. */
const kortKlasse =
  "flex flex-col rounded-xl border border-border bg-card text-card-foreground p-4 sm:p-6 " +
  "shadow-[0_1px_2px_oklch(0.2_0.01_80/0.08),0_8px_24px_-12px_oklch(0.2_0.01_80/0.14)] " +
  "dark:border-white/[0.12] dark:bg-[oklch(0.25_0.004_80)] dark:shadow-[inset_0_1px_0_oklch(1_0_0/0.06)]";

const toneKlasse: Record<Tone, string> = {
  noytral: "",
  // Mørkt tema: kortfargen med 6 % rødt/gult, så blokken fortsatt er lysere enn
  // bakgrunnen. Fargen bæres av rammen, ikonet og beløpet, ikke av en tung flate.
  haster:
    "border-red-200 bg-red-50 dark:border-red-500/40 " +
    "dark:bg-[color-mix(in_oklch,oklch(0.25_0.004_80)_94%,oklch(0.637_0.237_25.3))]",
  venter:
    "border-amber-200 bg-amber-50 dark:border-amber-500/40 " +
    "dark:bg-[color-mix(in_oklch,oklch(0.25_0.004_80)_94%,oklch(0.769_0.188_70.1))]",
};

/** Skillelinjer mellom rader, i samme farge som blokken. */
export const skilleKlasse: Record<Tone, string> = {
  noytral: "divide-border dark:divide-white/[0.1]",
  haster: "divide-red-200 dark:divide-red-500/25",
  venter: "divide-amber-200 dark:divide-amber-500/25",
};

/** Tekstfarge for beløp og ord som betyr noe. */
export const tekstFarge = {
  haster: "text-red-700 dark:text-red-300",
  venter: "text-amber-800 dark:text-amber-300",
  fakturert: "text-green-800 dark:text-green-300",
  igjen: "text-foreground",
} as const;

/** Tilleggstekst: mørkere enn muted-foreground, så den leses i sollys. */
export const dempet = "text-foreground/75";

type KortProps = HTMLAttributes<HTMLElement> & { tone?: Tone; indeks?: number };

/** Ett kort per blokk. `indeks` gir den rolige innfasingen ved første lasting. */
export function Kort({ tone = "noytral", indeks, className, style, children, ...rest }: KortProps) {
  const stil = indeks === undefined ? style : ({ ...style, "--db-i": Math.min(indeks, 5) } as CSSProperties);
  return (
    <section
      className={cn(kortKlasse, toneKlasse[tone], indeks !== undefined && "db-inn", className)}
      style={stil}
      {...rest}
    >
      {children}
    </section>
  );
}

export function BlokkTittel({
  ikon: Ikon,
  tone,
  id,
  children,
}: {
  ikon: LucideIcon;
  tone?: Tone;
  id?: string;
  children: ReactNode;
}) {
  const ikonFarge = tone === "haster" ? tekstFarge.haster : tone === "venter" ? tekstFarge.venter : "text-foreground/75";
  return (
    <h2 id={id} className="flex items-center gap-2 text-base font-semibold leading-[22px] text-foreground">
      <Ikon className={cn("size-5 shrink-0", ikonFarge)} aria-hidden />
      {children}
    </h2>
  );
}

/** Stort beløp der «kr» og «mill» står mindre ved siden av tallet (aldri under 14 px). */
export function StortBelop({ tekst, className }: { tekst: string; className?: string }) {
  const [verdi, enhet] = delBelop(tekst);
  return (
    <span className={cn("whitespace-nowrap font-semibold tabular-nums", className)}>
      {verdi}
      {enhet && <span className="ml-[0.25em] text-[length:max(14px,0.6em)] font-medium">{enhet}</span>}
    </span>
  );
}

/**
 * Knapp med ikon og ord. 48 px høy på mobil, 36 px på desktop, og et tydelig
 * trykk. Brukes med `asChild` rundt en Link eller en <a>.
 */
export const knappKlasse =
  "h-12 min-w-12 px-3 text-[15px] sm:h-9 bg-card dark:bg-[oklch(0.3_0.004_80)] dark:border-white/[0.16] " +
  "dark:hover:bg-[oklch(0.34_0.004_80)] active:translate-y-px active:bg-foreground/[0.08] " +
  "transition-[color,background-color,transform] duration-100 ease-linear motion-reduce:transition-none";

/** «Se alle 9» nederst i en liste: 48 px fullbreddeknapp. */
export const seAlleKlasse = cn(knappKlasse, "mt-4 w-full sm:h-12");

/** Lite merke ved siden av en rad, f.eks. «Bør lukkes» og «Ikke sendt». */
export function Merke({ tone = "noytral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 text-sm font-medium leading-5",
        tone === "haster"
          ? "border-red-300 bg-red-100 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
          : "border-foreground/20 bg-foreground/[0.06] text-foreground",
      )}
    >
      {children}
    </span>
  );
}

/** Liten fargeprøve til forklaringer («grønt = fakturert»). */
export function Fargeprove({ className }: { className: string }) {
  return <span aria-hidden className={cn("inline-block size-3 shrink-0 rounded-[3px]", className)} />;
}

/**
 * Fremhever et tall som endret seg siden forrige henting: grønn bakgrunn som
 * blekner over 1,5 s, og «Ny» i 10 s. Ingenting skjer ved første visning.
 */
export function Fremhev({ verdi, children }: { verdi: number; children: ReactNode }) {
  const forrige = useRef(Math.round(verdi));
  const [ny, setNy] = useState(0);

  useEffect(() => {
    const avrundet = Math.round(verdi);
    if (avrundet === forrige.current) return;
    forrige.current = avrundet;
    setNy((n) => n + 1);
    const t = window.setTimeout(() => setNy(0), 10_000);
    return () => window.clearTimeout(t);
  }, [verdi]);

  if (!ny) return <>{children}</>;
  return (
    <span key={ny} className="db-ny inline-flex items-baseline gap-2">
      {children}
      <span className="rounded bg-green-600 px-1.5 text-sm font-semibold leading-5 text-white">Ny</span>
    </span>
  );
}
