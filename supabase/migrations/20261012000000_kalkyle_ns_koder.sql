-- Kalkyle med NS 3420-koder.
--
-- ns_codes er firmaets kodebank: koderot, egen kort tittel, enhet og egen
-- enhetspris. Standardens beskrivelsestekst lagres ikke. NS 3420 eies av
-- Standard Norge. Startpakken er hentet fra offentlige anbudsgrunnlag, se
-- docs/ns3420-startliste.md, og ingen kilde bruker 2024-utgaven. Derfor står
-- utgaven på hver kode.
--
-- calculations og calculation_lines er lagrede kalkyler. Linjene har samme
-- form som offer_lines, så de kan flyttes rett over til et tilbud.
-- calculation_lines.ns_code er en kopi, ikke en fremmednøkkel: en gammel
-- kalkyle skal ikke endre seg når noen retter tittelen i kodebanken.
--
-- offer_lines.ns_code tar koden med inn i tilbudet. get_offer_pdf_by_token
-- gjenopprettes med feltet, ellers ville kundens PDF på signeringssiden mistet
-- Kode-kolonnen. Det skjedde med is_heading før 20261007000003.

create table if not exists public.ns_codes (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  part             text not null,
  code             text not null,
  title            text not null,
  unit             text not null default '',
  unit_price       numeric(12,2),
  edition          text,
  note             text,
  maa_kontrolleres boolean not null default false,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists public.calculations (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  name          text not null,
  customer_text text,
  markup_pct    numeric(5,2) not null default 0,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.calculation_lines (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  calculation_id uuid not null references public.calculations(id) on delete cascade,
  sort_order     int not null default 0,
  ns_code        text,
  description    text not null default '',
  unit           text not null default '',
  quantity       numeric(12,2) not null default 0,
  unit_price     numeric(12,2) not null default 0,
  is_heading     boolean not null default false,
  created_at     timestamptz not null default now(),
  -- Samme regel som offer_lines_overskrift_uten_pris (20260915000003)
  constraint calculation_lines_overskrift_uten_pris
    check (not is_heading or (quantity = 0 and unit_price = 0))
);

create index if not exists calculation_lines_calculation_idx
  on public.calculation_lines (calculation_id, sort_order);

-- RLS per firma, samme mønster som i 20260616000000
do $$
declare
  t text;
begin
  foreach t in array array['ns_codes', 'calculations'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "%s_tenant_isolation" on public.%I;', t, t);
    execute format(
      'create policy "%s_tenant_isolation" on public.%I
       using (tenant_id = current_tenant_id())
       with check (tenant_id = current_tenant_id());',
      t, t
    );
  end loop;
end$$;

alter table public.calculation_lines enable row level security;

-- Linjene arver tilgangen fra kalkylen. tenant_id ligger også på raden, men
-- den alene ville latt en rad peke på en kalkyle i et annet firma.
drop policy if exists "calculation_lines_tenant_isolation" on public.calculation_lines;
create policy "calculation_lines_tenant_isolation" on public.calculation_lines
  using (
    tenant_id = current_tenant_id()
    and exists (
      select 1 from public.calculations c
       where c.id = calculation_id and c.tenant_id = current_tenant_id()
    )
  )
  with check (
    tenant_id = current_tenant_id()
    and exists (
      select 1 from public.calculations c
       where c.id = calculation_id and c.tenant_id = current_tenant_id()
    )
  );

alter table public.offer_lines add column if not exists ns_code text;
comment on column public.offer_lines.ns_code is
  'NS 3420-kode for linjen, kopiert fra kalkylen. Vises som Kode-kolonne i tilbuds-PDF-en.';

-- Startpakken for ett firma. Kan kjøres flere ganger uten duplikater.
-- Ikke åpen for klienten: den tar firma som parameter.
create or replace function public.seed_ns_codes_for(p_tenant uuid)
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  n int;
begin
  insert into ns_codes (tenant_id, part, code, title, unit, edition, maa_kontrolleres)
  select p_tenant, v.part, v.code, v.title, v.unit, '2017–2022', v.maa
  from (values
    ('A', 'AV1.1', 'Etablering av rigg/anleggsplass', 'RS', false),
    ('A', 'AV2.1', 'Drift av rigg/anleggsplass', 'RS', false),
    ('A', 'AV3.1', 'Avvikling av rigg/anleggsplass', 'RS', false),
    ('A', 'AB1', 'Ansvarsforsikring', 'RS', false),
    ('A', 'AB2', 'Forsikring av kontraktsarbeidet', 'RS', false),
    ('A', 'AJ8.22', 'Utarbeide avfallsplan', 'RS', false),
    ('A', 'AM1.31', 'Hovedbedriftsansvar', 'RS', false),
    ('A', 'AM1.82', 'Koordinering mot andre', 'RS', false),
    ('A', 'AK3.1', 'Klargjøre adkomst/riggplass', 'RS', false),
    ('A', 'AM3.1', 'Drift av adkomst/riggplass', 'RS', false),
    ('A', 'AS3.1', 'Fjerne adkomst/riggplass', 'RS', false),
    ('A', 'AK3.3', 'Etablere sikring/inngjerding', 'm', false),
    ('A', 'AU2.1', 'Sluttdokumentasjon', 'RS', false),
    ('A', 'AU4', 'FDV-dokumentasjon', 'RS', false),
    ('CD', 'CD4.11', 'Riving, målt i lengde', 'm', false),
    ('CD', 'CD4.12', 'Riving, målt i areal', 'm²', false),
    ('CD', 'CD4.14', 'Riving, målt i antall', 'stk', false),
    ('Z', 'ZB3.12', 'Saging/skjæring av asfalt', 'm', false),
    ('Z', 'ZB7.2', 'Riving av asfaltdekke', 'm²', false),
    ('Z', 'ZB5', 'Fresing av dekke', 'm²', false),
    ('F', 'FV1.1', 'Vegetasjonsrydding komplett', 'm²', false),
    ('F', 'FB1.25', 'Felling av enkelttrær', 'stk', false),
    ('F', 'FB2.1', 'Matjord flyttet til ranke', 'm²', false),
    ('F', 'FB2.21', 'Avtaking av matjord til depot', 'm²', false),
    ('F', 'FD1.13', 'Graving til gravenivå, volum', 'm³', false),
    ('F', 'FD2.11', 'Grøftegraving, per meter', 'm', false),
    ('F', 'FD2.13', 'Grøftegraving, volum', 'm³', false),
    ('F', 'FD2.81', 'Grøftekasse', 'm', false),
    ('F', 'FD3.13', 'Gropgraving, volum', 'm³', false),
    ('F', 'FD3.14', 'Gropgraving, antall', 'stk', false),
    ('F', 'FD4.31', 'Forgraving/sjakting, lengde', 'm', false),
    ('F', 'FD4.34', 'Forgraving/sjakting, antall', 'stk', false),
    ('F', 'FD8.322', 'Tiltak frosne masser, areal', 'm²', false),
    ('F', 'FD8.521', 'Kryssing av eksisterende ledning', 'stk', false),
    ('F', 'FD8.522', 'Langsføring av eksisterende ledning', 'm', false),
    ('F', 'FD8.53', 'Passering av eksisterende anlegg', 'stk', false),
    ('F', 'FF1.2', 'Avretting uten tilførte masser', 'm²', false),
    ('F', 'FF1.3', 'Avretting med tilførte masser', 'm²', false),
    ('F', 'FV2.13', 'Komplett masseuttak løsmasser', 'm³', false),
    ('F', 'FV2.23', 'Komplett uttak av berg', 'm³', false),
    ('F', 'FV3.1', 'Komplett grøft per meter', 'm', false),
    ('F', 'FV4.6', 'Midlertidig omlegging eks. ledning', 'RS', false),
    ('F', 'FV5.1', 'Vannhåndtering komplett', 'RS', false),
    ('F', 'FJ1.21', 'Lensing av byggegrop/grøft', 'RS', false),
    ('F', 'FV7.1', 'Masseutskifting i grøft, lengde', 'm', false),
    ('F', 'FV7.31', 'Masseutskifting, volum', 'm³', false),
    ('GH', 'GH1.33', 'Spunting (nedramming)', 'm²', false),
    ('F', 'FF5.12', 'Rensk av berg etter graving', 'm²', false),
    ('F', 'FF5.22', 'Maskinrensk av berg', 'time', false),
    ('F', 'FH1.12', 'Sikring ved sprengning', 'RS', false),
    ('F', 'FH1.33', 'Sprengning i dagen (skjæring)', 'm³', false),
    ('F', 'FH1.533', 'Grøftesprengning, volum', 'm³', false),
    ('F', 'FH2.22', 'Pigging av berg, volum', 'm³', false),
    ('F', 'FH2.23', 'Pigging av berg i grøft', 'm', false),
    ('F', 'FH8.22', 'Knusing av store blokker', 'stk', false),
    ('F', 'FM1.23', 'Opplasting av masser, fast volum', 'm³', false),
    ('F', 'FM2.21', 'Massetransport innen anlegget', 'm³', false),
    ('F', 'FM2.22', 'Massetransport ut av anlegget', 'm³', false),
    ('F', 'FM5.1', 'Deponiavgift rene masser', 'tonn', false),
    ('F', 'FM5.2', 'Deponiavgift forurensede masser', 'tonn', false),
    ('F', 'FM5.5', 'Mottaksavgift avfall (asfalt/betong)', 'tonn', false),
    ('F', 'FS1.1', 'Utlegging i fylling', 'm³', false),
    ('F', 'FS2.22', 'Forsterkningslag, areal', 'm²', false),
    ('F', 'FS2.23', 'Bærelag (grus/pukk), areal', 'm²', false),
    ('F', 'FS2.24', 'Grusdekke, areal', 'm²', false),
    ('F', 'FS2.332', 'Forsterkningslag, volum', 'm³', false),
    ('F', 'FS2.333', 'Bærelag (grus/pukk), volum', 'm³', false),
    ('F', 'FS2.334', 'Forkiling, volum', 'm³', true),
    ('F', 'FS3.1115', 'Gjenfylling av grøft, lengde', 'm', false),
    ('F', 'FS3.1311', 'Rørfundament i grøft, volum', 'm³', false),
    ('F', 'FS3.1312', 'Sidefylling i grøft, volum', 'm³', false),
    ('F', 'FS3.1315', 'Gjenfylling av grøft, volum', 'm³', false),
    ('F', 'FS3.5', 'Grøfteperre/strømningsstopp', 'stk', false),
    ('F', 'FS3.82', 'Markeringsbånd i grøft', 'm', false),
    ('F', 'FS4.1', 'Tilbakefylling mot konstruksjon, lengde', 'm', false),
    ('F', 'FS4.3', 'Tilbakefylling mot konstruksjon, volum', 'm³', false),
    ('F', 'FS8.31', 'Plastring med sprengstein', 'm²', false),
    ('GU', 'GU6.1', 'Fiberduk som separasjon', 'm²', false),
    ('GU', 'GU5', 'Fiberduk som filter', 'm²', false),
    ('J', 'JH1.21', 'Rengjøring før asfaltering', 'm²', false),
    ('J', 'JH1.31', 'Klebing før asfalt', 'm²', false),
    ('J', 'JH2.11', 'Asfaltdekke (varmprodusert)', 'm²', false),
    ('J', 'JB1.12', 'Asfaltert bærelag (Ag)', 'm²', false),
    ('J', 'JK2.11', 'Permanent vegoppmerking', 'm', false),
    ('K', 'KD2.21', 'Granittkantstein, rett', 'm', false),
    ('K', 'KD2.22', 'Granittkantstein, radius', 'm', false),
    ('K', 'KD2.31', 'Betongkantstein (prefabrikert)', 'm', false),
    ('K', 'KD1.51', 'Belegningsstein av betong', 'm²', false),
    ('K', 'KP1.11', 'Gjerde', 'm', false),
    ('K', 'KB2.22', 'Utlegging av matjord/vekstjord', 'm²', false),
    ('K', 'KB4.61', 'Tilsåing grasbakke', 'm²', false),
    ('K', 'KB4.5', 'Tilsåing grasplen', 'm²', false),
    ('K', 'KB6.11', 'Planting av trær', 'stk', false),
    ('K', 'KB6.2', 'Planting av busker', 'stk', false),
    ('K', 'KM2.21', 'Tørrmur ensidig', 'm²', false),
    ('L', 'LB1.1', 'Forskaling fundament', 'm²', false),
    ('L', 'LB1.4', 'Forskaling vegg', 'm²', false),
    ('L', 'LB1.5', 'Forskaling dekke', 'm²', false),
    ('L', 'LC1.13', 'Armering med kamstål', 'kg', false),
    ('L', 'LG1.1', 'Plasstøpt betong', 'm³', false),
    ('L', 'LV1.11', 'Støpt fundament (f.eks. mast)', 'stk', false),
    ('U', 'UM1.11', 'Vannledning metall (duktil), per m', 'm', false),
    ('U', 'UM1.12', 'Vannledning plast (PE/PVC), per m', 'm', false),
    ('U', 'UM1.181', 'Tilkobling vannledning', 'stk', false),
    ('U', 'UM1.21', 'Avløpsledning betong, per m', 'm', false),
    ('U', 'UM1.22', 'Avløpsledning plast selvfall, per m', 'm', false),
    ('U', 'UM1.281', 'Tilkobling avløpsledning', 'stk', false),
    ('U', 'UM1.31', 'Drensledning, per m', 'm', false),
    ('U', 'UM8.1', 'Forankring/støttekloss rør', 'stk', false),
    ('U', 'UO2.14', 'Stengeventil (utendørs)', 'stk', false),
    ('U', 'UP1.11', 'Betongkum komplett', 'stk', false),
    ('U', 'UP1.13', 'Justeringsring for kum', 'stk', false),
    ('U', 'UP2.1', 'Plastkum (inspeksjon)', 'stk', false),
    ('U', 'UP3.13', 'Sandfangkum betong', 'stk', false),
    ('U', 'UP8.11', 'Kumramme', 'stk', false),
    ('U', 'UP8.12', 'Kumlokk', 'stk', false),
    ('U', 'UP8.21', 'Kumskilt/kumanviser', 'stk', false),
    ('U', 'UU1.11', 'Tetthetsprøving avløp', 'stk', false),
    ('U', 'UU1.21', 'Trykkprøving vannledning', 'stk', false),
    ('U', 'UU1.31', 'Rørinspeksjon (TV)', 'm', false),
    ('U', 'UU1.411', 'Spyling av ledning', 'm', false),
    ('U', 'UU1.413', 'Desinfisering/nøytralisering vannledning', 'm', false),
    ('U', 'UU1.81', 'Innmåling av ledningsanlegg', 'stk', false),
    ('S', 'SB5.21', 'Frostisolering av rør i grunn', 'm²', false),
    ('W', 'WB1.21', 'Trekkerør/kabelrør i grøft', 'm', false)
  ) as v(part, code, title, unit, maa)
  on conflict (tenant_id, code) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.seed_ns_codes_for(uuid) from public, anon, authenticated;

-- Knappen «Legg inn startpakken» i kodebanken. Bruker innlogget brukers firma,
-- aldri et firma sendt inn fra klienten.
create or replace function public.seed_ns_codes()
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  t uuid := current_tenant_id();
begin
  if t is null then
    raise exception 'Fant ikke firma for innlogget bruker';
  end if;
  return seed_ns_codes_for(t);
end;
$$;
revoke all on function public.seed_ns_codes() from public, anon;
grant execute on function public.seed_ns_codes() to authenticated;

-- Alle firmaer som finnes nå, får startpakken med en gang
select public.seed_ns_codes_for(id) from public.tenants;

-- get_offer_pdf_by_token: uendret fra 20261007000003, bortsett fra ns_code på linjene.
create or replace function public.get_offer_pdf_by_token(p_token text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_token offer_signing_tokens;
  v_offer offers;
  v_tenant_id uuid;
  v_lines jsonb;
  v_settings jsonb;
  v_customer_address text;
  v_customer_phone text;
begin
  select * into v_token from offer_signing_tokens where token = p_token;
  if not found or v_token.used_at is not null or v_token.revoked_at is not null then
    return null;
  end if;

  select * into v_offer from offers where id = v_token.offer_id;
  if not found or sperregrunn_tilbud(v_offer) is not null then
    return null;
  end if;
  v_tenant_id := v_offer.tenant_id;

  select c.address, c.phone
    into v_customer_address, v_customer_phone
    from customers c
   where c.id = v_offer.customer_id
     and c.tenant_id = v_tenant_id;

  select jsonb_agg(
    jsonb_build_object(
      'description', description,
      'comment', comment,
      'quantity', quantity,
      'unit', unit,
      'unit_price', unit_price,
      'discount_pct', discount_pct,
      'included', included,
      'is_heading', is_heading,
      'ns_code', ns_code
    ) order by sort_order, id
  ) into v_lines from offer_lines where offer_id = v_offer.id;

  select jsonb_build_object(
    'company_name', company_name,
    'company_org_nr', company_org_nr,
    'company_tagline', company_tagline,
    'company_address', company_address,
    'company_phone', company_phone,
    'logo_url', logo_url,
    'payment_terms', payment_terms,
    'vat_pct', vat_pct,
    'forbehold', forbehold,
    'our_refs', our_refs
  ) into v_settings from app_settings where tenant_id = v_tenant_id;

  return json_build_object(
    'offer', json_build_object(
      'offer_number', v_offer.offer_number,
      'title', v_offer.title,
      'offer_date', v_offer.offer_date,
      'valid_until', v_offer.valid_until,
      'customer_name', v_offer.customer_name,
      'customer_email', v_offer.customer_email,
      'customer_address', v_customer_address,
      'customer_phone', v_customer_phone,
      'their_ref', v_offer.their_ref,
      'our_ref', v_offer.our_ref,
      'project_number', v_offer.project_number,
      'offer_text', v_offer.offer_text,
      'admin_cost_pct', v_offer.admin_cost_pct,
      'forbehold', case when jsonb_typeof(v_offer.forbehold) = 'array'
                        then v_offer.forbehold
                        else '[]'::jsonb
                   end
    ),
    'lines', coalesce(v_lines, '[]'::jsonb),
    'settings', coalesce(v_settings, '{}'::jsonb)
  );
end;
$$;

grant execute on function public.get_offer_pdf_by_token(text) to anon, authenticated;
