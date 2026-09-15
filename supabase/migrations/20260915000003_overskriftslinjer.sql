-- Overskrifter i prisoppstillingen.
--
-- Et tilbud på tretti poster er ikke en liste — det er grunnarbeid, så VA, så
-- veg. Uten en måte å si det på, måtte folk skrive «GRUNNARBEID» som en vanlig
-- linje med 1 stk à 0 kr, og da lå det en nullpost i summen, i fakturagrunnlaget
-- og i alt som teller linjer.
--
-- En overskriftslinje har bare tekst. Den har ingen pris, den summeres ikke, og
-- den kan ikke hukes av eller faktureres. Den ligger i linjetabellen og ikke i
-- et eget felt, fordi rekkefølgen er hele poenget: overskriften hører til der
-- brukeren dro den inn.

do $$
declare
  t text;
begin
  foreach t in array array['offer_lines', 'amendment_lines'] loop
    execute format(
      'alter table public.%I add column if not exists is_heading boolean not null default false', t);
  end loop;
end $$;

comment on column public.offer_lines.is_heading is
  'Overskrift i oppstillingen: bare tekst, ingen pris, teller ikke med i summen.';
comment on column public.amendment_lines.is_heading is
  'Overskrift i oppstillingen: bare tekst, ingen pris, teller ikke med i summen.';

-- En overskrift skal aldri bære tall. Uten denne vakten kunne en rad som ble
-- gjort om til overskrift beholde prisen sin, usynlig i skjemaet, men fullt
-- synlig i summene.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'offer_lines_overskrift_uten_pris') then
    alter table public.offer_lines add constraint offer_lines_overskrift_uten_pris
      check (not is_heading or (coalesce(quantity, 0) = 0 and coalesce(unit_price, 0) = 0));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'amendment_lines_overskrift_uten_pris') then
    alter table public.amendment_lines add constraint amendment_lines_overskrift_uten_pris
      check (not is_heading or (coalesce(quantity, 0) = 0 and coalesce(unit_price, 0) = 0));
  end if;
end $$;

-- Signeringssiden for endringsmeldinger leser linjene gjennom denne funksjonen.
-- Uten feltet her ville kunden sett overskriftene som tomme prislinjer med
-- 0,00 kr — altså akkurat det oppstillingen skulle bli kvitt.
create or replace function public.get_amendment_by_token(p_token text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  t record;
  a record;
begin
  select * into t from amendment_signing_tokens where token = p_token;
  if not found then
    raise exception 'Ugyldig eller utløpt lenke';
  end if;

  select * into a from amendments where id = t.amendment_id;
  if not found then
    raise exception 'Ugyldig eller utløpt lenke';
  end if;

  return json_build_object(
    'token_id',             t.id,
    'used_at',              t.used_at,
    'amendment_id',         a.id,
    'amendment_number',     a.amendment_number,
    'project_ref',          a.project_ref,
    'internal_description', a.internal_description,
    'change_description',   a.change_description,
    'reason',               a.reason,
    'other_notes',          a.other_notes,
    'notified_date',        a.notified_date,
    'status',               a.status,
    'company_name',         (select company_name from app_settings where tenant_id = a.tenant_id),
    'lines', coalesce(
      (select json_agg(json_build_object(
                'description', l.description,
                'quantity',    l.quantity,
                'unit',        l.unit,
                'unit_price',  l.unit_price,
                'is_heading',  coalesce(l.is_heading, false))
              order by l.sort_order)
         from amendment_lines l where l.amendment_id = a.id),
      '[]'::json)
  );
end;
$$;
