import { describe, expect, it, vi } from 'vitest';

import { PersistenceError } from '../../errors/application-error.js';
import {
  checkDatabaseReadiness,
  closeSequelizeClient,
  createSequelizeClient,
} from '../../persistence/connection.js';

function buildConfiguration(overrides = {}) {
  return {
    database: {
      database: 'ghost_records',
      username: 'ghost_records_service',
      password: 'database-password',
      host: 'mysql.internal.example',
      port: 3306,
      tlsEnabled: true,
      maxReplicas: 1,
      connectionBudget: 5,
      migrationActorEnabled: false,
      pool: {
        min: 0,
        max: 5,
        acquireMs: 30000,
        idleMs: 10000,
      },
      ...overrides,
    },
  };
}

describe('Sequelize persistence connection', () => {
  it('creates a MySQL Sequelize client with TLS, modest pool settings, and ORM SQL logging disabled', () => {
    const constructor = vi.fn();

    createSequelizeClient(buildConfiguration(), {
      SequelizeConstructor: constructor,
    });

    expect(constructor).toHaveBeenCalledWith(
      'ghost_records',
      'ghost_records_service',
      'database-password',
      {
        host: 'mysql.internal.example',
        port: 3306,
        dialect: 'mysql',
        logging: false,
        dialectOptions: { ssl: { rejectUnauthorized: true } },
        pool: { min: 0, max: 5, acquire: 30000, idle: 10000 },
      },
    );
  });

  it('does not configure a TLS dialect option when the validated owner configuration disables TLS', () => {
    const constructor = vi.fn();

    createSequelizeClient(buildConfiguration({ tlsEnabled: false }), {
      SequelizeConstructor: constructor,
    });

    expect(constructor.mock.calls[0][3].dialectOptions).toBeUndefined();
  });

  it('reports a safe typed failure when database readiness cannot be established', async () => {
    const sequelize = {
      authenticate: vi
        .fn()
        .mockRejectedValue(new Error('mysql://ghost:database-password@mysql.internal')),
    };

    await expect(checkDatabaseReadiness(sequelize)).rejects.toBeInstanceOf(
      PersistenceError,
    );

    try {
      await checkDatabaseReadiness(sequelize);
    } catch (error) {
      expect(error.toSafeJSON()).toEqual({
        code: 'PERSISTENCE_FAILURE',
        message: 'Database readiness check failed.',
        details: { operation: 'authenticate' },
      });
    }
  });

  it('closes the supplied Sequelize client through the persistence boundary', async () => {
    const sequelize = { close: vi.fn().mockResolvedValue(undefined) };

    await expect(closeSequelizeClient(sequelize)).resolves.toBeUndefined();
    expect(sequelize.close).toHaveBeenCalledOnce();
  });
});
