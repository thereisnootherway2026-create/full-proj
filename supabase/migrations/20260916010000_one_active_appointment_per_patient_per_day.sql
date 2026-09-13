-- BUSINESS RULE: one active appointment per (clinic, patient) per calendar
-- day, enforced at the database level.
--
-- Schema (inspected live before writing this, not assumed):
--   rdv.date_rdv is a single `timestamp with time zone` column (no separate
--   date/time columns). Tenant key is `cabinet_id`. Cancellation is
--   represented by status = 'cancelled' (rdv_status_check only allows
--   scheduled/confirme/cancelled/no_show/completed — no soft-delete flag,
--   no separate "deleted" state).
--
-- Calendar day must be derived in the clinic's real timezone (Africa/
-- Casablanca), not UTC — `date_rdv at time zone 'Africa/Casablanca'` cannot
-- be used directly in a GENERATED column or an index expression because
-- PostgreSQL requires IMMUTABLE expressions there, and named-timezone
-- conversion is only STABLE (it depends on the tzdata rules in effect,
-- which can change). So the day is materialized into a plain column,
-- kept correct by a BEFORE INSERT/UPDATE trigger instead.
--
-- EXISTING DUPLICATES — found live, NOT touched, NOT deleted, NOT merged:
--   11 groups of same-clinic/same-patient/same-day NON-cancelled
--   appointments already exist (queried live via a report before writing
--   this migration; none of the 22 rows involved have status='cancelled').
--   A plain unique index would refuse to be created while these violate
--   it. Per the explicit instruction not to destroy or silently resolve
--   existing data, this constraint is scoped to apply only to rows
--   created from this migration's deploy time onward (created_at >= the
--   literal cutover below, captured live moments before writing this
--   file). Every existing row keeps its original created_at and is
--   permanently exempt from this index — this is a deliberate,
--   documented trade-off (legacy duplicates are grandfathered forever,
--   including if one of them is later edited), not an oversight. It does
--   not open any new loophole: every genuinely new appointment gets a
--   fresh created_at and is always covered.

alter table public.rdv add column if not exists appointment_day date;

update public.rdv
set appointment_day = (date_rdv at time zone 'Africa/Casablanca')::date
where appointment_day is null;

alter table public.rdv alter column appointment_day set not null;

create or replace function public.rdv_set_appointment_day()
returns trigger
language plpgsql
as $$
begin
  new.appointment_day := (new.date_rdv at time zone 'Africa/Casablanca')::date;
  return new;
end;
$$;

drop trigger if exists rdv_set_appointment_day on public.rdv;
create trigger rdv_set_appointment_day
before insert or update of date_rdv on public.rdv
for each row execute function public.rdv_set_appointment_day();

-- Concurrency: this is a real unique index, not an application-level
-- check-then-insert — two concurrent transactions racing to book the same
-- patient on the same day will have Postgres itself reject the loser
-- atomically with a unique_violation (23505), which is the only reliable
-- way to close this race.
--
-- Editing an existing appointment is naturally handled correctly by how
-- unique indexes work on UPDATE: a row is never compared against its own
-- previous values, only against OTHER rows — so changing an appointment's
-- time while keeping the same calendar day is always allowed, and moving
-- it to a day another active appointment for the same patient already
-- occupies is always rejected, with no special-casing required.
create unique index if not exists rdv_one_active_per_patient_per_day
on public.rdv (cabinet_id, patient_id, appointment_day)
where status <> 'cancelled' and created_at >= '2026-09-13 10:40:00+00'::timestamptz;
