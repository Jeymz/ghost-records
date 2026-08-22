import { ValidationError } from '../../errors/application-error.js';
import { createHistoricalEvidenceMigration } from './20260822-create-historical-evidence.js';

export const migrations = Object.freeze([createHistoricalEvidenceMigration]);

export function validateMigrationManifest(manifest = migrations) {
  const migrationIds = new Set();

  for (const migration of manifest) {
    if (!migration || typeof migration !== 'object') {
      throw new ValidationError({
        message: 'Every migration manifest entry must be an object.',
      });
    }

    if (typeof migration.id !== 'string' || migration.id.trim().length === 0) {
      throw new ValidationError({
        message: 'Every migration must have a non-empty immutable id.',
      });
    }

    if (migrationIds.has(migration.id)) {
      throw new ValidationError({
        message: `Duplicate migration id: ${migration.id}.`,
      });
    }

    if (typeof migration.up !== 'function' || typeof migration.down !== 'function') {
      throw new ValidationError({
        message: `Migration ${migration.id} must provide up and down functions.`,
      });
    }

    migrationIds.add(migration.id);
  }

  return true;
}
