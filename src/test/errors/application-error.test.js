import { describe, expect, it } from 'vitest';

import {
  ApplicationError,
  ConfigurationError,
  ValidationError,
} from '../../errors/application-error.js';

describe('application error taxonomy', () => {
  it('serializes stable safe details for configuration failures', () => {
    const error = new ConfigurationError({
      message: 'Configuration is invalid.',
      details: {
        field: 'GHOST_RECORDS_MYSQL_HOST',
        password: 'database-password',
      },
    });

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error.statusCode).toBe(500);
    expect(error.toSafeJSON()).toEqual({
      code: 'CONFIGURATION_INVALID',
      message: 'Configuration is invalid.',
      details: {
        field: 'GHOST_RECORDS_MYSQL_HOST',
        password: '[REDACTED]',
      },
    });
  });

  it('uses a client-safe validation code for invalid boundary data', () => {
    const error = new ValidationError({ message: 'Input is invalid.' });

    expect(error.statusCode).toBe(400);
    expect(error.toSafeJSON()).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Input is invalid.',
    });
  });
});
