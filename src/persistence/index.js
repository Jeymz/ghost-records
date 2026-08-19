import {
  checkDatabaseReadiness,
  closeSequelizeClient,
  createSequelizeClient,
} from './connection.js';
import { migrations } from './migrations/manifest.js';
import {
  rollbackLastMigration,
  runMigrations,
} from './migrations/runner.js';
import { initializePersistenceModels } from './models/index.js';

export function createPersistenceLayer(configuration, dependencies = {}) {
  const sequelize = createSequelizeClient(configuration, dependencies);
  const models = initializePersistenceModels(sequelize);

  return Object.freeze({
    sequelize,
    models,
    checkReadiness: () => checkDatabaseReadiness(sequelize),
    close: () => closeSequelizeClient(sequelize),
    runMigrations: ({ actorId, logger, manifest = migrations }) =>
      runMigrations({
        configuration,
        sequelize,
        models,
        actorId,
        logger,
        manifest,
      }),
    rollbackLastMigration: ({ actorId, logger, manifest = migrations }) =>
      rollbackLastMigration({
        configuration,
        sequelize,
        models,
        actorId,
        logger,
        manifest,
      }),
  });
}
