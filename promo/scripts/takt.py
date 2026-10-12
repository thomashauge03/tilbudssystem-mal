"""Finner tempo, slag og taktstreker i musikken, så klippene kan treffe dem.

Kjøres med et Python-miljø som har librosa:
    python scripts/takt.py public/musikk/showreel.mp3

Skriver en oppsummering til skjermen og slagene til src/musikk/takt.json.
"""

import json
import sys
from pathlib import Path

import librosa
import numpy as np

fil = sys.argv[1] if len(sys.argv) > 1 else "public/musikk/showreel.mp3"
y, sr = librosa.load(fil, sr=22050, mono=True)
varighet = len(y) / sr

onset = librosa.onset.onset_strength(y=y, sr=sr, aggregate=np.median)
kandidater = librosa.feature.tempo(onset_envelope=onset, sr=sr, aggregate=None)
tempo_global = float(librosa.feature.tempo(onset_envelope=onset, sr=sr)[0])

tempo, slag = librosa.beat.beat_track(onset_envelope=onset, sr=sr, units="time", tightness=400)
tempo = float(np.atleast_1d(tempo)[0])
intervall = np.diff(slag)

print(f"varighet {varighet:.3f} s")
print(f"tempo (global) {tempo_global:.2f} BPM, beat_track {tempo:.2f} BPM")
print(f"median tempo over tid {np.median(kandidater):.2f}, spredning {np.percentile(kandidater, 10):.1f}-{np.percentile(kandidater, 90):.1f}")
print(f"slag: {len(slag)}, første {slag[:6].round(3).tolist()}")
print(f"intervall snitt {intervall.mean():.4f} s, std {intervall.std():.4f}, min {intervall.min():.3f}, maks {intervall.max():.3f}")

# Rett linje gjennom slagene: gir et fast tempo og fasen til første slag.
n = np.arange(len(slag))
a, b = np.polyfit(n, slag, 1)
rest = slag - (a * n + b)
print(f"lineær tilpasning: {60 / a:.3f} BPM, første slag {b:.3f} s, avvik maks {np.abs(rest).max() * 1000:.1f} ms")

# Energi per slag, for å se hvor seksjonene skifter.
rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=512)[0]
rms_tid = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=512)
hoy = librosa.feature.spectral_contrast(y=y, sr=sr, hop_length=512)[-1]  # øverste bånd ~ hi-hat
energi = []
for i in range(len(slag) - 1):
    m = (rms_tid >= slag[i]) & (rms_tid < slag[i + 1])
    energi.append((round(float(slag[i]), 3), round(float(rms[m].mean()) if m.any() else 0.0, 4)))
print("energi per slag (tid, rms):")
for t, e in energi:
    print(f"  {t:7.3f}  {'#' * int(e * 200)}")

ut = Path(__file__).resolve().parent.parent / "src" / "musikk" / "takt.json"
ut.parent.mkdir(parents=True, exist_ok=True)
ut.write_text(json.dumps({
    "fil": fil,
    "varighet": round(varighet, 3),
    "bpm": round(60 / a, 4),
    "forsteSlag": round(float(b), 4),
    "slag": [round(float(t), 4) for t in slag],
}, indent=2))
print(f"skrev {ut}")
