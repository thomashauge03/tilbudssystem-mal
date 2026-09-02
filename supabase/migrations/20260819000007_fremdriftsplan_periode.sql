-- Planens egen periode.
--
-- Til nå ble tidsaksen utledet av aktivitetene: første startdato til siste
-- sluttdato. Det virker når planen er ferdig, men ikke når man skal lage den —
-- da finnes det ingen aktiviteter ennå, og altså ingen kalender å tegne i.
--
-- Nå settes perioden først, som et spørsmål om hvor lenge jobben varer, og
-- rutenettet bygges av den. Aktivitetene plasseres inne i den perioden.
-- Feltene er nullbare, så planer som alt finnes fortsetter å utlede aksen fra
-- aktivitetene sine.

alter table public.progress_plans
  add column if not exists start_date date,
  add column if not exists end_date date;

comment on column public.progress_plans.start_date is
  'Starten på tidsaksen. Er den tom, utledes aksen av aktivitetene.';
comment on column public.progress_plans.end_date is
  'Slutten på tidsaksen. Er den tom, utledes aksen av aktivitetene.';

-- Planer som alt er laget får perioden sin fra aktivitetene, slik at de åpner
-- rett i rutenettet i stedet for å spørre om noe brukeren allerede har svart på.
update public.progress_plans p
   set start_date = k.fra,
       end_date   = k.til
  from (
    select plan_id, min(start_date) as fra, max(coalesce(end_date, start_date)) as til
      from public.progress_plan_activities
     where start_date is not null
     group by plan_id
  ) k
 where k.plan_id = p.id
   and p.start_date is null;
