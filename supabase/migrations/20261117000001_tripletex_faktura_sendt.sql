-- Om fakturaen fra Tripletex er sendt til kunden.
--
-- En faktura kan ligge ferdig i Tripletex uten å være sendt. Synken leser
-- sendeloggen til fakturaen og skriver første vellykkede sending hit, så
-- delordren kan merkes «Sendt» på Status og Ordre.

alter table public.payments
  add column if not exists tripletex_sendt     timestamptz,
  add column if not exists tripletex_sendt_til text;

comment on column public.payments.tripletex_sendt is
  'Når fakturaen ble sendt til kunden fra Tripletex. Null = ikke sendt, eller ikke fakturert ennå. Settes av synken.';
comment on column public.payments.tripletex_sendt_til is
  'E-postadressen fakturaen ble sendt til, eller kanalen (EHF, eFaktura, papir) når det ikke var e-post.';
