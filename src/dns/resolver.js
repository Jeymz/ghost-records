import { Resolver } from 'node:dns/promises';
import { isIP } from 'node:net';

import { validateDomainObject } from '../domain/validate.js';
import { ValidationError } from '../errors/application-error.js';
import { classifyAddress } from './address-classification.js';
import { normalizeHostname } from './hostname.js';

const resolverName = 'system-configured';
const supportedErrorCodes = new Set([
  'ENOTFOUND',
  'ENODATA',
  'ESERVFAIL',
  'EREFUSED',
  'ETIMEOUT',
  'ECANCELLED',
]);

function nowIso(now) {
  return now().toISOString();
}

function resolutionError(code, message, cause = undefined) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), { code });
}

function classifyError(error) {
  switch (error?.code) {
    case 'ENOTFOUND':
      return { rcode: 'NXDOMAIN', coverageReason: 'resolver-failure' };
    case 'ENODATA':
      return { rcode: 'NODATA', coverageReason: 'complete' };
    case 'ESERVFAIL':
      return { rcode: 'SERVFAIL', coverageReason: 'resolver-failure' };
    case 'EREFUSED':
      return { rcode: 'REFUSED', coverageReason: 'resolver-failure' };
    case 'ETIMEOUT':
    case 'ECANCELLED':
      return { rcode: 'TIMEOUT', coverageReason: 'timeout' };
    default:
      return { rcode: 'UNKNOWN', coverageReason: 'resolver-failure' };
  }
}

function assertLimits(limits) {
  const expectedLimits = [
    ['maxChainDepth', 1, 32],
    ['maxQueries', 1, 128],
    ['maxConcurrency', 1, 32],
    ['queryTimeoutMs', 1, 30_000],
    ['maxAnswers', 1, 100],
  ];

  for (const [name, minimum, maximum] of expectedLimits) {
    if (!Number.isInteger(limits?.[name]) || limits[name] < minimum || limits[name] > maximum) {
      throw new ValidationError({
        message: 'DNS resolver limits must come from validated centralized configuration.',
        details: { name, minimum, maximum },
      });
    }
  }

  return Object.freeze({ ...limits });
}

function resolverEvidence({ queriedAt, queryCount, limits }) {
  return {
    resolver: resolverName,
    transport: 'system',
    queriedAt,
    queryCount,
    maxQueries: limits.maxQueries,
    maxDepth: limits.maxChainDepth,
    timeoutMs: limits.queryTimeoutMs,
  };
}

function baseObservation({ request, chain, terminalName, rcode, coverage, queriedAt, queryCount, limits, answers = [] }) {
  const answerRecords = answers.map(({ address, family, ttl }) => ({
    address,
    family,
    ttl,
    classification: classifyAddress(address),
  }));

  return validateDomainObject('dnsObservation', {
    recordKey: request.recordKey,
    queryName: chain[0],
    queryType: request.queryType,
    chain,
    terminalName,
    answers: answerRecords.map((answer) => answer.address),
    answerRecords,
    rcode,
    coverage,
    resolverEvidence: resolverEvidence({ queriedAt, queryCount, limits }),
    observedAt: queriedAt,
  });
}

function normalizeAnswerRecords(records, family, maximumAnswers) {
  if (!Array.isArray(records)) {
    throw resolutionError('EMALFORMED', 'DNS resolver response was not an array.');
  }

  const normalized = records.map((record) => {
    const candidate = typeof record === 'string' ? { address: record, ttl: 0 } : record;
    if (!candidate || typeof candidate.address !== 'string' || isIP(candidate.address) !== family) {
      throw resolutionError('EMALFORMED', 'DNS resolver returned an invalid address record.');
    }
    if (!Number.isInteger(candidate.ttl) || candidate.ttl < 0) {
      throw resolutionError('EMALFORMED', 'DNS resolver returned an invalid TTL value.');
    }
    return { address: candidate.address, family, ttl: candidate.ttl };
  });

  const uniqueByAddress = new Map();
  for (const answer of normalized) {
    const existing = uniqueByAddress.get(answer.address);
    if (!existing || answer.ttl < existing.ttl) {
      uniqueByAddress.set(answer.address, answer);
    }
  }

  const uniqueRecords = [...uniqueByAddress.values()];
  if (uniqueRecords.length > maximumAnswers) {
    throw resolutionError('EANSWERLIMIT', 'DNS resolver returned more answers than the approved limit.');
  }

  return uniqueRecords;
}

function isNoData(error) {
  return error?.code === 'ENODATA';
}

function isKnownResolverError(error) {
  return supportedErrorCodes.has(error?.code);
}

async function withQueryTimeout({ resolver, operation, timeoutMs }) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      resolver.cancel();
      reject(resolutionError('ETIMEOUT', 'DNS resolver query exceeded its approved timeout.'));
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function createQueryExecutor({ resolverFactory, limits }) {
  let queryCount = 0;

  async function execute(operation) {
    if (queryCount >= limits.maxQueries) {
      throw resolutionError('EQUERYLIMIT', 'DNS resolver query limit was reached.');
    }

    queryCount += 1;
    const resolver = resolverFactory();

    try {
      return await withQueryTimeout({
        resolver,
        operation: () => operation(resolver),
        timeoutMs: limits.queryTimeoutMs,
      });
    } catch (error) {
      if (isKnownResolverError(error) || error?.code === 'EQUERYLIMIT' || error?.code === 'EANSWERLIMIT' || error?.code === 'EMALFORMED') {
        throw error;
      }
      throw resolutionError('EUNKNOWN', 'DNS resolver request failed unexpectedly.', error);
    }
  }

  return {
    execute,
    get queryCount() {
      return queryCount;
    },
  };
}

async function resolveCname({ hostname, query }) {
  try {
    const targets = await query((resolver) => resolver.resolveCname(hostname));

    if (!Array.isArray(targets) || targets.length !== 1 || typeof targets[0] !== 'string') {
      throw resolutionError('EMALFORMED', 'DNS resolver returned an invalid CNAME response.');
    }

    return normalizeHostname(targets[0]);
  } catch (error) {
    if (isNoData(error)) return undefined;
    throw error;
  }
}

async function resolveAddresses({ hostname, query, limits }) {
  const results = [];
  const failures = [];

  for (const [family, method] of [
    [4, 'resolve4'],
    [6, 'resolve6'],
  ]) {
    try {
      const records = await query((resolver) => resolver[method](hostname, { ttl: true }));
      results.push(...normalizeAnswerRecords(records, family, limits.maxAnswers));
    } catch (error) {
      if (['EQUERYLIMIT', 'EANSWERLIMIT', 'EMALFORMED'].includes(error?.code)) {
        throw error;
      }
      if (!isNoData(error)) {
        failures.push(error);
      }
    }
  }

  if (results.length > limits.maxAnswers) {
    throw resolutionError('EANSWERLIMIT', 'DNS resolver returned more terminal answers than the approved limit.');
  }

  return { results, failures };
}

function classifyResolutionFailure(error) {
  if (error?.code === 'EQUERYLIMIT') {
    return { rcode: 'UNKNOWN', coverage: { status: 'partial', reason: 'query-limit' } };
  }
  if (error?.code === 'EANSWERLIMIT') {
    return { rcode: 'UNKNOWN', coverage: { status: 'partial', reason: 'malformed-response' } };
  }
  if (error?.code === 'EDEPTHLIMIT') {
    return { rcode: 'UNKNOWN', coverage: { status: 'partial', reason: 'depth-limit' } };
  }
  if (error?.code === 'ECYCLE') {
    return { rcode: 'UNKNOWN', coverage: { status: 'partial', reason: 'chain-cycle' } };
  }
  if (error?.code === 'EMALFORMED') {
    return { rcode: 'UNKNOWN', coverage: { status: 'failed', reason: 'malformed-response' } };
  }

  const classified = classifyError(error);
  return {
    rcode: classified.rcode,
    coverage: {
      status: 'failed',
      reason: classified.coverageReason,
    },
  };
}

function createConcurrencyLimiter(maxConcurrency) {
  let active = 0;
  const waiting = [];

  async function acquire() {
    if (active >= maxConcurrency) {
      await new Promise((resolve) => waiting.push(resolve));
    }
    active += 1;
  }

  function release() {
    active -= 1;
    waiting.shift()?.();
  }

  return async function run(operation) {
    await acquire();
    try {
      return await operation();
    } finally {
      release();
    }
  };
}

function createWorkerPool({ items, concurrency, handler }) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await handler(items[currentIndex]);
    }
  }

  return Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker)).then(
    () => results,
  );
}

export function createDnsEvidenceResolver({ limits, resolverFactory = () => new Resolver(), now = () => new Date() }) {
  const validatedLimits = assertLimits(limits);
  const runWithConcurrencyLimit = createConcurrencyLimiter(validatedLimits.maxConcurrency);

  async function resolveOne(requestValue) {
    const request = validateDomainObject('dnsResolutionRequest', requestValue);
    const queriedAt = nowIso(now);
    const initialName = normalizeHostname(request.target);
    const chain = [initialName];
    const visited = new Set(chain);
    const query = createQueryExecutor({ resolverFactory, limits: validatedLimits });
    let terminalName = initialName;

    try {
      while (true) {
        if (chain.length > validatedLimits.maxChainDepth) {
          throw resolutionError('EDEPTHLIMIT', 'DNS CNAME chain exceeded the approved depth limit.');
        }

        const nextName = await resolveCname({ hostname: terminalName, query: query.execute });
        if (!nextName) break;

        if (visited.has(nextName)) {
          throw resolutionError('ECYCLE', 'DNS CNAME chain contains a cycle.');
        }

        visited.add(nextName);
        chain.push(nextName);
        terminalName = nextName;
      }

      const { results, failures } = await resolveAddresses({
        hostname: terminalName,
        query: query.execute,
        limits: validatedLimits,
      });

      if (failures.length > 0) {
        const classified = classifyError(failures[0]);
        return baseObservation({
          request,
          chain,
          terminalName,
          rcode: classified.rcode,
          coverage: { status: 'partial', reason: classified.coverageReason },
          queriedAt,
          queryCount: query.queryCount,
          limits: validatedLimits,
          answers: results,
        });
      }

      return baseObservation({
        request,
        chain,
        terminalName,
        rcode: results.length === 0 ? 'NODATA' : 'NOERROR',
        coverage: { status: 'complete', reason: 'complete' },
        queriedAt,
        queryCount: query.queryCount,
        limits: validatedLimits,
        answers: results,
      });
    } catch (error) {
      const classified = classifyResolutionFailure(error);
      return baseObservation({
        request,
        chain,
        terminalName,
        rcode: classified.rcode,
        coverage: classified.coverage,
        queriedAt,
        queryCount: query.queryCount,
        limits: validatedLimits,
      });
    }
  }

  function resolve(requestValue) {
    return runWithConcurrencyLimit(() => resolveOne(requestValue));
  }

  async function resolveMany(batchValue) {
    const batch = validateDomainObject('dnsResolutionBatchRequest', batchValue);
    return createWorkerPool({
      items: batch.requests,
      concurrency: validatedLimits.maxConcurrency,
      handler: resolve,
    });
  }

  return Object.freeze({ resolve, resolveMany });
}
