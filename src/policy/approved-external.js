import { isIP } from 'node:net';

import { normalizeHostname } from '../dns/hostname.js';

function normalizePolicySubject(subject) {
  if (typeof subject !== 'string' || subject.length === 0) {
    throw new TypeError('Approved external policy subject must be a non-empty string.');
  }

  const candidate = subject.trim();
  if (isIP(candidate) !== 0) return candidate;
  return normalizeHostname(candidate);
}

function parsedExpiry(expiresAt) {
  const timestamp = Date.parse(expiresAt);
  if (Number.isNaN(timestamp)) {
    throw new TypeError('Approved external policy expiry must be a valid timestamp.');
  }
  return timestamp;
}

export function evaluateApprovedExternalPolicy({ subject, scope, policies, now = new Date() }) {
  if (typeof scope !== 'string' || scope.length === 0 || !Array.isArray(policies)) {
    throw new TypeError('Approved external policy evaluation requires scope and policy records.');
  }
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError('Approved external policy evaluation requires a valid Date.');
  }

  const normalizedSubject = normalizePolicySubject(subject);
  const matching = policies.filter(
    (policy) =>
      policy &&
      policy.scope === scope &&
      normalizePolicySubject(policy.target) === normalizedSubject,
  );
  const active = matching.find((policy) => parsedExpiry(policy.expiresAt) > now.getTime());

  if (active) {
    return Object.freeze({ status: 'approved', policy: Object.freeze({ ...active }) });
  }

  const expired = matching.sort(
    (left, right) => parsedExpiry(right.expiresAt) - parsedExpiry(left.expiresAt),
  )[0];

  if (expired) {
    return Object.freeze({ status: 'expired', policy: Object.freeze({ ...expired }) });
  }

  return Object.freeze({ status: 'none' });
}
