import { defineMigrationLedger } from './migration-ledger.js';
import { defineMigrationLease } from './migration-lease.js';

export function initializePersistenceModels(sequelize) {
  return Object.freeze({
    migrationLedger: defineMigrationLedger(sequelize),
    migrationLease: defineMigrationLease(sequelize),
  });
}
