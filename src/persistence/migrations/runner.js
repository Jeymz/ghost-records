import {
  PersistenceError,
  ValidationError,
} from '../../errors/application-error.js';
import { createMigrationLedgerRepository } from '../repositories/migration-ledger-repository.js';
import { createMigrationLeaseRepository } from '../repositories/migration-lease-repository.js';
import { validateMigrationManifest } from './manifest.js';

const DEFAULT_LEASE_DURATION_MS = 60_000;

function assertMigrationActor(configuration, actorId) {
  if (!configuration.database.migrationActorEnabled) {
    throw new PersistenceError({
      message: 'Migration execution is disabled for this application instance.',
      details: { operation: 'migrate' },
    });
  }

  if (typeof actorId !== 'string' || actorId.trim().length === 0) {
    throw new ValidationError({
      message: 'Migration execution requires a non-empty migration actor id.',
    });
  }
}

function createLeaseExpiration(now, leaseDurationMs) {
  return new Date(now.getTime() + leaseDurationMs);
}

export async function bootstrapMigrationMetadata(models) {
  await models.migrationLedger.sync({ alter: false, force: false });
  await models.migrationLease.sync({ alter: false, force: false });
}

export async function acquireMigrationLease({
  sequelize,
  migrationLease,
  actorId,
  now = new Date(),
  leaseDurationMs = DEFAULT_LEASE_DURATION_MS,
}) {
  if (!Number.isInteger(leaseDurationMs) || leaseDurationMs <= 0) {
    throw new ValidationError({
      message: 'Migration lease duration must be a positive integer.',
    });
  }

  const leaseExpiresAt = createLeaseExpiration(now, leaseDurationMs);

  try {
    const migrationLeaseRepository = createMigrationLeaseRepository({
      sequelize,
      migrationLease,
    });
    await migrationLeaseRepository.acquire({ actorId, now, leaseExpiresAt });
  } catch (error) {
    if (error instanceof PersistenceError || error instanceof ValidationError) {
      throw error;
    }

    throw new PersistenceError({
      message: 'Unable to acquire the database migration lease.',
      details: { operation: 'acquire-migration-lease' },
      cause: error,
    });
  }
}

export async function releaseMigrationLease({
  sequelize,
  migrationLease,
  actorId,
  now = new Date(),
}) {
  const migrationLeaseRepository = createMigrationLeaseRepository({
    sequelize,
    migrationLease,
  });
  await migrationLeaseRepository.release({ actorId, now });
}

export async function rollbackLastMigration({
  configuration,
  sequelize,
  models,
  actorId,
  manifest,
  logger,
}) {
  assertMigrationActor(configuration, actorId);
  validateMigrationManifest(manifest);
  await bootstrapMigrationMetadata(models);
  await acquireMigrationLease({
    sequelize,
    migrationLease: models.migrationLease,
    actorId,
  });

  try {
    const migrationLedgerRepository = createMigrationLedgerRepository(
      models.migrationLedger,
    );
    const mostRecentMigration =
      await migrationLedgerRepository.findMostRecentAppliedMigration();

    if (!mostRecentMigration) {
      return { rolledBackMigrationId: undefined };
    }

    const migration = manifest.find(
      (candidate) => candidate.id === mostRecentMigration.migrationId,
    );

    if (!migration) {
      throw new PersistenceError({
        message: 'The most recent applied migration is missing from the immutable manifest.',
        details: {
          operation: 'rollback-migration',
          migrationId: mostRecentMigration.migrationId,
        },
      });
    }

    try {
      await sequelize.transaction(async (transaction) => {
        await migration.down({
          queryInterface: sequelize.getQueryInterface(),
          transaction,
        });
        await migrationLedgerRepository.removeAppliedMigration({
          migrationId: migration.id,
          transaction,
        });
      });
      logger?.warn('Database migration rolled back.', {
        migrationId: migration.id,
      });
      return { rolledBackMigrationId: migration.id };
    } catch (error) {
      throw new PersistenceError({
        message: 'Database migration rollback failed.',
        details: {
          operation: 'rollback-migration',
          migrationId: migration.id,
        },
        cause: error,
      });
    }
  } finally {
    await releaseMigrationLease({
      sequelize,
      migrationLease: models.migrationLease,
      actorId,
    });
  }
}

export async function runMigrations({
  configuration,
  sequelize,
  models,
  actorId,
  manifest,
  logger,
}) {
  assertMigrationActor(configuration, actorId);
  validateMigrationManifest(manifest);
  await bootstrapMigrationMetadata(models);
  await acquireMigrationLease({
    sequelize,
    migrationLease: models.migrationLease,
    actorId,
  });

  try {
    const migrationLedgerRepository = createMigrationLedgerRepository(
      models.migrationLedger,
    );
    const appliedMigrationIds =
      await migrationLedgerRepository.listAppliedMigrationIds();
    const pendingMigrations = manifest.filter(
      (migration) => !appliedMigrationIds.has(migration.id),
    );

    for (const migration of pendingMigrations) {
      try {
        await sequelize.transaction(async (transaction) => {
          await migration.up({
            queryInterface: sequelize.getQueryInterface(),
            transaction,
          });
          await migrationLedgerRepository.recordAppliedMigration({
            migrationId: migration.id,
            transaction,
          });
        });
        logger?.info('Database migration applied.', {
          migrationId: migration.id,
        });
      } catch (error) {
        throw new PersistenceError({
          message: 'Database migration failed.',
          details: {
            operation: 'run-migration',
            migrationId: migration.id,
          },
          cause: error,
        });
      }
    }

    return {
      appliedMigrationIds: pendingMigrations.map((migration) => migration.id),
    };
  } finally {
    await releaseMigrationLease({
      sequelize,
      migrationLease: models.migrationLease,
      actorId,
    });
  }
}
