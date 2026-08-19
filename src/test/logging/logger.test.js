import { describe, expect, it } from 'vitest';

import { ConfigurationError } from '../../errors/application-error.js';
import { createLogger, serializeError } from '../../logging/logger.js';
import { REDACTED_VALUE } from '../../logging/redact.js';

describe('structured logger', () => {
  it('redacts nested sensitive values before emitting a structured record', () => {
    const records = [];
    const logger = createLogger({
      source: 'test.logger',
      sink: (entry) => records.push(entry),
      clock: () => '2026-08-19T00:00:00.000Z',
    });

    logger.info('Configuration loaded.', {
      config: {
        databasePassword: 'database-password',
        nested: {
          apiKey: 'provider-api-key',
          awsAccessKeyId: 'AKIAEXAMPLE',
          safeValue: 'visible',
        },
      },
      authorization: 'Bearer session-token',
      connectionString: 'mysql://ghost:database-password@mysql.internal/ghost_records',
      source: 'untrusted-source',
      level: 'http',
      message: 'untrusted-message',
    });

    expect(records).toEqual([
      {
        timestamp: '2026-08-19T00:00:00.000Z',
        level: 'info',
        source: 'test.logger',
        message: 'Configuration loaded.',
        config: {
          databasePassword: REDACTED_VALUE,
          nested: {
          apiKey: REDACTED_VALUE,
          awsAccessKeyId: REDACTED_VALUE,
          safeValue: 'visible',
          },
        },
        authorization: REDACTED_VALUE,
        connectionString: 'mysql://ghost:[REDACTED]@mysql.internal/ghost_records',
      },
    ]);
  });

  it('enforces the reusable HTTP request-record requirements', () => {
    const logger = createLogger({
      source: 'test.http',
      sink: () => {},
    });

    expect(() => logger.http('HTTP request received.', {})).toThrow(
      'HTTP request records require reqInfo.',
    );

    expect(
      logger.http('HTTP request received.', {
        reqInfo: {
          requestID: 'ce2a6a32-f3e3-4d95-bf52-40d1dc0593a4',
          hostname: 'ghost-records.internal',
          path: '/future-route',
        },
      }),
    ).toMatchObject({
      level: 'http',
      source: 'test.http',
    });
  });

  it('redacts sensitive structured error details', () => {
    const error = new ConfigurationError({
      message: 'Database configuration is invalid.',
      details: {
        password: 'database-password',
        retryable: false,
      },
    });

    expect(serializeError(error)).toEqual({
      name: 'ConfigurationError',
      message: 'Database configuration is invalid.',
      code: 'CONFIGURATION_INVALID',
      details: {
        password: REDACTED_VALUE,
        retryable: false,
      },
    });
  });
});
