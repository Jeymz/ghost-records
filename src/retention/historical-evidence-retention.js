import { PersistenceError, ValidationError } from '../errors/application-error.js';
import { createRetentionRepository } from '../persistence/repositories/retention-repository.js';

function cutoffFromDays(now, days) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function assertRetentionActor(configuration, actorId) {
  if (!configuration.retention.actorEnabled) {
    throw new PersistenceError({
      message: 'Historical evidence retention is disabled for this application instance.',
      details: { operation: 'run-retention' },
    });
  }

  if (typeof actorId !== 'string' || actorId.trim().length === 0) {
    throw new ValidationError({ message: 'Retention requires a non-empty actor id.' });
  }
}

export async function runHistoricalEvidenceRetention({
  configuration,
  persistence,
  actorId,
  logger,
  now = new Date(),
}) {
  assertRetentionActor(configuration, actorId);

  const repository = createRetentionRepository({
    sequelize: persistence.sequelize,
    models: persistence.models,
  });
  const leaseExpiresAt = new Date(now.getTime() + configuration.retention.leaseMs);

  await repository.acquireLease({ actorId, now, leaseExpiresAt });
  try {
    const results = await repository.purgeHistoricalEvidence({
      cutoffs: {
        history: cutoffFromDays(now, configuration.retention.historyDays),
        registration: cutoffFromDays(now, configuration.retention.registrationDays),
      },
      batchSize: configuration.retention.batchSize,
      now,
    });
    logger?.info('Historical evidence retention batch completed.', {
      component: 'historical-evidence-retention',
      deletedCounts: results,
    });
    return results;
  } finally {
    await repository.releaseLease({ actorId, now: new Date() });
  }
}
