import { isIP } from 'node:net';

import { ValidationError } from '../errors/application-error.js';

const maxHostnameLength = 253;
const labelPattern = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/u;

function failHostname(message, target) {
  throw new ValidationError({
    message,
    details: { target },
  });
}

export function normalizeHostname(target) {
  if (typeof target !== 'string') {
    failHostname('DNS resolution target must be a hostname string.', String(target));
  }

  const candidate = target.trim().toLowerCase().replace(/\.$/u, '');

  if (
    candidate.length === 0 ||
    candidate.length > maxHostnameLength ||
    candidate.includes('://') ||
    candidate.includes('/') ||
    candidate.includes(':') ||
    candidate.includes('@') ||
    candidate.includes('*') ||
    /\s/u.test(candidate) ||
    isIP(candidate) !== 0
  ) {
    failHostname('DNS resolution target must be a normalized hostname without URL syntax.', target);
  }

  const labels = candidate.split('.');
  if (labels.some((label) => !labelPattern.test(label))) {
    failHostname('DNS resolution target contains an invalid hostname label.', target);
  }

  return `${candidate}.`;
}
