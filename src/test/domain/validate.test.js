import { describe, expect, it } from 'vitest';

import { ValidationError } from '../../errors/application-error.js';
import { validateDomainObject } from '../../domain/validate.js';
import {
  completeCoverageEvent,
  dnsObservation,
  dnsRecord,
  dnsZone,
  finding,
  ownershipEvidence,
  providerAccount,
  scanArtifact,
  scanJob,
} from '../fixtures/domain/canonical-fixtures.js';

describe('canonical domain validation', () => {
  it.each([
    ['providerAccount', providerAccount],
    ['dnsZone', dnsZone],
    ['dnsRecord', dnsRecord],
    ['dnsObservation', dnsObservation],
    ['ownershipEvidence', ownershipEvidence],
    ['coverageEvent', completeCoverageEvent],
    ['scanJob', scanJob],
    ['finding', finding],
    ['scanArtifact', scanArtifact],
  ])('validates and freezes a canonical %s object', (schemaName, fixture) => {
    const validated = validateDomainObject(schemaName, fixture);

    expect(validated).toEqual(fixture);
    expect(validated).not.toBe(fixture);
    expect(Object.isFrozen(validated)).toBe(true);
  });

  it('rejects an unknown field on a canonical record', () => {
    expect(() =>
      validateDomainObject('dnsRecord', {
        ...dnsRecord,
        unexpectedProviderPayload: 'must-not-cross-boundary',
      }),
    ).toThrow(ValidationError);
  });

  it('rejects malformed canonical evidence before downstream processing', () => {
    expect(() =>
      validateDomainObject('ownershipEvidence', {
        ...ownershipEvidence,
        classification: 'probably-owned',
      }),
    ).toThrow('Canonical domain object validation failed.');

    expect(() =>
      validateDomainObject('dnsRecord', {
        ...dnsRecord,
        ttl: '300',
      }),
    ).toThrow('Canonical domain object validation failed.');
  });

  it('rejects an unknown canonical schema selection', () => {
    expect(() => validateDomainObject('unapprovedObject', {})).toThrow(
      'Unknown canonical domain schema requested.',
    );
  });

  it('rejects non-cloneable data at the trust boundary', () => {
    expect(() =>
      validateDomainObject('providerAccount', {
        ...providerAccount,
        untrustedFunction: () => {},
      }),
    ).toThrow('Canonical domain object must be cloneable structured data.');
  });
});
