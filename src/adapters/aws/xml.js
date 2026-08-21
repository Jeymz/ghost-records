import { XMLParser } from 'fast-xml-parser';

const maxXmlBytes = 1_000_000;
const maxXmlDepth = 32;
const forbiddenDeclarationPattern = /<!DOCTYPE|<!ENTITY/iu;

function assertXmlPayload(xml, expectedRoot) {
  if (typeof xml !== 'string' || Buffer.byteLength(xml, 'utf8') > maxXmlBytes) {
    throw new TypeError('AWS Query XML response exceeds the approved size boundary.');
  }
  if (forbiddenDeclarationPattern.test(xml)) {
    throw new TypeError('AWS Query XML response contains a prohibited declaration.');
  }
  if (typeof expectedRoot !== 'string' || expectedRoot.length === 0) {
    throw new TypeError('AWS Query XML parser requires an expected response root.');
  }
}

function depthOf(value, currentDepth = 0) {
  if (value === null || typeof value !== 'object') return currentDepth;
  if (currentDepth > maxXmlDepth) return currentDepth;
  return Math.max(
    currentDepth,
    ...Object.values(value).map((nested) => depthOf(nested, currentDepth + 1)),
  );
}

function stringField(value, fieldName, { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new TypeError(`AWS Query XML response is missing ${fieldName}.`);
    return undefined;
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`AWS Query XML response has an invalid ${fieldName}.`);
  }
  return value;
}

function itemArray(container) {
  if (container === undefined || container === null || container === '') return [];
  if (typeof container !== 'object') {
    throw new TypeError('AWS Query XML response contains an invalid item container.');
  }
  if (container.item === undefined || container.item === null) return [];
  return Array.isArray(container.item) ? container.item : [container.item];
}

export function parseAwsQueryXml({ xml, expectedRoot }) {
  assertXmlPayload(xml, expectedRoot);
  const parser = new XMLParser({
    ignoreDeclaration: true,
    ignoreAttributes: true,
    processEntities: false,
    trimValues: true,
    parseTagValue: false,
  });
  const parsed = parser.parse(xml);

  if (!parsed || typeof parsed !== 'object' || Object.keys(parsed).length !== 1 || !parsed[expectedRoot]) {
    throw new TypeError('AWS Query XML response has an unexpected root element.');
  }
  if (depthOf(parsed) > maxXmlDepth) {
    throw new TypeError('AWS Query XML response exceeds the approved nesting boundary.');
  }

  return parsed[expectedRoot];
}

export function parseCallerIdentityXml(xml) {
  const root = parseAwsQueryXml({ xml, expectedRoot: 'GetCallerIdentityResponse' });
  const result = root.GetCallerIdentityResult;
  if (!result || typeof result !== 'object') {
    throw new TypeError('AWS STS response is missing GetCallerIdentityResult.');
  }

  return Object.freeze({
    accountId: stringField(result.Account, 'Account', { required: true }),
    arn: stringField(result.Arn, 'Arn', { required: true }),
    userId: stringField(result.UserId, 'UserId', { required: true }),
  });
}

export function parseDescribeAddressesXml(xml) {
  const root = parseAwsQueryXml({ xml, expectedRoot: 'DescribeAddressesResponse' });
  const addresses = itemArray(root.addressesSet).map((item) => {
    if (!item || typeof item !== 'object') {
      throw new TypeError('AWS EC2 response contains an invalid address item.');
    }

    return Object.freeze({
      publicIp: stringField(item.publicIp, 'publicIp', { required: true }),
      allocationId: stringField(item.allocationId, 'allocationId'),
      associationId: stringField(item.associationId, 'associationId'),
      instanceId: stringField(item.instanceId, 'instanceId'),
      networkInterfaceId: stringField(item.networkInterfaceId, 'networkInterfaceId'),
      networkInterfaceOwnerId: stringField(item.networkInterfaceOwnerId, 'networkInterfaceOwnerId'),
      privateIpAddress: stringField(item.privateIpAddress, 'privateIpAddress'),
      domain: stringField(item.domain, 'domain'),
    });
  });

  return Object.freeze(addresses);
}
