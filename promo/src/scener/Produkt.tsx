import React from "react";
import { useBilde } from "../felles/Tempo";
import { Bakgrunn, mellom, Plassering, Rom } from "../felles/Scene";
import { Tittel } from "../felles/Tekst";
import { useFormat } from "../format";
import { ease } from "../tema";
import { Dashbord } from "../ui/Dashbord";
import { Vindu } from "../ui/Vindu";

/**
 * Produktet for første gang: appvinduet stiger opp av mørket med dashbordet
 * tent, tallene teller seg opp, og kameraet glir rundt. På slutten skyves
 * vinduet forbi kameraet, inn i neste scene.
 */
export const Produkt: React.FC<{ varighet: number }> = ({ varighet }) => {
  const frame = useBilde();
  const { type, px } = useFormat();
  const liggende = type === "liggende";
  const inn = mellom(frame, [0, 44], [0, 1], ease.inn);
  const glid = mellom(frame, [0, varighet], [0, 1], ease.myk);
  const ut = mellom(frame, [varighet - 12, varighet], [0, 1], ease.ut);

  const bredde = liggende ? 1500 : 1400;
  const hoyde = liggende ? 880 : 1300;
  return (
    <Bakgrunn lys={0.55 + inn * 0.35}>
      <Rom avstand={2600}>
        <Plassering
          y={(liggende ? 130 : px(170)) + (1 - inn) * 520}
          z={-glid * 70 + ut * 900}
          rx={10 + (1 - inn) * 32 - glid * 4}
          ry={-11 + glid * 16}
          rz={0.6 - glid * 1.2}
          skala={liggende ? 1 : px(1080) / 1500}
          opacity={inn * (1 - ut)}
          blur={(1 - inn) * 18 + ut * 16}
        >
          <Vindu bredde={bredde} hoyde={hoyde} zoom={liggende ? 1.12 : 1.2} aktiv="Dashboard" glans={mellom(frame, [24, 96], [0, 1])}>
            <Dashbord p={mellom(frame, [12, 72], [0, 1], ease.inn)} kortInn={mellom(frame, [6, 48], [0, 1])} />
          </Vindu>
        </Plassering>
      </Rom>
      <div style={{ position: "absolute", top: liggende ? 64 : px(150), width: "100%" }}>
        <Tittel
          tekst={liggende ? "Alt om jobben, samlet på ett sted." : "Alt om jobben,\nsamlet på ett sted."}
          inn={14}
          ut={varighet - 14}
          storrelse={liggende ? 80 : px(84)}
        />
      </div>
    </Bakgrunn>
  );
};
