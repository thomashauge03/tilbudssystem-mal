import React from "react";
import { AbsoluteFill } from "remotion";
import { useBilde } from "../felles/Tempo";
import { Bakgrunn, mellom, Plassering, Rom } from "../felles/Scene";
import { Tittel } from "../felles/Tekst";
import { useFormat } from "../format";
import { ease } from "../tema";
import { Anbud } from "../ui/Anbud";
import { Vindu } from "../ui/Vindu";

const VB = 1500;
const VH = 860;

/**
 * Pausen i musikken: svart, og et spørsmål entreprenøren kjenner seg igjen i.
 * Mens musikken stiger, kommer anbudsanalysen langsomt fram fra mørket.
 */
export const AnbudSporsmal: React.FC<{ varighet: number }> = ({ varighet }) => {
  const frame = useBilde();
  const { type, px } = useFormat();
  const liggende = type === "liggende";
  const kommer = mellom(frame, [118, varighet], [0, 1], ease.inn);
  const naerm = mellom(frame, [118, varighet], [0, 1], (t) => t * t);
  return (
    <Bakgrunn lys={0.15 + kommer * 0.4}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <Tittel
          tekst={"Taper du anbud\nuten å vite hvorfor?"}
          inn={12}
          ut={104}
          storrelse={liggende ? 96 : px(92)}
          stagger={5}
          varighet={30}
        />
      </AbsoluteFill>
      {kommer > 0 && (
        <Rom avstand={2600}>
          <Plassering
            y={liggende ? 150 : px(330)}
            z={-1700 + naerm * 1450}
            rx={24 - naerm * 12}
            ry={-4}
            skala={liggende ? 1 : px(1080) / VB * 1.2}
            opacity={kommer * 0.85}
            blur={(1 - naerm) * 16 + 2}
          >
            <Vindu bredde={VB} hoyde={VH} zoom={1.04} aktiv="Anbud">
              <Anbud tegnet={naerm * 0.32} tall={naerm * 0.3} />
            </Vindu>
          </Plassering>
        </Rom>
      )}
    </Bakgrunn>
  );
};

/**
 * Musikken slår inn igjen, og anbudsanalysen smekker på plass: treffrate,
 * hvor langt unna vinneren vi lå, og hvordan hver konkurrent priser seg.
 */
export const AnbudScene: React.FC<{ varighet: number }> = ({ varighet }) => {
  const frame = useBilde();
  const { type, px } = useFormat();
  const liggende = type === "liggende";
  const smekk = mellom(frame, [0, 16], [0, 1], ease.inn);
  const blits = mellom(frame, [0, 18], [1, 0], ease.inn);
  const glid = mellom(frame, [16, varighet], [0, 1], ease.myk);
  const ut = mellom(frame, [varighet - 10, varighet], [0, 1], ease.ut);
  return (
    <Bakgrunn lys={0.85 + blits * 0.6}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 60% 50% at 50% 60%, rgba(255,255,255,${0.12 * blits}), rgba(0,0,0,0) 70%)` }} />
      <Rom avstand={2600}>
        <Plassering
          y={liggende ? 170 : px(360)}
          z={-250 + smekk * 250 + glid * 70}
          rx={12 - smekk * 4 - glid * 2}
          ry={-4 + glid * 6}
          skala={liggende ? 1 : px(1080) / VB * 1.2}
          opacity={(0.85 + smekk * 0.15) * (1 - ut)}
          blur={(1 - smekk) * 2}
        >
          <Vindu bredde={VB} hoyde={VH} zoom={1.04} aktiv="Anbud" glans={mellom(frame, [6, 70], [0, 1])}>
            <Anbud tegnet={0.32 + mellom(frame, [0, 110], [0, 0.68], ease.inn)} tall={0.3 + mellom(frame, [0, 50], [0, 0.7], ease.inn)} />
          </Vindu>
        </Plassering>
      </Rom>
      <div style={{ position: "absolute", top: liggende ? 56 : px(150), left: liggende ? 150 : 0, right: liggende ? undefined : 0, zIndex: 10, padding: liggende ? 0 : `0 ${px(60)}px` }}>
        <Tittel
          tekst={liggende ? "Se hvordan konkurrentene priser seg." : "Se hvordan\nkonkurrentene\npriser seg."}
          inn={4}
          ut={varighet - 12}
          storrelse={liggende ? 72 : px(80)}
          justering={liggende ? "left" : "center"}
        />
        <div style={{ marginTop: liggende ? 10 : px(16) }}>
          <Tittel
            tekst="~Hentet rett fra anbudsprotokollene.~"
            inn={26}
            ut={varighet - 12}
            storrelse={liggende ? 36 : px(42)}
            vekt={500}
            sperring="-0.015em"
            justering={liggende ? "left" : "center"}
            modus="samlet"
          />
        </div>
      </div>
    </Bakgrunn>
  );
};
