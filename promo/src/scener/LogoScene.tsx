import React from "react";
import { AbsoluteFill } from "remotion";
import { useBilde } from "../felles/Tempo";
import { Bakgrunn, mellom } from "../felles/Scene";
import { Tittel } from "../felles/Tekst";
import { useFormat } from "../format";
import { TechaugeMerke, TechaugeOrd } from "../merke/TechaugeLogo";
import { merkeDeler, merkeRamme } from "../merke/techauge-vektor";
import { ease, farge } from "../tema";

// Midten av merket og av den røde delen, i logoens koordinater. Den røde delen
// starter som punktet midt i bildet og vokser ut til sin plass.
const [mx, my, mw, mh] = merkeRamme;
const MIDT = { x: mx + mw / 2, y: my + mh / 2 };
const rodBoks = merkeDeler[2].boks;
const ROD_MIDT = { x: (rodBoks[0] + rodBoks[2]) / 2, y: (rodBoks[1] + rodBoks[3]) / 2 };

/**
 * Logoen på droppet. Det røde punktet fra kaoset eksploderer ut til den røde
 * delen av merket, de hvite delene sveiper inn, og bokstavene faller på plass
 * én og én. `slutt` er sluttplakaten med adresse, uten utgang.
 */
export const LogoScene: React.FC<{ varighet: number; slutt?: boolean; adresse?: string; taglineInn?: number; adresseInn?: number }> = ({
  varighet,
  slutt = false,
  adresse = "techauge.no",
  taglineInn = 44,
  adresseInn = 58,
}) => {
  const frame = useBilde();
  const { type, px } = useFormat();
  const liggende = type === "liggende";
  const merke = liggende ? 280 : px(340);
  const ordHoyde = liggende ? 40 : px(52);

  const del = (a: number, b: number) => mellom(frame, [a, b], [0, 1], ease.inn);
  const deler = [
    { p: del(3, 22), dx: -150, dy: -120, rot: -22, blur: 10 * (1 - del(3, 22)) },
    { p: del(6, 25), dx: -160, dy: 130, rot: 18, blur: 10 * (1 - del(6, 25)) },
    { p: del(0, 17), dx: MIDT.x - ROD_MIDT.x, dy: MIDT.y - ROD_MIDT.y, rot: -40, skala: 0.035 },
  ];
  const bokstaver = Array.from({ length: 8 }, (_, i) => {
    const s = 22 + i * 2.5;
    return { p: del(s, s + 18), dx: (i - 3.5) * 26, dy: 18 };
  });

  const ut = slutt ? 0 : mellom(frame, [varighet - 22, varighet], [0, 1], ease.ut);
  const blits = mellom(frame, [0, 14], [1, 0], ease.inn);
  const glod = 0.5 + blits * 0.8;

  return (
    <Bakgrunn lys={glod} rodt>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 46%, rgba(255,255,255,${0.16 * blits}), rgba(0,0,0,0) 45%)`,
        }}
      />
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: liggende ? 34 : px(44),
          opacity: 1 - ut,
          transform: `scale(${1 + mellom(frame, [0, varighet], [0, 0.04]) - ut * 0.06})`,
          filter: ut > 0.02 ? `blur(${ut * 12}px)` : undefined,
          marginTop: slutt ? (liggende ? -40 : px(-60)) : 0,
        }}
      >
        <TechaugeMerke storrelse={merke} deler={deler} />
        <TechaugeOrd hoyde={ordHoyde} bokstaver={bokstaver} />
        <div style={{ marginTop: liggende ? -6 : px(-8) }}>
          <Tittel
            tekst="~Tilbud og prosjekt.~"
            inn={taglineInn}
            storrelse={liggende ? 34 : px(40)}
            vekt={500}
            sperring="-0.01em"
            modus="samlet"
          />
        </div>
        {slutt && (
          <div style={{ marginTop: liggende ? 18 : px(30) }}>
            <Tittel tekst={adresse} inn={adresseInn} storrelse={liggende ? 30 : px(38)} vekt={600} sperring="0.01em" modus="samlet" farge={farge.hvit} />
          </div>
        )}
      </AbsoluteFill>
    </Bakgrunn>
  );
};
