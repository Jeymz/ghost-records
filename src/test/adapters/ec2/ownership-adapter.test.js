import { describe, expect, it, vi } from 'vitest';

import { createAwsEipOwnershipAdapter } from '../../../adapters/ec2/ownership-adapter.js';
import {
  callerIdentityXml,
  emptyAddressesXml,
  ownedCrossAccountAddressXml,
  ownedIdleAddressXml,
} from '../../fixtures/aws/ownership-responses.js';

const scope = 'route53:123456789012:ZEXAMPLE';
const now = () => new Date('2026-08-20T12:00:00Z');

function xmlResponse(xml, status = 200) {
  return new Response(xml, {
    status,
    headers: { 'content-type': 'text/xml' },
  });
}

function configuration({ regions = ['us-east-1'], policies = [], includeCredentials = true } = {}) {
  return {
    aws: {
      ec2Regions: regions,
      approvedExternalPolicies: policies,
    },
    providerCredentials: includeCredentials
      ? [
          {
            provider: 'route53',
            values: {
              AWS_ACCESS_KEY_ID: 'AKIATESTACCESSKEY',
              AWS_SECRET_ACCESS_KEY: 'test-secret-access-key',
            },
          },
        ]
      : [],
  };
}

function request(overrides = {}) {
  return {
    subject: '198.51.100.10',
    subjectType: 'ipv4',
    scope,
    provider: 'route53',
    ...overrides,
  };
}

describe('AWS EIP ownership adapter', () => {
  it('classifies an owned idle EIP from complete read-only inventory evidence', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(xmlResponse(callerIdentityXml))
      .mockResolvedValueOnce(xmlResponse(ownedIdleAddressXml));
    const adapter = createAwsEipOwnershipAdapter({
      configuration: configuration(),
      fetchImpl,
      now,
      sleep: vi.fn(),
    });

    await expect(adapter.collectEvidence(request())).resolves.toMatchObject({
      outcome: 'success',
      evidence: {
        classification: 'owned',
        coverage: 'complete',
        confidence: 'high',
        details: {
          credentialAccountId: '123456789012',
          allocationId: 'eipalloc-0123456789abcdef0',
          associationState: 'idle',
          region: 'us-east-1',
        },
      },
    });
  });

  it('retains cross-account association as owned EIP context rather than an unowned claim', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(xmlResponse(callerIdentityXml))
      .mockResolvedValueOnce(xmlResponse(ownedCrossAccountAddressXml));
    const adapter = createAwsEipOwnershipAdapter({
      configuration: configuration(),
      fetchImpl,
      now,
      sleep: vi.fn(),
    });

    await expect(adapter.collectEvidence(request())).resolves.toMatchObject({
      evidence: {
        classification: 'owned',
        details: {
          associationState: 'cross-account-associated',
          networkInterfaceOwnerId: '210987654321',
        },
      },
    });
  });

  it('honors only an active exact-match policy and does not contact AWS for that approved external target', async () => {
    const fetchImpl = vi.fn();
    const adapter = createAwsEipOwnershipAdapter({
      configuration: configuration({
        policies: [
          {
            policyId: 'partner-cdn-2026',
            target: 'cdn.partner.example',
            scope,
            owner: 'Application Security',
            reason: 'Approved managed CDN dependency',
            expiresAt: '2026-12-31T00:00:00Z',
          },
        ],
      }),
      fetchImpl,
      now,
      sleep: vi.fn(),
    });

    await expect(
      adapter.collectEvidence(request({ subject: 'cdn.partner.example', subjectType: 'hostname' })),
    ).resolves.toMatchObject({
      outcome: 'success',
      evidence: {
        classification: 'approved-external',
        details: { policyId: 'partner-cdn-2026' },
      },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not suppress expired policy records and returns complete not-found EIP evidence', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(xmlResponse(callerIdentityXml))
      .mockResolvedValueOnce(xmlResponse(emptyAddressesXml));
    const adapter = createAwsEipOwnershipAdapter({
      configuration: configuration({
        policies: [
          {
            policyId: 'expired-eip',
            target: '198.51.100.10',
            scope,
            owner: 'Application Security',
            reason: 'Expired maintenance exception',
            expiresAt: '2026-01-01T00:00:00Z',
          },
        ],
      }),
      fetchImpl,
      now,
      sleep: vi.fn(),
    });

    await expect(adapter.collectEvidence(request())).resolves.toMatchObject({
      outcome: 'success',
      evidence: {
        classification: 'not-found',
        coverage: 'complete',
        details: { policyId: 'expired-eip' },
      },
    });
  });

  it('returns partial unknown evidence when configured regional inventory is unavailable', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(xmlResponse(callerIdentityXml))
      .mockResolvedValueOnce(xmlResponse(emptyAddressesXml))
      .mockResolvedValueOnce(xmlResponse('<error />', 403));
    const adapter = createAwsEipOwnershipAdapter({
      configuration: configuration({ regions: ['us-east-1', 'us-west-2'] }),
      fetchImpl,
      now,
      sleep: vi.fn(),
    });

    await expect(adapter.collectEvidence(request())).resolves.toMatchObject({
      outcome: 'partial',
      evidence: { classification: 'unknown', coverage: 'partial' },
      coverageEvents: [
        expect.objectContaining({ status: 'complete', reason: 'complete' }),
        expect.objectContaining({ status: 'partial', reason: 'authorization' }),
      ],
    });
  });

  it('treats caller-account identity failure as unavailable ownership coverage', async () => {
    const adapter = createAwsEipOwnershipAdapter({
      configuration: configuration(),
      fetchImpl: vi.fn().mockResolvedValue(xmlResponse('<error />', 403)),
      now,
      sleep: vi.fn(),
    });

    await expect(adapter.collectEvidence(request())).resolves.toMatchObject({
      outcome: 'failure',
      failure: { category: 'authorization', retryable: false },
      coverageEvents: [expect.objectContaining({ status: 'failed', reason: 'authorization' })],
    });
  });

  it('does not infer AWS ownership for non-IP subjects or absent AWS credentials', async () => {
    const fetchImpl = vi.fn();
    const nonIpAdapter = createAwsEipOwnershipAdapter({
      configuration: configuration(),
      fetchImpl,
      now,
      sleep: vi.fn(),
    });
    await expect(
      nonIpAdapter.collectEvidence(request({ subject: 'target.partner.example', subjectType: 'hostname' })),
    ).resolves.toMatchObject({
      evidence: { classification: 'unknown', coverage: 'complete' },
    });
    expect(fetchImpl).not.toHaveBeenCalled();

    const noCredentialAdapter = createAwsEipOwnershipAdapter({
      configuration: configuration({ includeCredentials: false }),
      fetchImpl,
      now,
      sleep: vi.fn(),
    });
    await expect(noCredentialAdapter.collectEvidence(request())).resolves.toMatchObject({
      outcome: 'failure',
      failure: { category: 'configuration', retryable: false },
    });
  });
});
