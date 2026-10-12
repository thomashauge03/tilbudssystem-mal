import React from "react";
import { interpolate } from "remotion";
import { useBilde } from "../felles/Tempo";
import { linjeSum, tilbud } from "../data";
import { FunksjonTekst } from "../felles/Funksjon";
import { Musepeker } from "../felles/Peker";
import { Bakgrunn, mellom, Plassering, Rom } from "../felles/Scene";
import { useFormat } from "../format";
import { ease } from "../tema";
import { TilbudPdf } from "../ui/TilbudPdf";
import { TilbudSkjema } from "../ui/TilbudSkjema";
import { Vindu } from "../ui/Vindu";

export const TILBUD_TIDER = {
  linjerFra: 26,
  linjerTil: 128,
  klikk: 146,
  pdf: 150,
} as const;

/**
 * Tilbudet lages: linjene legger seg inn under overskriftene og summen teller
 * med. Så trykkes «Last ned PDF», og dokumentet — med firmaets logo — glir ut
 * av skjermen og legger seg foran.
 */
export const TilbudScene: React.FC<{ varighet: number }> = ({ varighet }) => {
  const frame = useBilde();
  const { type, px } = useFormat();
  const liggende = type === "liggende";
  const T = TILBUD_TIDER;

  const inn = mellom(frame, [0, 30], [0, 1], ease.inn);
  const antall = tilbud.linjer.length;
  const linjer = interpolate(frame, [T.linjerFra, T.linjerTil], [0, antall], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // Summen følger linjene, men teller mykt opp til hver nye linje
  const helt = Math.floor(linjer);
  const forrige = tilbud.linjer.slice(0, helt).reduce((s, l) => s + linjeSum(l), 0);
  const neste = helt < antall ? linjeSum(tilbud.linjer[helt]) : 0;
  const total = forrige + neste * ease.inn(Math.min(1, (linjer - helt) * 1.4));

  const pdf = mellom(frame, [T.pdf, T.pdf + 36], [0, 1], ease.inn);
  const glid = mellom(frame, [0, varighet], [0, 1], ease.myk);
  const ut = mellom(frame, [varighet - 10, varighet], [0, 1], ease.ut);

  // Vinduet: 1180 × 900 med appens egne punkter (zoom 1)
  const vb = 1180;
  const vh = 900;
  const knappX = vb - 32 - 150 - 8 - 70; // midt på «Last ned PDF»
  const knappY = 60 + 28 + 20;

  const vindu = (
    <Vindu
      bredde={vb}
      hoyde={vh}
      zoom={1}
      aktiv="Tilbud"
      glans={mellom(frame, [10, 70], [0, 1])}
      over={
        <Musepeker
          rute={[
            { f: T.klikk - 26, x: vb - 120, y: vh - 80 },
            { f: T.klikk - 2, x: knappX, y: knappY },
            { f: T.klikk + 30, x: knappX + 30, y: knappY + 60 },
          ]}
          klikk={[T.klikk]}
          synligFra={T.klikk - 26}
          synligTil={T.klikk + 34}
        />
      }
    >
      <TilbudSkjema fokus linjer={linjer} total={total} trykket="pdf" trykk={mellom(frame, [T.klikk - 2, T.klikk + 1, T.klikk + 6], [0, 1, 0])} />
    </Vindu>
  );

  return (
    <Bakgrunn lys={0.8} x={liggende ? 64 : 50}>
      <Rom avstand={2400}>
        <Plassering
          x={liggende ? 470 + (1 - inn) * 400 : 0}
          y={liggende ? 30 : px(250)}
          z={-pdf * 260 - glid * 40}
          rx={5}
          ry={(liggende ? -15 : -6) - (1 - inn) * 20 + glid * 5}
          skala={liggende ? 1.02 : px(1080) / vb * 0.92}
          opacity={inn * (1 - ut) * (1 - pdf * 0.45)}
          blur={(1 - inn) * 14 + pdf * 3}
        >
          {vindu}
        </Plassering>
        {pdf > 0 && (
          <Plassering
            x={liggende ? 300 + (1 - pdf) * 60 : 0}
            y={liggende ? 30 : px(300)}
            z={-400 + pdf * 520}
            rx={(1 - pdf) * 20}
            ry={-24 * (1 - pdf) - 8}
            rz={-3 + (1 - pdf) * 6}
            skala={liggende ? 1 : px(1)}
            opacity={Math.min(1, pdf * 2) * (1 - ut)}
          >
            <TilbudPdf bredde={liggende ? 620 : 660} />
          </Plassering>
        )}
      </Rom>
      <FunksjonTekst etikett="Tilbud" tittel={"Et ryddig tilbud\npå noen minutter."} inn={6} ut={T.pdf - 4} />
      <FunksjonTekst tittel={"Ferdig PDF med\ndin egen logo."} inn={T.pdf + 8} ut={varighet - 12} />
    </Bakgrunn>
  );
};
