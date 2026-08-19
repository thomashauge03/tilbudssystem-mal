// Tar imot SMS videresendt fra mobilen og legger dem i innboksen.
//
// Funksjonen tolker IKKE meldingen. Den lagrer rå tekst, og appen tolker den
// når du godkjenner den — med den samme tolkeren som brukes ved innliming.
// Dermed finnes tolkelogikken bare ett sted.
//
// Rulles ut med:
//   supabase functions deploy sms-inn --no-verify-jwt
//
// --no-verify-jwt er nødvendig fordi telefonen ikke har en Supabase-innlogging.
// Tilgangen styres i stedet av nøkkelen under, som er unik per firma.
//
// Appen på telefonen skal sende:
//   POST https://<prosjekt>.supabase.co/functions/v1/sms-inn
//   x-sms-token: <nøkkelen fra Innstillinger>
//   { "text": "<hele meldingen>", "from": "<avsender>" }
//
// Tekst/plain i kroppen godtas også, for apper som ikke kan sende JSON.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-sms-token, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function svar(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return svar(405, { error: "Bruk POST" });

  // Nøkkelen kan komme som header eller som ?token=, siden noen
  // videresendings-apper ikke lar deg sette egne headere.
  const url = new URL(req.url);
  const token = req.headers.get("x-sms-token") ?? url.searchParams.get("token") ?? "";
  if (!token) return svar(401, { error: "Mangler nøkkel" });

  let text = "";
  let sender: string | null = null;
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const j = await req.json().catch(() => ({}));
    text = String(j.text ?? j.body ?? j.message ?? "");
    sender = j.from ?? j.sender ?? null;
  } else {
    text = await req.text();
  }
  if (!text.trim()) return svar(400, { error: "Tom melding" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: innst, error: oppslag } = await supabase
    .from("app_settings")
    .select("tenant_id")
    .eq("sms_token", token)
    .maybeSingle();

  // Samme svar på ukjent og feil nøkkel, så en utenforstående ikke kan bruke
  // endepunktet til å finne ut hvilke nøkler som finnes.
  if (oppslag || !innst?.tenant_id) return svar(401, { error: "Ugyldig nøkkel" });

  const { error } = await supabase.from("sms_inbox").insert({
    tenant_id: innst.tenant_id,
    body: text.trim(),
    sender,
  });
  if (error) return svar(500, { error: error.message });

  return svar(200, { ok: true });
});
