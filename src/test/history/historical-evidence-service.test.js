import { describe, expect, it, vi } from 'vitest';
import { createHistoricalEvidenceService } from '../../history/historical-evidence-service.js';

function observation(overrides = {}) {
  return {
    recordKey: 'route53:record:1',
    queryName: 'external.example.com',
    queryType: 'CNAME',
    chain: ['external.example.com', 'target.example.net'],
    terminalName: 'target.example.net',
    answers: ['203.0.113.10'],
    answerRecords: [
      { address: '203.0.113.10', family: 4, ttl: 60, classification: 'documentation' },
    ],
    rcode: 'NOERROR',
    coverage: { status: 'complete', reason: 'complete' },
    resolverEvidence: {
      resolver: 'system',
      transport: 'system',
      queriedAt: '2026-08-22T00:00:00Z',
      queryCount: 3,
      maxQueries: 32,
      maxDepth: 8,
      timeoutMs: 3000,
    },
    observedAt: '2026-08-22T00:00:00Z',
    ...overrides,
  };
}

function model({ baseline } = {}) {
  return {
    findOne: vi.fn().mockResolvedValue(baseline),
    create: vi.fn().mockImplementation(async (value) => ({ get: () => ({ id: 1, ...value }) })),
  };
}

function service({ baseline } = {}) {
  const models = {
    resolutionSnapshot: model({ baseline }),
    registrationObservation: model(),
    policyDecision: model(),
    findingHistory: model(),
  };
  return {
    service: createHistoricalEvidenceService({ persistence: { models } }),
    models,
  };
}

describe('createHistoricalEvidenceService', () => {
  it('records a valid first observation as no-baseline evidence', async () => {
    const { service: evidence, models } = service();
    const result = await evidence.recordResolutionSnapshot({
      scope: 'zone:example.com',
      observation: observation(),
    });

    expect(result.drift).toBe('no-baseline');
    expect(models.resolutionSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        declaredTarget: 'external.example.com',
        terminalAnswers: [expect.objectContaining({ ttl: 60 })],
        queryCount: 3,
      }),
      expect.any(Object),
    );
  });

  it('marks identical persisted evidence as unchanged and changed terminal evidence as drift', async () => {
    const { service: first } = service({ baseline: { get: () => ({ evidenceHash: 'different', observedAt: new Date() }) } });
    await expect(
      first.recordResolutionSnapshot({ scope: 'zone:example.com', observation: observation() }),
    ).resolves.toMatchObject({ drift: 'changed' });

    const { service: second } = service();
    const initial = await second.recordResolutionSnapshot({ scope: 'zone:example.com', observation: observation() });
    const { service: repeated } = service({ baseline: { get: () => ({ evidenceHash: initial.record.evidenceHash, observedAt: new Date() }) } });
    await expect(
      repeated.recordResolutionSnapshot({ scope: 'zone:example.com', observation: observation() }),
    ).resolves.toMatchObject({ drift: 'unchanged' });
  });

  it('persists validated minimized registration and policy decision records only', async () => {
    const { service: evidence, models } = service();
    await evidence.recordRegistrationObservation({
      domain: 'external.example.com',
      sourceRoot: 'https://rdap.example.test/rdap/',
      statuses: ['active'],
      events: [{ action: 'registration', at: '2025-01-01T00:00:00Z' }],
      nameservers: ['ns1.example.net'],
      responseHash: 'a'.repeat(64),
      coverageStatus: 'complete',
      observedAt: '2026-08-22T00:00:00Z',
    });
    await evidence.recordPolicyDecision({
      policyId: 'policy-1',
      scope: 'zone:example.com',
      target: 'external.example.com',
      decision: 'approved',
      owner: 'security',
      reason: 'approved dependency',
      expiresAt: '2027-01-01T00:00:00Z',
      evaluatedAt: '2026-08-22T00:00:00Z',
    });

    expect(models.registrationObservation.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ entities: expect.anything(), raw: expect.anything() }),
      expect.any(Object),
    );
    expect(models.policyDecision.create).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'approved', policyId: 'policy-1' }),
      expect.any(Object),
    );
  });
});
