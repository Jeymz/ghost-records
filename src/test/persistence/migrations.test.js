import { describe, expect, it, vi } from 'vitest';

import {
  PersistenceError,
  ValidationError,
} from '../../errors/application-error.js';
import {
  acquireMigrationLease,
  rollbackLastMigration,
  runMigrations,
} from '../../persistence/migrations/runner.js';
import { validateMigrationManifest } from '../../persistence/migrations/manifest.js';

function buildConfiguration({ migrationActorEnabled = true } = {}) {
  return {
    database: {
      migrationActorEnabled,
    },
  };
}

function buildPersistenceDoubles({
  appliedMigrationIds = [],
  currentLease = null,
  mostRecentMigration = null,
} = {}) {
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  const sequelize = {
    transaction: vi.fn(async (callback) => callback(transaction)),
    getQueryInterface: vi.fn(() => ({ createTable: vi.fn() })),
  };
  const models = {
    migrationLedger: {
      sync: vi.fn().mockResolvedValue(undefined),
      findAll: vi.fn().mockResolvedValue(
        appliedMigrationIds.map((migrationId) => ({ migrationId })),
      ),
      findOne: vi.fn().mockResolvedValue(mostRecentMigration),
      create: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(1),
    },
    migrationLease: {
      sync: vi.fn().mockResolvedValue(undefined),
      findByPk: vi.fn().mockResolvedValue(currentLease),
      create: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue([1]),
    },
  };

  return { sequelize, models };
}

describe('migration lifecycle', () => {
  it('rejects malformed and duplicate immutable migration entries', () => {
    expect(() => validateMigrationManifest([{ id: 'only-id' }])).toThrow(
      ValidationError,
    );

    const migration = { id: '001-test', up: () => {}, down: () => {} };
    expect(() => validateMigrationManifest([migration, migration])).toThrow(
      'Duplicate migration id',
    );
  });

  it('runs pending Sequelize migrations transactionally and records them once', async () => {
    const { sequelize, models } = buildPersistenceDoubles();
    const up = vi.fn().mockResolvedValue(undefined);
    const logger = { info: vi.fn() };

    const result = await runMigrations({
      configuration: buildConfiguration(),
      sequelize,
      models,
      actorId: 'migration-job-1',
      logger,
      manifest: [{ id: '001-create-metadata', up, down: vi.fn() }],
    });

    expect(models.migrationLedger.sync).toHaveBeenCalledWith({
      alter: false,
      force: false,
    });
    expect(models.migrationLease.sync).toHaveBeenCalledWith({
      alter: false,
      force: false,
    });
    expect(models.migrationLease.create).toHaveBeenCalledOnce();
    expect(up).toHaveBeenCalledWith({
      queryInterface: expect.any(Object),
      transaction: expect.any(Object),
    });
    expect(models.migrationLedger.create).toHaveBeenCalledWith(
      {
        migrationId: '001-create-metadata',
        appliedAt: expect.any(Date),
      },
      { transaction: expect.any(Object) },
    );
    expect(logger.info).toHaveBeenCalledWith('Database migration applied.', {
      migrationId: '001-create-metadata',
    });
    expect(result).toEqual({ appliedMigrationIds: ['001-create-metadata'] });
  });

  it('does not rerun a migration already recorded in the ledger', async () => {
    const { sequelize, models } = buildPersistenceDoubles({
      appliedMigrationIds: ['001-create-metadata'],
    });
    const up = vi.fn();

    const result = await runMigrations({
      configuration: buildConfiguration(),
      sequelize,
      models,
      actorId: 'migration-job-1',
      logger: { info: vi.fn() },
      manifest: [{ id: '001-create-metadata', up, down: vi.fn() }],
    });

    expect(up).not.toHaveBeenCalled();
    expect(result).toEqual({ appliedMigrationIds: [] });
  });

  it('runs the most recent migration down transactionally and removes its ledger entry', async () => {
    const { sequelize, models } = buildPersistenceDoubles({
      mostRecentMigration: { migrationId: '001-create-metadata' },
    });
    const down = vi.fn().mockResolvedValue(undefined);
    const logger = { warn: vi.fn() };

    const result = await rollbackLastMigration({
      configuration: buildConfiguration(),
      sequelize,
      models,
      actorId: 'migration-job-1',
      logger,
      manifest: [{ id: '001-create-metadata', up: vi.fn(), down }],
    });

    expect(down).toHaveBeenCalledWith({
      queryInterface: expect.any(Object),
      transaction: expect.any(Object),
    });
    expect(models.migrationLedger.destroy).toHaveBeenCalledWith({
      where: { migrationId: '001-create-metadata' },
      transaction: expect.any(Object),
    });
    expect(logger.warn).toHaveBeenCalledWith('Database migration rolled back.', {
      migrationId: '001-create-metadata',
    });
    expect(result).toEqual({ rolledBackMigrationId: '001-create-metadata' });
  });

  it('rejects migration execution when the configured actor is disabled', async () => {
    const { sequelize, models } = buildPersistenceDoubles();

    await expect(
      runMigrations({
        configuration: buildConfiguration({ migrationActorEnabled: false }),
        sequelize,
        models,
        actorId: 'migration-job-1',
        logger: { info: vi.fn() },
        manifest: [],
      }),
    ).rejects.toBeInstanceOf(PersistenceError);
  });

  it('rejects a concurrent non-expired lease held by another actor', async () => {
    const { sequelize, models } = buildPersistenceDoubles({
      currentLease: {
        leaseOwner: 'migration-job-2',
        leaseExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
      },
    });

    await expect(
      acquireMigrationLease({
        sequelize,
        migrationLease: models.migrationLease,
        actorId: 'migration-job-1',
        now: new Date('2026-08-19T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(PersistenceError);
  });
});
