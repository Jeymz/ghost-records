export const RUNTIME_ENVIRONMENT_KEYS = Object.freeze([
  'NODE_ENV',
  'GHOST_RECORDS_DNS_ONLY',
  'GHOST_RECORDS_CONTROL_PLANE_ENABLED',
  'GHOST_RECORDS_MYSQL_HOST',
  'GHOST_RECORDS_MYSQL_PORT',
  'GHOST_RECORDS_MYSQL_DATABASE',
  'GHOST_RECORDS_MYSQL_USERNAME',
  'GHOST_RECORDS_MYSQL_PASSWORD',
  'GHOST_RECORDS_MYSQL_TLS_ENABLED',
  'GHOST_RECORDS_MAX_REPLICAS',
  'GHOST_RECORDS_DB_POOL_MIN',
  'GHOST_RECORDS_DB_POOL_MAX',
  'GHOST_RECORDS_DB_POOL_ACQUIRE_MS',
  'GHOST_RECORDS_DB_POOL_IDLE_MS',
  'GHOST_RECORDS_DB_CONNECTION_BUDGET',
  'GHOST_RECORDS_MIGRATION_ACTOR_ENABLED',
  'GHOST_RECORDS_RETENTION_HISTORY_DAYS',
  'GHOST_RECORDS_RETENTION_REGISTRATION_DAYS',
  'GHOST_RECORDS_RETENTION_ARTIFACT_DAYS',
  'GHOST_RECORDS_RETENTION_RAW_EVIDENCE_DAYS',
  'GHOST_RECORDS_RETENTION_ACTOR_ENABLED',
  'GHOST_RECORDS_RETENTION_LEASE_MS',
  'GHOST_RECORDS_RETENTION_BATCH_SIZE',
  'GHOST_RECORDS_RAW_EVIDENCE_ENABLED',
  'GHOST_RECORDS_RDAP_ALLOWED_ROOTS_JSON',
  'GHOST_RECORDS_RDAP_BOOTSTRAP_CACHE_TTL_MS',
  'GHOST_RECORDS_PROVIDER_CREDENTIALS_JSON',
  'GHOST_RECORDS_DNS_MAX_CHAIN_DEPTH',
  'GHOST_RECORDS_DNS_MAX_QUERIES',
  'GHOST_RECORDS_DNS_MAX_CONCURRENCY',
  'GHOST_RECORDS_DNS_QUERY_TIMEOUT_MS',
  'GHOST_RECORDS_DNS_MAX_ANSWERS',
  'GHOST_RECORDS_AWS_EC2_REGIONS_JSON',
  'GHOST_RECORDS_APPROVED_EXTERNAL_POLICIES_JSON',
]);

const booleanStringSchema = {
  type: 'string',
  enum: ['true', 'false'],
};

const positiveIntegerStringSchema = {
  type: 'string',
  pattern: '^[1-9][0-9]*$',
};

const nonNegativeIntegerStringSchema = {
  type: 'string',
  pattern: '^(0|[1-9][0-9]*)$',
};

export const runtimeEnvironmentSchema = {
  $id: 'https://ghost-records.dev/schemas/runtime-environment.json',
  type: 'object',
  additionalProperties: false,
  required: [
    'NODE_ENV',
    'GHOST_RECORDS_DNS_ONLY',
    'GHOST_RECORDS_CONTROL_PLANE_ENABLED',
    'GHOST_RECORDS_MYSQL_HOST',
    'GHOST_RECORDS_MYSQL_PORT',
    'GHOST_RECORDS_MYSQL_DATABASE',
    'GHOST_RECORDS_MYSQL_USERNAME',
    'GHOST_RECORDS_MYSQL_PASSWORD',
    'GHOST_RECORDS_MYSQL_TLS_ENABLED',
    'GHOST_RECORDS_MAX_REPLICAS',
    'GHOST_RECORDS_DB_POOL_MIN',
    'GHOST_RECORDS_DB_POOL_MAX',
    'GHOST_RECORDS_DB_POOL_ACQUIRE_MS',
    'GHOST_RECORDS_DB_POOL_IDLE_MS',
    'GHOST_RECORDS_DB_CONNECTION_BUDGET',
    'GHOST_RECORDS_RETENTION_HISTORY_DAYS',
    'GHOST_RECORDS_RETENTION_REGISTRATION_DAYS',
    'GHOST_RECORDS_RETENTION_ARTIFACT_DAYS',
    'GHOST_RECORDS_RETENTION_RAW_EVIDENCE_DAYS',
    'GHOST_RECORDS_RAW_EVIDENCE_ENABLED',
  ],
  properties: {
    NODE_ENV: {
      type: 'string',
      enum: ['development', 'test', 'production'],
    },
    GHOST_RECORDS_DNS_ONLY: {
      type: 'string',
      const: 'true',
    },
    GHOST_RECORDS_CONTROL_PLANE_ENABLED: booleanStringSchema,
    GHOST_RECORDS_MYSQL_HOST: {
      type: 'string',
      minLength: 1,
      maxLength: 253,
    },
    GHOST_RECORDS_MYSQL_PORT: positiveIntegerStringSchema,
    GHOST_RECORDS_MYSQL_DATABASE: {
      type: 'string',
      minLength: 1,
      maxLength: 64,
    },
    GHOST_RECORDS_MYSQL_USERNAME: {
      type: 'string',
      minLength: 1,
      maxLength: 128,
    },
    GHOST_RECORDS_MYSQL_PASSWORD: {
      type: 'string',
      minLength: 1,
    },
    GHOST_RECORDS_MYSQL_TLS_ENABLED: booleanStringSchema,
    GHOST_RECORDS_MAX_REPLICAS: positiveIntegerStringSchema,
    GHOST_RECORDS_DB_POOL_MIN: nonNegativeIntegerStringSchema,
    GHOST_RECORDS_DB_POOL_MAX: positiveIntegerStringSchema,
    GHOST_RECORDS_DB_POOL_ACQUIRE_MS: positiveIntegerStringSchema,
    GHOST_RECORDS_DB_POOL_IDLE_MS: positiveIntegerStringSchema,
    GHOST_RECORDS_DB_CONNECTION_BUDGET: positiveIntegerStringSchema,
    GHOST_RECORDS_MIGRATION_ACTOR_ENABLED: booleanStringSchema,
    GHOST_RECORDS_RETENTION_HISTORY_DAYS: positiveIntegerStringSchema,
    GHOST_RECORDS_RETENTION_REGISTRATION_DAYS: positiveIntegerStringSchema,
    GHOST_RECORDS_RETENTION_ARTIFACT_DAYS: positiveIntegerStringSchema,
    GHOST_RECORDS_RETENTION_RAW_EVIDENCE_DAYS: nonNegativeIntegerStringSchema,
    GHOST_RECORDS_RETENTION_ACTOR_ENABLED: booleanStringSchema,
    GHOST_RECORDS_RETENTION_LEASE_MS: positiveIntegerStringSchema,
    GHOST_RECORDS_RETENTION_BATCH_SIZE: positiveIntegerStringSchema,
    GHOST_RECORDS_RAW_EVIDENCE_ENABLED: { const: 'false' },
    GHOST_RECORDS_RDAP_ALLOWED_ROOTS_JSON: { type: 'string', minLength: 2 },
    GHOST_RECORDS_RDAP_BOOTSTRAP_CACHE_TTL_MS: positiveIntegerStringSchema,
    GHOST_RECORDS_PROVIDER_CREDENTIALS_JSON: {
      type: 'string',
      minLength: 2,
    },
    GHOST_RECORDS_DNS_MAX_CHAIN_DEPTH: positiveIntegerStringSchema,
    GHOST_RECORDS_DNS_MAX_QUERIES: positiveIntegerStringSchema,
    GHOST_RECORDS_DNS_MAX_CONCURRENCY: positiveIntegerStringSchema,
    GHOST_RECORDS_DNS_QUERY_TIMEOUT_MS: positiveIntegerStringSchema,
    GHOST_RECORDS_DNS_MAX_ANSWERS: positiveIntegerStringSchema,
    GHOST_RECORDS_AWS_EC2_REGIONS_JSON: { type: 'string', minLength: 2 },
    GHOST_RECORDS_APPROVED_EXTERNAL_POLICIES_JSON: { type: 'string', minLength: 2 },
  },
};

export const providerCredentialReferencesSchema = {
  $id: 'https://ghost-records.dev/schemas/provider-credential-references.json',
  type: 'array',
  maxItems: 4,
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['provider', 'secretEnvironmentKeys'],
    properties: {
      provider: {
        type: 'string',
        enum: ['route53', 'azure-dns', 'godaddy', 'namecheap'],
      },
      secretEnvironmentKeys: {
        type: 'array',
        minItems: 1,
        uniqueItems: true,
        items: {
          type: 'string',
          pattern: '^[A-Z][A-Z0-9_]*$',
          maxLength: 128,
        },
      },
    },
  },
};

export const approvedExternalPolicySchema = {
  $id: 'https://ghost-records.dev/schemas/approved-external-policy.json',
  type: 'array',
  maxItems: 1000,
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['policyId', 'target', 'scope', 'owner', 'reason', 'expiresAt'],
    properties: {
      policyId: { type: 'string', minLength: 1, maxLength: 191, pattern: '^[A-Za-z0-9][A-Za-z0-9._:/@-]*$' },
      target: { type: 'string', minLength: 1, maxLength: 1024 },
      scope: { type: 'string', minLength: 1, maxLength: 512 },
      owner: { type: 'string', minLength: 1, maxLength: 256 },
      reason: { type: 'string', minLength: 1, maxLength: 1024 },
      expiresAt: { type: 'string', minLength: 20, maxLength: 40, pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,9})?Z$' },
    },
  },
};

export const awsEc2RegionSchema = {
  $id: 'https://ghost-records.dev/schemas/aws-ec2-regions.json',
  type: 'array',
  maxItems: 50,
  uniqueItems: true,
  items: {
    type: 'string',
    pattern: '^[a-z]{2}-[a-z0-9-]+-\\d+$',
    minLength: 5,
    maxLength: 32,
  },
};

export const rdapAllowedRootsSchema = {
  $id: 'https://ghost-records.dev/schemas/rdap-allowed-roots.json',
  type: 'array',
  maxItems: 200,
  uniqueItems: true,
  items: {
    type: 'string',
    minLength: 12,
    maxLength: 2048,
    pattern: '^https://',
  },
};

export const normalizedRuntimeConfigSchema = {
  $id: 'https://ghost-records.dev/schemas/normalized-runtime-config.json',
  type: 'object',
  additionalProperties: false,
  required: [
    'environment',
    'dnsOnly',
    'controlPlane',
    'database',
    'retention',
    'rawEvidenceEnabled',
    'registration',
    'providerCredentialReferences',
    'providerCredentials',
    'dns',
    'aws',
  ],
  properties: {
    environment: {
      type: 'string',
      enum: ['development', 'test', 'production'],
    },
    dnsOnly: {
      const: true,
    },
    controlPlane: {
      type: 'object',
      additionalProperties: false,
      required: ['enabled'],
      properties: {
        enabled: { type: 'boolean' },
      },
    },
    database: {
      type: 'object',
      additionalProperties: false,
      required: [
        'host',
        'port',
        'database',
        'username',
        'password',
        'tlsEnabled',
        'maxReplicas',
        'connectionBudget',
        'migrationActorEnabled',
        'pool',
      ],
      properties: {
        host: { type: 'string', minLength: 1, maxLength: 253 },
        port: { type: 'integer', minimum: 1, maximum: 65535 },
        database: { type: 'string', minLength: 1, maxLength: 64 },
        username: { type: 'string', minLength: 1, maxLength: 128 },
        password: { type: 'string', minLength: 1 },
        tlsEnabled: { type: 'boolean' },
        maxReplicas: { type: 'integer', minimum: 1 },
        connectionBudget: { type: 'integer', minimum: 1 },
        migrationActorEnabled: { type: 'boolean' },
        pool: {
          type: 'object',
          additionalProperties: false,
          required: ['min', 'max', 'acquireMs', 'idleMs'],
          properties: {
            min: {
              type: 'integer',
              minimum: 0,
              maximum: { $data: '/database/pool/max' },
            },
            max: { type: 'integer', minimum: 1 },
            acquireMs: { type: 'integer', minimum: 1 },
            idleMs: { type: 'integer', minimum: 1 },
          },
        },
      },
    },
    retention: {
      type: 'object',
      additionalProperties: false,
      required: [        'historyDays', 'registrationDays', 'artifactDays', 'rawEvidenceDays', 'actorEnabled', 'leaseMs', 'batchSize'],
      properties: {
        historyDays: { type: 'integer', minimum: 1 },
        registrationDays: { type: 'integer', minimum: 1 },
        artifactDays: { type: 'integer', minimum: 1 },
        rawEvidenceDays: { const: 0 },
        actorEnabled: { type: 'boolean' },
        leaseMs: { type: 'integer', minimum: 1000, maximum: 3600000 },
        batchSize: { type: 'integer', minimum: 1, maximum: 10000 },
      },
    },
    rawEvidenceEnabled: { const: false },
    registration: {
      type: 'object',
      additionalProperties: false,
      required: ['allowedRoots', 'bootstrapCacheTtlMs'],
      properties: {
        allowedRoots: { $ref: 'https://ghost-records.dev/schemas/rdap-allowed-roots.json' },
        bootstrapCacheTtlMs: { type: 'integer', minimum: 60000, maximum: 604800000 },
      },
    },
    providerCredentialReferences: {
      $ref: 'https://ghost-records.dev/schemas/provider-credential-references.json',
    },
    dns: {
      type: 'object',
      additionalProperties: false,
      required: ['maxChainDepth', 'maxQueries', 'maxConcurrency', 'queryTimeoutMs', 'maxAnswers'],
      properties: {
        maxChainDepth: { type: 'integer', minimum: 1, maximum: 32 },
        maxQueries: { type: 'integer', minimum: 1, maximum: 128 },
        maxConcurrency: { type: 'integer', minimum: 1, maximum: 32 },
        queryTimeoutMs: { type: 'integer', minimum: 1, maximum: 30000 },
        maxAnswers: { type: 'integer', minimum: 1, maximum: 100 },
      },
    },
    aws: {
      type: 'object',
      additionalProperties: false,
      required: ['ec2Regions', 'approvedExternalPolicies'],
      properties: {
        ec2Regions: { $ref: 'https://ghost-records.dev/schemas/aws-ec2-regions.json' },
        approvedExternalPolicies: { $ref: 'https://ghost-records.dev/schemas/approved-external-policy.json' },
      },
    },
    providerCredentials: {
      type: 'array',
      maxItems: 4,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['provider', 'values'],
        properties: {
          provider: {
            type: 'string',
            enum: ['route53', 'azure-dns', 'godaddy', 'namecheap'],
          },
          values: {
            type: 'object',
            minProperties: 1,
            additionalProperties: false,
            patternProperties: {
              '^[A-Z][A-Z0-9_]*$': {
                type: 'string',
                minLength: 1,
                maxLength: 4096,
              },
            },
          },
        },
      },
    },
  },
};
