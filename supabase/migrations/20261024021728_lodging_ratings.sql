-- Review aggregates shown on the marketplace card. Denormalized for now —
-- when a reviews table exists these become computed/cached values.
alter table public.lodgings
  add column rating numeric(2,1) check (rating between 0 and 5),
  add column reviews int not null default 0;
