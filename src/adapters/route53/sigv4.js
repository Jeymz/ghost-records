import { createHash, createHmac } from 'node:crypto';

export const ROUTE53_ENDPOINT = 'https://route53.amazonaws.com';
export const ROUTE53_SIGNING_REGION = 'us-east-1';
export const ROUTE53_SERVICE = 'route53';

const signerAlgorithm = 'AWS4-HMAC-SHA256';
const emptyPayloadHash = createHash('sha256').update('').digest('hex');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key, value) {
  return createHmac('sha256', key).update(value).digest();
}

function toAmzDate(now) {
  const iso = now.toISOString();
  return `${iso.slice(0, 10).replaceAll('-', '')}T${iso.slice(11, 19).replaceAll(':', '')}Z`;
}

function uriEncode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function canonicalQuery(parameters = {}) {
  return Object.entries(parameters)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [uriEncode(key), uriEncode(String(value))])
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey),
    )
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

function deriveSigningKey({ secretAccessKey, dateStamp }) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, ROUTE53_SIGNING_REGION);
  const serviceKey = hmac(regionKey, ROUTE53_SERVICE);
  return hmac(serviceKey, 'aws4_request');
}

function assertCredentials(credentials) {
  if (
    !credentials ||
    typeof credentials.accessKeyId !== 'string' ||
    credentials.accessKeyId.length === 0 ||
    typeof credentials.secretAccessKey !== 'string' ||
    credentials.secretAccessKey.length === 0
  ) {
    throw new TypeError('Route 53 credentials require a non-empty access key ID and secret access key.');
  }

  if (
    credentials.sessionToken !== undefined &&
    (typeof credentials.sessionToken !== 'string' || credentials.sessionToken.length === 0)
  ) {
    throw new TypeError('Route 53 session token must be a non-empty string when supplied.');
  }
}

function assertReadOnlyPath(path) {
  if (typeof path !== 'string' || !path.startsWith('/2013-04-01/')) {
    throw new TypeError('Route 53 request path must use the approved API version prefix.');
  }
}

export function createSignedRoute53GetRequest({
  path,
  query,
  credentials,
  now = new Date(),
}) {
  assertCredentials(credentials);
  assertReadOnlyPath(path);

  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError('Route 53 signing requires a valid Date.');
  }

  const requestTimestamp = toAmzDate(now);
  const dateStamp = requestTimestamp.slice(0, 8);
  const queryString = canonicalQuery(query);
  const headers = {
    host: 'route53.amazonaws.com',
    'x-amz-date': requestTimestamp,
  };

  if (credentials.sessionToken) {
    headers['x-amz-security-token'] = credentials.sessionToken;
  }

  const canonicalHeaders = Object.entries(headers)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}:${String(value).trim().replaceAll(/\s+/g, ' ')}`)
    .join('\n');
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalRequest = [
    'GET',
    path,
    queryString,
    `${canonicalHeaders}\n`,
    signedHeaders,
    emptyPayloadHash,
  ].join('\n');
  const credentialScope = `${dateStamp}/${ROUTE53_SIGNING_REGION}/${ROUTE53_SERVICE}/aws4_request`;
  const stringToSign = [
    signerAlgorithm,
    requestTimestamp,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n');
  const signature = createHmac('sha256', deriveSigningKey({
    secretAccessKey: credentials.secretAccessKey,
    dateStamp,
  }))
    .update(stringToSign)
    .digest('hex');
  const authorization = `${signerAlgorithm} Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const url = `${ROUTE53_ENDPOINT}${path}${queryString ? `?${queryString}` : ''}`;

  return Object.freeze({
    url,
    requestTimestamp,
    canonicalRequest,
    stringToSign,
    init: Object.freeze({
      method: 'GET',
      redirect: 'error',
      headers: Object.freeze({
        Authorization: authorization,
        'x-amz-date': requestTimestamp,
        ...(credentials.sessionToken
          ? { 'x-amz-security-token': credentials.sessionToken }
          : {}),
      }),
    }),
  });
}

export const route53SigningInternals = Object.freeze({
  canonicalQuery,
  emptyPayloadHash,
});
