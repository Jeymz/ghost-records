import { describe, expect, it } from 'vitest';
import { createRdapRegistrationClient, IANA_RDAP_BOOTSTRAP_URL } from '../../registration/rdap-client.js';
import {
  bootstrapResponse,
  domainResponse,
  malformedBootstrapResponse,
  malformedDomainResponse,
} from '../fixtures/rdap/responses.js';

const configuration = Object.freeze({
  registration: Object.freeze({
    allowedRoots: Object.freeze(['https://rdap.example.test/rdap/']),
    bootstrapCacheTtlMs: 60_000,
  }),
});

function response({ status = 200, value, contentType = 'application/rdap+json', headers = {} } = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': contentType, ...headers },
  });
}

function fetchSequence(values) {
  const calls = [];
  return {
    calls,
    fetch: async (url, options) => {
      calls.push({ url, options });
      const next = values.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

describe('createRdapRegistrationClient', () => {
  it('uses the fixed IANA bootstrap then an owner-approved HTTPS root and persists minimized evidence only', async () => {
    const sequence = fetchSequence([
      response({ value: bootstrapResponse, contentType: 'application/json' }),
      response({ value: domainResponse }),
    ]);
    const client = createRdapRegistrationClient({
      fetchImpl: sequence.fetch,
      now: () => new Date('2026-08-22T00:00:00Z'),
    });

    const observation = await client.observe(
      { domain: 'external.example.com', scope: 'zone:example.com' },
      { configuration },
    );

    expect(sequence.calls).toHaveLength(2);
    expect(sequence.calls[0].url).toBe(IANA_RDAP_BOOTSTRAP_URL);
    expect(sequence.calls[0].options.method).toBe('GET');
    expect(sequence.calls[0].options.redirect).toBe('error');
    expect(sequence.calls[1].url).toBe('https://rdap.example.test/rdap/domain/external.example.com');
    expect(observation).toMatchObject({
      domain: 'external.example.com',
      handle: 'EXAMPLE-TEST',
      sourceRoot: 'https://rdap.example.test/rdap/',
      registrarHandle: 'REGISTRAR-TEST',
      statuses: ['active'],
      nameservers: ['ns1.example.net'],
      coverageStatus: 'complete',
    });
    expect(observation).not.toHaveProperty('entities');
    expect(JSON.stringify(observation)).not.toContain('private@example.test');
    expect(JSON.stringify(observation)).not.toContain('must-not-persist');
  });

  it('returns unsupported-scope evidence without querying a bootstrap-selected root not approved by the owner', async () => {
    const sequence = fetchSequence([
      response({ value: bootstrapResponse, contentType: 'application/json' }),
    ]);
    const client = createRdapRegistrationClient({ fetchImpl: sequence.fetch });

    const observation = await client.observe(
      { domain: 'external.example.net', scope: 'zone:example.net' },
      { configuration },
    );

    expect(sequence.calls).toHaveLength(1);
    expect(observation).toMatchObject({
      coverageStatus: 'failed',
      coverageReason: 'unsupported-scope',
    });
  });

  it('uses the cached bootstrap document for different domain suffixes without reusing the first suffix roots', async () => {
    const sequence = fetchSequence([
      response({ value: bootstrapResponse, contentType: 'application/json' }),
      response({ status: 404, value: {} }),
      response({ status: 404, value: {} }),
    ]);
    const client = createRdapRegistrationClient({ fetchImpl: sequence.fetch });
    const broadConfiguration = {
      registration: {
        ...configuration.registration,
        allowedRoots: ['https://rdap.example.test/rdap/', 'https://rdap.net.example.test/'],
      },
    };

    await client.observe({ domain: 'one.example.com', scope: 'zone:example.com' }, { configuration: broadConfiguration });
    await client.observe({ domain: 'two.example.net', scope: 'zone:example.net' }, { configuration: broadConfiguration });

    expect(sequence.calls).toHaveLength(3);
    expect(sequence.calls[2].url).toBe('https://rdap.net.example.test/domain/two.example.net');
  });

  it('preserves RDAP not-found as typed failed coverage', async () => {
    const sequence = fetchSequence([
      response({ value: bootstrapResponse, contentType: 'application/json' }),
      response({ status: 404, value: {} }),
    ]);
    const client = createRdapRegistrationClient({ fetchImpl: sequence.fetch });

    const observation = await client.observe(
      { domain: 'external.example.com', scope: 'zone:example.com' },
      { configuration },
    );

    expect(observation).toMatchObject({ coverageStatus: 'failed', coverageReason: 'not-found' });
  });

  it('rejects oversized RDAP responses before parsing or minimizing their body', async () => {
    const sequence = fetchSequence([
      response({ value: bootstrapResponse, contentType: 'application/json' }),
      response({ value: domainResponse, headers: { 'content-length': '1000001' } }),
    ]);
    const client = createRdapRegistrationClient({ fetchImpl: sequence.fetch });

    await expect(
      client.observe({ domain: 'external.example.com', scope: 'zone:example.com' }, { configuration }),
    ).resolves.toMatchObject({ coverageStatus: 'failed', coverageReason: 'malformed-response' });
  });

  it('fails closed for malformed bootstrap or domain payloads', async () => {
    const malformedBootstrap = createRdapRegistrationClient({
      fetchImpl: fetchSequence([response({ value: malformedBootstrapResponse, contentType: 'application/json' })]).fetch,
    });
    const malformedDomain = createRdapRegistrationClient({
      fetchImpl: fetchSequence([
        response({ value: bootstrapResponse, contentType: 'application/json' }),
        response({ value: malformedDomainResponse }),
      ]).fetch,
    });

    await expect(
      malformedBootstrap.observe({ domain: 'external.example.com', scope: 'zone:example.com' }, { configuration }),
    ).resolves.toMatchObject({ coverageStatus: 'failed', coverageReason: 'malformed-response' });
    await expect(
      malformedDomain.observe({ domain: 'external.example.com', scope: 'zone:example.com' }, { configuration }),
    ).resolves.toMatchObject({ coverageStatus: 'failed', coverageReason: 'malformed-response' });
  });
});
