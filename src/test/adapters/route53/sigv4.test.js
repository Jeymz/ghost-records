import { describe, expect, it } from 'vitest';

import {
  createSignedRoute53GetRequest,
  ROUTE53_ENDPOINT,
  ROUTE53_SIGNING_REGION,
  ROUTE53_SERVICE,
} from '../../../adapters/route53/sigv4.js';

describe('Route 53 native SigV4 signing', () => {
  it('creates a deterministic signed GET request for the fixed Route 53 endpoint', () => {
    const signed = createSignedRoute53GetRequest({
      path: '/2013-04-01/hostedzone',
      query: { marker: 'ZPRIVATE1', maxitems: 100 },
      credentials: {
        accessKeyId: 'AKIATESTACCESSKEY',
        secretAccessKey: 'test-secret-access-key',
      },
      now: new Date('2026-08-20T12:34:56.000Z'),
    });

    expect(ROUTE53_ENDPOINT).toBe('https://route53.amazonaws.com');
    expect(ROUTE53_SIGNING_REGION).toBe('us-east-1');
    expect(ROUTE53_SERVICE).toBe('route53');
    expect(signed.url).toBe(
      'https://route53.amazonaws.com/2013-04-01/hostedzone?marker=ZPRIVATE1&maxitems=100',
    );
    expect(signed.init).toMatchObject({ method: 'GET', redirect: 'error' });
    expect(signed.canonicalRequest).toContain('GET\n/2013-04-01/hostedzone\nmarker=ZPRIVATE1&maxitems=100');
    expect(signed.init.headers.Authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIATESTACCESSKEY/20260820/us-east-1/route53/aws4_request, SignedHeaders=host;x-amz-date, Signature=ef8a85a394ddb800931e511453f5afa36b478bc74fc01b6182a10cd0154804a0',
    );
  });

  it('adds an optional session token to the signed header set', () => {
    const signed = createSignedRoute53GetRequest({
      path: '/2013-04-01/hostedzone',
      credentials: {
        accessKeyId: 'AKIATESTACCESSKEY',
        secretAccessKey: 'test-secret-access-key',
        sessionToken: 'test-session-token',
      },
      now: new Date('2026-08-20T12:34:56.000Z'),
    });

    expect(signed.init.headers['x-amz-security-token']).toBe('test-session-token');
    expect(signed.init.headers.Authorization).toContain(
      'SignedHeaders=host;x-amz-date;x-amz-security-token',
    );
  });

  it('rejects non-Route-53 API paths and incomplete credentials', () => {
    expect(() =>
      createSignedRoute53GetRequest({
        path: '/unexpected',
        credentials: {
          accessKeyId: 'AKIATESTACCESSKEY',
          secretAccessKey: 'test-secret-access-key',
        },
      }),
    ).toThrow(TypeError);

    expect(() =>
      createSignedRoute53GetRequest({
        path: '/2013-04-01/hostedzone',
        credentials: { accessKeyId: 'AKIATESTACCESSKEY' },
      }),
    ).toThrow(TypeError);
  });
});
