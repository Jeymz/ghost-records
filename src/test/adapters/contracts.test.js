import { describe, expect, it, vi } from 'vitest';

import { createOwnershipAdapter, createProviderAdapter } from '../../adapters/contracts.js';
import { ValidationError } from '../../errors/application-error.js';
import { validateDomainObject } from '../../domain/validate.js';
import {
  authorizationFailureCoverageEvent,
  ownershipEvidenceRequest,
  ownershipSuccessOutcome,
  partialCoverageEvent,
  providerAuthorizationFailureOutcome,
  providerCollectionRequest,
  providerPaginationFailureOutcome,
  providerPartialOutcome,
  providerSuccessOutcome,
} from '../fixtures/domain/canonical-fixtures.js';

describe('adapter contracts', () => {
  it.each([
    ['success', providerSuccessOutcome],
    ['partial coverage', providerPartialOutcome],
    ['authorization failure', providerAuthorizationFailureOutcome],
    ['pagination failure', providerPaginationFailureOutcome],
  ])('validates a typed provider %s outcome', (_name, outcome) => {
    expect(validateDomainObject('providerCollectionOutcome', outcome)).toEqual(
      outcome,
    );
  });

  it('rejects a failed coverage event masquerading as an empty successful inventory', () => {
    expect(() =>
      validateDomainObject('providerCollectionOutcome', {
        ...providerSuccessOutcome,
        zones: [],
        records: [],
        coverageEvents: [authorizationFailureCoverageEvent],
      }),
    ).toThrow(ValidationError);
  });

  it('validates provider requests and outcomes around an adapter operation', async () => {
    const collect = vi.fn().mockResolvedValue(providerSuccessOutcome);
    const adapter = createProviderAdapter({ provider: 'route53', collect });

    await expect(adapter.collect(providerCollectionRequest)).resolves.toEqual(
      providerSuccessOutcome,
    );
    expect(collect).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'route53' }),
    );
    expect(Object.isFrozen(collect.mock.calls[0][0])).toBe(true);
  });

  it('rejects a request whose provider does not match the adapter', async () => {
    const adapter = createProviderAdapter({
      provider: 'route53',
      collect: vi.fn(),
    });

    await expect(
      adapter.collect({ ...providerCollectionRequest, provider: 'azure-dns' }),
    ).rejects.toThrow('request provider does not match');
  });

  it('rejects a provider operation that returns an invalid partial coverage contract', async () => {
    const adapter = createProviderAdapter({
      provider: 'route53',
      collect: vi.fn().mockResolvedValue({
        ...providerPartialOutcome,
        coverageEvents: [partialCoverageEvent, authorizationFailureCoverageEvent],
      }),
    });

    await expect(adapter.collect(providerCollectionRequest)).rejects.toThrow(
      ValidationError,
    );
  });

  it('validates ownership evidence requests and typed outcomes around an adapter operation', async () => {
    const collectEvidence = vi.fn().mockResolvedValue(ownershipSuccessOutcome);
    const adapter = createOwnershipAdapter({ collectEvidence });

    await expect(
      adapter.collectEvidence(ownershipEvidenceRequest),
    ).resolves.toEqual(ownershipSuccessOutcome);
    expect(collectEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ subject: '203.0.113.10' }),
    );
  });

  it('rejects adapter creation without the required operation function', () => {
    expect(() => createProviderAdapter({ provider: 'route53' })).toThrow(
      'Provider adapters require an operation function.',
    );
    expect(() => createOwnershipAdapter({})).toThrow(
      'Ownership adapters require an operation function.',
    );
  });
});
