// Henter alle radene i en spørring, ikke bare de første 1000.
//
// Supabase gir aldri mer enn 1000 rader i ett svar, og sier ikke fra når det
// kutter. Det merkes ikke før et firma har mer enn 1000 av noe — Hauge Maskin
// fikk 1678 kunder da kunderegisteret ble hentet fra Tripletex, og kundelista
// og kundevelgeren viste bare de 1000 første.
//
// Spørringen må sorteres på noe unikt til slutt (for eksempel id), ellers kan
// en rad havne på to sider eller ingen.

const SIDE = 1000;

export async function alleRader<T>(
  side: (fra: number, til: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const ut: T[] = [];
  for (let fra = 0; ; fra += SIDE) {
    const { data, error } = await side(fra, fra + SIDE - 1);
    if (error) throw error;
    ut.push(...(data ?? []));
    if ((data ?? []).length < SIDE) return ut;
  }
}
