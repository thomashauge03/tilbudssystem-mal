import React from "react";
import { useBilde } from "../felles/Tempo";
import { Bakgrunn, mellom, Plassering, Rom } from "../felles/Scene";
import { Tittel } from "../felles/Tekst";
import { useFormat } from "../format";
import { ease } from "../tema";
import { Fremdriftsplan } from "../ui/Fremdriftsplan";
import { Ordre } from "../ui/Ordre";
import { Vindu } from "../ui/Vindu";

/** Overskrift oppe til venstre (liggende) eller midt på toppen (stående). */
const Topptekst: React.FC<{ tekst: string; tekstStaaende?: string; inn: number; ut?: number; storrelse?: number; modus?: "ord" | "linje" }> = ({
  tekst,
  tekstStaaende,
  inn,
  ut,
  storrelse,
  modus,
}) => {
  const { type, px } = useFormat();
  const liggende = type === "liggende";
  return (
    <div
      style={{
        position: "absolute",
        top: liggende ? 64 : px(150),
        left: liggende ? 150 : 0,
        right: liggende ? undefined : 0,
        padding: liggende ? 0 : `0 ${px(60)}px`,
        zIndex: 10,
      }}
    >
      <Tittel
        tekst={!liggende && tekstStaaende ? tekstStaaende : tekst}
        inn={inn}
        ut={ut}
        storrelse={storrelse ?? (liggende ? 72 : px(80))}
        justering={liggende ? "left" : "center"}
        modus={modus}
      />
    </div>
  );
};

/** Planen: strekene tegner seg over ukene. Et kort slag. */
export const Fremdrift: React.FC<{ varighet: number }> = ({ varighet }) => {
  const frame = useBilde();
  const { type, px } = useFormat();
  const liggende = type === "liggende";
  const glid = mellom(frame, [0, varighet], [0, 1], ease.myk);
  const inn = mellom(frame, [0, 14], [0, 1], ease.inn);
  const ut = mellom(frame, [varighet - 8, varighet], [0, 1], ease.ut);
  return (
    <Bakgrunn lys={0.75}>
      <Rom avstand={2600}>
        <Plassering
          y={(liggende ? 170 : px(330)) + (1 - inn) * 120}
          z={glid * 60}
          rx={16 - glid * 5}
          ry={-3 + glid * 3}
          skala={liggende ? 1 : px(1080) / 1400 * 1.2}
          opacity={inn * (1 - ut)}
        >
          <Vindu bredde={1440} hoyde={740} zoom={1.1} aktiv="Fremdriftsplan" glans={mellom(frame, [8, 60], [0, 1])}>
            <Fremdriftsplan tegnet={mellom(frame, [4, 58], [0, 1], ease.lineaer)} />
          </Vindu>
        </Plassering>
      </Rom>
      <Topptekst
        tekst="Fremdriftsplanen er klar til byggemøtet."
        tekstStaaende={"Fremdriftsplanen er\nklar til byggemøtet."}
        inn={2}
        ut={varighet - 10}
        storrelse={liggende ? 66 : undefined}
      />
    </Bakgrunn>
  );
};

/** Ordren: fakturert teller opp, gjenstår teller ned. Rolig, i pausen i musikken. */
export const OrdreScene: React.FC<{ varighet: number }> = ({ varighet }) => {
  const frame = useBilde();
  const { type, px } = useFormat();
  const liggende = type === "liggende";
  const glid = mellom(frame, [0, varighet], [0, 1], ease.myk);
  const inn = mellom(frame, [0, 22], [0, 1], ease.inn);
  const ut = mellom(frame, [varighet - 14, varighet], [0, 1], ease.ut);
  return (
    <Bakgrunn lys={0.7}>
      <Rom avstand={2600}>
        <Plassering
          y={(liggende ? 190 : px(360)) + (1 - inn) * 200}
          z={glid * 110}
          rx={10 - glid * 3}
          ry={-7 + glid * 5}
          skala={liggende ? 1 : px(1080) / 1400 * 1.15}
          opacity={inn * (1 - ut)}
          blur={(1 - inn) * 10 + ut * 8}
        >
          <Vindu bredde={1440} hoyde={740} zoom={1.1} aktiv="Ordre">
            <Ordre fakturert={mellom(frame, [26, 118], [0, 1], ease.myk)} uthev={mellom(frame, [10, 40], [0, 1])} />
          </Vindu>
        </Plassering>
      </Rom>
      <Topptekst tekst="Du ser hva som er fakturert," tekstStaaende={"Du ser hva som\ner fakturert,"} inn={6} ut={varighet - 16} />
      <div style={{ position: "absolute", top: liggende ? 150 : px(420), left: liggende ? 150 : 0, right: liggende ? undefined : 0, zIndex: 10 }}>
        <Tittel tekst="~og hva som gjenstår.~" inn={62} ut={varighet - 16} storrelse={liggende ? 72 : px(80)} justering={liggende ? "left" : "center"} />
      </div>
    </Bakgrunn>
  );
};
