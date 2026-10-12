import React from "react";
import { AbsoluteFill } from "remotion";
import { useBilde } from "../felles/Tempo";
import { FunksjonTekst } from "../felles/Funksjon";
import { Bakgrunn, mellom, Plassering, Rom } from "../felles/Scene";
import { Tittel } from "../felles/Tekst";
import { Telefon } from "../felles/Telefon";
import { useFormat } from "../format";
import { ease } from "../tema";
import { MobilOversikt } from "../ui/MobilOversikt";

/** Mobilvisningen: telefonen dreier sakte, og oversikten ruller forbi. */
export const Mobil: React.FC<{ varighet: number }> = ({ varighet }) => {
  const frame = useBilde();
  const { type, px } = useFormat();
  const liggende = type === "liggende";
  const inn = mellom(frame, [0, 26], [0, 1], ease.inn);
  const glid = mellom(frame, [0, varighet], [0, 1], ease.myk);
  const ut = mellom(frame, [varighet - 10, varighet], [0, 1], ease.ut);
  return (
    <Bakgrunn lys={0.8} x={liggende ? 66 : 50} y={liggende ? 50 : 62}>
      <Rom avstand={2000}>
        <Plassering
          x={liggende ? 380 : 0}
          y={(liggende ? 0 : px(240)) + (1 - inn) * 500}
          z={glid * 40}
          rx={3}
          ry={24 - glid * 36}
          rz={(1 - inn) * -8}
          skala={liggende ? 1.02 : px(1.25)}
          opacity={inn * (1 - ut)}
          blur={(1 - inn) * 10}
        >
          <Telefon klokke="07:12">
            <MobilOversikt rull={mellom(frame, [34, 112], [0, 250], ease.myk)} />
          </Telefon>
        </Plassering>
      </Rom>
      <FunksjonTekst tittel={"Hele oversikten,\n~også på mobilen.~"} inn={8} ut={varighet - 12} />
    </Bakgrunn>
  );
};

/**
 * Slagordet, som svarer på åpningen («Hele dagen i maskina. Hele kvelden med
 * papirarbeid.»). To linjer på svart, den andre i rødt.
 */
export const Slagord: React.FC<{ varighet: number; andreLinje?: number }> = ({ varighet, andreLinje = 40 }) => {
  const frame = useBilde();
  const { type, px } = useFormat();
  const liggende = type === "liggende";
  const stor = liggende ? 124 : px(112);
  const glod = mellom(frame, [andreLinje, andreLinje + 40], [0, 1], ease.inn) * mellom(frame, [varighet - 20, varighet], [1, 0]);
  return (
    <Bakgrunn lys={0.15}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 40% 26% at 50% 57%, rgba(227,2,19,${0.2 * glod}), rgba(0,0,0,0) 70%)`,
        }}
      />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
        <Tittel
          tekst={liggende ? "Mindre tid på kontoret." : "Mindre tid\npå kontoret."}
          inn={6}
          ut={varighet - 20}
          storrelse={stor}
          stagger={5}
          varighet={30}
        />
        <div style={{ height: liggende ? 8 : px(20) }} />
        <Tittel
          tekst={liggende ? "*Mer tid i maskina.*" : "*Mer tid\ni maskina.*"}
          inn={andreLinje}
          ut={varighet - 20}
          storrelse={stor}
          stagger={5}
          varighet={30}
        />
      </AbsoluteFill>
    </Bakgrunn>
  );
};
