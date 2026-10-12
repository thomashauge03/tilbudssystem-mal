/**
 * Tenanter der prosjektlista eies av SmartDok. Adminbordet synker lista inn i
 * public.projects hvert kvarter, så prosjekter som lages eller endres her ville
 * enten blitt overskrevet eller blitt stående som egne prosjekter ved siden av.
 *
 * Tenanten kjennes igjen på id og ikke på slug: useAuth kjenner bare tenant_id,
 * og en slug ville krevd en ekstra spørring mot tenants ved hver innlogging. Feilet
 * den spørringen, ville låsen stille gått opp. Id-en endres heller aldri, mens
 * slug er et navn som kan skiftes. Techauge og TT Anlegg har ingen synk og skal
 * fortsatt lage prosjektene sine selv, derfor en liste og ikke et flagg for alle.
 */
const SMARTDOK_TENANTER = new Set<string>([
  "95ee2a3d-6bd3-4a94-ab44-c000c49beae5", // Hauge Maskin
]);

export function prosjekterFraSmartDok(tenantId: string | null): boolean {
  return !!tenantId && SMARTDOK_TENANTER.has(tenantId);
}

export interface Prosjektvalg {
  id: string;
  name: string;
  project_number: string | null;
  customer_id: string | null;
  customer_name: string | null;
  status: string;
}

/**
 * Nyeste prosjektnummer først. SmartDok-numrene stiger over tid, så de ferske
 * prosjektene, som det oftest skrives tilbud på, havner øverst. numeric gjør at
 * «999» ikke sorteres over «1000». Prosjekter uten nummer kommer sist, etter navn.
 */
export function sorterProsjekter<T extends { name: string; project_number: string | null }>(
  liste: T[],
): T[] {
  return [...liste].sort((a, b) => {
    const na = (a.project_number ?? "").trim();
    const nb = (b.project_number ?? "").trim();
    if (na && nb) {
      const s = nb.localeCompare(na, "nb", { numeric: true });
      if (s !== 0) return s;
    } else if (na || nb) {
      return na ? -1 : 1;
    }
    return a.name.localeCompare(b.name, "nb");
  });
}
