-- Slipp varselet forbi gatewayen.
--
-- Funksjoner som rulles ut fra dashboardet får alltid JWT-sjekk på seg:
-- verify_jwt = false i config.toml gjelder bare når supabase CLI gjør
-- utrullingen, og den brukes ikke her. Uten en Authorization-header svarte
-- gatewayen derfor UNAUTHORIZED_NO_AUTH_HEADER, og kallet nådde aldri fram til
-- funksjonen vår.
--
-- Løsningen er å sende den offentlige anon-nøkkelen som Authorization. Den
-- svekker ingenting: den ligger i nettleserbunten og er ment å være kjent, og
-- den slipper deg bare inn på gatewayen. Den virkelige adgangskontrollen er
-- fortsatt x-varsel-nokkel, som funksjonen måler mot VARSEL_NOKKEL — et kall
-- med gyldig anon-nøkkel, men feil hemmelighet, blir fortsatt avvist.

alter table public.varsel_oppsett
  add column if not exists anon_nokkel text not null default '';

comment on column public.varsel_oppsett.anon_nokkel is
  'Prosjektets offentlige anon-nøkkel. Sendes som Authorization for å komme forbi gatewayens JWT-sjekk; er ikke det som autoriserer kallet.';

create or replace function public.varsle_kundesvar()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_hendelse text;
  v_oppsett  public.varsel_oppsett;
  v_type     text;
begin
  -- Bare kundens egne svar. signature_method er alt satt av
  -- stemple_manuell_godkjenning, som er en before-trigger, så en
  -- papirgodkjenning vi registrerer selv siler seg ut her.
  if new.customer_signed_at is not null
     and old.customer_signed_at is distinct from new.customer_signed_at
     and coalesce(new.signature_method, 'digital') = 'digital' then
    v_hendelse := 'signert';
  elsif new.rejected_at is not null
     and old.rejected_at is distinct from new.rejected_at then
    v_hendelse := 'avslaatt';
  else
    return new;
  end if;

  select * into v_oppsett from public.varsel_oppsett where id limit 1;
  if not found or btrim(coalesce(v_oppsett.funksjon_url, '')) = '' then
    return new;
  end if;

  v_type := case tg_table_name when 'offers' then 'offer' else 'amendment' end;

  -- Bare type, id og hendelse. Funksjonen slår opp resten selv, så den som
  -- måtte få tak i kallet ikke kan diktere hva det står i e-posten.
  begin
    perform net.http_post(
      url     := v_oppsett.funksjon_url,
      headers := jsonb_build_object(
                   'Content-Type',    'application/json',
                   'Authorization',   'Bearer ' || v_oppsett.anon_nokkel,
                   'x-varsel-nokkel', v_oppsett.delt_hemmelighet
                 ),
      body    := jsonb_build_object('type', v_type, 'id', new.id, 'hendelse', v_hendelse)
    );
  exception when others then
    -- En e-post som ikke går skal aldri rulle tilbake en signatur kunden har
    -- avgitt. Signeringen er det viktige; varselet er en tjeneste til oss.
    null;
  end;

  return new;
end;
$$;
