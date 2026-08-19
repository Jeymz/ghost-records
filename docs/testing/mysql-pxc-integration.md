# MySQL and Percona XtraDB Cluster Integration Validation

Ghost Records does **not** provision, bundle, operate, or recover MySQL/PXC. This integration path is intentionally opt-in and must target an owner-provided, non-production MySQL 8.0+ instance or a supported Percona XtraDB Cluster environment.

## Preconditions

The owner supplies a least-privilege test database user, TLS settings, connection budget, and the standard `GHOST_RECORDS_MYSQL_*` runtime configuration. The user must set `GHOST_RECORDS_MIGRATION_ACTOR_ENABLED=true` for the migration validation run and set `GHOST_RECORDS_MYSQL_INTEGRATION=true` only in the dedicated test environment. The integration test must never point at an unapproved production database.

## Validation procedure

Run `npm run test:integration` after loading the owner-provided test configuration. The test verifies Sequelize readiness, creates only the fixed migration metadata/lease tables when absent, runs the empty baseline manifest twice to demonstrate repeatability, and closes the connection. It does not create domain tables, provider data, or scanner artifacts.

For each future domain migration, the migration author must add a disposable-test-database case that runs `up`, verifies the expected schema through Sequelize `QueryInterface` APIs, runs the migration's mandatory `down` function in a transaction, and verifies the schema is removed or restored. Migrations must not use raw SQL, `sequelize.query`, filesystem migration state, or direct database-driver access.

## PXC compatibility expectation

The same opt-in test is the supported PXC validation path. It must be run against the target supported PXC release before a version with schema changes is released. Owners retain responsibility for PXC topology, backups, recovery, availability, and restore operations; Ghost Records owns forward migration compatibility and documented upgrade prerequisites.
