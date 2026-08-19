const schemaBase = 'https://ghost-records.dev/schemas/domain';

export const PROVIDERS = Object.freeze([
  'route53',
  'azure-dns',
  'godaddy',
  'namecheap',
]);

const identifierSchema = {
  type: 'string',
  minLength: 1,
  maxLength: 191,
  pattern: '^[A-Za-z0-9][A-Za-z0-9._:/@-]*$',
};

const timestampSchema = {
  type: 'string',
  minLength: 20,
  maxLength: 40,
  pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,9})?Z$',
};

const dnsNameSchema = {
  type: 'string',
  minLength: 1,
  maxLength: 253,
  pattern: '^[A-Za-z0-9_*][A-Za-z0-9_*.@-]*(?:\\.[A-Za-z0-9_*][A-Za-z0-9_*.@-]*)*\\.?$',
};

const ipAddressSchema = {
  type: 'string',
  minLength: 3,
  maxLength: 45,
  pattern: '^(?:(?:25[0-5]|2[0-4][0-9]|1?[0-9]{1,2})\\.){3}(?:25[0-5]|2[0-4][0-9]|1?[0-9]{1,2})$|^[0-9A-Fa-f:]+$',
};

const providerSchema = {
  type: 'string',
  enum: PROVIDERS,
};

const coverageReasonSchema = {
  type: 'string',
  enum: [
    'complete',
    'authorization',
    'authentication',
    'throttling',
    'network',
    'malformed-response',
    'pagination',
    'unsupported-scope',
    'configuration',
    'resolver-failure',
    'unknown',
  ],
};

const coverageEventProperties = {
  component: { type: 'string', minLength: 1, maxLength: 128 },
  provider: providerSchema,
  scope: { type: 'string', minLength: 1, maxLength: 512 },
  status: { type: 'string', enum: ['complete', 'partial', 'failed'] },
  reason: coverageReasonSchema,
  observedAt: timestampSchema,
};

export const providerAccountSchema = {
  $id: `${schemaBase}/provider-account.json`,
  type: 'object',
  additionalProperties: false,
  required: ['provider', 'accountId', 'displayName', 'collectionScope', 'observedAt'],
  properties: {
    provider: providerSchema,
    accountId: identifierSchema,
    displayName: { type: 'string', minLength: 1, maxLength: 256 },
    collectionScope: { type: 'string', minLength: 1, maxLength: 512 },
    observedAt: timestampSchema,
  },
};

export const dnsZoneSchema = {
  $id: `${schemaBase}/dns-zone.json`,
  type: 'object',
  additionalProperties: false,
  required: [
    'provider',
    'providerAccountId',
    'zoneId',
    'name',
    'visibility',
    'observedAt',
  ],
  properties: {
    provider: providerSchema,
    providerAccountId: identifierSchema,
    zoneId: identifierSchema,
    name: dnsNameSchema,
    visibility: { type: 'string', enum: ['public', 'private', 'unknown'] },
    observedAt: timestampSchema,
  },
};

export const dnsRecordSchema = {
  $id: `${schemaBase}/dns-record.json`,
  type: 'object',
  additionalProperties: false,
  required: [
    'recordKey',
    'provider',
    'providerAccountId',
    'zoneId',
    'recordId',
    'fqdn',
    'type',
    'values',
    'ttl',
    'alias',
    'version',
    'observedAt',
  ],
  properties: {
    recordKey: identifierSchema,
    provider: providerSchema,
    providerAccountId: identifierSchema,
    zoneId: identifierSchema,
    recordId: identifierSchema,
    fqdn: dnsNameSchema,
    type: { type: 'string', enum: ['A', 'AAAA', 'CNAME', 'MX', 'NS'] },
    values: {
      type: 'array',
      minItems: 1,
      maxItems: 100,
      uniqueItems: true,
      items: { type: 'string', minLength: 1, maxLength: 1024 },
    },
    ttl: { type: 'integer', minimum: 0, maximum: 2_147_483_647 },
    alias: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['target', 'hostedZoneId', 'evaluateTargetHealth'],
          properties: {
            target: dnsNameSchema,
            hostedZoneId: identifierSchema,
            evaluateTargetHealth: { type: 'boolean' },
          },
        },
      ],
    },
    version: { type: 'string', minLength: 1, maxLength: 191 },
    observedAt: timestampSchema,
  },
};

export const dnsObservationSchema = {
  $id: `${schemaBase}/dns-observation.json`,
  type: 'object',
  additionalProperties: false,
  required: [
    'recordKey',
    'queryName',
    'queryType',
    'chain',
    'answers',
    'rcode',
    'resolverEvidence',
    'observedAt',
  ],
  properties: {
    recordKey: identifierSchema,
    queryName: dnsNameSchema,
    queryType: { type: 'string', enum: ['A', 'AAAA', 'CNAME', 'MX', 'NS'] },
    chain: {
      type: 'array',
      maxItems: 32,
      items: dnsNameSchema,
    },
    answers: {
      type: 'array',
      maxItems: 100,
      uniqueItems: true,
      items: { type: 'string', minLength: 1, maxLength: 1024 },
    },
    rcode: {
      type: 'string',
      enum: ['NOERROR', 'NXDOMAIN', 'SERVFAIL', 'REFUSED', 'TIMEOUT', 'UNKNOWN'],
    },
    resolverEvidence: {
      type: 'object',
      additionalProperties: false,
      required: ['resolver', 'transport', 'queriedAt'],
      properties: {
        resolver: { type: 'string', minLength: 1, maxLength: 253 },
        transport: { type: 'string', enum: ['udp', 'tcp', 'doh', 'dot'] },
        queriedAt: timestampSchema,
      },
    },
    observedAt: timestampSchema,
  },
};

export const ownershipEvidenceSchema = {
  $id: `${schemaBase}/ownership-evidence.json`,
  type: 'object',
  additionalProperties: false,
  required: [
    'subject',
    'source',
    'scope',
    'classification',
    'confidence',
    'observedAt',
    'coverage',
  ],
  properties: {
    subject: { type: 'string', minLength: 1, maxLength: 1024 },
    source: { type: 'string', minLength: 1, maxLength: 128 },
    scope: { type: 'string', minLength: 1, maxLength: 512 },
    classification: {
      type: 'string',
      enum: ['owned', 'approved-external', 'unknown', 'not-found', 'unavailable'],
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    observedAt: timestampSchema,
    coverage: { type: 'string', enum: ['complete', 'partial', 'failed'] },
  },
};

export const coverageEventSchema = {
  $id: `${schemaBase}/coverage-event.json`,
  type: 'object',
  additionalProperties: false,
  required: ['component', 'provider', 'scope', 'status', 'reason', 'observedAt'],
  properties: coverageEventProperties,
};

export const scanJobSchema = {
  $id: `${schemaBase}/scan-job.json`,
  type: 'object',
  additionalProperties: false,
  required: [
    'jobId',
    'scope',
    'status',
    'leaseOwner',
    'leaseExpiresAt',
    'startedAt',
    'completedAt',
  ],
  properties: {
    jobId: identifierSchema,
    scope: { type: 'string', minLength: 1, maxLength: 512 },
    status: {
      type: 'string',
      enum: ['queued', 'running', 'completed', 'failed', 'cancelled'],
    },
    leaseOwner: { anyOf: [{ type: 'null' }, identifierSchema] },
    leaseExpiresAt: { anyOf: [{ type: 'null' }, timestampSchema] },
    startedAt: { anyOf: [{ type: 'null' }, timestampSchema] },
    completedAt: { anyOf: [{ type: 'null' }, timestampSchema] },
  },
};

export const findingSchema = {
  $id: `${schemaBase}/finding.json`,
  type: 'object',
  additionalProperties: false,
  required: [
    'findingId',
    'type',
    'severity',
    'confidence',
    'recordKey',
    'evidenceRefs',
    'status',
    'firstSeenAt',
    'lastSeenAt',
    'remediation',
  ],
  properties: {
    findingId: identifierSchema,
    type: {
      type: 'string',
      enum: [
        'dangling-eip',
        'cname-target-unresolved',
        'cname-resolution-drift',
        'domain-registration-drift',
        'ownership-unknown',
        'coverage-incomplete',
      ],
    },
    severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    recordKey: identifierSchema,
    evidenceRefs: {
      type: 'array',
      minItems: 1,
      maxItems: 100,
      uniqueItems: true,
      items: identifierSchema,
    },
    status: { type: 'string', enum: ['open', 'suppressed', 'remediated', 'accepted-risk'] },
    firstSeenAt: timestampSchema,
    lastSeenAt: timestampSchema,
    remediation: { type: 'string', minLength: 1, maxLength: 4000 },
  },
};

export const scanArtifactSchema = {
  $id: `${schemaBase}/scan-artifact.json`,
  type: 'object',
  additionalProperties: false,
  required: [
    'artifactId',
    'jobId',
    'schemaVersion',
    'format',
    'contentHash',
    'recordCount',
    'createdAt',
  ],
  properties: {
    artifactId: identifierSchema,
    jobId: identifierSchema,
    schemaVersion: { type: 'string', pattern: '^[0-9]+\\.[0-9]+\\.[0-9]+$' },
    format: { type: 'string', enum: ['json', 'markdown', 'csv'] },
    contentHash: { type: 'string', pattern: '^[A-Fa-f0-9]{64}$' },
    recordCount: { type: 'integer', minimum: 0 },
    createdAt: timestampSchema,
  },
};

export const providerCollectionRequestSchema = {
  $id: `${schemaBase}/provider-collection-request.json`,
  type: 'object',
  additionalProperties: false,
  required: ['provider', 'providerAccountId', 'scope'],
  properties: {
    provider: providerSchema,
    providerAccountId: identifierSchema,
    scope: { type: 'string', minLength: 1, maxLength: 512 },
    zoneIds: {
      type: 'array',
      minItems: 1,
      maxItems: 1000,
      uniqueItems: true,
      items: identifierSchema,
    },
  },
};

const providerSuccessOutcomeSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['outcome', 'provider', 'providerAccount', 'zones', 'records', 'coverageEvents'],
  properties: {
    outcome: { const: 'success' },
    provider: providerSchema,
    providerAccount: { $ref: providerAccountSchema.$id },
    zones: { type: 'array', maxItems: 1000, items: { $ref: dnsZoneSchema.$id } },
    records: { type: 'array', maxItems: 100000, items: { $ref: dnsRecordSchema.$id } },
    coverageEvents: {
      type: 'array',
      minItems: 1,
      maxItems: 1000,
      items: {
        allOf: [
          { $ref: coverageEventSchema.$id },
          {
            type: 'object',
            properties: { status: { const: 'complete' } },
            required: ['status'],
          },
        ],
      },
    },
  },
};

const providerPartialOutcomeSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['outcome', 'provider', 'providerAccount', 'zones', 'records', 'coverageEvents'],
  properties: {
    outcome: { const: 'partial' },
    provider: providerSchema,
    providerAccount: { $ref: providerAccountSchema.$id },
    zones: { type: 'array', maxItems: 1000, items: { $ref: dnsZoneSchema.$id } },
    records: { type: 'array', maxItems: 100000, items: { $ref: dnsRecordSchema.$id } },
    coverageEvents: {
      type: 'array',
      minItems: 1,
      maxItems: 1000,
      items: {
        allOf: [
          { $ref: coverageEventSchema.$id },
          {
            type: 'object',
            properties: { status: { const: 'partial' } },
            required: ['status'],
          },
        ],
      },
    },
  },
};

const adapterFailureSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['category', 'retryable'],
  properties: {
    category: coverageReasonSchema,
    retryable: { type: 'boolean' },
  },
};

const providerFailureOutcomeSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['outcome', 'provider', 'providerAccountId', 'coverageEvents', 'failure'],
  properties: {
    outcome: { const: 'failure' },
    provider: providerSchema,
    providerAccountId: identifierSchema,
    coverageEvents: {
      type: 'array',
      minItems: 1,
      maxItems: 1000,
      items: {
        allOf: [
          { $ref: coverageEventSchema.$id },
          {
            type: 'object',
            properties: { status: { const: 'failed' } },
            required: ['status'],
          },
        ],
      },
    },
    failure: adapterFailureSchema,
  },
};

export const providerCollectionOutcomeSchema = {
  $id: `${schemaBase}/provider-collection-outcome.json`,
  oneOf: [
    providerSuccessOutcomeSchema,
    providerPartialOutcomeSchema,
    providerFailureOutcomeSchema,
  ],
};

export const ownershipEvidenceRequestSchema = {
  $id: `${schemaBase}/ownership-evidence-request.json`,
  type: 'object',
  additionalProperties: false,
  required: ['subject', 'subjectType', 'scope'],
  properties: {
    subject: { type: 'string', minLength: 1, maxLength: 1024 },
    subjectType: { type: 'string', enum: ['ipv4', 'ipv6', 'hostname', 'cloud-resource'] },
    scope: { type: 'string', minLength: 1, maxLength: 512 },
    provider: providerSchema,
  },
};

const ownershipSuccessOutcomeSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['outcome', 'evidence'],
  properties: {
    outcome: { const: 'success' },
    evidence: { $ref: ownershipEvidenceSchema.$id },
  },
};

const ownershipPartialOutcomeSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['outcome', 'evidence', 'coverageEvents'],
  properties: {
    outcome: { const: 'partial' },
    evidence: { $ref: ownershipEvidenceSchema.$id },
    coverageEvents: {
      type: 'array',
      minItems: 1,
      maxItems: 100,
      items: {
        allOf: [
          { $ref: coverageEventSchema.$id },
          {
            type: 'object',
            properties: { status: { const: 'partial' } },
            required: ['status'],
          },
        ],
      },
    },
  },
};

const ownershipFailureOutcomeSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['outcome', 'coverageEvents', 'failure'],
  properties: {
    outcome: { const: 'failure' },
    coverageEvents: {
      type: 'array',
      minItems: 1,
      maxItems: 100,
      items: {
        allOf: [
          { $ref: coverageEventSchema.$id },
          {
            type: 'object',
            properties: { status: { const: 'failed' } },
            required: ['status'],
          },
        ],
      },
    },
    failure: adapterFailureSchema,
  },
};

export const ownershipEvidenceOutcomeSchema = {
  $id: `${schemaBase}/ownership-evidence-outcome.json`,
  oneOf: [
    ownershipSuccessOutcomeSchema,
    ownershipPartialOutcomeSchema,
    ownershipFailureOutcomeSchema,
  ],
};

export const domainSchemas = Object.freeze([
  providerAccountSchema,
  dnsZoneSchema,
  dnsRecordSchema,
  dnsObservationSchema,
  ownershipEvidenceSchema,
  coverageEventSchema,
  scanJobSchema,
  findingSchema,
  scanArtifactSchema,
  providerCollectionRequestSchema,
  providerCollectionOutcomeSchema,
  ownershipEvidenceRequestSchema,
  ownershipEvidenceOutcomeSchema,
]);

export const canonicalAddressSchema = ipAddressSchema;
