# Insurance rules engine: database tests

**Test-only.** Every rule, tariff, act and source in `rules_engine.sql` (Stage 4B) and
`context_and_acts.sql` (Stage 4C) is a fictitious fixture
(`TESTNOM`, `T-*`, `SRC-TEST-*`, made-up rates). None of it belongs in a migration or in
production data.

Run it against a **throwaway** database that has every migration applied, e.g. a local Supabase
stack right after `supabase db reset`. Both files must run in the same psql session, because the
fixtures define a `pg_temp` helper:

```sh
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f scripts/db-tests/insurance/fixtures.sql -f scripts/db-tests/insurance/rules_engine.sql
# on a fresh database:
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f scripts/db-tests/insurance/fixtures.sql -f scripts/db-tests/insurance/context_and_acts.sql
```

The last query prints `passed | failed`. The expected result is `failed = 0`.
