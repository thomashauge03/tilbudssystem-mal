export const nok = (n: number | null | undefined) =>
  new Intl.NumberFormat("nb-NO", { style: "currency", currency: "NOK", maximumFractionDigits: 2 }).format(Number(n ?? 0));

export const num = (n: number | null | undefined) =>
  new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(Number(n ?? 0));

export const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("nb-NO", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
};

export const toISODate = (d: Date) => d.toISOString().slice(0, 10);

export const addDays = (d: Date, days: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
};

export const UNITS = ["stk", "m", "m²", "m³", "tonn", "time", "LS", "RS"];
export const OUR_REFS = ["Tommy Hauge", "Karl Hauge"];
