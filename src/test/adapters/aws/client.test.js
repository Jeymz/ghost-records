import { describe, expect, it, vi } from 'vitest';

import {
  AwsQueryClientError,
  createAwsOwnershipClient,
} from '../../../adapters/aws/client.js';
import {
  callerIdentityXml,
  malformedAddressesXml,
  ownedIdleAddressXml,
} from '../../fixtures/aws/ownership-responses.js';

const credentials = Object.freeze({
  accessKeyId: 'AKIATESTACCESSKEY',
  secretAccessKey: 'test-secret-access-key',
});
const now = () => new Date('2026-08-20T12:34:56Z');

function xmlResponse(xml, status = 200) {
  return new Response(xml, {
    status,
    headers: { 'content-type': 'text/xml; charset=UTF-8' },
  });
}

describe('direct AWS ownership client', () => {
  it('calls only the fixed STS and derived regional EC2 endpoints with signed GET requests', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(xmlResponse(callerIdentityXml))
      .mockResolvedValueOnce(xmlResponse(ownedIdleAddressXml));
    const client = createAwsOwnershipClient({ credentials, fetchImpl, now, sleep: vi.fn() });

    await expect(client.getCallerIdentity()).resolves.toMatchObject({ accountId: '123456789012' });
    await expect(
      client.describeAddresses({ region: 'us-west-2', publicIp: '198.51.100.10' }),
    ).resolves.toEqual([
      expect.objectContaining({ publicIp: '198.51.100.10', allocationId: 'eipalloc-0123456789abcdef0' }),
    ]);

    expect(fetchImpl.mock.calls[0][0]).toContain('https://sts.amazonaws.com/?Action=GetCallerIdentity');
    expect(fetchImpl.mock.calls[1][0]).toContain('https://ec2.us-west-2.amazonaws.com/?Action=DescribeAddresses');
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({ method: 'GET', redirect: 'error' });
    expect(fetchImpl.mock.calls[1][1].headers.Authorization).toContain('/us-west-2/ec2/aws4_request');
  });

  it('retries only bounded retryable status responses and returns typed failures', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(xmlResponse('<error />', 503))
      .mockResolvedValueOnce(xmlResponse(callerIdentityXml));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = createAwsOwnershipClient({ credentials, fetchImpl, now, sleep });

    await expect(client.getCallerIdentity()).resolves.toMatchObject({ accountId: '123456789012' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledOnce();

    const deniedClient = createAwsOwnershipClient({
      credentials,
      fetchImpl: vi.fn().mockResolvedValue(xmlResponse('<error />', 403)),
      now,
      sleep,
    });
    await expect(deniedClient.getCallerIdentity()).rejects.toMatchObject({
      name: 'AwsQueryClientError',
      category: 'authorization',
      retryable: false,
    });
  });

  it('rejects malformed or non-XML ownership responses without leaking body content', async () => {
    const malformedClient = createAwsOwnershipClient({
      credentials,
      fetchImpl: vi.fn().mockResolvedValue(xmlResponse(malformedAddressesXml)),
      now,
      sleep: vi.fn(),
    });

    await expect(
      malformedClient.describeAddresses({ region: 'us-east-1', publicIp: '198.51.100.10' }),
    ).rejects.toBeInstanceOf(AwsQueryClientError);

    const nonXmlClient = createAwsOwnershipClient({
      credentials,
      fetchImpl: vi.fn().mockResolvedValue(
        new Response('{"unexpected":true}', { status: 200, headers: { 'content-type': 'application/json' } }),
      ),
      now,
      sleep: vi.fn(),
    });
    await expect(nonXmlClient.getCallerIdentity()).rejects.toMatchObject({
      category: 'malformed-response',
    });
  });

  it('rejects unvalidated regions before a network request', async () => {
    const fetchImpl = vi.fn();
    const client = createAwsOwnershipClient({ credentials, fetchImpl, now, sleep: vi.fn() });

    expect(() => client.describeAddresses({ region: 'https://invalid.example', publicIp: '198.51.100.10' })).toThrow(
      TypeError,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
