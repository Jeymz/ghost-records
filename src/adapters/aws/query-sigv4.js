import { createHash, createHmac } from 'node:crypto';

const signerAlgorithm = 'AWS4-HMAC-SHA256';
const emptyPayloadHash = createHash('sha256').update('').digest('hex');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key, value) {
  return createHmac('sha256', key).update(value).digest();
}

function uriEncode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function canonicalQuery(parameters) {
  return Object.entries(parameters)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [uriEncode(key), uriEncode(String(value))])
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey),
    )
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

function toAmzDate(now) {
  const iso = now.toISOString();
  return `${iso.slice(0, 10).replaceAll('-', '')}T${iso.slice(11, 19).replaceAll(':', '')}Z`;
}

function assertCredentials(credentials) {
  if (
    !credentials ||
    typeof credentials.accessKeyId !== 'string' ||
    credentials.accessKeyId.length === 0 ||
    typeof credentials.secretAccessKey !== 'string' ||
    credentials.secretAccessKey.length === 0
  ) {
    throw new TypeError('AWS Query API credentials require an access key ID and secret access key.');
  }

  if (
    credentials.sessionToken !== undefined &&
    (typeof credentials.sessionToken !== 'string' || credentials.sessionToken.length === 0)
  ) {
    throw new TypeError('AWS Query API session token must be non-empty when supplied.');
  }
}

function assertEndpoint(endpoint) {
  const parsed = new URL(endpoint);
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new TypeError('AWS Query API endpoint must be a fixed HTTPS origin without path, credentials, port, or query.');
  }
  return parsed;
}

function deriveSigningKey({ secretAccessKey, dateStamp, region, service }) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, service);
  return hmac(serviceKey, 'aws4_request');
}

export function createSignedAwsQueryGetRequest({
  endpoint,
  service,
  region,
  action,
  version,
  parameters = {},
  credentials,
  now = new Date(),
}) {
  assertCredentials(credentials);
  const endpointUrl = assertEndpoint(endpoint);

  if (
    typeof service !== 'string' || service.length === 0 ||
    typeof region !== 'string' || region.length === 0 ||
    typeof action !== 'string' || action.length === 0 ||
    typeof version !== 'string' || version.length === 0 ||
    !(now instanceof Date) || Number.isNaN(now.getTime())
  ) {
    throw new TypeError('AWS Query API signing requires fixed service, region, action, version, and Date values.');
  }

  const requestTimestamp = toAmzDate(now);
  const dateStamp = requestTimestamp.slice(0, 8);
  const queryString = canonicalQuery({ Action: action, Version: version, ...parameters });
  const headers = {
    host: endpointUrl.host,
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
    '/',
    queryString,
    `${canonicalHeaders}\n`,
    signedHeaders,
    emptyPayloadHash,
  ].join('\n');
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    signerAlgorithm,
    requestTimestamp,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n');
  const signature = createHmac('sha256', deriveSigningKey({
    secretAccessKey: credentials.secretAccessKey,
    dateStamp,
    region,
    service,
  }))
    .update(stringToSign)
    .digest('hex');

  return Object.freeze({
    url: `${endpointUrl.origin}/?${queryString}`,
    requestTimestamp,
    canonicalRequest,
    stringToSign,
    init: Object.freeze({
      method: 'GET',
      redirect: 'error',
      headers: Object.freeze({
        Authorization: `${signerAlgorithm} Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
        'x-amz-date': requestTimestamp,
        ...(credentials.sessionToken ? { 'x-amz-security-token': credentials.sessionToken } : {}),
      }),
    }),
  });
}

export const awsQuerySigningInternals = Object.freeze({ canonicalQuery, emptyPayloadHash });
