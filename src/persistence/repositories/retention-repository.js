import { Op, Transaction } from 'sequelize';
import { PersistenceError, ValidationError } from '../../errors/application-error.js';

function assertActor(actorId) {
  if (typeof actorId !== 'string' || actorId.trim().length === 0) {
    throw new ValidationError({ message: 'Retention execution requires a non-empty actor id.' });
  }
}

export function createRetentionRepository({ sequelize, models }) {
  const {
    resolutionSnapshot,
    registrationObservation,
    policyDecision,
    findingHistory,
    retentionMetadata,
    retentionLease,
  } = models;

  async function acquireLease({ actorId, now, leaseExpiresAt }) {
    assertActor(actorId);
    try {
      await sequelize.transaction(async (transaction) => {
        const [lease] = await retentionLease.findOrCreate({
          where: { leaseName: 'historical-evidence-retention' },
          defaults: { leaseName: 'historical-evidence-retention', leaseOwner: actorId, leaseExpiresAt },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });

        if (lease.leaseOwner !== actorId && lease.leaseExpiresAt > now) {
          throw new PersistenceError({
            message: 'Historical evidence retention is leased by another actor.',
            details: { operation: 'acquire-retention-lease' },
          });
        }

        await lease.update({ leaseOwner: actorId, leaseExpiresAt }, { transaction });
      });
    } catch (error) {
      if (error instanceof PersistenceError || error instanceof ValidationError) throw error;
      throw new PersistenceError({
        message: 'Unable to acquire the historical evidence retention lease.',
        details: { operation: 'acquire-retention-lease' },
        cause: error,
      });
    }
  }

  async function releaseLease({ actorId, now }) {
    await retentionLease.update(
      { leaseExpiresAt: now },
      { where: { leaseName: 'historical-evidence-retention', leaseOwner: actorId } },
    );
  }

  async function purgeModel({ model, timestampField, cutoff, batchSize, transaction }) {
    const rows = await model.findAll({
      where: { [timestampField]: { [Op.lt]: cutoff } },
      order: [['id', 'ASC']],
      limit: batchSize,
      attributes: ['id'],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (rows.length === 0) return 0;
    return model.destroy({
      where: { id: rows.map((row) => row.id) },
      transaction,
    });
  }

  async function purgeMetadata({ resourceType, cutoff, now, transaction }) {
    await retentionMetadata.upsert(
      { resourceType, purgedThrough: cutoff, lastRunAt: now, updatedAt: now },
      { transaction },
    );
  }

  return Object.freeze({
    acquireLease,
    releaseLease,
    async purgeHistoricalEvidence({ cutoffs, batchSize, now = new Date() }) {
      if (!Number.isInteger(batchSize) || batchSize < 1) {
        throw new ValidationError({ message: 'Retention batch size must be a positive integer.' });
      }

      return sequelize.transaction(
        { isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED },
        async (transaction) => {
          const results = {
            resolutionSnapshots: await purgeModel({
              model: resolutionSnapshot,
              timestampField: 'observedAt',
              cutoff: cutoffs.history,
              batchSize,
              transaction,
            }),
            registrationObservations: await purgeModel({
              model: registrationObservation,
              timestampField: 'observedAt',
              cutoff: cutoffs.registration,
              batchSize,
              transaction,
            }),
            policyDecisions: await purgeModel({
              model: policyDecision,
              timestampField: 'evaluatedAt',
              cutoff: cutoffs.history,
              batchSize,
              transaction,
            }),
            findingHistory: await purgeModel({
              model: findingHistory,
              timestampField: 'recordedAt',
              cutoff: cutoffs.history,
              batchSize,
              transaction,
            }),
          };

          await Promise.all([
            purgeMetadata({ resourceType: 'resolution-snapshots', cutoff: cutoffs.history, now, transaction }),
            purgeMetadata({ resourceType: 'registration-observations', cutoff: cutoffs.registration, now, transaction }),
            purgeMetadata({ resourceType: 'policy-decisions', cutoff: cutoffs.history, now, transaction }),
            purgeMetadata({ resourceType: 'finding-history', cutoff: cutoffs.history, now, transaction }),
          ]);

          return results;
        },
      );
    },
  });
}
