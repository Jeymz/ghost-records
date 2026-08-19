const REDACTED_VALUE = '[REDACTED]';
const CIRCULAR_VALUE = '[CIRCULAR]';

const SENSITIVE_KEY_PATTERN = /(?:access[-_]?key|api[-_]?key|authorization|bearer|client[-_]?secret|cookie|credential|pass(?:word|phrase)?|private[-_]?key|secret|session|token)/iu;

export function isSensitiveKey(key) {
  return SENSITIVE_KEY_PATTERN.test(String(key));
}

export function redact(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return CIRCULAR_VALUE;
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      isSensitiveKey(key) ? REDACTED_VALUE : redact(item, seen),
    ]),
  );
}

export { REDACTED_VALUE };
