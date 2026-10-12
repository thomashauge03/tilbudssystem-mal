import React from "react";
import { interpolate } from "remotion";
import { fremdrift, kunde, tilbud } from "../data";
import { app, ease, fagFarger } from "../tema";
import { Knapp, Kort, Sidetittel } from "./deler";

const DAGER = 5 * fremdrift.uker.length; // arbeidsdager i planen (man–fre)
const DAG_NAVN = ["M", "T", "O", "T", "F"];

/**
 * Fremdriftsplanen (src/components/fremdrift-rutenett.tsx): navn og ansvarlig
 * til venstre, ukene til høyre, og en farget strek per aktivitet med ukene
 * skrevet på selve streken.
 *
 * `tegnet` (0–1) tegner strekene ut fra venstre, én etter én.
 */
export const Fremdriftsplan: React.FC<{ tegnet?: number }> = ({ tegnet = 1 }) => {
  const venstre = 300;
  const n = fremdrift.aktiviteter.length;
  return (
    <div>
      <Sidetittel
        tittel="Fremdriftsplan"
        under={`#${tilbud.nummer} ${tilbud.tittel} · ${kunde.navn}`}
        hoyre={
          <div style={{ display: "flex", gap: 8 }}>
            <Knapp ikon="filNed">Last ned PDF</Knapp>
            <Knapp variant="primar" ikon="lagre">
              Lagre
            </Knapp>
          </div>
        }
      />
      <Kort padding={0} stil={{ overflow: "hidden" }}>
        {/* Aksen: måned over ukenummeret */}
        <div style={{ display: "flex", borderBottom: `1px solid ${app.kant}`, background: "oklch(0.95 0.01 80 / 0.4)" }}>
          <div
            style={{
              width: venstre,
              flexShrink: 0,
              padding: "10px 16px",
              fontSize: 12,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: app.dempetTekst,
              display: "flex",
              alignItems: "flex-end",
            }}
          >
            Aktivitet
          </div>
          {fremdrift.uker.map((u, i) => (
            <div key={u} style={{ flex: 1, borderLeft: `1px solid ${app.kant}`, padding: "8px 0 0" }}>
              <div style={{ textAlign: "center", fontSize: 11, color: app.dempetTekst }}>{fremdrift.maned[i]}</div>
              <div style={{ textAlign: "center", fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>Uke {u}</div>
              <div style={{ display: "flex", marginTop: 4 }}>
                {DAG_NAVN.map((d, j) => (
                  <div key={j} style={{ flex: 1, textAlign: "center", fontSize: 10, color: app.dempetTekst, padding: "2px 0 6px", borderLeft: j ? `1px solid oklch(0.90 0.015 80 / 0.4)` : undefined }}>
                    {d}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {fremdrift.aktiviteter.map((a, i) => {
          const f = fagFarger[a.farge as keyof typeof fagFarger];
          const start = i / n;
          const p = interpolate(tegnet, [start * 0.7, start * 0.7 + 0.3], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease.inn,
          });
          const fra = (a.fra / DAGER) * 100;
          const bredde = ((a.til - a.fra + 1) / DAGER) * 100;
          const uFra = fremdrift.uker[Math.floor(a.fra / 5)];
          const uTil = fremdrift.uker[Math.floor(a.til / 5)];
          const etikett = uFra === uTil ? `uke ${uFra}` : `uke ${uFra}–${uTil}`;
          return (
            <div key={a.navn} style={{ display: "flex", borderBottom: i < n - 1 ? `1px solid ${app.kant}` : undefined, height: 48 }}>
              <div style={{ width: venstre, flexShrink: 0, display: "flex", alignItems: "center", gap: 10, padding: "0 16px" }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: f.fyll, flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: "nowrap" }}>
                    {a.navn}
                    {"nyFraEndring" in a && a.nyFraEndring && (
                      <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: "#b91c1c", background: "#fee2e2", borderRadius: 999, padding: "1px 7px" }}>
                        endring
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: app.dempetTekst }}>{a.ansvarlig}</div>
                </div>
              </div>
              <div style={{ flex: 1, position: "relative", borderLeft: `1px solid ${app.kant}` }}>
                {/* Ukene og dagene i bakgrunnen */}
                <div style={{ position: "absolute", inset: 0, display: "flex" }}>
                  {Array.from({ length: DAGER }, (_, d) => (
                    <div key={d} style={{ flex: 1, borderLeft: d % 5 === 0 ? (d ? `1px solid ${app.kant}` : undefined) : `1px solid oklch(0.90 0.015 80 / 0.3)` }} />
                  ))}
                </div>
                {"milepael" in a && a.milepael ? (
                  <div
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: `${fra + bredde / 2}%`,
                      width: 16,
                      height: 16,
                      marginLeft: -8,
                      marginTop: -8,
                      transform: `rotate(45deg) scale(${p})`,
                      background: f.fyll,
                      border: `1px solid ${f.kant}`,
                      boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      position: "absolute",
                      top: "50%",
                      marginTop: -12,
                      height: 24,
                      left: `${fra}%`,
                      width: `${bredde * p}%`,
                      background: f.fyll,
                      border: `1px solid ${f.kant}`,
                      borderRadius: 3,
                      boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                      overflow: "hidden",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: "rgba(255,255,255,0.95)", whiteSpace: "nowrap", opacity: p > 0.8 ? (p - 0.8) * 5 : 0 }}>
                      {etikett}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </Kort>
    </div>
  );
};
