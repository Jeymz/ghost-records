import { describe, expect, it } from 'vitest';

import { ConfigurationError } from '../../errors/application-error.js';
import { loadConfiguration } from '../../config/load-configuration.js';

function buildEnvironment(overrides = {}) {
  return {
    NODE_ENV: 'test',
    GHOST_RECORDS_DNS_ONLY: 'true',
    GHOST_RECORDS_CONTROL_PLANE_ENABLED: 'false',
    GHOST_RECORDS_MYSQL_HOST: 'mysql.internal.example',
    GHOST_RECORDS_MYSQL_PORT: '3306',
    GHOST_RECORDS_MYSQL_DATABASE: 'ghost_records',
    GHOST_RECORDS_MYSQL_USERNAME: 'ghost_records_service',
    GHOST_RECORDS_MYSQL_PASSWORD: 'database-password',
    GHOST_RECORDS_MYSQL_TLS_ENABLED: 'true',
    GHOST_RECORDS_MAX_REPLICAS: '2',
    GHOST_RECORDS_DB_POOL_MIN: '0',
    GHOST_RECORDS_DB_POOL_MAX: '5',
    GHOST_RECORDS_DB_POOL_ACQUIRE_MS: '30000',
    GHOST_RECORDS_DB_POOL_IDLE_MS: '10000',
    GHOST_RECORDS_DB_CONNECTION_BUDGET: '10',
    GHOST_RECORDS_MIGRATION_ACTOR_ENABLED: 'false',
    GHOST_RECORDS_RETENTION_HISTORY_DAYS: '365',
    GHOST_RECORDS_RETENTION_REGISTRATION_DAYS: '90',
    GHOST_RECORDS_RETENTION_ARTIFACT_DAYS: '90',
    GHOST_RECORDS_RETENTION_RAW_EVIDENCE_DAYS: '30',
    GHOST_RECORDS_RAW_EVIDENCE_ENABLED: 'false',
    GHOST_RECORDS_PROVIDER_CREDENTIALS_JSON: JSON.stringify([
      {
        provider: 'route53',
        secretEnvironmentKeys: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
      },
    ]),
    ...overrides,
  };
}

describe('loadConfiguration', () => {
  it('returns a deeply frozen normalized configuration', () => {
    const configuration = loadConfiguration({ environment: buildEnvironment() });

    expect(configuration).toMatchObject({
      environment: 'test',
      dnsOnly: true,
      controlPlane: { enabled: false },
      database: {
        host: 'mysql.internal.example',
        port: 3306,
        tlsEnabled: true,
        maxReplicas: 2,
        connectionBudget: 10,
        migrationActorEnabled: false,
        pool: { min: 0, max: 5, acquireMs: 30000, idleMs: 10000 },
      },
      retention: {
        historyDays: 365,
        registrationDays: 90,
        artifactDays: 90,
        rawEvidenceDays: 30,
      },
      rawEvidenceEnabled: false,
    });
    expect(Object.isFrozen(configuration)).toBe(true);
    expect(Object.isFrozen(configuration.database.pool)).toBe(true);
  });

  it('fails closed when a required configuration value is missing without exposing its value', () => {
    const secret = 'do-not-expose-this-password';

    try {
      loadConfiguration({
        environment: buildEnvironment({ GHOST_RECORDS_MYSQL_PASSWORD: undefined }),
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      expect(error.toSafeJSON()).not.toContain(secret);
      expect(error.toSafeJSON()).toMatchObject({ code: 'CONFIGURATION_INVALID' });
      return;
    }

    throw new Error('Expected a ConfigurationError.');
  });

  it('rejects unknown Ghost Records configuration keys', () => {
    expect(() =>
      loadConfiguration({
        environment: buildEnvironment({ GHOST_RECORDS_UNSAFE_OVERRIDE: 'true' }),
      }),
    ).toThrow(ConfigurationError);
  });

  it('enforces DNS-only operation and pool ordering through AJV schemas', () => {
    expect(() =>
      loadConfiguration({
        environment: buildEnvironment({ GHOST_RECORDS_DNS_ONLY: 'false' }),
      }),
    ).toThrow(ConfigurationError);

    expect(() =>
      loadConfiguration({
        environment: buildEnvironment({
          GHOST_RECORDS_DB_POOL_MIN: '6',
          GHOST_RECORDS_DB_POOL_MAX: '5',
        }),
      }),
    ).toThrow(ConfigurationError);

    expect(() =>
      loadConfiguration({
        environment: buildEnvironment({
          GHOST_RECORDS_MAX_REPLICAS: '3',
          GHOST_RECORDS_DB_POOL_MAX: '5',
          GHOST_RECORDS_DB_CONNECTION_BUDGET: '14',
        }),
      }),
    ).toThrow(ConfigurationError);
  });

  it('rejects malformed or unexpected provider credential references', () => {
    expect(() =>
      loadConfiguration({
        environment: buildEnvironment({
          GHOST_RECORDS_PROVIDER_CREDENTIALS_JSON: '{not-json}',
        }),
      }),
    ).toThrow(ConfigurationError);

    expect(() =>
      loadConfiguration({
        environment: buildEnvironment({
          GHOST_RECORDS_PROVIDER_CREDENTIALS_JSON: JSON.stringify([
            {
              provider: 'route53',
              secretEnvironmentKeys: ['AWS_ACCESS_KEY_ID'],
              unexpected: true,
            },
          ]),
        }),
      }),
    ).toThrow(ConfigurationError);
  });
});
