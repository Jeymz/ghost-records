import { describe, expect, it, vi } from 'vitest';

import { createDnsEvidenceResolver } from '../../dns/resolver.js';
import {
  defaultLimits,
  dnsError,
  fixedNow,
  noData,
  resolverDouble,
  resolverFactory,
} from '../fixtures/dns/resolver-fixtures.js';

const request = Object.freeze({
  recordKey: 'route53:123456789012:ZPUBLIC1:record-001',
  target: 'App.Example.com.',
  queryType: 'CNAME',
});

function createResolver({ limits = defaultLimits, resolvers }) {
  return createDnsEvidenceResolver({
    limits,
    resolverFactory: resolverFactory(...resolvers),
    now: fixedNow,
  });
}

describe('bounded DNS evidence resolver', () => {
  it('records a normalized CNAME chain with bounded A/AAAA terminal evidence and TTLs', async () => {
    const resolver = createResolver({
      resolvers: [
        resolverDouble({ cname: async () => ['target.vendor.example.'] }),
        resolverDouble({ cname: noData }),
        resolverDouble({
          a: async () => [
            { address: '203.0.113.42', ttl: 300 },
            { address: '10.20.30.40', ttl: 60 },
          ],
        }),
        resolverDouble({
          aaaa: async () => [{ address: '2001:db8::42', ttl: 120 }],
        }),
      ],
    });

    const observation = await resolver.resolve(request);

    expect(observation).toMatchObject({
      queryName: 'app.example.com.',
      queryType: 'CNAME',
      chain: ['app.example.com.', 'target.vendor.example.'],
      terminalName: 'target.vendor.example.',
      answers: ['203.0.113.42', '10.20.30.40', '2001:db8::42'],
      rcode: 'NOERROR',
      coverage: { status: 'complete', reason: 'complete' },
      resolverEvidence: {
        resolver: 'system-configured',
        transport: 'system',
        queryCount: 4,
      },
    });
    expect(observation.answerRecords).toEqual([
      { address: '203.0.113.42', family: 4, ttl: 300, classification: 'documentation' },
      { address: '10.20.30.40', family: 4, ttl: 60, classification: 'private' },
      { address: '2001:db8::42', family: 6, ttl: 120, classification: 'documentation' },
    ]);
  });

  it('deduplicates repeated terminal answers while retaining the shortest observed TTL', async () => {
    const resolver = createResolver({
      resolvers: [
        resolverDouble({ cname: noData }),
        resolverDouble({
          a: async () => [
            { address: '203.0.113.42', ttl: 300 },
            { address: '203.0.113.42', ttl: 45 },
          ],
        }),
        resolverDouble({ aaaa: noData }),
      ],
    });

    const observation = await resolver.resolve(request);

    expect(observation.answerRecords).toEqual([
      { address: '203.0.113.42', family: 4, ttl: 45, classification: 'documentation' },
    ]);
  });

  it('distinguishes definitive NODATA from resolver failures', async () => {
    const resolver = createResolver({
      resolvers: [
        resolverDouble({ cname: noData }),
        resolverDouble({ a: noData }),
        resolverDouble({ aaaa: noData }),
      ],
    });

    const observation = await resolver.resolve(request);

    expect(observation).toMatchObject({
      terminalName: 'app.example.com.',
      answers: [],
      answerRecords: [],
      rcode: 'NODATA',
      coverage: { status: 'complete', reason: 'complete' },
    });
  });

  it('preserves successful answers while reporting a partial resolver failure for the other address family', async () => {
    const resolver = createResolver({
      resolvers: [
        resolverDouble({ cname: noData }),
        resolverDouble({ a: async () => [{ address: '198.51.100.20', ttl: 45 }] }),
        resolverDouble({ aaaa: async () => { throw dnsError('ESERVFAIL'); } }),
      ],
    });

    const observation = await resolver.resolve(request);

    expect(observation).toMatchObject({
      answers: ['198.51.100.20'],
      rcode: 'SERVFAIL',
      coverage: { status: 'partial', reason: 'resolver-failure' },
    });
  });

  it('classifies NXDOMAIN and timeout outcomes without masking them as empty successful answers', async () => {
    const nxdomainResolver = createResolver({
      resolvers: [resolverDouble({ cname: async () => { throw dnsError('ENOTFOUND'); } })],
    });
    const cancellation = vi.fn();
    const timeoutResolver = createResolver({
      limits: { ...defaultLimits, queryTimeoutMs: 1 },
      resolvers: [
        {
          cancel: cancellation,
          resolveCname: () => new Promise(() => {}),
          resolve4: noData,
          resolve6: noData,
        },
      ],
    });

    await expect(nxdomainResolver.resolve(request)).resolves.toMatchObject({
      rcode: 'NXDOMAIN',
      coverage: { status: 'failed', reason: 'resolver-failure' },
    });
    await expect(timeoutResolver.resolve(request)).resolves.toMatchObject({
      rcode: 'TIMEOUT',
      coverage: { status: 'failed', reason: 'timeout' },
    });
    expect(cancellation).toHaveBeenCalledOnce();
  });

  it('stops CNAME cycles and depth growth before terminal-address resolution', async () => {
    const cycleResolver = createResolver({
      resolvers: [
        resolverDouble({ cname: async () => ['second.example.com.'] }),
        resolverDouble({ cname: async () => ['app.example.com.'] }),
      ],
    });
    const depthResolver = createResolver({
      limits: { ...defaultLimits, maxChainDepth: 1 },
      resolvers: [resolverDouble({ cname: async () => ['second.example.com.'] })],
    });

    await expect(cycleResolver.resolve(request)).resolves.toMatchObject({
      chain: ['app.example.com.', 'second.example.com.'],
      rcode: 'UNKNOWN',
      coverage: { status: 'partial', reason: 'chain-cycle' },
    });
    await expect(depthResolver.resolve(request)).resolves.toMatchObject({
      chain: ['app.example.com.', 'second.example.com.'],
      rcode: 'UNKNOWN',
      coverage: { status: 'partial', reason: 'depth-limit' },
    });
  });

  it('records split-horizon-style private answers as DNS evidence without inferring authority or wildcard semantics', async () => {
    const resolver = createResolver({
      resolvers: [
        resolverDouble({ cname: noData }),
        resolverDouble({ a: async () => [{ address: '10.0.0.25', ttl: 60 }] }),
        resolverDouble({ aaaa: noData }),
      ],
    });

    const observation = await resolver.resolve({
      recordKey: 'route53:123456789012:ZPRIVATE1:record-private',
      target: 'wildcard-looking.internal.example.',
      queryType: 'A',
    });

    expect(observation).toMatchObject({
      rcode: 'NOERROR',
      coverage: { status: 'complete', reason: 'complete' },
      answers: ['10.0.0.25'],
    });
    expect(observation.answerRecords).toEqual([
      { address: '10.0.0.25', family: 4, ttl: 60, classification: 'private' },
    ]);
    expect(observation).not.toHaveProperty('authoritative');
    expect(observation).not.toHaveProperty('wildcard');
  });

  it('enforces query and answer limits as explicit partial coverage', async () => {
    const queryLimitResolver = createResolver({
      limits: { ...defaultLimits, maxQueries: 1 },
      resolvers: [resolverDouble({ cname: noData })],
    });
    const answerLimitResolver = createResolver({
      limits: { ...defaultLimits, maxAnswers: 1 },
      resolvers: [
        resolverDouble({ cname: noData }),
        resolverDouble({
          a: async () => [
            { address: '192.0.2.1', ttl: 30 },
            { address: '192.0.2.2', ttl: 30 },
          ],
        }),
      ],
    });

    await expect(queryLimitResolver.resolve(request)).resolves.toMatchObject({
      rcode: 'UNKNOWN',
      coverage: { status: 'partial', reason: 'query-limit' },
    });
    await expect(answerLimitResolver.resolve(request)).resolves.toMatchObject({
      rcode: 'UNKNOWN',
      coverage: { status: 'partial', reason: 'malformed-response' },
    });
  });

  it('enforces the configured concurrency ceiling across simultaneous direct resolve calls', async () => {
    let releaseFirstCname;
    const started = [];
    const firstCname = () => {
      started.push('first');
      return new Promise((_, reject) => {
        releaseFirstCname = () => reject(dnsError('ENODATA'));
      });
    };
    const secondCname = async () => {
      started.push('second');
      throw dnsError('ENODATA');
    };
    const resolver = createResolver({
      limits: { ...defaultLimits, maxConcurrency: 1 },
      resolvers: [
        resolverDouble({ cname: firstCname }),
        resolverDouble({ a: noData }),
        resolverDouble({ aaaa: noData }),
        resolverDouble({ cname: secondCname }),
        resolverDouble({ a: noData }),
        resolverDouble({ aaaa: noData }),
      ],
    });

    const first = resolver.resolve(request);
    await new Promise((resolve) => setImmediate(resolve));
    const second = resolver.resolve({
      recordKey: 'route53:123456789012:ZPUBLIC1:record-concurrency',
      target: 'concurrent.example.com.',
      queryType: 'A',
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(started).toEqual(['first']);
    releaseFirstCname();
    await Promise.all([first, second]);
    expect(started).toEqual(['first', 'second']);
  });

  it('validates batch inputs and resolves a batch through the configured concurrency boundary', async () => {
    const resolver = createResolver({
      limits: { ...defaultLimits, maxConcurrency: 1 },
      resolvers: [
        resolverDouble({ cname: noData }),
        resolverDouble({ a: async () => [{ address: '192.0.2.10', ttl: 15 }] }),
        resolverDouble({ aaaa: noData }),
        resolverDouble({ cname: noData }),
        resolverDouble({ a: noData }),
        resolverDouble({ aaaa: async () => [{ address: '2001:db8::10', ttl: 15 }] }),
      ],
    });

    const observations = await resolver.resolveMany({
      requests: [
        request,
        {
          recordKey: 'route53:123456789012:ZPUBLIC1:record-002',
          target: 'api.example.com.',
          queryType: 'A',
        },
      ],
    });

    expect(observations).toHaveLength(2);
    expect(observations.map((observation) => observation.recordKey)).toEqual([
      request.recordKey,
      'route53:123456789012:ZPUBLIC1:record-002',
    ]);
    await expect(resolver.resolveMany({ requests: [], unexpected: true })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });
});
