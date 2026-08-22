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
    GHOST_RECORDS_RETENTION_RAW_EVIDENCE_DAYS: '0',
    GHOST_RECORDS_RAW_EVIDENCE_ENABLED: 'false',
    GHOST_RECORDS_PROVIDER_CREDENTIALS_JSON: JSON.stringify([
      {
        provider: 'route53',
        secretEnvironmentKeys: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
      },
    ]),
    AWS_ACCESS_KEY_ID: 'AKIATESTACCESSKEY',
    AWS_SECRET_ACCESS_KEY: 'test-secret-access-key',
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
        rawEvidenceDays: 0,
        actorEnabled: false,
        leaseMs: 60000,
        batchSize: 500,
      },
      rawEvidenceEnabled: false,
      registration: {
        allowedRoots: [],
        bootstrapCacheTtlMs: 86400000,
      },
      dns: {
        maxChainDepth: 8,
        maxQueries: 32,
        maxConcurrency: 4,
        queryTimeoutMs: 3000,
        maxAnswers: 100,
      },
      aws: {
        ec2Regions: [],
        approvedExternalPolicies: [],
      },
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

  it('enforces bounded DNS resolver limits through the central schema', () => {
    expect(() =>
      loadConfiguration({
        environment: buildEnvironment({ GHOST_RECORDS_DNS_MAX_CHAIN_DEPTH: '33' }),
      }),
    ).toThrow(ConfigurationError);

    expect(() =>
      loadConfiguration({
        environment: buildEnvironment({ GHOST_RECORDS_DNS_QUERY_TIMEOUT_MS: '30001' }),
      }),
    ).toThrow(ConfigurationError);
  });

  it('resolves declared Route 53 static and session credentials centrally', () => {
    const configuration = loadConfiguration({
      environment: buildEnvironment({
        AWS_SESSION_TOKEN: 'test-session-token',
        GHOST_RECORDS_PROVIDER_CREDENTIALS_JSON: JSON.stringify([
          {
            provider: 'route53',
            secretEnvironmentKeys: [
              'AWS_ACCESS_KEY_ID',
              'AWS_SECRET_ACCESS_KEY',
              'AWS_SESSION_TOKEN',
            ],
          },
        ]),
      }),
    });

    expect(configuration.providerCredentials).toEqual([
      {
        provider: 'route53',
        values: {
          AWS_ACCESS_KEY_ID: 'AKIATESTACCESSKEY',
          AWS_SECRET_ACCESS_KEY: 'test-secret-access-key',
          AWS_SESSION_TOKEN: 'test-session-token',
        },
      },
    ]);
  });

  it('fails closed for missing, unsupported, or duplicate Route 53 credential references', () => {
    expect(() =>
      loadConfiguration({
        environment: buildEnvironment({ AWS_SECRET_ACCESS_KEY: undefined }),
      }),
    ).toThrow(ConfigurationError);

    expect(() =>
      loadConfiguration({
        environment: buildEnvironment({
          GHOST_RECORDS_PROVIDER_CREDENTIALS_JSON: JSON.stringify([
            {
              provider: 'route53',
              secretEnvironmentKeys: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'PATH'],
            },
          ]),
        }),
      }),
    ).toThrow(ConfigurationError);

    expect(() =>
      loadConfiguration({
        environment: buildEnvironment({
          GHOST_RECORDS_PROVIDER_CREDENTIALS_JSON: JSON.stringify([
            {
              provider: 'route53',
              secretEnvironmentKeys: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
            },
            {
              provider: 'route53',
              secretEnvironmentKeys: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
            },
          ]),
        }),
      }),
    ).toThrow(ConfigurationError);
  });

  it('normalizes explicit EC2 regions and expiring approved-external policies', () => {
    const configuration = loadConfiguration({
      environment: buildEnvironment({
        GHOST_RECORDS_AWS_EC2_REGIONS_JSON: JSON.stringify(['us-east-1', 'us-west-2']),
        GHOST_RECORDS_APPROVED_EXTERNAL_POLICIES_JSON: JSON.stringify([
          {
            policyId: 'external-cdn-2026',
            target: 'cdn.partner.example',
            scope: 'route53:123456789012:ZEXAMPLE',
            owner: 'Application Security',
            reason: 'Approved managed CDN dependency',
            expiresAt: '2026-12-31T00:00:00Z',
          },
        ]),
      }),
    });

    expect(configuration.aws).toEqual({
      ec2Regions: ['us-east-1', 'us-west-2'],
      approvedExternalPolicies: [
        {
          policyId: 'external-cdn-2026',
          target: 'cdn.partner.example',
          scope: 'route53:123456789012:ZEXAMPLE',
          owner: 'Application Security',
          reason: 'Approved managed CDN dependency',
          expiresAt: '2026-12-31T00:00:00Z',
        },
      ],
    });
  });

  it('fails closed for malformed, duplicate, or unexpected T7 policy configuration', () => {
    expect(() =>
      loadConfiguration({
        environment: buildEnvironment({ GHOST_RECORDS_AWS_EC2_REGIONS_JSON: '["not-a-region"]' }),
      }),
    ).toThrow(ConfigurationError);

    expect(() =>
      loadConfiguration({
        environment: buildEnvironment({
          GHOST_RECORDS_APPROVED_EXTERNAL_POLICIES_JSON: JSON.stringify([
            {
              policyId: 'duplicate',
              target: '198.51.100.10',
              scope: 'route53:123456789012:ZEXAMPLE',
              owner: 'Application Security',
              reason: 'Temporary exception',
              expiresAt: '2026-12-31T00:00:00Z',
            },
            {
              policyId: 'duplicate',
              target: '198.51.100.11',
              scope: 'route53:123456789012:ZEXAMPLE',
              owner: 'Application Security',
              reason: 'Temporary exception',
              expiresAt: '2026-12-31T00:00:00Z',
            },
          ]),
        }),
      }),
    ).toThrow(ConfigurationError);

    expect(() =>
      loadConfiguration({
        environment: buildEnvironment({ GHOST_RECORDS_AWS_EC2_REGIONS_JSON: '["us-gov-west-1"]' }),
      }),
    ).toThrow(ConfigurationError);

    expect(() =>
      loadConfiguration({
        environment: buildEnvironment({
          GHOST_RECORDS_APPROVED_EXTERNAL_POLICIES_JSON: JSON.stringify([
            {
              policyId: 'invalid-calendar-date',
              target: '198.51.100.10',
              scope: 'route53:123456789012:ZEXAMPLE',
              owner: 'Application Security',
              reason: 'Temporary exception',
              expiresAt: '2026-02-30T00:00:00Z',
            },
          ]),
        }),
      }),
    ).toThrow(ConfigurationError);

    expect(() =>
      loadConfiguration({
        environment: buildEnvironment({
          GHOST_RECORDS_APPROVED_EXTERNAL_POLICIES_JSON: JSON.stringify([
            {
              policyId: 'unexpected-field',
              target: '198.51.100.10',
              scope: 'route53:123456789012:ZEXAMPLE',
              owner: 'Application Security',
              reason: 'Temporary exception',
              expiresAt: '2026-12-31T00:00:00Z',
              wildcard: true,
            },
          ]),
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


describe('T8 minimized registration configuration', () => {
  it('normalizes owner-approved HTTPS RDAP roots and bounded retention controls', () => {
    const configuration = loadConfiguration({
      environment: buildEnvironment({
        GHOST_RECORDS_RETENTION_ACTOR_ENABLED: 'true',
        GHOST_RECORDS_RETENTION_LEASE_MS: '120000',
        GHOST_RECORDS_RETENTION_BATCH_SIZE: '250',
        GHOST_RECORDS_RDAP_ALLOWED_ROOTS_JSON: JSON.stringify([
          'https://rdap.example.test/rdap',
        ]),
      }),
    });

    expect(configuration.registration).toEqual({
      allowedRoots: ['https://rdap.example.test/rdap/'],
      bootstrapCacheTtlMs: 86400000,
    });
    expect(configuration.retention).toMatchObject({
      actorEnabled: true,
      leaseMs: 120000,
      batchSize: 250,
      rawEvidenceDays: 0,
    });
    expect(configuration.rawEvidenceEnabled).toBe(false);
  });

  it('fails closed for raw capture, unsafe roots, duplicate normalized roots, or unsafe retention limits', () => {
    for (const overrides of [
      { GHOST_RECORDS_RAW_EVIDENCE_ENABLED: 'true' },
      { GHOST_RECORDS_RDAP_ALLOWED_ROOTS_JSON: JSON.stringify(['http://rdap.example.test/']) },
      { GHOST_RECORDS_RDAP_ALLOWED_ROOTS_JSON: JSON.stringify(['https://rdap.example.test', 'https://rdap.example.test/']) },
      { GHOST_RECORDS_RETENTION_LEASE_MS: '1' },
    ]) {
      expect(() => loadConfiguration({ environment: buildEnvironment(overrides) })).toThrow(
        ConfigurationError,
      );
    }
  });
});
