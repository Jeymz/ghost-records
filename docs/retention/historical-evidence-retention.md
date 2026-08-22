# Historical Evidence Retention

Ghost Records stores normalized resolution snapshots, minimized registration observations, approved-external policy decisions, and finding-history placeholders through Sequelize models and the owner-provided MySQL/PXC database. Retention is disabled for an application instance unless `GHOST_RECORDS_RETENTION_ACTOR_ENABLED=true`; enabling it authorizes only the bounded application purge job, not database backup, restore, or infrastructure management.

The retention actor acquires a database-backed lease named `historical-evidence-retention` before purging. The lease prevents concurrent workers from performing the same retention batch. Each run deletes at most `GHOST_RECORDS_RETENTION_BATCH_SIZE` rows per evidence class, updates retention metadata in the same transaction, records only aggregate deletion counts, and never logs deleted evidence content.

| Configuration | Default | Bound |
| --- | --- | --- |
| `GHOST_RECORDS_RETENTION_HISTORY_DAYS` | 365 days | Minimum 1 day |
| `GHOST_RECORDS_RETENTION_REGISTRATION_DAYS` | 90 days | Minimum 1 day |
| `GHOST_RECORDS_RETENTION_ACTOR_ENABLED` | `false` | Explicit owner enablement required |
| `GHOST_RECORDS_RETENTION_LEASE_MS` | 60,000 ms | 1,000–3,600,000 ms |
| `GHOST_RECORDS_RETENTION_BATCH_SIZE` | 500 rows/class | 1–10,000 rows/class |
| `GHOST_RECORDS_RAW_EVIDENCE_ENABLED` | `false` | Enforced disabled in T8 |
| `GHOST_RECORDS_RETENTION_RAW_EVIDENCE_DAYS` | 0 days | Enforced zero in T8 |

The MySQL/PXC owner remains responsible for provisioning, topology, availability, encryption, database backups, restore operations, and recovery testing. T8 retention is a logical application-data lifecycle control only. It neither creates a MySQL backup nor guarantees point-in-time recovery.
