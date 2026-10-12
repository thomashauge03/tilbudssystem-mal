import { Easing } from "remotion";

/**
 * Filmens egne farger. Svart scene, hvit tekst, grått for det som står i
 * andre rekke, og rødt fra logoen der noe skal treffe.
 */
export const farge = {
  svart: "#000000",
  natt: "#070708",
  hvit: "#F5F5F7",
  gra: "#8E8E93",
  graMork: "#48484A",
  /** Målt fra logoen (scripts/spor-logo.py). */
  rod: "#E30213",
  rodLys: "#FF453A",
  gronn: "#30D158",
} as const;

/** Rødt som går mot oransje — brukes på ordene som skal sitte igjen. */
export const rodGradient = "linear-gradient(95deg, #FF6B3D 0%, #FF3B30 48%, #E30613 100%)";

/**
 * Appens eget lyse tema, hentet fra src/styles.css i hovedprosjektet. Skjermene
 * i filmen skal se ut som appen, ikke som en tolkning av den.
 */
export const app = {
  bakgrunn: "oklch(0.97 0.008 80)",
  tekst: "oklch(0.14 0.004 80)",
  kort: "#FFFFFF",
  primar: "oklch(0.49 0.22 27)",
  sekundar: "oklch(0.95 0.01 80)",
  sekundarTekst: "oklch(0.35 0.01 80)",
  dempet: "oklch(0.95 0.01 80)",
  dempetTekst: "oklch(0.55 0.012 80)",
  aksent: "oklch(0.99 0.005 80)",
  kant: "oklch(0.90 0.015 80)",
  input: "oklch(0.84 0.02 80)",
  suksess: "oklch(0.55 0.13 150)",
  gronn600: "#16a34a",
  gronn100: "#dcfce7",
  gronn700: "#15803d",
  gronn800: "#166534",
  gul100: "#fef9c3",
  gul800: "#854d0e",
  gul300: "#fde047",
  amber100: "#fef3c7",
  amber700: "#b45309",
  amber500: "#f59e0b",
  emerald100: "#d1fae5",
  emerald600: "#059669",
  emerald700: "#047857",
  rod100: "#fee2e2",
  rod600: "#dc2626",
  rod700: "#b91c1c",
  slate100: "#f1f5f9",
  slate300: "#cbd5e1",
  slate400: "#94a3b8",
  slate700: "#334155",
  gra50: "#f9fafb",
  gra100: "#f3f4f6",
  gra200: "#e5e7eb",
  gra300: "#d1d5db",
  gra400: "#9ca3af",
  gra500: "#6b7280",
  gra600: "#4b5563",
  gra700: "#374151",
  gra900: "#111827",
  bla100: "#dbeafe",
  bla700: "#1d4ed8",
  skygge: "0 1px 2px rgba(20,20,18,0.05), 0 1px 3px rgba(20,20,18,0.04)",
} as const;

/** Fargene i fremdriftsplanen, samme faste sett som i appen (src/lib/fremdrift.ts). */
export const fagFarger = {
  graa: { fyll: "#4B5563", kant: "#1F2937" },
  bla: { fyll: "#2563EB", kant: "#1E3A8A" },
  gronn: { fyll: "#16A34A", kant: "#14532D" },
  oransje: { fyll: "#EA580C", kant: "#7C2D12" },
  lilla: { fyll: "#7C3AED", kant: "#4C1D95" },
  turkis: { fyll: "#0891B2", kant: "#164E63" },
  rod: { fyll: "#DC2626", kant: "#7F1D1D" },
  gul: { fyll: "#CA8A04", kant: "#713F12" },
} as const;

/**
 * Bevegelseskurvene. Alt som kommer inn, lander mykt; alt som går ut,
 * akselererer bort; kameraet glir. Ingen sprett — det er ikke den typen film.
 */
export const ease = {
  /** Inn på scenen: rask start, lang og myk landing. */
  inn: Easing.bezier(0.16, 1, 0.3, 1),
  /** Ut av scenen: starter rolig og forsvinner fort. */
  ut: Easing.bezier(0.7, 0, 0.84, 0),
  /** Begge veier, for bevegelser som starter og stopper i ro. */
  myk: Easing.bezier(0.65, 0, 0.35, 1),
  /** Kameraet: roligere start enn myk, og lang utglidning. */
  kamera: Easing.bezier(0.45, 0, 0.12, 1),
  /** Rett og slett lineær, for tellere og tidslinjer. */
  lineaer: Easing.linear,
} as const;
