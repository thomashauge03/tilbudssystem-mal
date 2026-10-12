import React from "react";
import { interpolate } from "remotion";
import { useBilde } from "./Tempo";
import { inter } from "../fonter";
import { ease, farge, rodGradient } from "../tema";

/**
 * Overskrift som kommer inn ord for ord: hvert ord løfter seg litt, går fra
 * uskarpt til skarpt og toner fram. Det er Apple-grepet, og det er nesten
 * hele hemmeligheten — resten er god luft rundt teksten.
 *
 * Teksten skrives med en liten markering:
 *   \n        linjeskift
 *   *ord*     rød gradient (ordene som skal sitte igjen)
 *   ~ord~     grått (det som står i andre rekke)
 */
type Token = { ord: string; stil: "vanlig" | "rod" | "gra"; linje: number };

const tolk = (tekst: string): Token[] => {
  const ut: Token[] = [];
  let stil: Token["stil"] = "vanlig";
  tekst.split("\n").forEach((linje, li) => {
    linje
      .split(" ")
      .filter(Boolean)
      .forEach((raa) => {
        let ord = raa;
        let denne = stil;
        if (ord.startsWith("*")) { stil = "rod"; denne = "rod"; ord = ord.slice(1); }
        if (ord.startsWith("~")) { stil = "gra"; denne = "gra"; ord = ord.slice(1); }
        let slutt = false;
        if (ord.endsWith("*") || ord.endsWith("~")) { slutt = true; ord = ord.slice(0, -1); }
        ut.push({ ord, stil: denne, linje: li });
        if (slutt) stil = "vanlig";
      });
  });
  return ut;
};

export type TittelProps = {
  tekst: string;
  /** Bildet der første ord begynner å komme inn. */
  inn: number;
  /** Bildet der teksten begynner å forsvinne. Utelates hvis den skal bli stående. */
  ut?: number;
  storrelse: number;
  vekt?: number;
  farge?: string;
  /** Bilder mellom hvert ord. */
  stagger?: number;
  /** Hvor lenge hvert ord bruker på å komme inn. */
  varighet?: number;
  justering?: "left" | "center" | "right";
  linjehoyde?: number;
  sperring?: string;
  stil?: React.CSSProperties;
  /** «ord»: ord for ord. «linje»: hele linjer om gangen. «samlet»: alt på en gang. */
  modus?: "ord" | "linje" | "samlet";
  /** Hvor langt ordene løfter seg, i andeler av skriftstørrelsen. */
  loft?: number;
};

export const Tittel: React.FC<TittelProps> = ({
  tekst,
  inn,
  ut,
  storrelse,
  vekt = 600,
  farge: tekstFarge = farge.hvit,
  stagger = 3,
  varighet = 24,
  justering = "center",
  linjehoyde = 1.06,
  sperring = "-0.035em",
  stil,
  modus = "ord",
  loft = 0.32,
}) => {
  const frame = useBilde();
  const tokens = tolk(tekst);
  const linjer = Math.max(...tokens.map((t) => t.linje)) + 1;

  const renderOrd = (t: Token, i: number) => {
    const rekke = modus === "ord" ? i : modus === "linje" ? t.linje : 0;
    const start = inn + rekke * (modus === "linje" ? stagger * 3 : stagger);
    const p = interpolate(frame, [start, start + varighet], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: ease.inn,
    });
    let q = 0;
    if (ut !== undefined) {
      const s = ut + (modus === "ord" ? i * 1.5 : 0);
      q = interpolate(frame, [s, s + 14], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: ease.ut,
      });
    }
    const opacity = Math.min(1, p * 1.15) * (1 - q);
    const y = (1 - p) * storrelse * loft - q * storrelse * 0.12;
    const blur = (1 - p) * storrelse * 0.11 + q * storrelse * 0.06;

    const farget: React.CSSProperties =
      t.stil === "rod"
        ? {
            backgroundImage: rodGradient,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            // Gradienten klippes til glyfene; litt ekstra plass under så
            // nedstrekene (g, j) ikke kuttes av boksen.
            paddingBottom: "0.08em",
          }
        : t.stil === "gra"
          ? { color: farge.gra }
          : { color: tekstFarge };

    return (
      <span
        key={i}
        style={{
          display: "inline-block",
          whiteSpace: "pre",
          opacity,
          transform: `translate3d(0, ${y}px, 0)`,
          filter: blur > 0.05 ? `blur(${blur}px)` : undefined,
          ...farget,
        }}
      >
        {t.ord}
      </span>
    );
  };

  return (
    <div
      style={{
        fontFamily: inter,
        fontSize: storrelse,
        fontWeight: vekt,
        letterSpacing: sperring,
        lineHeight: linjehoyde,
        textAlign: justering,
        fontFeatureSettings: "'cv11', 'ss01'",
        ...stil,
      }}
    >
      {Array.from({ length: linjer }, (_, li) => {
        const iLinja = tokens.map((t, i) => ({ t, i })).filter(({ t }) => t.linje === li);
        return (
          // Linjene brytes bare der teksten sier det (\n), aldri av seg selv
          <div key={li} style={{ display: "block", whiteSpace: "nowrap" }}>
            {iLinja.map(({ t, i }, n) => (
              <React.Fragment key={i}>
                {renderOrd(t, i)}
                {/* Mellomrom som eget element, så det ikke forsvinner mellom inline-block-ordene */}
                {n < iLinja.length - 1 && <span style={{ display: "inline-block", width: "0.26em" }} />}
              </React.Fragment>
            ))}
          </div>
        );
      })}
    </div>
  );
};

/** Den lille røde etiketten over en overskrift: «Tilbud», «Signering» … */
export const Etikett: React.FC<{
  tekst: string;
  inn: number;
  ut?: number;
  storrelse: number;
  justering?: "left" | "center" | "right";
}> = ({ tekst, inn, ut, storrelse, justering = "left" }) => (
  <Tittel
    tekst={`*${tekst}*`}
    inn={inn}
    ut={ut}
    storrelse={storrelse}
    vekt={600}
    sperring="-0.01em"
    justering={justering}
    modus="samlet"
    varighet={20}
    loft={0.5}
  />
);
