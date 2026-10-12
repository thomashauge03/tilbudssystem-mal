import React from "react";
import { logoFarger, merkeDeler, merkeRamme, ordDeler, ordRamme } from "./techauge-vektor";

/**
 * Techauge-logoen som vektor, med hver del for seg. Animasjonen styres
 * utenfra: for hver del (merket) og hver bokstav (ordmerket) sender man inn
 * hvor langt den har kommet, 0 til 1. Standard er ferdig tegnet logo.
 */
export type DelTilstand = {
  /** 0 = borte, 1 = på plass */
  p: number;
  /** Forskyvning i logoens eget koordinatsystem før den er på plass */
  dx?: number;
  dy?: number;
  rot?: number;
  skala?: number;
  blur?: number;
};

const transformFor = (t: DelTilstand, cx: number, cy: number) => {
  const q = 1 - t.p;
  const dx = (t.dx ?? 0) * q;
  const dy = (t.dy ?? 0) * q;
  const rot = (t.rot ?? 0) * q;
  const s = 1 + ((t.skala ?? 1) - 1) * q;
  return `translate(${dx} ${dy}) rotate(${rot} ${cx} ${cy}) translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy})`;
};

const fyll = (f: "rod" | "hvit") => (f === "rod" ? logoFarger.rod : logoFarger.hvit);

export const TechaugeMerke: React.FC<{
  storrelse: number;
  deler?: DelTilstand[];
  stil?: React.CSSProperties;
}> = ({ storrelse, deler, stil }) => {
  const [x, y, w, h] = merkeRamme;
  const luft = w * 0.12;
  return (
    <svg
      viewBox={`${x - luft} ${y - luft} ${w + 2 * luft} ${h + 2 * luft}`}
      width={storrelse * (1 + 0.24)}
      height={(storrelse * (h + 2 * luft)) / w}
      style={{ overflow: "visible", ...stil }}
    >
      <defs>
        {merkeDeler.map((_, i) => (
          <filter key={i} id={`merke-blur-${i}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={deler?.[i]?.blur ?? 0} />
          </filter>
        ))}
      </defs>
      {merkeDeler.map((del, i) => {
        const t = deler?.[i] ?? { p: 1 };
        const [bx0, by0, bx1, by1] = del.boks;
        return (
          <path
            key={i}
            d={del.d}
            fill={fyll(del.farge)}
            fillRule="evenodd"
            opacity={Math.min(1, t.p * 1.4)}
            transform={transformFor(t, (bx0 + bx1) / 2, (by0 + by1) / 2)}
            filter={t.blur ? `url(#merke-blur-${i})` : undefined}
          />
        );
      })}
    </svg>
  );
};

export const TechaugeOrd: React.FC<{
  hoyde: number;
  bokstaver?: DelTilstand[];
  stil?: React.CSSProperties;
}> = ({ hoyde, bokstaver, stil }) => {
  const [x, y, w, h] = ordRamme;
  const luft = h * 0.4;
  return (
    <svg
      viewBox={`${x - luft} ${y - luft} ${w + 2 * luft} ${h + 2 * luft}`}
      height={hoyde * ((h + 2 * luft) / h)}
      width={(hoyde * (w + 2 * luft)) / h}
      style={{ overflow: "visible", ...stil }}
    >
      {ordDeler.map((del, i) => {
        const t = bokstaver?.[i] ?? { p: 1 };
        const [bx0, by0, bx1, by1] = del.boks;
        return (
          <path
            key={i}
            d={del.d}
            fill={fyll(del.farge)}
            fillRule="evenodd"
            opacity={Math.min(1, t.p * 1.25)}
            transform={transformFor(t, (bx0 + bx1) / 2, (by0 + by1) / 2)}
          />
        );
      })}
    </svg>
  );
};
