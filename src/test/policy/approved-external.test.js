import { describe, expect, it } from 'vitest';

import { evaluateApprovedExternalPolicy } from '../../policy/approved-external.js';

const scope = 'route53:123456789012:ZEXAMPLE';
const policy = Object.freeze({
  policyId: 'partner-cdn-2026',
  target: 'CDN.partner.example.',
  scope,
  owner: 'Application Security',
  reason: 'Approved managed CDN dependency',
  expiresAt: '2026-12-31T00:00:00Z',
});

const now = new Date('2026-08-20T12:00:00Z');

describe('approved external policy evaluation', () => {
  it('approves only an exact normalized target within the exact scope', () => {
    const decision = evaluateApprovedExternalPolicy({
      subject: 'cdn.partner.example',
      scope,
      policies: [policy],
      now,
    });

    expect(decision).toMatchObject({ status: 'approved' });
    expect(decision.policy).toEqual(policy);
  });

  it('does not treat suffix-like or cross-scope records as approved', () => {
    expect(
      evaluateApprovedExternalPolicy({
        subject: 'unapproved.cdn.partner.example',
        scope,
        policies: [policy],
        now,
      }),
    ).toEqual({ status: 'none' });

    expect(
      evaluateApprovedExternalPolicy({
        subject: 'cdn.partner.example',
        scope: 'route53:123456789012:ZOTHER',
        policies: [policy],
        now,
      }),
    ).toEqual({ status: 'none' });
  });

  it('returns expired evidence that cannot suppress findings', () => {
    expect(
      evaluateApprovedExternalPolicy({
        subject: 'cdn.partner.example',
        scope,
        policies: [{ ...policy, expiresAt: '2026-01-01T00:00:00Z' }],
        now,
      }),
    ).toMatchObject({ status: 'expired', policy: { policyId: 'partner-cdn-2026' } });
  });

  it('supports exact IP records but rejects wildcard policy targets', () => {
    expect(
      evaluateApprovedExternalPolicy({
        subject: '198.51.100.10',
        scope,
        policies: [{ ...policy, target: '198.51.100.10' }],
        now,
      }),
    ).toMatchObject({ status: 'approved' });

    expect(() =>
      evaluateApprovedExternalPolicy({
        subject: 'cdn.partner.example',
        scope,
        policies: [{ ...policy, target: '*.partner.example' }],
        now,
      }),
    ).toThrow();
  });
});
