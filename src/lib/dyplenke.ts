// Dyplenker fra Innboks: et klikk på en sak der skal åpne akkurat den saken
// her. Parameterne kommer fra adressefeltet og er dermed fritt redigerbare, så
// de valideres strengt før de brukes til noe som helst.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Id-en til en SMS i sms_inbox, eller undefined. Tabellen har uuid som
 * primærnøkkel, så alt annet er en lenke som er klippet i stykker eller
 * skrevet for hånd, og da er det tryggest å la være å lete.
 */
export function smsParam(verdi: unknown): string | undefined {
  if (typeof verdi !== "string") return undefined;
  const v = verdi.trim();
  return UUID.test(v) ? v.toLowerCase() : undefined;
}

/**
 * Hvor innloggingen skal sende deg videre, eller undefined.
 *
 * Bare stier på dette nettstedet slipper gjennom. «//vond.no» og «/\vond.no»
 * ser ut som stier, men nettleseren tolker dem som en annen vert, og da ville
 * innloggingssiden blitt en åpen videresending. Kontrolltegn stoppes også,
 * fordi nettlesere stryker tab og linjeskift i URL-er og dermed kan gjøre
 * «/\t/vond.no» om til «//vond.no».
 */
export function tryggNeste(verdi: unknown): string | undefined {
  if (typeof verdi !== "string") return undefined;
  if (!verdi.startsWith("/")) return undefined;
  if (verdi.startsWith("//") || verdi.startsWith("/\\")) return undefined;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(verdi)) return undefined;
  // Tilbake til innloggingen er en løkke, ikke et mål.
  if (verdi === "/login" || verdi.startsWith("/login?") || verdi.startsWith("/login/")) return undefined;
  if (verdi.length > 2000) return undefined;
  // Siste vakt: la URL-tolkeren selv avgjøre om stien blir på samme vert.
  const base = "https://denne-verten.invalid";
  try {
    if (new URL(verdi, base).origin !== base) return undefined;
  } catch {
    return undefined;
  }
  return verdi;
}
