// Lager lydeffektene til filmen fra bunnen av: støy, sinustoner, filtre og
// litt romklang. Da eier vi dem selv, og ingen lisens å tenke på.
//
//   node scripts/lydeffekter.mjs
//
// Skriver 48 kHz stereo WAV-filer til public/lyd/.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const SR = 48000;
const ut = path.resolve("public/lyd");
mkdirSync(ut, { recursive: true });

// ---------- byggeklosser ----------

const buffer = (sek) => ({ l: new Float32Array(Math.ceil(sek * SR)), r: new Float32Array(Math.ceil(sek * SR)) });

// Forutsigbar støy, så filene blir like hver gang
const stoykilde = (frø) => {
  let a = frø >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296 * 2 - 1;
  };
};

// Biquad (RBJ). Koeffisientene kan byttes underveis for sveipende filtre.
const biquad = () => {
  let b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return {
    sett(type, f, q) {
      const w = (2 * Math.PI * Math.min(f, SR * 0.45)) / SR;
      const cos = Math.cos(w);
      const alfa = Math.sin(w) / (2 * q);
      let n0, n1, n2;
      if (type === "lp") [n0, n1, n2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
      else if (type === "hp") [n0, n1, n2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
      else [n0, n1, n2] = [alfa, 0, -alfa]; // båndpass
      const a0 = 1 + alfa;
      b0 = n0 / a0; b1 = n1 / a0; b2 = n2 / a0; a1 = (-2 * cos) / a0; a2 = (1 - alfa) / a0;
    },
    kjør(x) {
      const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      return y;
    },
  };
};

// Schroeder-klang: fire kamfiltre parallelt og to allpass i serie, litt
// forskjellig i venstre og høyre så klangen får bredde.
const klang = (inn, { miks = 0.25, tilbake = 0.8, demp = 0.35 } = {}) => {
  const kanal = (sig, forskyv) => {
    const kammer = [1557, 1617, 1491, 1422].map((d) => ({ buf: new Float32Array(d + forskyv), i: 0, lp: 0 }));
    const allpass = [225, 556].map((d) => ({ buf: new Float32Array(d + forskyv), i: 0 }));
    const ut = new Float32Array(sig.length);
    for (let n = 0; n < sig.length; n++) {
      let s = 0;
      for (const k of kammer) {
        const y = k.buf[k.i];
        k.lp = y * (1 - demp) + k.lp * demp;
        k.buf[k.i] = sig[n] + k.lp * tilbake;
        k.i = (k.i + 1) % k.buf.length;
        s += y;
      }
      s *= 0.25;
      for (const a of allpass) {
        const y = a.buf[a.i];
        a.buf[a.i] = s + y * 0.5;
        a.i = (a.i + 1) % a.buf.length;
        s = y - s * 0.5;
      }
      ut[n] = sig[n] * (1 - miks) + s * miks * 1.6;
    }
    return ut;
  };
  return { l: kanal(inn.l, 0), r: kanal(inn.r, 23) };
};

const normaliser = (b, topp = 0.89) => {
  let m = 0;
  for (let i = 0; i < b.l.length; i++) m = Math.max(m, Math.abs(b.l[i]), Math.abs(b.r[i]));
  const g = m > 0 ? topp / m : 1;
  for (let i = 0; i < b.l.length; i++) { b.l[i] *= g; b.r[i] *= g; }
  return b;
};

// Myk inn- og uttoning i endene, så ingen fil starter eller slutter med et klikk
const kanter = (b, inn = 0.002, ut = 0.01) => {
  const ni = Math.floor(inn * SR), nu = Math.floor(ut * SR), n = b.l.length;
  for (let i = 0; i < ni; i++) { const g = i / ni; b.l[i] *= g; b.r[i] *= g; }
  for (let i = 0; i < nu; i++) { const g = i / nu; b.l[n - 1 - i] *= g; b.r[n - 1 - i] *= g; }
  return b;
};

const reverser = (b) => ({ l: b.l.slice().reverse(), r: b.r.slice().reverse() });

const skrivWav = (navn, b) => {
  const n = b.l.length;
  const data = Buffer.alloc(44 + n * 4);
  data.write("RIFF", 0); data.writeUInt32LE(36 + n * 4, 4); data.write("WAVE", 8);
  data.write("fmt ", 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22);
  data.writeUInt32LE(SR, 24); data.writeUInt32LE(SR * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34);
  data.write("data", 36); data.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, b.l[i])) * 32767), 44 + i * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, b.r[i])) * 32767), 46 + i * 4);
  }
  writeFileSync(path.join(ut, `${navn}.wav`), data);
  console.log(`${navn}.wav  ${(n / SR).toFixed(2)} s`);
};

// Tone med overtoner og eksponentiell utdøing
const tone = (b, start, f, { amp = 0.5, tau = 0.4, harm = [[1, 1]], angrep = 0.003, pan = 0 } = {}) => {
  const s0 = Math.floor(start * SR);
  for (let i = 0; s0 + i < b.l.length; i++) {
    const t = i / SR;
    const env = Math.min(1, t / angrep) * Math.exp(-t / tau);
    if (env < 1e-5 && t > angrep) break;
    let v = 0;
    for (const [forhold, a] of harm) v += Math.sin(2 * Math.PI * f * forhold * t) * a * Math.exp((-t * (forhold - 1)) / (tau * 3 + 1e-9));
    b.l[s0 + i] += v * env * amp * (1 - pan) ;
    b.r[s0 + i] += v * env * amp * (1 + pan);
  }
};

// ---------- effektene ----------

// Sveip: båndpasset støy som stiger og faller, og vandrer fra venstre mot høyre
const sveip = (navn, lengde, fra, til, frø) => {
  const b = buffer(lengde);
  const s = stoykilde(frø);
  const fl = biquad(), fr = biquad();
  const topp = 0.42;
  for (let i = 0; i < b.l.length; i++) {
    const t = i / b.l.length;
    const f = fra * Math.pow(til / fra, t);
    if (i % 32 === 0) { fl.sett("bp", f, 0.9); fr.sett("bp", f * 1.04, 0.9); }
    const env = t < topp ? Math.pow(t / topp, 2.2) : Math.exp(-(t - topp) * 6);
    const vinkel = (0.15 + 0.7 * t) * Math.PI / 2;
    b.l[i] = fl.kjør(s()) * env * Math.cos(vinkel);
    b.r[i] = fr.kjør(s()) * env * Math.sin(vinkel);
  }
  skrivWav(navn, kanter(normaliser(klang(b, { miks: 0.22 }), 0.8)));
};
sveip("sveip", 0.9, 350, 4200, 11);
sveip("sveip-kort", 0.45, 600, 5200, 12);

// Klikk: et kort, tørt knepp — som en god knapp
{
  const b = buffer(0.12);
  const s = stoykilde(3);
  const f = biquad(); f.sett("hp", 2500, 0.7);
  for (let i = 0; i < b.l.length; i++) {
    const t = i / SR;
    const v = Math.sin(2 * Math.PI * 2100 * t) * Math.exp(-t / 0.006) * 0.6 + f.kjør(s()) * Math.exp(-t / 0.0025) * 0.8;
    b.l[i] = v; b.r[i] = v;
  }
  skrivWav("klikk", kanter(normaliser(klang(b, { miks: 0.12, tilbake: 0.6 }), 0.8), 0.0005, 0.02));
}

// Tastetrykk: tre varianter så skrivingen ikke blir en maskingevær-lyd
[3300, 2900, 3600].forEach((hz, n) => {
  const b = buffer(0.07);
  const s = stoykilde(20 + n);
  const f = biquad(); f.sett("bp", hz, 1.2);
  for (let i = 0; i < b.l.length; i++) {
    const t = i / SR;
    const v = f.kjør(s()) * Math.exp(-t / 0.004) + Math.sin(2 * Math.PI * hz * 0.5 * t) * Math.exp(-t / 0.003) * 0.3;
    b.l[i] = v * (1 - n * 0.1); b.r[i] = v * (0.9 + n * 0.1);
  }
  skrivWav(`tast${n + 1}`, kanter(normaliser(b, 0.7), 0.0005, 0.01));
});

// Pling: to toner (E6 og H6) med overtoner og klang — suksess, uten å rope
{
  const b = buffer(2.4);
  const harm = [[1, 1], [2, 0.22], [3, 0.06]];
  tone(b, 0.0, 1318.5, { amp: 0.5, tau: 0.55, harm, pan: -0.15 });
  tone(b, 0.085, 1975.5, { amp: 0.42, tau: 0.6, harm, pan: 0.15 });
  skrivWav("pling", kanter(normaliser(klang(b, { miks: 0.34, tilbake: 0.82 }), 0.85)));
}

// Varsel: to myke marimbatoner
{
  const b = buffer(1.6);
  const harm = [[1, 1], [3.93, 0.3]];
  tone(b, 0.0, 880, { amp: 0.5, tau: 0.28, harm, pan: -0.1 });
  tone(b, 0.12, 1318.5, { amp: 0.45, tau: 0.32, harm, pan: 0.1 });
  skrivWav("varsel", kanter(normaliser(klang(b, { miks: 0.25 }), 0.85)));
}

// Dunk: dypt smell med tonefall og lang klang — logoen på droppet
{
  const b = buffer(3.2);
  const s = stoykilde(7);
  const lp = biquad(); lp.sett("lp", 1400, 0.7);
  let fase = 0;
  for (let i = 0; i < b.l.length; i++) {
    const t = i / SR;
    const f = 42 + 58 * Math.exp(-t / 0.09);
    fase += (2 * Math.PI * f) / SR;
    const kropp = Math.sin(fase) * Math.exp(-t / 0.55) * Math.min(1, t / 0.002);
    const slag = lp.kjør(s()) * Math.exp(-t / 0.018) * 0.9;
    const v = kropp * 0.95 + slag;
    b.l[i] = v; b.r[i] = v;
  }
  skrivWav("dunk", kanter(normaliser(klang(b, { miks: 0.3, tilbake: 0.86, demp: 0.5 }), 0.9)));
}

// Sug: en kort, lys støyeksplosjon med lang klang, spilt baklengs — alt suges inn
{
  const b = buffer(1.5);
  const s = stoykilde(9);
  const bp = biquad(); bp.sett("bp", 3200, 0.6);
  for (let i = 0; i < 0.2 * SR; i++) {
    const t = i / SR;
    const v = bp.kjør(s()) * Math.exp(-t / 0.05);
    b.l[i] = v; b.r[i] = v * 0.9;
  }
  const k = klang(b, { miks: 0.85, tilbake: 0.9, demp: 0.25 });
  skrivWav("sug", kanter(normaliser(reverser(k), 0.8), 0.05, 0.004));
}

// Fjell: tungt dunk med knas i — stein mot grabb
{
  const b = buffer(1.6);
  const s = stoykilde(13);
  const lp = biquad(); lp.sett("lp", 700, 0.8);
  let fase = 0;
  for (let i = 0; i < b.l.length; i++) {
    const t = i / SR;
    const f = 44 + 30 * Math.exp(-t / 0.06);
    fase += (2 * Math.PI * f) / SR;
    const kropp = Math.sin(fase) * Math.exp(-t / 0.28) * Math.min(1, t / 0.003);
    const knas = lp.kjør(s()) * Math.exp(-t / 0.09) * (0.6 + 0.4 * Math.sin(t * 190));
    const v = kropp + knas * 0.8;
    b.l[i] = v; b.r[i] = v * 0.95;
  }
  skrivWav("fjell", kanter(normaliser(klang(b, { miks: 0.2, tilbake: 0.78 }), 0.9)));
}

// Lås: to mekaniske knepp
{
  const b = buffer(0.35);
  const s = stoykilde(17);
  const bp = biquad(); bp.sett("bp", 1900, 2);
  [0, 0.065].forEach((start, n) => {
    const s0 = Math.floor(start * SR);
    for (let i = 0; i < 0.05 * SR; i++) {
      const t = i / SR;
      const v = bp.kjør(s()) * Math.exp(-t / 0.005) * 1.2 + Math.sin(2 * Math.PI * (1100 - n * 250) * t) * Math.exp(-t / 0.008) * 0.5;
      b.l[s0 + i] += v; b.r[s0 + i] += v;
    }
  });
  skrivWav("laas", kanter(normaliser(klang(b, { miks: 0.12 }), 0.8), 0.0005, 0.02));
}

// Skribling: finger mot glass — dempet båndpasset støy som følger en ujevn hånd
{
  const b = buffer(1.5);
  const s = stoykilde(19);
  const r = stoykilde(29);
  const bp = biquad(); bp.sett("bp", 1400, 1.3);
  let fart = 0;
  for (let i = 0; i < b.l.length; i++) {
    if (i % 480 === 0) fart = 0.35 + Math.abs(r()) * 0.65;
    const t = i / b.l.length;
    const env = Math.min(1, t * 12) * Math.min(1, (1 - t) * 8);
    const v = bp.kjør(s()) * fart * env;
    b.l[i] = v; b.r[i] = v;
  }
  skrivWav("skrible", kanter(normaliser(b, 0.6), 0.02, 0.05));
}

// Glimt: lys klynge som stiger inn — sluttlogoen
{
  const b = buffer(2.6);
  [[2637, -0.2], [3136, 0.1], [3951, 0.25], [5274, -0.05]].forEach(([f, pan], n) => {
    const s0 = Math.floor(n * 0.05 * SR);
    for (let i = 0; s0 + i < b.l.length; i++) {
      const t = i / SR;
      const env = Math.min(1, t / 0.25) * Math.exp(-t / 0.7) * (1 + 0.15 * Math.sin(2 * Math.PI * 6 * t));
      const v = Math.sin(2 * Math.PI * f * t) * env * (0.3 - n * 0.05);
      b.l[s0 + i] += v * (1 - pan); b.r[s0 + i] += v * (1 + pan);
    }
  });
  skrivWav("glimt", kanter(normaliser(klang(b, { miks: 0.45, tilbake: 0.86 }), 0.7), 0.01, 0.2));
}
