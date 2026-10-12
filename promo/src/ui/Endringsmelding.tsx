import React from "react";
import { endring, endringSum, kunde, linjeSum, nok, tilbud } from "../data";
import { app } from "../tema";
import { Etikett, Felt, Ikon, Knapp, Kort, Merke, Seksjon } from "./deler";

const num = (n: number) => new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(n);

/**
 * Krav om endring (src/components/amendment-form.tsx). Før kunden har svart
 * heter det «krav om endring»; når kunden har signert, blir det en
 * endringsmelding, og linjene låses.
 *
 * `linjer` er hvor mange linjer som er lagt inn (brøk = på vei inn),
 * `sendt` og `signert` går fra 0 til 1.
 */
export const Endringsmelding: React.FC<{
  linjer?: number;
  sendt?: number;
  signert?: number;
  sendTrykk?: number;
}> = ({ linjer = endring.linjer.length, sendt = 0, signert = 0, sendTrykk = 0 }) => {
  const erSignert = signert >= 0.5;
  const hele = Math.floor(linjer);
  const delvis = linjer - hele;
  const synlige = endring.linjer.slice(0, Math.min(endring.linjer.length, hele + (delvis > 0 ? 1 : 0)));
  const sum = synlige.slice(0, hele).reduce((s, l) => s + linjeSum(l), 0);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Knapp variant="spokelse" ikon="pilVenstre" liten>
            Tilbake
          </Knapp>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }}>
            {erSignert ? "Endringsmelding" : "Krav om endring"} #{endring.nummer}
          </div>
          {erSignert ? (
            <Merke tone="gronn" stil={{ transform: `scale(${1 + Math.sin(Math.min(1, (signert - 0.5) * 2) * Math.PI) * 0.15})` }}>
              Signert
            </Merke>
          ) : sendt >= 0.5 ? (
            <Merke tone="gul">Sendt</Merke>
          ) : (
            <Merke tone="gra">Utkast</Merke>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Knapp ikon="filNed">Lagre og last ned PDF</Knapp>
          <Knapp variant="primar" ikon="send" trykket={sendTrykk}>
            Send på e-post
          </Knapp>
        </div>
      </div>

      {sendt > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            borderRadius: 12,
            border: `1px solid ${erSignert ? "rgba(5,150,105,0.4)" : "rgba(5,150,105,0.4)"}`,
            background: "rgba(5,150,105,0.1)",
            padding: "12px 16px",
            fontSize: 14,
            marginBottom: 18,
            opacity: Math.min(1, sendt * 2),
          }}
        >
          <span style={{ color: "#059669", display: "flex" }}>
            <Ikon navn={erSignert ? "penn" : "epostSjekk"} storrelse={16} />
          </span>
          {erSignert ? (
            <span>
              <b style={{ color: "#047857" }}>Signert av {kunde.navn}</b>
              <span style={{ color: app.dempetTekst }}> {endring.dato} kl. 09:31 · linjene er låst</span>
            </span>
          ) : (
            <span>
              <b style={{ color: "#047857" }}>Sendt til kunden</b>
              <span style={{ color: app.dempetTekst }}> {endring.dato} kl. 09:14 · venter på signatur</span>
            </span>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 24 }}>
        <Kort>
          <Seksjon stil={{ marginBottom: 16 }}>Endringsinfo</Seksjon>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <Etikett>Knytt til tilbud</Etikett>
              <Felt verdi={`#${tilbud.nummer} – ${tilbud.tittel} (${kunde.navn})`} />
            </div>
            <div>
              <Etikett>Prosjektreferanse *</Etikett>
              <Felt verdi={tilbud.prosjekt} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <Etikett>Dato varslet</Etikett>
                <Felt verdi={endring.dato} />
              </div>
              <div>
                <Etikett>Prosjektleder</Etikett>
                <Felt verdi="Erik Fjordheim" />
              </div>
            </div>
          </div>
        </Kort>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Kort stil={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <Etikett>Beskrivelse av endring</Etikett>
              <div style={{ border: `1px solid ${app.input}`, borderRadius: 7, padding: "8px 12px", fontSize: 14, lineHeight: 1.5 }}>{endring.beskrivelse}</div>
            </div>
            <div>
              <Etikett>Årsak</Etikett>
              <div style={{ border: `1px solid ${app.input}`, borderRadius: 7, padding: "8px 12px", fontSize: 14, lineHeight: 1.5 }}>{endring.arsak}</div>
            </div>
          </Kort>
          <Kort>
            <div style={{ marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <Seksjon>Prisoverslag</Seksjon>
              {erSignert ? (
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: app.dempetTekst }}>
                  <Ikon navn="laas" storrelse={13} />
                  Låst — linjene kan ikke endres etter at kunden har signert
                </span>
              ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <Knapp liten ikon="overskrift">Ny overskrift</Knapp>
                  <Knapp liten ikon="pluss">Ny linje</Knapp>
                </div>
              )}
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${app.kant}`, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", color: app.dempetTekst }}>
                  <th style={{ padding: 8, textAlign: "left", fontWeight: 600 }}>Beskrivelse</th>
                  <th style={{ padding: 8, textAlign: "right", fontWeight: 600 }}>Antall</th>
                  <th style={{ padding: 8, textAlign: "left", fontWeight: 600 }}>Enhet</th>
                  <th style={{ padding: 8, textAlign: "right", fontWeight: 600 }}>Pris/enhet</th>
                  <th style={{ padding: 8, textAlign: "right", fontWeight: 600 }}>Sum</th>
                </tr>
              </thead>
              <tbody>
                {synlige.map((l, i) => {
                  if (!("tekst" in l)) return null;
                  const inn = i === hele && delvis > 0 ? delvis : 1;
                  return (
                    <tr key={i} style={{ borderBottom: `1px solid ${app.kant}`, opacity: inn, transform: `translateY(${(1 - inn) * 10}px)` }}>
                      <td style={{ padding: 8 }}>
                        <Felt verdi={l.tekst} stil={{ background: erSignert ? app.dempet : "#fff" }} />
                      </td>
                      <td style={{ padding: 8, width: 80 }}>
                        <Felt verdi={num(l.antall)} hoyrejustert stil={{ background: erSignert ? app.dempet : "#fff" }} />
                      </td>
                      <td style={{ padding: 8, width: 90 }}>
                        <Felt verdi={l.enhet} stil={{ background: erSignert ? app.dempet : "#fff" }} />
                      </td>
                      <td style={{ padding: 8, width: 120 }}>
                        <Felt verdi={num(l.pris)} hoyrejustert stil={{ background: erSignert ? app.dempet : "#fff" }} />
                      </td>
                      <td style={{ padding: 8, width: 130, textAlign: "right", fontWeight: 500, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                        {nok(linjeSum(l))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ marginTop: 16, marginLeft: "auto", maxWidth: 384, borderTop: `1px solid ${app.kant}`, paddingTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 700 }}>
                <span>Total eks. mva</span>
                <span style={{ color: app.primar, fontVariantNumeric: "tabular-nums" }}>{nok(hele >= endring.linjer.length ? endringSum : sum)}</span>
              </div>
            </div>
          </Kort>
        </div>
      </div>
    </div>
  );
};
