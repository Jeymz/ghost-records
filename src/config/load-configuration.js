import Ajv from 'ajv';

import { ConfigurationError } from '../errors/application-error.js';
import {
  approvedExternalPolicySchema,
  awsEc2RegionSchema,
  normalizedRuntimeConfigSchema,
  providerCredentialReferencesSchema,
  RUNTIME_ENVIRONMENT_KEYS,
  runtimeEnvironmentSchema,
} from './schemas.js';

const ajv = new Ajv({
  $data: true,
  allErrors: true,
  strict: true,
});

ajv.addSchema(providerCredentialReferencesSchema);
ajv.addSchema(approvedExternalPolicySchema);
ajv.addSchema(awsEc2RegionSchema);
const validateAwsEc2Regions = ajv.getSchema(awsEc2RegionSchema.$id);
const validateApprovedExternalPolicies = ajv.getSchema(approvedExternalPolicySchema.$id);
const validateRuntimeEnvironment = ajv.compile(runtimeEnvironmentSchema);
const validateNormalizedRuntimeConfig = ajv.compile(normalizedRuntimeConfigSchema);

const allowedEnvironmentKeys = new Set(RUNTIME_ENVIRONMENT_KEYS);

const runtimeDefaults = Object.freeze({
  NODE_ENV: 'development',
  GHOST_RECORDS_DNS_ONLY: 'true',
  GHOST_RECORDS_CONTROL_PLANE_ENABLED: 'false',
  GHOST_RECORDS_MYSQL_TLS_ENABLED: 'true',
  GHOST_RECORDS_MAX_REPLICAS: '1',
  GHOST_RECORDS_DB_POOL_MIN: '0',
  GHOST_RECORDS_DB_POOL_MAX: '5',
  GHOST_RECORDS_DB_POOL_ACQUIRE_MS: '30000',
  GHOST_RECORDS_DB_POOL_IDLE_MS: '10000',
  GHOST_RECORDS_MIGRATION_ACTOR_ENABLED: 'false',
  GHOST_RECORDS_RETENTION_HISTORY_DAYS: '365',
  GHOST_RECORDS_RETENTION_REGISTRATION_DAYS: '90',
  GHOST_RECORDS_RETENTION_ARTIFACT_DAYS: '90',
  GHOST_RECORDS_RETENTION_RAW_EVIDENCE_DAYS: '30',
  GHOST_RECORDS_RAW_EVIDENCE_ENABLED: 'false',
  GHOST_RECORDS_PROVIDER_CREDENTIALS_JSON: '[]',
  GHOST_RECORDS_DNS_MAX_CHAIN_DEPTH: '8',
  GHOST_RECORDS_DNS_MAX_QUERIES: '32',
  GHOST_RECORDS_DNS_MAX_CONCURRENCY: '4',
  GHOST_RECORDS_DNS_QUERY_TIMEOUT_MS: '3000',
  GHOST_RECORDS_DNS_MAX_ANSWERS: '100',
  GHOST_RECORDS_AWS_EC2_REGIONS_JSON: '[]',
  GHOST_RECORDS_APPROVED_EXTERNAL_POLICIES_JSON: '[]',
});

function formatSchemaErrors(errors) {
  return (errors ?? []).map((error) => ({
    instancePath: error.instancePath,
    keyword: error.keyword,
    message: error.message,
    params: error.params,
  }));
}

function failConfiguration(message, errors = undefined, cause = undefined) {
  throw new ConfigurationError({
    message,
    ...(errors ? { details: { errors } } : {}),
    ...(cause ? { cause } : {}),
  });
}

function projectRuntimeEnvironment(environment) {
  const unknownGhostRecordsKeys = Object.keys(environment).filter(
    (key) => key.startsWith('GHOST_RECORDS_') && !allowedEnvironmentKeys.has(key),
  );

  if (unknownGhostRecordsKeys.length > 0) {
    failConfiguration('Unknown Ghost Records configuration keys are not allowed.', [
      {
        keyword: 'additionalProperties',
        message: 'Unknown Ghost Records configuration key.',
        params: { keys: unknownGhostRecordsKeys },
      },
    ]);
  }

  return Object.fromEntries(
    RUNTIME_ENVIRONMENT_KEYS.map((key) => [
      key,
      environment[key] ?? runtimeDefaults[key],
    ]),
  );
}

function parseBoolean(value) {
  return value === 'true';
}

function parseInteger(value) {
  return Number.parseInt(value, 10);
}

function parseJsonConfiguration(value, message) {
  try {
    return JSON.parse(value);
  } catch (error) {
    failConfiguration(message, undefined, error);
  }
}

function parseProviderCredentialReferences(value) {
  return parseJsonConfiguration(value, 'Provider credential references must be valid JSON.');
}

function parseAwsEc2Regions(value) {
  return parseJsonConfiguration(value, 'AWS EC2 regions must be valid JSON.');
}

function parseApprovedExternalPolicies(value) {
  return parseJsonConfiguration(value, 'Approved external policies must be valid JSON.');
}

function validateParsedConfiguration(value, validator, message) {
  if (!validator(value)) {
    failConfiguration(message, formatSchemaErrors(validator.errors));
  }
  return value;
}

function isCalendarTimestamp(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;

  const expectedSecond = value.replace(/(?:\.\d{1,9})?Z$/u, 'Z');
  const actualSecond = `${parsed.toISOString().slice(0, 19)}Z`;
  return expectedSecond === actualSecond;
}

function validateStandardAwsRegions(regions) {
  const unsupportedRegion = regions.find((region) =>
    /^(?:cn-|us-gov-|us-iso-)/u.test(region),
  );
  if (unsupportedRegion) {
    failConfiguration('AWS EC2 region is outside the supported standard-partition endpoint model.', [
      {
        keyword: 'unsupported-scope',
        message: 'AWS China, GovCloud, and isolated partitions require a separately approved endpoint model.',
        params: { region: unsupportedRegion },
      },
    ]);
  }
  return regions;
}

function validatePolicyTimestamps(policies) {
  for (const policy of policies) {
    if (!isCalendarTimestamp(policy.expiresAt)) {
      failConfiguration('Approved external policy expiry must be a valid timestamp.', [
        {
          keyword: 'format',
          message: 'Approved external policy expiry is invalid.',
          params: { policyId: policy.policyId },
        },
      ]);
    }
  }

  return policies;
}

function rejectDuplicatePolicyIds(policies) {
  const seenPolicyIds = new Set();

  for (const policy of policies) {
    if (seenPolicyIds.has(policy.policyId)) {
      failConfiguration('Approved external policy records must not repeat a policy ID.', [
        {
          keyword: 'uniqueItems',
          message: 'Duplicate approved external policy ID.',
          params: { policyId: policy.policyId },
        },
      ]);
    }
    seenPolicyIds.add(policy.policyId);
  }

  return policies;
}

const route53CredentialKeys = Object.freeze([
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
]);

function resolveProviderCredentials(references, environment) {
  const seenProviders = new Set();

  return references.map((reference) => {
    if (seenProviders.has(reference.provider)) {
      failConfiguration('Provider credential references must not repeat a provider.', [
        {
          keyword: 'uniqueItems',
          message: 'Duplicate provider credential reference.',
          params: { provider: reference.provider },
        },
      ]);
    }
    seenProviders.add(reference.provider);

    if (reference.provider === 'route53') {
      const unsupportedKeys = reference.secretEnvironmentKeys.filter(
        (key) => !route53CredentialKeys.includes(key),
      );
      const missingRequiredKeys = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'].filter(
        (key) => !reference.secretEnvironmentKeys.includes(key),
      );

      if (unsupportedKeys.length > 0 || missingRequiredKeys.length > 0) {
        failConfiguration('Route 53 credential references are invalid.', [
          {
            keyword: 'route53Credentials',
            message: 'Route 53 requires AWS access-key and secret-access-key references only, with an optional session token reference.',
            params: {
              unsupportedKeys,
              missingRequiredKeys,
            },
          },
        ]);
      }
    }

    const missingValues = reference.secretEnvironmentKeys.filter(
      (key) => typeof environment[key] !== 'string' || environment[key].length === 0,
    );

    if (missingValues.length > 0) {
      failConfiguration('A declared provider credential value is missing.', [
        {
          keyword: 'required',
          message: 'Declared provider credential environment value is missing.',
          params: { provider: reference.provider, missingValues },
        },
      ]);
    }

    return {
      provider: reference.provider,
      values: Object.fromEntries(
        reference.secretEnvironmentKeys.map((key) => [key, environment[key]]),
      ),
    };
  });
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

function normalizeRuntimeEnvironment(environment, sourceEnvironment) {
  const providerCredentialReferences = parseProviderCredentialReferences(
    environment.GHOST_RECORDS_PROVIDER_CREDENTIALS_JSON,
  );
  const ec2Regions = validateStandardAwsRegions(
    validateParsedConfiguration(
      parseAwsEc2Regions(environment.GHOST_RECORDS_AWS_EC2_REGIONS_JSON),
      validateAwsEc2Regions,
      'AWS EC2 regions must satisfy the required schema.',
    ),
  );
  const approvedExternalPolicies = rejectDuplicatePolicyIds(
    validatePolicyTimestamps(
      validateParsedConfiguration(
        parseApprovedExternalPolicies(environment.GHOST_RECORDS_APPROVED_EXTERNAL_POLICIES_JSON),
        validateApprovedExternalPolicies,
        'Approved external policies must satisfy the required schema.',
      ),
    ),
  );

  return {
    environment: environment.NODE_ENV,
    dnsOnly: parseBoolean(environment.GHOST_RECORDS_DNS_ONLY),
    controlPlane: {
      enabled: parseBoolean(environment.GHOST_RECORDS_CONTROL_PLANE_ENABLED),
    },
    database: {
      host: environment.GHOST_RECORDS_MYSQL_HOST,
      port: parseInteger(environment.GHOST_RECORDS_MYSQL_PORT),
      database: environment.GHOST_RECORDS_MYSQL_DATABASE,
      username: environment.GHOST_RECORDS_MYSQL_USERNAME,
      password: environment.GHOST_RECORDS_MYSQL_PASSWORD,
      tlsEnabled: parseBoolean(environment.GHOST_RECORDS_MYSQL_TLS_ENABLED),
      maxReplicas: parseInteger(environment.GHOST_RECORDS_MAX_REPLICAS),
      connectionBudget: parseInteger(environment.GHOST_RECORDS_DB_CONNECTION_BUDGET),
      migrationActorEnabled: parseBoolean(
        environment.GHOST_RECORDS_MIGRATION_ACTOR_ENABLED,
      ),
      pool: {
        min: parseInteger(environment.GHOST_RECORDS_DB_POOL_MIN),
        max: parseInteger(environment.GHOST_RECORDS_DB_POOL_MAX),
        acquireMs: parseInteger(environment.GHOST_RECORDS_DB_POOL_ACQUIRE_MS),
        idleMs: parseInteger(environment.GHOST_RECORDS_DB_POOL_IDLE_MS),
      },
    },
    retention: {
      historyDays: parseInteger(environment.GHOST_RECORDS_RETENTION_HISTORY_DAYS),
      registrationDays: parseInteger(environment.GHOST_RECORDS_RETENTION_REGISTRATION_DAYS),
      artifactDays: parseInteger(environment.GHOST_RECORDS_RETENTION_ARTIFACT_DAYS),
      rawEvidenceDays: parseInteger(environment.GHOST_RECORDS_RETENTION_RAW_EVIDENCE_DAYS),
    },
    rawEvidenceEnabled: parseBoolean(environment.GHOST_RECORDS_RAW_EVIDENCE_ENABLED),
    aws: {
      ec2Regions,
      approvedExternalPolicies,
    },
    dns: {
      maxChainDepth: parseInteger(environment.GHOST_RECORDS_DNS_MAX_CHAIN_DEPTH),
      maxQueries: parseInteger(environment.GHOST_RECORDS_DNS_MAX_QUERIES),
      maxConcurrency: parseInteger(environment.GHOST_RECORDS_DNS_MAX_CONCURRENCY),
      queryTimeoutMs: parseInteger(environment.GHOST_RECORDS_DNS_QUERY_TIMEOUT_MS),
      maxAnswers: parseInteger(environment.GHOST_RECORDS_DNS_MAX_ANSWERS),
    },
    providerCredentialReferences,
    providerCredentials: resolveProviderCredentials(providerCredentialReferences, sourceEnvironment),
  };
}

export function loadConfiguration({ environment = process.env } = {}) {
  const runtimeEnvironment = projectRuntimeEnvironment(environment);

  if (!validateRuntimeEnvironment(runtimeEnvironment)) {
    failConfiguration(
      'Runtime configuration does not satisfy the required environment schema.',
      formatSchemaErrors(validateRuntimeEnvironment.errors),
    );
  }

  const normalizedConfiguration = normalizeRuntimeEnvironment(runtimeEnvironment, environment);

  if (!validateNormalizedRuntimeConfig(normalizedConfiguration)) {
    failConfiguration(
      'Normalized runtime configuration is invalid.',
      formatSchemaErrors(validateNormalizedRuntimeConfig.errors),
    );
  }

  const totalConfiguredConnections =
    normalizedConfiguration.database.maxReplicas *
    normalizedConfiguration.database.pool.max;

  if (totalConfiguredConnections > normalizedConfiguration.database.connectionBudget) {
    failConfiguration('Configured replica and pool limits exceed the database connection budget.', [
      {
        keyword: 'connectionBudget',
        message: 'maxReplicas multiplied by pool.max must not exceed connectionBudget.',
        params: {
          totalConfiguredConnections,
          connectionBudget: normalizedConfiguration.database.connectionBudget,
        },
      },
    ]);
  }

  return deepFreeze(normalizedConfiguration);
}
