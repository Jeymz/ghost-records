import { ValidationError } from '../errors/application-error.js';

const AFFECTED_UUID_ALGORITHMS = new Set(['v3', 'v5', 'v6']);

export const UUID_ADVISORY_MITIGATION_ID = 'GHSA-w5hq-g745-h8pq';

export function enforceUuidAdvisoryMitigation({
  algorithm,
  outputBuffer = undefined,
  offset = undefined,
}) {
  if (AFFECTED_UUID_ALGORITHMS.has(algorithm)) {
    throw new ValidationError({
      message: 'UUID v3, v5, and v6 are disabled by the active UUID advisory mitigation.',
      details: {
        advisory: UUID_ADVISORY_MITIGATION_ID,
        algorithm,
      },
    });
  }

  if (outputBuffer !== undefined || offset !== undefined) {
    throw new ValidationError({
      message: 'Caller-supplied UUID output buffers and offsets are disabled by the active UUID advisory mitigation.',
      details: {
        advisory: UUID_ADVISORY_MITIGATION_ID,
      },
    });
  }

  return true;
}

export function enforceSequelizeUuidBoundary() {
  return enforceUuidAdvisoryMitigation({ algorithm: 'v4' });
}
