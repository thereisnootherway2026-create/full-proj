-- FINAL PRE-PRODUCTION CLOSURE — exhaustive table sweep found two more
-- tables carrying the exact same anti-pattern already fixed for
-- payments_legacy (20260913060000): a lone policy literally named
-- "Enable all for authenticated users" (qual: true, with_check: true) —
-- unconditional cross-tenant read/write/delete for every authenticated
-- user, no tenant or role check at all.
--
-- payment_methods and receipts each have exactly ONE policy total (this
-- one) and zero frontend callers, zero rows (confirmed live). Unlike
-- payments_legacy, there is no second, correct policy to fall back on here
-- — dropping this leaves RLS with zero policies, which defaults to deny-all.
-- That is the correct, safe outcome for a table nothing in the product
-- currently reads or writes: it closes the gap without inventing a new
-- tenant-scoped policy this pass has no product spec for (these tables'
-- intended shape — per-clinic? per-doctor? — isn't established by any
-- existing code, so guessing at one would be a speculative schema change).
-- If either table is wired up in the future, its RLS must be designed
-- deliberately at that time, not inherited from this leftover default.

drop policy if exists "Enable all for authenticated users" on public.payment_methods;
drop policy if exists "Enable all for authenticated users" on public.receipts;
