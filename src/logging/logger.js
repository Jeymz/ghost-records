import { ValidationError } from '../errors/application-error.js';
import { redact } from './redact.js';

const APPLICATION_LEVELS = new Set(['debug', 'info', 'warn', 'error']);

function assertNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError({
      message: `Logger field ${field} must be a non-empty string.`,
    });
  }
}

function validateRequestInfo(reqInfo) {
  if (!reqInfo || typeof reqInfo !== 'object') {
    throw new ValidationError({
      message: 'HTTP request records require reqInfo.',
    });
  }

  assertNonEmptyString(reqInfo.requestID, 'reqInfo.requestID');
  assertNonEmptyString(reqInfo.hostname, 'reqInfo.hostname');
}

export function serializeError(error) {
  if (!(error instanceof Error)) {
    return redact({ value: error });
  }

  return redact({
    name: error.name,
    message: error.message,
    ...(error.code ? { code: error.code } : {}),
    ...(error.details ? { details: error.details } : {}),
  });
}

export function createLogger({ source, sink = console.log, clock = () => new Date().toISOString() }) {
  assertNonEmptyString(source, 'source');

  function write(level, message, attributes = {}) {
    assertNonEmptyString(message, 'message');

    if (level === 'http') {
      validateRequestInfo(attributes.reqInfo);
    } else if (!APPLICATION_LEVELS.has(level)) {
      throw new ValidationError({
        message: `Unsupported log level: ${level}.`,
      });
    }

    const entry = redact({
      ...attributes,
      timestamp: clock(),
      level,
      source,
      message,
    });

    sink(entry);
    return entry;
  }

  return Object.freeze({
    debug: (message, attributes) => write('debug', message, attributes),
    info: (message, attributes) => write('info', message, attributes),
    warn: (message, attributes) => write('warn', message, attributes),
    error: (message, attributes) => write('error', message, attributes),
    http: (message, attributes) => write('http', message, attributes),
  });
}
