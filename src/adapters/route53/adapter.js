import { createHash } from 'node:crypto';

import { createProviderAdapter } from '../contracts.js';
import { ConfigurationError } from '../../errors/application-error.js';
import { createRoute53Client, Route53RequestError } from './client.js';
import { parseHostedZonesPage, parseResourceRecordSetsPage } from './xml.js';

const supportedRecordTypes = new Set(['A', 'AAAA', 'CNAME', 'MX', 'NS']);
const defaultMaximumPages = 100;

function timestamp(now) {
  return now().toISOString();
}

function stableHash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function route53CredentialValues(configuration) {
  const configuredCredentials = configuration.providerCredentials.find(
    (entry) => entry.provider === 'route53',
  );
  if (!configuredCredentials) {
    throw new ConfigurationError({
      message: 'Route 53 collection requires a declared route53 credential reference.',
    });
  }

  const { AWS_ACCESS_KEY_ID: accessKeyId, AWS_SECRET_ACCESS_KEY: secretAccessKey, AWS_SESSION_TOKEN: sessionToken } =
    configuredCredentials.values;
  if (!accessKeyId || !secretAccessKey) {
    throw new ConfigurationError({
      message: 'Route 53 collection requires declared AWS access-key and secret-access-key values.',
    });
  }

  return Object.freeze({ accessKeyId, secretAccessKey, ...(sessionToken ? { sessionToken } : {}) });
}

function coverageEvent({ request, status, reason, observedAt, scope = request.scope }) {
  return {
    component: 'route53.collection',
    provider: 'route53',
    scope,
    status,
    reason,
    observedAt,
  };
}

function failureOutcome({ request, error, observedAt }) {
  const category = error instanceof Route53RequestError ? error.category : 'unknown';
  const retryable = error instanceof Route53RequestError ? error.retryable : false;

  return {
    outcome: 'failure',
    provider: 'route53',
    providerAccountId: request.providerAccountId,
    coverageEvents: [
      coverageEvent({ request, status: 'failed', reason: category, observedAt }),
    ],
    failure: { category, retryable },
  };
}

function normalizedZone({ zone, request, observedAt }) {
  return {
    provider: 'route53',
    providerAccountId: request.providerAccountId,
    zoneId: zone.id,
    name: zone.name,
    visibility: zone.privateZone ? 'private' : 'public',
    observedAt,
  };
}

function normalizedRecord({ record, zoneId, request, observedAt }) {
  const recordIdentity = stableHash(
    [zoneId, record.name, record.type, record.setIdentifier ?? ''].join('\u0000'),
  );
  const version = stableHash(
    JSON.stringify({
      values: record.values,
      ttl: record.ttl,
      alias: record.alias,
    }),
  );

  return {
    recordKey: `route53:${request.providerAccountId}:${zoneId}:${recordIdentity}`,
    provider: 'route53',
    providerAccountId: request.providerAccountId,
    zoneId,
    recordId: recordIdentity,
    fqdn: record.name,
    type: record.type,
    values: record.values,
    ttl: record.ttl,
    alias: record.alias,
    version,
    observedAt,
  };
}

function assertMaximumPages(maximumPages) {
  if (!Number.isInteger(maximumPages) || maximumPages < 1 || maximumPages > 1000) {
    throw new TypeError('Route 53 maximumPages must be an integer between 1 and 1000.');
  }
}

async function collectHostedZones({ client, maximumPages }) {
  const zones = [];
  const markers = new Set();
  let marker;

  for (let pageNumber = 0; pageNumber < maximumPages; pageNumber += 1) {
    const page = parseHostedZonesPage(await client.listHostedZones({ marker }));
    zones.push(...page.zones);
    if (!page.isTruncated) {
      return zones;
    }
    if (!page.nextMarker || markers.has(page.nextMarker)) {
      throw new Route53RequestError({
        category: 'pagination',
        message: 'Route 53 hosted-zone pagination did not advance.',
        retryable: false,
      });
    }
    markers.add(page.nextMarker);
    marker = page.nextMarker;
  }

  throw new Route53RequestError({
    category: 'pagination',
    message: 'Route 53 hosted-zone pagination exceeded the approved page limit.',
    retryable: false,
  });
}

async function collectZoneRecords({ client, zoneId, maximumPages }) {
  const records = [];
  const continuations = new Set();
  let next;

  for (let pageNumber = 0; pageNumber < maximumPages; pageNumber += 1) {
    const page = parseResourceRecordSetsPage(
      await client.listResourceRecordSets({
        zoneId,
        name: next?.name,
        type: next?.type,
        identifier: next?.identifier,
      }),
    );
    records.push(...page.records);
    if (!page.isTruncated) {
      return records;
    }

    const continuationKey = `${page.next.name}\u0000${page.next.type}\u0000${page.next.identifier ?? ''}`;
    if (continuations.has(continuationKey)) {
      throw new Route53RequestError({
        category: 'pagination',
        message: 'Route 53 record pagination did not advance.',
        retryable: false,
      });
    }
    continuations.add(continuationKey);
    next = page.next;
  }

  throw new Route53RequestError({
    category: 'pagination',
    message: 'Route 53 record pagination exceeded the approved page limit.',
    retryable: false,
  });
}

export function createRoute53Adapter({
  configuration,
  client,
  now = () => new Date(),
  maximumPages = defaultMaximumPages,
}) {
  assertMaximumPages(maximumPages);
  const route53Client = client ?? createRoute53Client({
    credentials: route53CredentialValues(configuration),
  });

  return createProviderAdapter({
    provider: 'route53',
    async collect(request) {
      const observedAt = timestamp(now);
      if (!request.zoneIds || request.zoneIds.length === 0) {
        return failureOutcome({
          request,
          observedAt,
          error: new Route53RequestError({
            category: 'configuration',
            message: 'Route 53 collection requires one or more owner-enabled zone IDs.',
            retryable: false,
          }),
        });
      }

      let hostedZones;
      try {
        hostedZones = await collectHostedZones({
          client: route53Client,
          maximumPages,
        });
      } catch (error) {
        return failureOutcome({ request, error, observedAt });
      }

      const enabledZones = new Map(request.zoneIds.map((zoneId) => [zoneId, undefined]));
      for (const hostedZone of hostedZones) {
        if (enabledZones.has(hostedZone.id)) {
          enabledZones.set(hostedZone.id, hostedZone);
        }
      }

      const zones = [];
      const records = [];
      const incompleteScopes = [];
      for (const [zoneId, hostedZone] of enabledZones) {
        if (!hostedZone) {
          incompleteScopes.push({ scope: `zone:${zoneId}`, reason: 'unsupported-scope' });
          continue;
        }

        try {
          const collectedRecords = await collectZoneRecords({
            client: route53Client,
            zoneId,
            maximumPages,
          });
          zones.push(normalizedZone({ zone: hostedZone, request, observedAt }));
          records.push(
            ...collectedRecords
              .filter((record) => supportedRecordTypes.has(record.type))
              .map((record) => normalizedRecord({ record, zoneId, request, observedAt })),
          );
        } catch (error) {
          incompleteScopes.push({
            scope: `zone:${zoneId}`,
            reason: error instanceof Route53RequestError ? error.category : 'unknown',
          });
        }
      }

      const providerAccount = {
        provider: 'route53',
        accountId: request.providerAccountId,
        displayName: `Route 53 account ${request.providerAccountId}`,
        collectionScope: request.scope,
        observedAt,
      };

      if (incompleteScopes.length > 0) {
        return {
          outcome: 'partial',
          provider: 'route53',
          providerAccount,
          zones,
          records,
          coverageEvents: incompleteScopes.map((incompleteScope) =>
            coverageEvent({
              request,
              status: 'partial',
              reason: incompleteScope.reason,
              observedAt,
              scope: incompleteScope.scope,
            }),
          ),
        };
      }

      return {
        outcome: 'success',
        provider: 'route53',
        providerAccount,
        zones,
        records,
        coverageEvents: [
          coverageEvent({
            request,
            status: 'complete',
            reason: 'complete',
            observedAt,
          }),
        ],
      };
    },
  });
}
