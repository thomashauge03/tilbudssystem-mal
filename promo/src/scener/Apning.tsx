import React from "react";
import { AbsoluteFill, interpolateColors } from "remotion";
import { useBilde } from "../felles/Tempo";
import { Bakgrunn, mellom } from "../felles/Scene";
import { Tittel } from "../felles/Tekst";
import { useFormat } from "../format";
import { ease, farge } from "../tema";

/**
 * Åpningen: to linjer på svart. Den første står alene en takt, så løfter den
 * seg og blir grå når den andre kommer. Slagordet på slutten svarer på dem.
 */
export const Apning: React.FC<{ varighet: number }> = ({ varighet }) => {
  const frame = useBilde();
  const { type, px } = useFormat();
  const liggende = type === "liggende";
  const stor = liggende ? 104 : px(92);
  const linje2 = 90;
  const opp = mellom(frame, [linje2 - 4, linje2 + 22], [0, 1], ease.myk);
  const graa = interpolateColors(opp, [0, 1], [farge.hvit, farge.gra]);
  const avstand = stor * (liggende ? 0.62 : 1.15);

  const t1 = liggende ? "Hele dagen i maskina." : "Hele dagen\ni maskina.";
  const t2 = liggende ? "Hele kvelden med papirarbeid." : "Hele kvelden\nmed papirarbeid.";

  return (
    <Bakgrunn lys={0.35}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", width: "100%", transform: `translateY(${-opp * avstand}px)` }}>
          <Tittel tekst={t1} inn={8} ut={varighet - 18} storrelse={stor} farge={graa} stagger={4} varighet={28} />
        </div>
        <div style={{ position: "absolute", width: "100%", transform: `translateY(${avstand}px)` }}>
          <Tittel tekst={t2} inn={linje2} ut={varighet - 14} storrelse={stor} stagger={4} varighet={28} />
        </div>
      </AbsoluteFill>
    </Bakgrunn>
  );
};
