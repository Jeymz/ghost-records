import { Sequelize } from 'sequelize';

import { PersistenceError } from '../errors/application-error.js';
import { enforceSequelizeUuidBoundary } from '../security/uuid-advisory-mitigation.js';

function buildDialectOptions({ tlsEnabled }) {
  if (!tlsEnabled) {
    return undefined;
  }

  return {
    ssl: {
      rejectUnauthorized: true,
    },
  };
}

export function createSequelizeClient(configuration, {
  SequelizeConstructor = Sequelize,
} = {}) {
  enforceSequelizeUuidBoundary();

  const { database } = configuration;

  return new SequelizeConstructor(
    database.database,
    database.username,
    database.password,
    {
      host: database.host,
      port: database.port,
      dialect: 'mysql',
      logging: false,
      dialectOptions: buildDialectOptions(database),
      pool: {
        min: database.pool.min,
        max: database.pool.max,
        acquire: database.pool.acquireMs,
        idle: database.pool.idleMs,
      },
    },
  );
}

export async function checkDatabaseReadiness(sequelize) {
  try {
    await sequelize.authenticate();
    return {
      ready: true,
    };
  } catch (error) {
    throw new PersistenceError({
      message: 'Database readiness check failed.',
      details: { operation: 'authenticate' },
      cause: error,
    });
  }
}

export async function closeSequelizeClient(sequelize) {
  try {
    await sequelize.close();
  } catch (error) {
    throw new PersistenceError({
      message: 'Database connection shutdown failed.',
      details: { operation: 'close' },
      cause: error,
    });
  }
}
