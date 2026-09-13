-- FINAL PRE-PRODUCTION AUDIT — exhaustive table sweep found `payments_legacy`
-- (a dead table: zero frontend callers, zero rows, confirmed live) carrying
-- TWO permissive policies: the correct tenant-scoped `payments_secure`, and
-- a second one literally named "Enable all for authenticated users" with
-- `qual: true, with_check: true` — unconditional read/write/delete access
-- to every row for every authenticated user in any clinic, with no tenant
-- or role check at all. Permissive policies are ORed, so this second policy
-- completely nullified the correct one.
--
-- Not exploitable today (table is empty and unused), but this is a live
-- schema misconfiguration, not a "maybe" — the tenant-scoped policy already
-- provides the intended, correct access model, so dropping the erroneous
-- `true` one restores that intended protection rather than removing any
-- real capability. Table and correct policy are left in place; only the
-- anti-pattern policy is dropped.

drop policy if exists "Enable all for authenticated users" on public.payments_legacy;
