-- Betalingsvilkåret skal være 14 dager netto for alle firma.
--
-- Vilkåret leses fra app_settings hver gang tilbuds-PDF, endrings-PDF og
-- kontrakt lages, så oppdateringen her slår gjennom på alle tilbud, også de
-- som alt er sendt. Kjørt mot produksjon 2026-11-17 via Management API.

alter table public.app_settings
  alter column payment_terms set default '14 dager netto';

update public.app_settings
   set payment_terms = '14 dager netto';
