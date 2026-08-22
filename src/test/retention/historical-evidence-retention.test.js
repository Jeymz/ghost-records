import { describe, expect, it, vi } from 'vitest';
import { PersistenceError } from '../../errors/application-error.js';
import { runHistoricalEvidenceRetention } from '../../retention/historical-evidence-retention.js';

function retentionModel() {
  return {
    findAll: vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]),
    destroy: vi.fn().mockResolvedValue(2),
  };
}

function createPersistence({ leasedByOtherActor = false } = {}) {
  const lease = {
    leaseOwner: leasedByOtherActor ? 'other-worker' : 'worker-1',
    leaseExpiresAt: leasedByOtherActor ? new Date('2030-01-01T00:00:00Z') : new Date(0),
    update: vi.fn().mockResolvedValue(undefined),
  };
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  const sequelize = {
    transaction: vi.fn(async (...args) => args.at(-1)(transaction)),
  };
  const models = {
    resolutionSnapshot: retentionModel(),
    registrationObservation: retentionModel(),
    policyDecision: retentionModel(),
    findingHistory: retentionModel(),
    retentionMetadata: { upsert: vi.fn().mockResolvedValue(undefined) },
    retentionLease: {
      findOrCreate: vi.fn().mockResolvedValue([lease]),
      update: vi.fn().mockResolvedValue(undefined),
    },
  };
  return { persistence: { sequelize, models }, models };
}

const configuration = Object.freeze({
  retention: Object.freeze({
    actorEnabled: true,
    leaseMs: 60000,
    batchSize: 10,
    historyDays: 365,
    registrationDays: 90,
  }),
});

describe('runHistoricalEvidenceRetention', () => {
  it('refuses to run when the retention actor is disabled', async () => {
    const { persistence } = createPersistence();
    await expect(
      runHistoricalEvidenceRetention({
        configuration: { retention: { ...configuration.retention, actorEnabled: false } },
        persistence,
        actorId: 'worker-1',
      }),
    ).rejects.toBeInstanceOf(PersistenceError);
  });

  it('leases and deletes only configured bounded batches while recording metadata without deleted content', async () => {
    const { persistence, models } = createPersistence();
    const logger = { info: vi.fn() };

    const result = await runHistoricalEvidenceRetention({
      configuration,
      persistence,
      actorId: 'worker-1',
      logger,
      now: new Date('2026-08-22T00:00:00Z'),
    });

    expect(result).toEqual({
      resolutionSnapshots: 2,
      registrationObservations: 2,
      policyDecisions: 2,
      findingHistory: 2,
    });
    expect(models.resolutionSnapshot.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10, attributes: ['id'] }),
    );
    expect(models.retentionMetadata.upsert).toHaveBeenCalledTimes(4);
    expect(logger.info).toHaveBeenCalledWith(
      'Historical evidence retention batch completed.',
      expect.objectContaining({ deletedCounts: result }),
    );
  });

  it('does not purge when an unexpired lease belongs to another actor', async () => {
    const { persistence, models } = createPersistence({ leasedByOtherActor: true });
    await expect(
      runHistoricalEvidenceRetention({
        configuration,
        persistence,
        actorId: 'worker-1',
        now: new Date('2026-08-22T00:00:00Z'),
      }),
    ).rejects.toBeInstanceOf(PersistenceError);
    expect(models.resolutionSnapshot.destroy).not.toHaveBeenCalled();
  });
});
