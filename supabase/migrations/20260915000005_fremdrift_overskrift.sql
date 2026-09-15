-- Overskrifter i fremdriftsplanen.
--
-- Samme sak som i prisoppstillingen: en plan på tjue aktiviteter er ikke en
-- liste, den er grunnarbeid, så VA, så veg. Uten en måte å si det på, måtte
-- folk lage en aktivitet uten datoer som skille — og den ble stående i lista
-- over «uten dato, ikke tegnet inn», telt som aktivitet i dokumenthodet, og
-- med en fargeprikk som lovet et fag den ikke hadde.
--
-- En overskrift har bare navn. Ingen datoer, ingen milepæl, ingen plass i
-- kalenderen. Den ligger blant aktivitetene fordi rekkefølgen er hele poenget.

alter table public.progress_plan_activities
  add column if not exists is_heading boolean not null default false;

comment on column public.progress_plan_activities.is_heading is
  'Overskrift i planen: bare tekst, ingen datoer, tegnes ikke inn i kalenderen.';

-- En overskrift skal aldri bære datoer eller være en milepæl. Uten vakten
-- kunne en rad som ble gjort om til overskrift beholde periodene sine —
-- usynlig i skjemaet, men fullt synlig i tidsaksen, som strekker seg etter
-- ytterpunktene til aktivitetene.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'progress_plan_activities_overskrift_uten_dato') then
    alter table public.progress_plan_activities
      add constraint progress_plan_activities_overskrift_uten_dato
      check (
        not is_heading
        or (start_date is null and end_date is null and coalesce(is_milestone, false) = false)
      );
  end if;
end $$;
