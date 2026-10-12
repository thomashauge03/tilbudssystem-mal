// Tester for dyplenkene fra Innboks. Kjøres av `npm test`.
//
// To ting skal holde: /anbud?sms=<id> leter bare etter en ekte uuid, og
// innloggingen sender deg bare videre til en sti på dette nettstedet.

import { smsParam, tryggNeste } from "./dyplenke.ts";

let feil = 0;
let ok = 0;
function sjekk(navn: string, faktisk: unknown, forventet: unknown) {
  const a = JSON.stringify(faktisk);
  const b = JSON.stringify(forventet);
  if (a === b) ok++;
  else {
    feil++;
    console.log(`  FEIL  ${navn}\n        fikk:      ${a}\n        forventet: ${b}`);
  }
}

const id = "3f2a9c1e-8b7d-4e6f-a5b4-c3d2e1f0a9b8";

console.log("\n--- sms-parameteren ---");
sjekk("gyldig uuid", smsParam(id), id);
sjekk("store bokstaver blir små", smsParam(id.toUpperCase()), id);
sjekk("mellomrom rundt", smsParam(` ${id} `), id);
sjekk("mangler", smsParam(undefined), undefined);
sjekk("tom", smsParam(""), undefined);
sjekk("tall", smsParam(1172), undefined);
sjekk("tall som tekst", smsParam("1172"), undefined);
sjekk("avkuttet", smsParam(id.slice(0, 30)), undefined);
sjekk("html", smsParam(`<img src=x onerror=alert(1)>`), undefined);
sjekk("uuid med hale", smsParam(`${id}x`), undefined);
sjekk("uuid med sql", smsParam(`${id}' or 1=1`), undefined);
sjekk("liste", smsParam([id]), undefined);

console.log("\n--- next etter innlogging ---");
sjekk("tilbud", tryggNeste("/tilbud/abc"), "/tilbud/abc");
sjekk("endringsmelding", tryggNeste("/endringsmeldinger/abc"), "/endringsmeldinger/abc");
sjekk("med query", tryggNeste(`/anbud?sms=${id}`), `/anbud?sms=${id}`);
sjekk("rot", tryggNeste("/"), "/");
sjekk("mangler", tryggNeste(undefined), undefined);
sjekk("ekstern", tryggNeste("https://vond.no/"), undefined);
sjekk("protokollrelativ", tryggNeste("//vond.no/"), undefined);
sjekk("omvendt skråstrek", tryggNeste("/\\vond.no/"), undefined);
sjekk("tab i midten", tryggNeste("/\t/vond.no/"), undefined);
sjekk("linjeskift", tryggNeste("/a\nb"), undefined);
sjekk("javascript", tryggNeste("javascript:alert(1)"), undefined);
sjekk("relativ uten skråstrek", tryggNeste("tilbud/abc"), undefined);
sjekk("tilbake til login", tryggNeste("/login?next=%2F"), undefined);
sjekk("login", tryggNeste("/login"), undefined);
sjekk("tall", tryggNeste(5), undefined);

console.log(`\n${ok} ok, ${feil} feil`);
if (feil) process.exit(1);
