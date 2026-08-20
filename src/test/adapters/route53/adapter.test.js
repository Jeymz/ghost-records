import { describe, expect, it, vi } from 'vitest';

import { createRoute53Adapter } from '../../../adapters/route53/adapter.js';
import { Route53RequestError } from '../../../adapters/route53/client.js';
import {
  hostedZonesFirstPage,
  hostedZonesSecondPage,
  privateZoneRecords,
  publicRecordsFirstPage,
  publicRecordsSecondPage,
} from '../../fixtures/route53/responses.js';

const configuration = Object.freeze({
  providerCredentials: Object.freeze([
    Object.freeze({
      provider: 'route53',
      values: Object.freeze({
        AWS_ACCESS_KEY_ID: 'AKIATESTACCESSKEY',
        AWS_SECRET_ACCESS_KEY: 'test-secret-access-key',
      }),
    }),
  ]),
});

function request(zoneIds = ['ZPUBLIC1', 'ZPRIVATE1']) {
  return {
    provider: 'route53',
    providerAccountId: 'aws-account-123456789012',
    scope: 'owner-enabled-route53-zones',
    zoneIds,
  };
}

function completeClient() {
  const listHostedZones = vi
    .fn()
    .mockResolvedValueOnce(hostedZonesFirstPage)
    .mockResolvedValueOnce(hostedZonesSecondPage);
  const listResourceRecordSets = vi.fn(({ zoneId, name }) => {
    if (zoneId === 'ZPUBLIC1' && !name) {
      return Promise.resolve(publicRecordsFirstPage);
    }
    if (zoneId === 'ZPUBLIC1' && name === 'root.example.com.') {
      return Promise.resolve(publicRecordsSecondPage);
    }
    if (zoneId === 'ZPRIVATE1') {
      return Promise.resolve(privateZoneRecords);
    }
    return Promise.reject(new Error('Unexpected test-zone request.'));
  });

  return { listHostedZones, listResourceRecordSets };
}

describe('Route 53 collection adapter', () => {
  it('collects only owner-enabled zones, normalizes supported records, and follows every pagination continuation field', async () => {
    const client = completeClient();
    const adapter = createRoute53Adapter({
      configuration,
      client,
      now: () => new Date('2026-08-20T12:34:56.000Z'),
    });

    const outcome = await adapter.collect(request());

    expect(outcome).toMatchObject({
      outcome: 'success',
      provider: 'route53',
      providerAccount: {
        accountId: 'aws-account-123456789012',
        collectionScope: 'owner-enabled-route53-zones',
      },
      coverageEvents: [
        { status: 'complete', reason: 'complete', scope: 'owner-enabled-route53-zones' },
      ],
    });
    expect(outcome.zones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ zoneId: 'ZPUBLIC1', visibility: 'public' }),
        expect.objectContaining({ zoneId: 'ZPRIVATE1', visibility: 'private' }),
      ]),
    );
    expect(outcome.records).toHaveLength(4);
    expect(outcome.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fqdn: 'www.example.com.', type: 'A', ttl: 60 }),
        expect.objectContaining({ fqdn: 'app.example.com.', type: 'CNAME' }),
        expect.objectContaining({
          fqdn: 'root.example.com.',
          alias: {
            target: 'dualstack.load-balancer.example.',
            hostedZoneId: 'ZALIAS1',
            evaluateTargetHealth: false,
          },
        }),
        expect.objectContaining({ fqdn: 'internal.example.', type: 'NS' }),
      ]),
    );
    expect(outcome.records.find((record) => record.fqdn === 'notes.example.com.')).toBeUndefined();
    const aliasRecord = outcome.records.find((record) => record.fqdn === 'root.example.com.');
    expect(aliasRecord.version).toMatch(/^[a-f0-9]{64}$/u);
    expect(aliasRecord.recordId).not.toBe(aliasRecord.version);
    expect(client.listHostedZones).toHaveBeenNthCalledWith(1, { marker: undefined });
    expect(client.listHostedZones).toHaveBeenNthCalledWith(2, { marker: 'ZPRIVATE1' });
    expect(client.listResourceRecordSets).toHaveBeenNthCalledWith(2, {
      zoneId: 'ZPUBLIC1',
      name: 'root.example.com.',
      type: 'A',
      identifier: 'weighted-primary',
    });
  });

  it('returns a partial outcome when one owner-enabled zone is unauthorized without hiding collected records', async () => {
    const client = completeClient();
    client.listResourceRecordSets.mockImplementation(({ zoneId, name }) => {
      if (zoneId === 'ZPUBLIC1' && !name) {
        return Promise.resolve(publicRecordsFirstPage.replace('<IsTruncated>true</IsTruncated>', '<IsTruncated>false</IsTruncated>'));
      }
      if (zoneId === 'ZPRIVATE1') {
        return Promise.reject(
          new Route53RequestError({
            category: 'authorization',
            message: 'Not authorized.',
            retryable: false,
          }),
        );
      }
      return Promise.reject(new Error('Unexpected request.'));
    });
    const adapter = createRoute53Adapter({ configuration, client });

    const outcome = await adapter.collect(request());

    expect(outcome).toMatchObject({
      outcome: 'partial',
      coverageEvents: [
        { status: 'partial', reason: 'authorization', scope: 'zone:ZPRIVATE1' },
      ],
    });
    expect(outcome.records).toHaveLength(2);
    expect(outcome.zones).toEqual([
      expect.objectContaining({ zoneId: 'ZPUBLIC1' }),
    ]);
  });

  it('returns typed coverage for a requested zone outside the discovered owner scope', async () => {
    const client = completeClient();
    const adapter = createRoute53Adapter({ configuration, client });

    const outcome = await adapter.collect(request(['ZUNKNOWN']));

    expect(outcome).toMatchObject({
      outcome: 'partial',
      zones: [],
      records: [],
      coverageEvents: [
        { status: 'partial', reason: 'unsupported-scope', scope: 'zone:ZUNKNOWN' },
      ],
    });
    expect(client.listResourceRecordSets).not.toHaveBeenCalled();
  });

  it('returns a failure coverage outcome when account-zone inventory cannot be authorized', async () => {
    const client = {
      listHostedZones: vi.fn().mockRejectedValue(
        new Route53RequestError({
          category: 'authentication',
          message: 'Authentication failed.',
          retryable: false,
        }),
      ),
      listResourceRecordSets: vi.fn(),
    };
    const adapter = createRoute53Adapter({ configuration, client });

    await expect(adapter.collect(request(['ZPUBLIC1']))).resolves.toMatchObject({
      outcome: 'failure',
      coverageEvents: [{ status: 'failed', reason: 'authentication' }],
      failure: { category: 'authentication', retryable: false },
    });
  });

  it('rejects an empty owner-enabled zone selection before provider collection begins', async () => {
    const client = completeClient();
    const adapter = createRoute53Adapter({ configuration, client });

    await expect(adapter.collect(request([]))).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(client.listHostedZones).not.toHaveBeenCalled();
  });
});
