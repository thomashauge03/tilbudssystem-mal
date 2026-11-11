import { ChartColumn } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { Maned } from "@/lib/dashboard-typer";
import { BlokkTittel, Fargeprove, Kort, dempet } from "./felles";
import { stolpeTall } from "./format";

// «Kommer det inn nok nytt arbeid?» To stolper per måned: nye jobber og
// fakturert. Beløpet står over hver stolpe, så ingen akse trengs. Inneværende
// måned har striper og «hittil», så den ikke ser ut som en dårlig måned.

const TALL_HOYDE = 24; // px: tallet over stolpen (20 px linje + 4 px luft)

export function Maneder({
  maneder,
  setning,
  mindreArbeidIgjen,
  className,
  indeks,
}: {
  maneder: Maned[];
  setning: string;
  mindreArbeidIgjen: boolean;
  className?: string;
  indeks?: number;
}) {
  const storst = Math.max(1, ...maneder.flatMap((m) => [m.nyeJobber, m.fakturert]));
  const andel = (n: number) => (n <= 0 ? 0 : n / storst);

  const beskrivelse =
    "Nye jobber og fakturert per måned, i millioner kroner. " +
    maneder
      .map((m) => `${m.navn}${m.hittil ? " hittil" : ""}: nye jobber ${stolpeTall(m.nyeJobber)}, fakturert ${stolpeTall(m.fakturert)}`)
      .join(". ");

  return (
    <Kort className={className} indeks={indeks} aria-labelledby="db-maneder-tittel">
      <BlokkTittel ikon={ChartColumn} id="db-maneder-tittel">
        Nye jobber og fakturert
      </BlokkTittel>
      <ul className={cn("mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm", dempet)}>
        <li className="flex items-center gap-1.5">
          <Fargeprove className="bg-slate-500 dark:bg-slate-400" />
          Nye jobber
        </li>
        <li className="flex items-center gap-1.5">
          <Fargeprove className="bg-green-600" />
          Fakturert
        </li>
        <li>Tall i mill kr</li>
      </ul>

      {maneder.length === 0 ? (
        <p className={cn("mt-6 text-[15px]", dempet)}>Ingen tall for de siste månedene ennå.</p>
      ) : (
        // Stolpeområdet vokser med kortet (det står ved siden av Penger inn), men er
        // aldri lavere enn 148 px på mobil og 180 px på desktop.
        <div role="img" aria-label={beskrivelse} className="mt-5 grid flex-1 grid-cols-6 gap-0.5 sm:gap-2">
          {maneder.map((m, i) => (
            <div key={m.maned} className="flex min-w-0 flex-col items-center">
              <div className="flex min-h-[148px] w-full flex-1 items-stretch justify-center gap-[3px] border-b border-foreground/25 sm:gap-1 xl:min-h-[180px]">
                <Stolpe verdi={m.nyeJobber} andel={andel(m.nyeJobber)} type="nye" hittil={m.hittil} nr={i * 2} />
                <Stolpe verdi={m.fakturert} andel={andel(m.fakturert)} type="fakturert" hittil={m.hittil} nr={i * 2 + 1} />
              </div>
              <span className="mt-1.5 text-sm font-medium leading-5">{m.navn}</span>
              {m.hittil && <span className={cn("text-sm leading-5", dempet)}>hittil</span>}
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 text-base leading-6 sm:text-[15px] sm:leading-[22px]">
        {setning}
        {mindreArbeidIgjen && <span className="font-semibold"> Det er mindre arbeid igjen enn før.</span>}
      </p>
    </Kort>
  );
}

function Stolpe({
  verdi,
  andel,
  type,
  hittil,
  nr,
}: {
  verdi: number;
  /** 0–1 av den største stolpen. */
  andel: number;
  type: "nye" | "fakturert";
  hittil: boolean;
  nr: number;
}) {
  const farge = hittil
    ? type === "nye"
      ? "db-striper-nye"
      : "db-striper-fakturert"
    : type === "nye"
      ? "bg-slate-500 dark:bg-slate-400"
      : "bg-green-600";
  return (
    // Tallet over tar 24 px; resten av høyden (som følger kortet) er skalaen.
    <div className="flex max-w-9 flex-1 flex-col items-center justify-end">
      <span className="mb-1 whitespace-nowrap text-sm font-medium leading-5 tracking-tight">{stolpeTall(verdi)}</span>
      {andel > 0 && (
        <div
          className={cn("db-stolpe w-full rounded-t-[3px]", farge)}
          style={{ height: `max(3px, calc((100% - ${TALL_HOYDE}px) * ${andel.toFixed(4)}))`, "--db-i": Math.min(nr, 11) } as CSSProperties}
        />
      )}
    </div>
  );
}
