-- Tripletex sin nye API-nøkkel: én «refresh token» (tlxr_…) per firma, som
-- alene gir en innlogging på inntil 8 timer. Den lages under Selskap →
-- API-tokens og trenger ingen egen integrasjonsnøkkel.
--
-- Den gamle innloggingen gjelder ut en dato; den nye ut et klokkeslett. Derfor
-- et eget felt med tid, så en økt aldri brukes etter at den har gått ut.

alter table public.tripletex_oppsett
  add column if not exists session_gyldig_til timestamptz;

comment on column public.tripletex_oppsett.employee_token is
  'Firmaets API-nøkkel: refresh token (tlxr_…) eller, med gammel innlogging, employee token.';
comment on column public.tripletex_oppsett.session_gyldig_til is
  'Når øktnøkkelen går ut. Settes for refresh token, som gir økter på timer, ikke dager.';

notify pgrst, 'reload schema';
