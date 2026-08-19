-- SMS-nøkkelen: hvert firma skal alltid ha en, og den skal kunne byttes.
--
-- Kolonnen ble lagt til uten default og fylt av et engangs-update. Firma som
-- ikke hadde en app_settings-rad da 20260819000001 kjørte — og alle som
-- opprettes siden — sto derfor igjen med sms_token = null, og Innstillinger ba
-- dem «kjøre migrasjonen først», noe en sluttbruker ikke kan gjøre. Da virker
-- ikke SMS-videresendingen i det hele tatt for det firmaet.
--
-- Motsatt vei fantes det ingen vei tilbake: kommer nøkkelen på avveie — en
-- ansatt slutter med telefonen sin, noen tar et skjermbilde av Innstillinger —
-- kunne den ikke ugyldiggjøres uten å kjøre SQL for hånd.

-- Kolonnen finnes fra 20260819000001. Den gjentas her så denne migrasjonen kan
-- kjøres alene mot en base som ligger etter, og så triggerne under alltid har
-- feltet å lese.
alter table public.app_settings
  add column if not exists sms_token text unique;

alter table public.app_settings
  alter column sms_token set default replace(gen_random_uuid()::text, '-', '');

-- Rader som fortsatt står uten nøkkel, altså alle opprettet etter forrige gang.
update public.app_settings
   set sms_token = replace(gen_random_uuid()::text, '-', '')
 where sms_token is null;

-- Nøkkelen er en bærernøkkel mot et endepunkt uten innlogging. Kunne en
-- innlogget bruker velge verdien selv, kunne han sette den til noe kort og
-- gjettbart, og da skriver hvem som helst utenfra i firmaets anbudsinnboks.
-- Derfor bestemmer databasen verdien. Kall fra service-rollen og fra postgres
-- går klar: ellers ville en tilbakelesing av en sikkerhetskopi gitt alle firma
-- nye nøkler, og telefonene hadde stumt sluttet å komme fram.
create or replace function public.app_settings_sett_sms_token()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') or new.sms_token is null then
    new.sms_token := replace(gen_random_uuid()::text, '-', '');
  end if;
  return new;
end;
$$;

drop trigger if exists app_settings_sms_token_ins on public.app_settings;
create trigger app_settings_sms_token_ins
  before insert on public.app_settings
  for each row execute function public.app_settings_sett_sms_token();

-- Samme regel ved oppdatering: en patch fra nettleseren skal aldri kunne endre
-- eller nulle nøkkelen. Gamle rader uten nøkkel får en ved første lagring.
create or replace function public.app_settings_frys_sms_token()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.sms_token := old.sms_token;
  end if;
  if new.sms_token is null then
    new.sms_token := replace(gen_random_uuid()::text, '-', '');
  end if;
  return new;
end;
$$;

drop trigger if exists app_settings_sms_token_upd on public.app_settings;
create trigger app_settings_sms_token_upd
  before update on public.app_settings
  for each row execute function public.app_settings_frys_sms_token();

-- «Lag ny nøkkel». Den gamle slutter å virke i samme øyeblikk, så telefonen må
-- få den nye limt inn etterpå. Security definer fordi triggeren over ellers
-- ville frosset byttet, og admin-krav fordi det stopper videresendingen for
-- hele firmaet til noen har oppdatert telefonen.
create or replace function public.rotate_sms_token()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_token  text;
begin
  v_tenant := current_tenant_id();
  if v_tenant is null then
    raise exception 'Ingen tilknyttet firma';
  end if;

  if not exists (
    select 1 from tenant_users
     where user_id = auth.uid() and tenant_id = v_tenant and role = 'admin'
  ) then
    raise exception 'Bare administratorer kan lage ny SMS-nøkkel';
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '');

  -- Et firma som aldri har lagret innstillinger har ingen rad ennå.
  insert into app_settings (tenant_id, sms_token)
  values (v_tenant, v_token)
  on conflict (tenant_id) do update set sms_token = excluded.sms_token;

  return v_token;
end;
$$;

revoke all on function public.rotate_sms_token() from public;
grant execute on function public.rotate_sms_token() to authenticated;
grant execute on function public.rotate_sms_token() to service_role;
