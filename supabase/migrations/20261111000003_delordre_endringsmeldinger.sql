-- Delordre gjelder endringsmeldinger også, ikke bare tilbud.
--
-- Andelene ligger alt i payments (som har amendment_id), så det eneste som
-- mangler er at en post i en endringsmelding kan merkes fullført.

alter table public.delpost_fullfort
  add column if not exists amendment_id uuid references public.amendments(id) on delete cascade;

alter table public.delpost_fullfort
  alter column offer_id drop not null;

-- Hver post hører til nøyaktig én: et tilbud eller en endringsmelding.
alter table public.delpost_fullfort
  drop constraint if exists delpost_fullfort_en_forelder;
alter table public.delpost_fullfort
  add constraint delpost_fullfort_en_forelder check (num_nonnulls(offer_id, amendment_id) = 1);

create index if not exists delpost_fullfort_amendment on public.delpost_fullfort (amendment_id);

comment on table public.delpost_fullfort is
  'Poster (linjer i tilbud eller endringsmelding) merket fullført på Status-siden. Tas ikke med i flere delordre.';

drop policy if exists delpost_fullfort_tenant on public.delpost_fullfort;
create policy delpost_fullfort_tenant on public.delpost_fullfort
  for all
  using (tenant_id = public.current_tenant_id())
  with check (
    tenant_id = public.current_tenant_id()
    and (
      exists (select 1 from public.offers o
               where o.id = offer_id and o.tenant_id = public.current_tenant_id())
      or exists (select 1 from public.amendments a
                  where a.id = amendment_id and a.tenant_id = public.current_tenant_id())
    )
  );

notify pgrst, 'reload schema';
