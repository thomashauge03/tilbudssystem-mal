-- Legacy "name" column from initial schema is no longer used (replaced by "navn"),
-- but its NOT NULL constraint still blocked all inserts.
alter table potential_customers
  alter column name drop not null;
