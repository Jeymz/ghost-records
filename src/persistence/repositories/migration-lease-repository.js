import { Op } from 'sequelize';

import { PersistenceError } from '../../errors/application-error.js';
import { MIGRATION_LEASE_NAME } from '../models/migration-lease.js';

export function createMigrationLeaseRepository({ sequelize, migrationLease }) {
  return Object.freeze({
    async acquire({ actorId, now, leaseExpiresAt }) {
      await sequelize.transaction(async (transaction) => {
        const currentLease = await migrationLease.findByPk(MIGRATION_LEASE_NAME, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });

        if (
          currentLease &&
          currentLease.leaseOwner !== actorId &&
          currentLease.leaseExpiresAt > now
        ) {
          throw new PersistenceError({
            message: 'Another migration actor currently holds the database migration lease.',
            details: { operation: 'acquire-migration-lease' },
          });
        }

        if (currentLease) {
          await currentLease.update(
            { leaseOwner: actorId, leaseExpiresAt },
            { transaction },
          );
          return;
        }

        await migrationLease.create(
          {
            lockName: MIGRATION_LEASE_NAME,
            leaseOwner: actorId,
            leaseExpiresAt,
          },
          { transaction },
        );
      });
    },

    async release({ actorId, now }) {
      await sequelize.transaction(async (transaction) => {
        await migrationLease.update(
          { leaseExpiresAt: now },
          {
            where: {
              lockName: MIGRATION_LEASE_NAME,
              leaseOwner: actorId,
              leaseExpiresAt: { [Op.gt]: now },
            },
            transaction,
          },
        );
      });
    },
  });
}
