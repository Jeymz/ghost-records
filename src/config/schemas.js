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
  'GHOST_RECORDS_RAW_EVIDENCE_ENABLED',
  'GHOST_RECORDS_PROVIDER_CREDENTIALS_JSON',
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
    GHOST_RECORDS_RAW_EVIDENCE_ENABLED: booleanStringSchema,
    GHOST_RECORDS_PROVIDER_CREDENTIALS_JSON: {
      type: 'string',
      minLength: 2,
    },
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
    'providerCredentialReferences',
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
      required: ['historyDays', 'registrationDays', 'artifactDays', 'rawEvidenceDays'],
      properties: {
        historyDays: { type: 'integer', minimum: 1 },
        registrationDays: { type: 'integer', minimum: 1 },
        artifactDays: { type: 'integer', minimum: 1 },
        rawEvidenceDays: { type: 'integer', minimum: 0 },
      },
    },
    rawEvidenceEnabled: { type: 'boolean' },
    providerCredentialReferences: {
      $ref: 'https://ghost-records.dev/schemas/provider-credential-references.json',
    },
  },
};
