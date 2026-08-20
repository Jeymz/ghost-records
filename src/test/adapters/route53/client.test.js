import { describe, expect, it, vi } from 'vitest';

import {
  createRoute53Client,
  Route53RequestError,
} from '../../../adapters/route53/client.js';
import {
  parseHostedZonesPage,
  parseResourceRecordSetsPage,
} from '../../../adapters/route53/xml.js';
import {
  hostedZonesFirstPage,
  malformedXml,
  publicRecordsFirstPage,
} from '../../fixtures/route53/responses.js';

const credentials = Object.freeze({
  accessKeyId: 'AKIATESTACCESSKEY',
  secretAccessKey: 'test-secret-access-key',
});

function response({ body, status = 200, contentType = 'application/xml' }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => contentType },
    text: async () => body,
  };
}

describe('Route 53 direct client', () => {
  it('uses only fixed-endpoint signed GET requests for hosted-zone inventory', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      response({ body: hostedZonesFirstPage }),
    );
    const client = createRoute53Client({
      credentials,
      fetchImplementation,
      now: () => new Date('2026-08-20T12:34:56.000Z'),
    });

    await expect(client.listHostedZones()).resolves.toContain('ListHostedZonesResponse');

    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://route53.amazonaws.com/2013-04-01/hostedzone?maxitems=100',
      expect.objectContaining({
        method: 'GET',
        redirect: 'error',
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^AWS4-HMAC-SHA256 /),
          'x-amz-date': '20260820T123456Z',
        }),
      }),
    );
  });

  it('classifies authorization, throttling, malformed content, and response-limit failures', async () => {
    const authorizationClient = createRoute53Client({
      credentials,
      fetchImplementation: vi.fn().mockResolvedValue(
        response({ body: '<Error />', status: 403 }),
      ),
    });
    await expect(authorizationClient.listHostedZones()).rejects.toMatchObject({
      category: 'authorization',
      retryable: false,
    });

    const sleep = vi.fn().mockResolvedValue(undefined);
    const throttledClient = createRoute53Client({
      credentials,
      fetchImplementation: vi
        .fn()
        .mockResolvedValueOnce(response({ body: '<Error />', status: 429 }))
        .mockResolvedValueOnce(response({ body: hostedZonesFirstPage })),
      sleep,
    });
    await expect(throttledClient.listHostedZones()).resolves.toContain('ListHostedZonesResponse');
    expect(sleep).toHaveBeenCalledWith(100);

    const invalidContentTypeClient = createRoute53Client({
      credentials,
      fetchImplementation: vi.fn().mockResolvedValue(
        response({ body: hostedZonesFirstPage, contentType: 'application/json' }),
      ),
    });
    await expect(invalidContentTypeClient.listHostedZones()).rejects.toMatchObject({
      category: 'malformed-response',
    });

    const oversizedResponseClient = createRoute53Client({
      credentials,
      maxResponseBytes: 16,
      fetchImplementation: vi.fn().mockResolvedValue(response({ body: hostedZonesFirstPage })),
    });
    await expect(oversizedResponseClient.listHostedZones()).rejects.toMatchObject({
      category: 'malformed-response',
    });
  });

  it('rejects invalid hosted-zone identifiers before network activity', async () => {
    const fetchImplementation = vi.fn();
    const client = createRoute53Client({ credentials, fetchImplementation });

    expect(() => client.listResourceRecordSets({ zoneId: '../unsafe' })).toThrow(TypeError);
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});

describe('Route 53 XML extraction boundary', () => {
  it('extracts hosted-zone and full record pagination values needed by the direct adapter', () => {
    expect(parseHostedZonesPage(hostedZonesFirstPage)).toMatchObject({
      isTruncated: true,
      nextMarker: 'ZPRIVATE1',
      zones: [{ id: 'ZPUBLIC1', privateZone: false }],
    });
    expect(parseResourceRecordSetsPage(publicRecordsFirstPage)).toMatchObject({
      isTruncated: true,
      next: {
        name: 'root.example.com.',
        type: 'A',
        identifier: 'weighted-primary',
      },
    });
  });

  it('rejects malformed, over-nested, and incomplete-paginated XML before adapter use', () => {
    expect(() => parseHostedZonesPage(malformedXml)).toThrow(TypeError);
    expect(() =>
      parseHostedZonesPage(
        hostedZonesFirstPage.replace('<NextMarker>ZPRIVATE1</NextMarker>', ''),
      ),
    ).toThrow(TypeError);
    expect(() =>
      parseHostedZonesPage(`${'<item>'.repeat(33)}${'</item>'.repeat(33)}`),
    ).toThrow(RangeError);
    expect(() =>
      parseHostedZonesPage(
        '<!DOCTYPE doc [<!ENTITY unsafe "unexpected">]><ListHostedZonesResponse />',
      ),
    ).toThrow(TypeError);
  });

  it('provides a stable typed error class to direct-client callers', () => {
    const error = new Route53RequestError({
      category: 'pagination',
      message: 'Page did not advance.',
      retryable: false,
    });
    expect(error).toMatchObject({ category: 'pagination', retryable: false });
  });
});
