# Promofilmen

Reklamefilmen for Techauge – Tilbud og prosjekt, laget med
[Remotion](https://www.remotion.dev/) (video skrevet i React). Skjermene i
filmen er ikke skjermopptak, men gjenskapt fra appens egen kode og farger, med
oppdiktede data. Derfor er alt skarpt i 4K, og ingen ekte kundedata er med.

## Versjoner

| Komposisjon     | Format      | Lengde  | Til                              |
| --------------- | ----------- | ------- | -------------------------------- |
| `Hovedfilm`     | 16:9, 4K    | ~87 sek | nettside, YouTube                |
| `Messe`         | 16:9        | ~87 sek | skjerm på messe (uten lyd, loop) |
| `Feed-16x9`     | 16:9        | ~33 sek | LinkedIn, Facebook               |
| `Feed-4x5`      | 1080 × 1350 | ~33 sek | LinkedIn, Facebook, Instagram    |
| `Staaende-9x16` | 1080 × 1920 | ~30 sek | Reels, TikTok, Shorts            |

## Komme i gang

Prosjektet har egne avhengigheter, adskilt fra appen (npm her, bun i appen):

```bash
cd promo
npm install
```

Musikken ligger ikke i git. Last ned sporet fra lenken i
[public/musikk/KILDE.md](public/musikk/KILDE.md) og legg det som
`public/musikk/showreel.mp3`.

## Se og rendre

```bash
npm run studio              # forhåndsvisning i nettleseren
node scripts/render.mjs     # alle versjonene til out/leveranse/
```

`render.mjs` normaliserer lyden til −14 LUFS, det YouTube og sosiale medier
spiller av på. Hovedfilmen i 4K tar rundt en time på en bærbar maskin.

## Slik henger det sammen

- **Takten styrer alt.** Sporet går på 100 BPM, som ved 30 bilder i sekundet er
  nøyaktig 72 bilder per takt. Scenene starter og slutter på takter
  ([src/tid.ts](src/tid.ts)), og musikken klippes bare på frasegrenser (hver
  fjerde takt). `scripts/takt.py` fant tempoet; kjør den på nytt om sporet
  byttes.
- **Én scene, flere formater.** Scenene i [src/scener/](src/scener/) spør hvilket
  format de står i ([src/format.ts](src/format.ts)) og legger seg etter det.
  Kortversjonene spiller de samme scenene raskere
  ([src/felles/Tempo.tsx](src/felles/Tempo.tsx)).
- **Versjonene er planer.** [src/versjoner/planer.ts](src/versjoner/planer.ts)
  sier hvilke scener som kommer når, og hvilke biter av sporet som ligger under.
- **Skjermene** i [src/ui/](src/ui/) er kopier av appens sider, med fargene fra
  `src/styles.css` i appen. Endres appen mye, bør de følge etter.
- **Logoen** er sporet fra `public/logo.png` til vektorer med
  `scripts/spor-logo.py`, så delene kan animeres hver for seg.
- **Lydeffektene** er laget fra bunnen av i `scripts/lydeffekter.mjs`, så det
  finnes ingen lisens å holde styr på for dem.

## Innholdet

Alt i filmen er oppdiktet: Fjordheim Maskin AS, konkurrentene i anbudsgrafen
og de andre firmanavnene er sjekket mot Brønnøysundregistrene og finnes ikke.
Kunden er Kari Nordmann. Påstandene i teksten er holdt til det appen faktisk
gjør. Den viser for eksempel hva som er fakturert og hva som gjenstår, men den
lager ikke selve fakturaen.

Nettadressen på sluttbildet (`techauge.no`) står i
[src/scener/LogoScene.tsx](src/scener/LogoScene.tsx).
