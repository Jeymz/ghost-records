import {
  createSignedRoute53GetRequest,
  ROUTE53_ENDPOINT,
} from './sigv4.js';
import { ROUTE53_MAX_RESPONSE_BYTES } from './xml.js';

const allowedContentTypes = ['application/xml', 'text/xml'];

export class Route53RequestError extends Error {
  constructor({ category, message, retryable, status, cause }) {
    super(message, cause ? { cause } : undefined);
    this.name = 'Route53RequestError';
    this.category = category;
    this.retryable = retryable;
    this.status = status;
  }
}

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive integer.`);
  }
}

function classifyHttpFailure(status) {
  if (status === 429) {
    return { category: 'throttling', retryable: true };
  }

  if (status === 401) {
    return { category: 'authentication', retryable: false };
  }

  if (status === 403) {
    return { category: 'authorization', retryable: false };
  }

  if (status >= 500) {
    return { category: 'network', retryable: true };
  }

  return { category: 'malformed-response', retryable: false };
}

function ensureXmlContentType(response) {
  const contentType = response.headers?.get?.('content-type')?.toLowerCase() ?? '';
  if (!allowedContentTypes.some((allowed) => contentType.startsWith(allowed))) {
    throw new Route53RequestError({
      category: 'malformed-response',
      message: 'Route 53 response did not declare an approved XML content type.',
      retryable: false,
      status: response.status,
    });
  }
}

async function readBoundedResponse(response, maximumBytes) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const body = await response.text();
    if (Buffer.byteLength(body, 'utf8') > maximumBytes) {
      throw new Route53RequestError({
        category: 'malformed-response',
        message: 'Route 53 response exceeded the approved size limit.',
        retryable: false,
        status: response.status,
      });
    }
    return body;
  }

  const chunks = [];
  let observedBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    observedBytes += value.byteLength;
    if (observedBytes > maximumBytes) {
      await reader.cancel();
      throw new Route53RequestError({
        category: 'malformed-response',
        message: 'Route 53 response exceeded the approved size limit.',
        retryable: false,
        status: response.status,
      });
    }
    chunks.push(value);
  }

  return new TextDecoder().decode(Buffer.concat(chunks));
}

function requestFailureFromError(error) {
  if (error instanceof Route53RequestError) {
    return error;
  }

  return new Route53RequestError({
    category: 'network',
    message: 'Route 53 request could not be completed.',
    retryable: true,
    cause: error,
  });
}

export function createRoute53Client({
  credentials,
  fetchImplementation = globalThis.fetch,
  now = () => new Date(),
  sleep = async () => {},
  timeoutMs = 10_000,
  maxAttempts = 2,
  maxResponseBytes = ROUTE53_MAX_RESPONSE_BYTES,
}) {
  if (typeof fetchImplementation !== 'function') {
    throw new TypeError('Route 53 client requires a fetch implementation.');
  }
  assertPositiveInteger(timeoutMs, 'timeoutMs');
  assertPositiveInteger(maxAttempts, 'maxAttempts');
  assertPositiveInteger(maxResponseBytes, 'maxResponseBytes');

  async function get({ path, query }) {
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const signedRequest = createSignedRoute53GetRequest({
        path,
        query,
        credentials,
        now: now(),
      });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImplementation(signedRequest.url, {
          ...signedRequest.init,
          signal: controller.signal,
        });
        if (!response || typeof response.ok !== 'boolean') {
          throw new Route53RequestError({
            category: 'malformed-response',
            message: 'Route 53 client received an invalid response object.',
            retryable: false,
          });
        }
        if (!response.ok) {
          const failure = classifyHttpFailure(response.status);
          throw new Route53RequestError({
            ...failure,
            message: 'Route 53 request did not succeed.',
            status: response.status,
          });
        }

        ensureXmlContentType(response);
        return await readBoundedResponse(response, maxResponseBytes);
      } catch (error) {
        const failure = requestFailureFromError(error);
        lastError = failure;
        if (!failure.retryable || attempt === maxAttempts) {
          throw failure;
        }
        await sleep(attempt * 100);
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError;
  }

  return Object.freeze({
    endpoint: ROUTE53_ENDPOINT,
    listHostedZones({ marker } = {}) {
      return get({
        path: '/2013-04-01/hostedzone',
        query: { maxitems: 100, marker },
      });
    },
    listResourceRecordSets({ zoneId, name, type, identifier } = {}) {
      if (typeof zoneId !== 'string' || !/^[A-Za-z0-9]+$/.test(zoneId)) {
        throw new TypeError('Route 53 hosted zone ID must be an alphanumeric string.');
      }

      return get({
        path: `/2013-04-01/hostedzone/${zoneId}/rrset`,
        query: {
          identifier,
          maxitems: 300,
          name,
          type,
        },
      });
    },
  });
}
