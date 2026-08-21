import { createSignedAwsQueryGetRequest } from './query-sigv4.js';
import { parseCallerIdentityXml, parseDescribeAddressesXml } from './xml.js';

const maxResponseBytes = 1_000_000;
const maxRetries = 2;
const ec2ApiVersion = '2016-11-15';
const stsApiVersion = '2011-06-15';
const regionalPattern = /^[a-z]{2}-[a-z0-9-]+-\d+$/u;

export const STS_ENDPOINT = 'https://sts.amazonaws.com';

export class AwsQueryClientError extends Error {
  constructor({ category, message, retryable, cause = undefined }) {
    super(message, cause ? { cause } : undefined);
    this.name = 'AwsQueryClientError';
    this.category = category;
    this.retryable = retryable;
  }
}

function classifyHttpStatus(status) {
  if (status === 401) return { category: 'authentication', retryable: false };
  if (status === 403) return { category: 'authorization', retryable: false };
  if (status === 429) return { category: 'throttling', retryable: true };
  if (status >= 500) return { category: 'network', retryable: true };
  return { category: 'malformed-response', retryable: false };
}

function assertRegion(region) {
  if (typeof region !== 'string' || !regionalPattern.test(region)) {
    throw new TypeError('AWS EC2 region must be a validated regional identifier.');
  }
  return region;
}

function ec2Endpoint(region) {
  return `https://ec2.${assertRegion(region)}.amazonaws.com`;
}

function defaultSleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readXmlResponse(response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('xml')) {
    throw new AwsQueryClientError({
      category: 'malformed-response',
      message: 'AWS Query response did not declare an XML content type.',
      retryable: false,
    });
  }

  const declaredLength = response.headers.get('content-length');
  if (declaredLength && Number(declaredLength) > maxResponseBytes) {
    throw new AwsQueryClientError({
      category: 'malformed-response',
      message: 'AWS Query response exceeded the approved size boundary.',
      retryable: false,
    });
  }

  const xml = await response.text();
  if (Buffer.byteLength(xml, 'utf8') > maxResponseBytes) {
    throw new AwsQueryClientError({
      category: 'malformed-response',
      message: 'AWS Query response exceeded the approved size boundary.',
      retryable: false,
    });
  }
  return xml;
}

export function createAwsOwnershipClient({
  credentials,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  sleep = defaultSleep,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('AWS ownership client requires a fetch implementation.');
  }
  if (typeof now !== 'function' || typeof sleep !== 'function') {
    throw new TypeError('AWS ownership client requires clock and sleep functions.');
  }

  async function request({ endpoint, service, region, action, version, parameters, parse }) {
    let attempt = 0;

    while (attempt <= maxRetries) {
      const signed = createSignedAwsQueryGetRequest({
        endpoint,
        service,
        region,
        action,
        version,
        parameters,
        credentials,
        now: now(),
      });

      try {
        const response = await fetchImpl(signed.url, signed.init);
        if (!response.ok) {
          const classified = classifyHttpStatus(response.status);
          if (classified.retryable && attempt < maxRetries) {
            await sleep(25 * (attempt + 1));
            attempt += 1;
            continue;
          }
          throw new AwsQueryClientError({
            ...classified,
            message: `AWS Query request failed with HTTP status ${response.status}.`,
          });
        }

        const xml = await readXmlResponse(response);
        try {
          return parse(xml);
        } catch (error) {
          throw new AwsQueryClientError({
            category: 'malformed-response',
            message: 'AWS Query response did not match the expected XML contract.',
            retryable: false,
            cause: error,
          });
        }
      } catch (error) {
        if (error instanceof AwsQueryClientError) throw error;
        if (attempt < maxRetries) {
          await sleep(25 * (attempt + 1));
          attempt += 1;
          continue;
        }
        throw new AwsQueryClientError({
          category: 'network',
          message: 'AWS Query request could not be completed.',
          retryable: true,
          cause: error,
        });
      }
    }

    throw new AwsQueryClientError({
      category: 'network',
      message: 'AWS Query request exhausted the approved retry budget.',
      retryable: true,
    });
  }

  return Object.freeze({
    getCallerIdentity() {
      return request({
        endpoint: STS_ENDPOINT,
        service: 'sts',
        region: 'us-east-1',
        action: 'GetCallerIdentity',
        version: stsApiVersion,
        parameters: {},
        parse: parseCallerIdentityXml,
      });
    },
    describeAddresses({ region, publicIp }) {
      if (typeof publicIp !== 'string' || publicIp.length === 0) {
        throw new TypeError('EC2 DescribeAddresses requires a non-empty public IPv4 address.');
      }
      return request({
        endpoint: ec2Endpoint(region),
        service: 'ec2',
        region: assertRegion(region),
        action: 'DescribeAddresses',
        version: ec2ApiVersion,
        parameters: { 'PublicIp.1': publicIp },
        parse: parseDescribeAddressesXml,
      });
    },
  });
}

export const awsOwnershipClientInternals = Object.freeze({ ec2Endpoint, maxRetries });
