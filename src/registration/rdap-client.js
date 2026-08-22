import { createHash } from 'node:crypto';
import { ConfigurationError, ValidationError } from '../errors/application-error.js';
import { validateDomainObject } from '../domain/validate.js';

export const IANA_RDAP_BOOTSTRAP_URL = 'https://data.iana.org/rdap/dns.json';
const MAX_RESPONSE_BYTES = 1_000_000;
const REQUEST_TIMEOUT_MS = 5_000;

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizeDomain(value) {
  return value.trim().replace(/\.$/u, '').toLowerCase();
}

function normalizeRoot(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    /^[0-9.:[\]]+$/u.test(url.hostname)
  ) {
    throw new ValidationError({ message: 'RDAP service root is not an approved HTTPS hostname root.' });
  }
  return `${url.origin}${url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`}`;
}

function createAbortSignal(timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(timeout) };
}

async function readBoundedResponseBody(response) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new ValidationError({ message: 'RDAP response exceeds the permitted size limit.' });
  }

  const reader = response.body?.getReader?.();
  if (!reader) {
    throw new ValidationError({ message: 'RDAP response body must be a readable stream.' });
  }

  const chunks = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new ValidationError({ message: 'RDAP response exceeds the permitted size limit.' });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks).toString('utf8');
}

async function fetchBoundedJson({ fetchImpl, url, accept, timeoutMs = REQUEST_TIMEOUT_MS }) {
  const abort = createAbortSignal(timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'error',
      signal: abort.signal,
      headers: { accept },
    });
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('json')) {
      throw new ValidationError({ message: 'RDAP response content type must be JSON.' });
    }
    if (!response.ok) {
      return { response, value: undefined };
    }
    const body = await readBoundedResponseBody(response);
    try {
      return { response, value: JSON.parse(body), body };
    } catch (error) {
      throw new ValidationError({ message: 'RDAP response is not valid JSON.', cause: error });
    }
  } finally {
    abort.clear();
  }
}

function extractBootstrapRoots(value, domain) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.services)) {
    throw new ValidationError({ message: 'IANA RDAP bootstrap response is malformed.' });
  }

  const labels = normalizeDomain(domain).split('.');
  let match;
  for (const service of value.services) {
    if (!Array.isArray(service) || service.length !== 2) continue;
    const [tlds, roots] = service;
    if (!Array.isArray(tlds) || !Array.isArray(roots)) continue;
    for (const tld of tlds) {
      if (typeof tld !== 'string') continue;
      const tldLabels = normalizeDomain(tld).split('.');
      const suffix = labels.slice(-tldLabels.length).join('.');
      if (suffix === tldLabels.join('.') && (!match || tldLabels.length > match.length)) {
        match = { length: tldLabels.length, roots };
      }
    }
  }

  if (!match) return [];
  return match.roots.filter((root) => typeof root === 'string').map(normalizeRoot);
}

function mapEventAction(value) {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'registration') return 'registration';
  if (normalized === 'expiration') return 'expiration';
  if (normalized === 'last changed' || normalized === 'last update') return 'last-changed';
  return 'unknown';
}

function extractRegistrarHandle(entities) {
  if (!Array.isArray(entities)) return undefined;
  const registrar = entities.find(
    (entity) =>
      entity &&
      typeof entity === 'object' &&
      Array.isArray(entity.roles) &&
      entity.roles.includes('registrar') &&
      typeof entity.handle === 'string',
  );
  return registrar?.handle;
}

function minimizeRdapDomain({ value, domain, sourceRoot, body, observedAt }) {
  if (!value || typeof value !== 'object' || value.objectClassName !== 'domain') {
    throw new ValidationError({ message: 'RDAP response does not describe a domain object.' });
  }

  const normalizedDomain = normalizeDomain(domain);
  const responseDomain = typeof value.ldhName === 'string' ? normalizeDomain(value.ldhName) : normalizedDomain;
  if (responseDomain !== normalizedDomain) {
    throw new ValidationError({ message: 'RDAP response domain does not match the requested domain.' });
  }

  const observation = {
    domain: normalizedDomain,
    ...(typeof value.handle === 'string' ? { handle: value.handle } : {}),
    sourceRoot,
    ...(extractRegistrarHandle(value.entities) ? { registrarHandle: extractRegistrarHandle(value.entities) } : {}),
    statuses: Array.isArray(value.status)
      ? [...new Set(value.status.filter((status) => typeof status === 'string').slice(0, 100))]
      : [],
    events: Array.isArray(value.events)
      ? value.events
          .filter((event) => event && typeof event === 'object' && typeof event.eventDate === 'string')
          .slice(0, 20)
          .map((event) => ({ action: mapEventAction(event.eventAction), at: event.eventDate }))
      : [],
    nameservers: Array.isArray(value.nameservers)
      ? [
          ...new Set(
            value.nameservers
              .map((nameserver) => nameserver?.ldhName)
              .filter((name) => typeof name === 'string')
              .map(normalizeDomain)
              .slice(0, 100),
          ),
        ]
      : [],
    responseHash: sha256(body),
    coverageStatus: 'complete',
    observedAt: observedAt.toISOString(),
  };

  return validateDomainObject('registrationObservation', observation);
}

function failedObservation({ domain, sourceRoot, reason, observedAt }) {
  return validateDomainObject('registrationObservation', {
    domain: normalizeDomain(domain),
    sourceRoot,
    statuses: [],
    events: [],
    nameservers: [],
    responseHash: sha256(`registration-observation:${reason}:${domain}`),
    coverageStatus: 'failed',
    coverageReason: reason,
    observedAt: observedAt.toISOString(),
  });
}

function classifyFailure(error) {
  if (error instanceof ConfigurationError) return 'configuration';
  if (error instanceof ValidationError) return 'malformed-response';
  if (error?.name === 'AbortError') return 'network';
  return 'network';
}

export function createRdapRegistrationClient({ fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new ConfigurationError({ message: 'RDAP collection requires a fetch implementation.' });
  }

  let bootstrapCache;

  async function getBootstrapRoots({ configuration, domain }) {
    const current = now();
    if (bootstrapCache && bootstrapCache.expiresAt > current) {
      return extractBootstrapRoots(bootstrapCache.value, domain);
    }

    const { value } = await fetchBoundedJson({
      fetchImpl,
      url: IANA_RDAP_BOOTSTRAP_URL,
      accept: 'application/json',
    });
    bootstrapCache = {
      value,
      expiresAt: new Date(current.getTime() + configuration.registration.bootstrapCacheTtlMs),
    };
    return extractBootstrapRoots(value, domain);
  }

  return Object.freeze({
    async observe(request, { configuration } = {}) {
      const validatedRequest = validateDomainObject('registrationObservationRequest', request);
      const observedAt = now();
      const fallbackRoot = IANA_RDAP_BOOTSTRAP_URL.replace('dns.json', '');
      try {
        const roots = await getBootstrapRoots({ configuration, domain: validatedRequest.domain });
        const allowedRoots = new Set(configuration.registration.allowedRoots.map(normalizeRoot));
        const root = roots.find((candidate) => allowedRoots.has(candidate));
        if (!root) {
          return failedObservation({
            domain: validatedRequest.domain,
            sourceRoot: fallbackRoot,
            reason: 'unsupported-scope',
            observedAt,
          });
        }

        const queryUrl = new URL(`domain/${encodeURIComponent(normalizeDomain(validatedRequest.domain))}`, root);
        const { response, value, body } = await fetchBoundedJson({
          fetchImpl,
          url: queryUrl.toString(),
          accept: 'application/rdap+json, application/json',
        });
        if (!response.ok) {
          return failedObservation({
            domain: validatedRequest.domain,
            sourceRoot: root,
            reason: response.status === 404 ? 'not-found' : 'network',
            observedAt,
          });
        }
        return minimizeRdapDomain({
          value,
          domain: validatedRequest.domain,
          sourceRoot: root,
          body,
          observedAt,
        });
      } catch (error) {
        return failedObservation({
          domain: validatedRequest.domain,
          sourceRoot: fallbackRoot,
          reason: classifyFailure(error),
          observedAt,
        });
      }
    },
  });
}
