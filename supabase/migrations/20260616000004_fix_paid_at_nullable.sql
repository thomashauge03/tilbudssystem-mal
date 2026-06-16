-- paid_at should be nullable (invoice is not paid when first created)
alter table payments alter column paid_at drop not null;
