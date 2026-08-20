import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  allowBooleanAttributes: false,
  attributeNamePrefix: '@_',
  ignoreAttributes: false,
  ignoreDeclaration: true,
  parseAttributeValue: false,
  parseTagValue: false,
  processEntities: false,
  removeNSPrefix: false,
  trimValues: true,
});

export const ROUTE53_MAX_RESPONSE_BYTES = 1_048_576;
export const ROUTE53_MAX_XML_DEPTH = 32;

function assertXmlDepth(xml) {
  const tags = xml.match(/<[^>]+>/gu) ?? [];
  let depth = 0;

  for (const tag of tags) {
    if (tag.startsWith('<?') || tag.startsWith('<!')) {
      continue;
    }
    if (tag.startsWith('</')) {
      depth -= 1;
      if (depth < 0) {
        throw new TypeError('Route 53 XML response has an invalid closing-tag structure.');
      }
      continue;
    }
    if (!tag.endsWith('/>')) {
      depth += 1;
      if (depth > ROUTE53_MAX_XML_DEPTH) {
        throw new RangeError('Route 53 XML response exceeds the approved nesting-depth limit.');
      }
    }
  }
}

function asArray(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function text(value, fieldName, { optional = false } = {}) {
  if (value === undefined || value === null) {
    if (optional) {
      return undefined;
    }
    throw new TypeError(`Route 53 XML response is missing ${fieldName}.`);
  }

  if (typeof value === 'object') {
    if (typeof value['#text'] === 'string') {
      return value['#text'];
    }
    throw new TypeError(`Route 53 XML response has an invalid ${fieldName} value.`);
  }

  if (typeof value !== 'string') {
    throw new TypeError(`Route 53 XML response has a non-string ${fieldName} value.`);
  }

  return value;
}

function booleanText(value, fieldName) {
  const parsed = text(value, fieldName);
  if (parsed !== 'true' && parsed !== 'false') {
    throw new TypeError(`Route 53 XML response has an invalid ${fieldName} boolean.`);
  }
  return parsed === 'true';
}

function integerText(value, fieldName) {
  const parsed = text(value, fieldName);
  if (!/^[0-9]+$/.test(parsed)) {
    throw new TypeError(`Route 53 XML response has an invalid ${fieldName} integer.`);
  }
  return Number.parseInt(parsed, 10);
}

export function parseRoute53Xml(xml) {
  if (typeof xml !== 'string' || xml.length === 0) {
    throw new TypeError('Route 53 XML response body must be a non-empty string.');
  }

  if (Buffer.byteLength(xml, 'utf8') > ROUTE53_MAX_RESPONSE_BYTES) {
    throw new RangeError('Route 53 XML response exceeds the approved size limit.');
  }

  if (/<!\s*(?:DOCTYPE|ENTITY)\b/iu.test(xml)) {
    throw new TypeError('Route 53 XML response contains a prohibited DTD or entity declaration.');
  }

  assertXmlDepth(xml);

  let parsed;
  try {
    parsed = parser.parse(xml);
  } catch (error) {
    throw new TypeError('Route 53 XML response could not be parsed.', { cause: error });
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('Route 53 XML response has an invalid root object.');
  }

  return parsed;
}

function responseRoot(parsed, rootName) {
  const root = parsed[rootName];
  if (!root || typeof root !== 'object' || Array.isArray(root)) {
    throw new TypeError(`Route 53 XML response is missing ${rootName}.`);
  }
  return root;
}

export function parseHostedZonesPage(xml) {
  const root = responseRoot(parseRoute53Xml(xml), 'ListHostedZonesResponse');
  const zones = asArray(root.HostedZones?.HostedZone).map((zone) => ({
    id: text(zone.Id, 'HostedZone.Id').replace(/^\/hostedzone\//, ''),
    name: text(zone.Name, 'HostedZone.Name'),
    privateZone: booleanText(zone.Config?.PrivateZone ?? 'false', 'HostedZone.Config.PrivateZone'),
  }));
  const isTruncated = booleanText(root.IsTruncated, 'IsTruncated');
  const nextMarker = text(root.NextMarker, 'NextMarker', { optional: !isTruncated });

  if (isTruncated && !nextMarker) {
    throw new TypeError('Route 53 XML response is truncated without NextMarker.');
  }

  return Object.freeze({
    zones: Object.freeze(zones),
    isTruncated,
    nextMarker,
  });
}

function parseAlias(aliasTarget) {
  if (!aliasTarget) {
    return null;
  }

  return {
    target: text(aliasTarget.DNSName, 'AliasTarget.DNSName'),
    hostedZoneId: text(aliasTarget.HostedZoneId, 'AliasTarget.HostedZoneId'),
    evaluateTargetHealth: booleanText(
      aliasTarget.EvaluateTargetHealth,
      'AliasTarget.EvaluateTargetHealth',
    ),
  };
}

function parseRecord(record) {
  const resourceRecords = asArray(record.ResourceRecords?.ResourceRecord).map((resourceRecord) =>
    text(resourceRecord.Value, 'ResourceRecord.Value'),
  );
  const alias = parseAlias(record.AliasTarget);

  if (!alias && resourceRecords.length === 0) {
    throw new TypeError('Route 53 resource record set has neither ResourceRecords nor AliasTarget.');
  }

  return {
    name: text(record.Name, 'ResourceRecordSet.Name'),
    type: text(record.Type, 'ResourceRecordSet.Type'),
    ttl: alias ? 0 : integerText(record.TTL, 'ResourceRecordSet.TTL'),
    values: alias ? [alias.target] : resourceRecords,
    alias,
    setIdentifier: text(record.SetIdentifier, 'ResourceRecordSet.SetIdentifier', { optional: true }),
  };
}

export function parseResourceRecordSetsPage(xml) {
  const root = responseRoot(parseRoute53Xml(xml), 'ListResourceRecordSetsResponse');
  const records = asArray(root.ResourceRecordSets?.ResourceRecordSet).map(parseRecord);
  const isTruncated = booleanText(root.IsTruncated, 'IsTruncated');
  const nextName = text(root.NextRecordName, 'NextRecordName', { optional: !isTruncated });
  const nextType = text(root.NextRecordType, 'NextRecordType', { optional: !isTruncated });
  const nextIdentifier = text(root.NextRecordIdentifier, 'NextRecordIdentifier', {
    optional: true,
  });

  if (isTruncated && (!nextName || !nextType)) {
    throw new TypeError('Route 53 XML response is truncated without a complete record continuation tuple.');
  }

  return Object.freeze({
    records: Object.freeze(records),
    isTruncated,
    next: isTruncated
      ? Object.freeze({ name: nextName, type: nextType, identifier: nextIdentifier })
      : undefined,
  });
}
