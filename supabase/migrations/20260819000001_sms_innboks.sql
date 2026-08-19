-- Innboks for SMS som videresendes fra mobilen.
--
-- Endepunktet lagrer BARE rå tekst. Tolkingen skjer i appen når meldingen
-- godkjennes, med den samme tolkeren som brukes ved innliming. Da kan de to
-- ikke komme i utakt, og en forbedring i tolkeren virker også på gamle
-- meldinger som ligger ubehandlet.

-- Nøkkelen som identifiserer hvilket firma meldingen hører til. Den limes inn
-- i videresendings-appen på telefonen, så den må kunne byttes uten at noe annet
-- endres.
alter table public.app_settings
  add column if not exists sms_token text unique;

create table if not exists public.sms_inbox (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  received_at  timestamptz not null default now(),
  sender       text,
  body         text not null,
  -- 'ny' til noen har sett på den, deretter 'handtert' eller 'ignorert'.
  -- Meldinger slettes ikke: står tallene feil i ettertid, er originalen her.
  status       text not null default 'ny',
  tender_id    uuid references public.tenders(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists sms_inbox_status_idx on public.sms_inbox(tenant_id, status, received_at desc);

alter table public.sms_inbox enable row level security;

-- Innloggede ser bare sitt eget firma sine meldinger. Edge-funksjonen skriver
-- med service-rollen og går dermed utenom denne.
drop policy if exists "sms_inbox_tenant_isolation" on public.sms_inbox;
create policy "sms_inbox_tenant_isolation" on public.sms_inbox
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

-- Gi hvert firma en nøkkel med en gang, så den finnes å vise fram i
-- Innstillinger uten at noen må trykke på noe først.
update public.app_settings
   set sms_token = replace(gen_random_uuid()::text, '-', '')
 where sms_token is null;
