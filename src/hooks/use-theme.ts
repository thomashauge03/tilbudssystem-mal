import { useSyncExternalStore } from "react";
import { Moon, Monitor, Sun } from "lucide-react";
import { THEME_STORAGE_KEY } from "@/lib/format";

export type Theme = "light" | "dark" | "system";

export const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Lys modus", icon: Sun },
  { value: "dark", label: "Mørk modus", icon: Moon },
  { value: "system", label: "Systemstandard", icon: Monitor },
];

// Temaet bor utenfor React fordi flere komponenter (toppmenyen og
// Innstillinger) viser samme valg. Da de hadde hver sin useState, ble den ene
// stående på gammel verdi når du byttet tema i den andre.
const listeners = new Set<() => void>();

function readStored(): Theme {
  if (typeof window === "undefined") return "light";
  const v = localStorage.getItem(THEME_STORAGE_KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "light";
}

let current: Theme = readStored();

function applyToDocument(t: Theme) {
  if (typeof window === "undefined") return;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", t === "dark" || (t === "system" && prefersDark));
}

// Gjelder allerede ved modullasting, så temaet ikke blinker inn etter montering.
applyToDocument(current);

if (typeof window !== "undefined") {
  // "Systemstandard" må følge med når operativsystemet bytter modus underveis.
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (current === "system") applyToDocument(current);
  });
}

export function setTheme(t: Theme) {
  if (t === current) return;
  current = t;
  if (typeof window !== "undefined") localStorage.setItem(THEME_STORAGE_KEY, t);
  applyToDocument(t);
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): Theme {
  return current;
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => "light" as Theme);
  return { theme, setTheme };
}
