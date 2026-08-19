import { describe, expect, it } from 'vitest';

import {
  enforceSequelizeUuidBoundary,
  enforceUuidAdvisoryMitigation,
  UUID_ADVISORY_MITIGATION_ID,
} from '../../security/uuid-advisory-mitigation.js';

describe('UUID advisory mitigation', () => {
  it('allows the non-buffered UUIDv4 boundary used by Sequelize', () => {
    expect(enforceSequelizeUuidBoundary()).toBe(true);
    expect(enforceUuidAdvisoryMitigation({ algorithm: 'v4' })).toBe(true);
  });

  it.each(['v3', 'v5', 'v6'])(
    'rejects affected UUID algorithm %s',
    (algorithm) => {
      expect(() => enforceUuidAdvisoryMitigation({ algorithm })).toThrow(
        'disabled by the active UUID advisory mitigation',
      );
    },
  );

  it('rejects caller-supplied output buffers and offsets for all UUID algorithms', () => {
    expect(() =>
      enforceUuidAdvisoryMitigation({
        algorithm: 'v4',
        outputBuffer: new Uint8Array(16),
      }),
    ).toThrow('Caller-supplied UUID output buffers and offsets are disabled');

    expect(() =>
      enforceUuidAdvisoryMitigation({ algorithm: 'v4', offset: 0 }),
    ).toThrow('Caller-supplied UUID output buffers and offsets are disabled');
  });

  it('records the active advisory identifier in safe error details', () => {
    try {
      enforceUuidAdvisoryMitigation({ algorithm: 'v5' });
    } catch (error) {
      expect(error.toSafeJSON()).toMatchObject({
        details: { advisory: UUID_ADVISORY_MITIGATION_ID },
      });
      return;
    }

    throw new Error('Expected advisory mitigation to reject UUIDv5.');
  });
});
