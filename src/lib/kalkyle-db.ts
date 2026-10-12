import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// De genererte typene i integrations/supabase/types.ts er utdaterte og kjenner
// ikke kalkyletabellene. Dette er samme klient, bare uten typesjekk på
// tabellnavn, slik at den nye koden slipper `as never` på hvert kall.
export const db = supabase as unknown as SupabaseClient;
