# db/ — two schema sets (run one, not both)

| Set | Files | Tables | Purpose |
|---|---|---|---|
| **Original (3-table)** | `schema.sql`, `triggers.sql`, `procedures.sql`, `seed.sql`, `concurrency_demo.sql` | `CONTAINERS`, `RESOURCE_LIMITS`, `CONTAINER_LOGS` | Initial commit / concurrency demo |
| **Full (9-table)** | `schema_full.sql`, `seed_full.sql`, `queries_full.sql`, `drop_full.sql` | `users`, `images`, `containers`, `processes`, `namespaces`, `resource_limits`, `metrics`, `events`, `logs` | Complete PBL model + ER diagram |

> **Why only one at a time:** Oracle folds unquoted identifiers to
> uppercase, so `containers` (full set) and `CONTAINERS` (original set)
> are the *same* table name. Create them in separate Oracle schemas/users,
> or run `drop_full.sql` / drop the original first before switching.

## Run the full set

```bash
sqlplus pbl/pbl@localhost:1521/XEPDB1 @db/schema_full.sql
sqlplus pbl/pbl@localhost:1521/XEPDB1 @db/seed_full.sql
sqlplus pbl/pbl@localhost:1521/XEPDB1 @db/queries_full.sql   # 12 demo queries
# teardown:
sqlplus pbl/pbl@localhost:1521/XEPDB1 @db/drop_full.sql
```

`schema_full.sql` includes: 9 tables, PK sequences + 11g-style triggers,
a lifecycle state-machine trigger (rejects illegal transitions),
auto-audit triggers writing to `events`, 4 views (incl. `CONNECT BY`
process tree), `prc_stop_container`, `fn_uptime_seconds`, and comments.

## ER diagram & architecture

- [../docs/er-diagram.md](../docs/er-diagram.md) — Mermaid source + cardinality table
- [../docs/er-diagram.html](../docs/er-diagram.html) — open in a browser
- [../docs/er-diagram.png](../docs/er-diagram.png) — rendered snapshot for the report
- [../docs/architecture.md](../docs/architecture.md) — 3-tier diagram + command→data flow
