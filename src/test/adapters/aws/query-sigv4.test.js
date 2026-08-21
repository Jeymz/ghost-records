import { describe, expect, it } from 'vitest';

import {
  awsQuerySigningInternals,
  createSignedAwsQueryGetRequest,
} from '../../../adapters/aws/query-sigv4.js';

const credentials = Object.freeze({
  accessKeyId: 'AKIATESTACCESSKEY',
  secretAccessKey: 'test-secret-access-key',
  sessionToken: 'test-session-token',
});
const now = new Date('2026-08-20T12:34:56Z');

describe('AWS Query SigV4 signer', () => {
  it('builds an HTTPS-only signed EC2 DescribeAddresses GET request', () => {
    const signed = createSignedAwsQueryGetRequest({
      endpoint: 'https://ec2.us-west-2.amazonaws.com',
      service: 'ec2',
      region: 'us-west-2',
      action: 'DescribeAddresses',
      version: '2016-11-15',
      parameters: { 'PublicIp.1': '198.51.100.10' },
      credentials,
      now,
    });

    expect(signed.url).toBe(
      'https://ec2.us-west-2.amazonaws.com/?Action=DescribeAddresses&PublicIp.1=198.51.100.10&Version=2016-11-15',
    );
    expect(signed.init).toMatchObject({
      method: 'GET',
      redirect: 'error',
      headers: {
        'x-amz-date': '20260820T123456Z',
        'x-amz-security-token': 'test-session-token',
      },
    });
    expect(signed.init.headers.Authorization).toContain(
      'Credential=AKIATESTACCESSKEY/20260820/us-west-2/ec2/aws4_request',
    );
    expect(signed.canonicalRequest).toContain('host:ec2.us-west-2.amazonaws.com');
    expect(signed.canonicalRequest).toContain('x-amz-security-token:test-session-token');
  });

  it('signs fixed STS caller identity scope deterministically', () => {
    const signed = createSignedAwsQueryGetRequest({
      endpoint: 'https://sts.amazonaws.com',
      service: 'sts',
      region: 'us-east-1',
      action: 'GetCallerIdentity',
      version: '2011-06-15',
      credentials,
      now,
    });

    expect(signed.url).toBe('https://sts.amazonaws.com/?Action=GetCallerIdentity&Version=2011-06-15');
    expect(signed.init.headers.Authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIATESTACCESSKEY/20260820/us-east-1/sts/aws4_request, SignedHeaders=host;x-amz-date;x-amz-security-token, Signature=fefa8e76d1220f670894d4c46380a5be68d8a26c4f62ddf7dbb08cd3621b3469',
    );
  });

  it('sorts and encodes canonical query parameters according to the signing contract', () => {
    expect(
      awsQuerySigningInternals.canonicalQuery({ z: 'a b', a: '!*()', empty: '' }),
    ).toBe('a=%21%2A%28%29&empty=&z=a%20b');
  });

  it('rejects non-HTTPS or mutable endpoint forms before signing', () => {
    expect(() =>
      createSignedAwsQueryGetRequest({
        endpoint: 'http://ec2.us-east-1.amazonaws.com',
        service: 'ec2',
        region: 'us-east-1',
        action: 'DescribeAddresses',
        version: '2016-11-15',
        credentials,
        now,
      }),
    ).toThrow(TypeError);
  });
});
