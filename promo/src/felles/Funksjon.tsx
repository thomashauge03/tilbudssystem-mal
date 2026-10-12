import React from "react";
import { Etikett, Tittel } from "./Tekst";
import { useFormat } from "../format";

/**
 * Teksten i en funksjonsscene: rød etikett over en stor overskrift. Liggende
 * står den til venstre med produktet til høyre; i stående formater står den
 * øverst med produktet under.
 */
export const FunksjonTekst: React.FC<{
  etikett?: string;
  tittel: string;
  /** Overskrift i stående format, der linjene må brytes annerledes */
  tittelStaaende?: string;
  inn: number;
  ut?: number;
  /** Plassering i liggende format */
  plass?: "venstre" | "topp";
  storrelse?: number;
  undertekst?: string;
  underInn?: number;
}> = ({ etikett, tittel, tittelStaaende, inn, ut, plass = "venstre", storrelse, undertekst, underInn }) => {
  const { type, px } = useFormat();
  const liggende = type === "liggende";
  const venstre = liggende && plass === "venstre";
  const stor = storrelse ?? (liggende ? (venstre ? 84 : 76) : px(80));
  const juster = venstre ? "left" : "center";
  return (
    <div
      style={{
        position: "absolute",
        left: venstre ? 150 : 0,
        right: venstre ? undefined : 0,
        top: venstre ? "50%" : liggende ? 66 : px(150),
        transform: venstre ? "translateY(-50%)" : undefined,
        width: venstre ? 720 : undefined,
        display: "flex",
        flexDirection: "column",
        gap: liggende ? 18 : px(22),
        zIndex: 10,
        padding: liggende ? 0 : `0 ${px(60)}px`,
      }}
    >
      {etikett && <Etikett tekst={etikett} inn={inn} ut={ut} storrelse={liggende ? 34 : px(40)} justering={juster} />}
      <Tittel
        tekst={!liggende && tittelStaaende ? tittelStaaende : tittel}
        inn={inn + 4}
        ut={ut}
        storrelse={stor}
        justering={juster}
        linjehoyde={1.04}
      />
      {undertekst && (
        <Tittel
          tekst={`~${undertekst}~`}
          inn={underInn ?? inn + 20}
          ut={ut}
          storrelse={liggende ? 38 : px(44)}
          vekt={500}
          sperring="-0.015em"
          justering={juster}
          modus="samlet"
        />
      )}
    </div>
  );
};
