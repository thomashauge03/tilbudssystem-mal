"""Sporer Techauge-logoen (public/logo.png i appen) om til vektorer.

Filmen animerer merket og bokstavene hver for seg, og da må de være egne
former — ikke ett bilde. Skriptet deler logoen i rødt og hvitt, sporer hver
farge med potrace, og grupperer formene i biter av merket og bokstaver i
ordmerket. Resultatet skrives til src/merke/techauge-vektor.ts.

    python scripts/spor-logo.py ../public/logo.png
"""

import json
import sys
from pathlib import Path

import numpy as np
import potrace
from PIL import Image

kilde = sys.argv[1] if len(sys.argv) > 1 else "../public/logo.png"
bilde = np.asarray(Image.open(kilde).convert("RGB")).astype(int)
r, g, b = bilde[..., 0], bilde[..., 1], bilde[..., 2]

masker = {
    "rod": (r > 130) & (g < 110) & (b < 110) & (r - g > 80),
    "hvit": (r > 170) & (g > 170) & (b > 170),
}

farger = {}
for navn, m in masker.items():
    piks = bilde[m]
    farger[navn] = "#%02X%02X%02X" % tuple(int(v) for v in np.median(piks, axis=0))


def pkt(p):
    x = p.x if hasattr(p, "x") else p[0]
    y = p.y if hasattr(p, "y") else p[1]
    return float(x), float(y)


def spor(maske):
    # potracer fyller det som er usant i masken; med masken rett vei får man
    # i tillegg en ramme rundt hele bildet. Derfor invertert.
    bm = potrace.Bitmap(~maske)
    kurver = bm.trace(turdsize=12, alphamax=1.0, opticurve=True, opttolerance=0.2)
    ut = []
    for kurve in kurver:
        x0, y0 = pkt(kurve.start_point)
        d = [f"M{x0:.1f} {y0:.1f}"]
        xs, ys = [x0], [y0]
        for seg in kurve.segments:
            if seg.is_corner:
                cx, cy = pkt(seg.c)
                ex, ey = pkt(seg.end_point)
                d.append(f"L{cx:.1f} {cy:.1f}L{ex:.1f} {ey:.1f}")
                xs += [cx, ex]
                ys += [cy, ey]
            else:
                ax, ay = pkt(seg.c1)
                bx, by = pkt(seg.c2)
                ex, ey = pkt(seg.end_point)
                d.append(f"C{ax:.1f} {ay:.1f} {bx:.1f} {by:.1f} {ex:.1f} {ey:.1f}")
                xs += [ex]
                ys += [ey]
        d.append("Z")
        ut.append({"d": "".join(d), "boks": [min(xs), min(ys), max(xs), max(ys)]})
    return ut


def grupper(kurver):
    """Legger hull inn i formen de ligger i (samme sti, evenodd)."""
    kurver = sorted(kurver, key=lambda k: -(k["boks"][2] - k["boks"][0]) * (k["boks"][3] - k["boks"][1]))
    grupper = []
    for k in kurver:
        x0, y0, x1, y1 = k["boks"]
        forelder = None
        for gr in grupper:
            gx0, gy0, gx1, gy1 = gr["boks"]
            if x0 >= gx0 - 1 and y0 >= gy0 - 1 and x1 <= gx1 + 1 and y1 <= gy1 + 1:
                forelder = gr
                break
        if forelder:
            forelder["d"] += k["d"]
        else:
            grupper.append({"d": k["d"], "boks": list(k["boks"])})
    return grupper


alle = {navn: grupper(spor(m)) for navn, m in masker.items()}

# Merket står over ordmerket; skillet går i luften mellom dem.
# Største tomrom i radene er luften mellom merket og ordmerket. (Det første
# tomrommet kan være løse støypiksler øverst i bildet.)
ys = np.where(masker["rod"] | masker["hvit"])[0]
rader = np.unique(ys)
hull = sorted(((b - a, a, b) for a, b in zip(rader[:-1], rader[1:]) if b - a > 20), reverse=True)
skille = (hull[0][1] + hull[0][2]) / 2 if hull else 860

merke, ordmerke = [], []
for navn, gr in alle.items():
    for g in gr:
        del_ = {"d": g["d"], "farge": navn, "boks": [round(v, 1) for v in g["boks"]]}
        (merke if g["boks"][3] < skille else ordmerke).append(del_)

ordmerke.sort(key=lambda d: d["boks"][0])
merke.sort(key=lambda d: (d["farge"], d["boks"][0]))


def ramme(deler):
    x0 = min(d["boks"][0] for d in deler)
    y0 = min(d["boks"][1] for d in deler)
    x1 = max(d["boks"][2] for d in deler)
    y1 = max(d["boks"][3] for d in deler)
    return [round(x0, 1), round(y0, 1), round(x1 - x0, 1), round(y1 - y0, 1)]


ut = Path(__file__).resolve().parent.parent / "src" / "merke" / "techauge-vektor.ts"
ut.parent.mkdir(parents=True, exist_ok=True)
innhold = (
    "// Generert av scripts/spor-logo.py fra public/logo.png i appen. Ikke rediger for hånd.\n"
    f"export const logoFarger = {json.dumps(farger)} as const;\n\n"
    "export type LogoDel = { d: string; farge: \"rod\" | \"hvit\"; boks: [number, number, number, number] };\n\n"
    f"/** viewBox for merket (x, y, bredde, høyde) */\nexport const merkeRamme = {json.dumps(ramme(merke))} as const;\n"
    f"export const merkeDeler: LogoDel[] = {json.dumps(merke, ensure_ascii=False)};\n\n"
    f"/** viewBox for ordmerket (x, y, bredde, høyde) */\nexport const ordRamme = {json.dumps(ramme(ordmerke))} as const;\n"
    f"/** Bokstavene i TECHAUGE, fra venstre */\nexport const ordDeler: LogoDel[] = {json.dumps(ordmerke, ensure_ascii=False)};\n"
)
ut.write_text(innhold, encoding="utf-8")
print("farger", farger)
print("skille", skille)
print("merke:", [(d["farge"], d["boks"]) for d in merke])
print("ordmerke:", [(d["farge"], d["boks"][0]) for d in ordmerke])
print("skrev", ut)
