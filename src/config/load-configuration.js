import Ajv from 'ajv';

import { ConfigurationError } from '../errors/application-error.js';
import {
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

function parseProviderCredentialReferences(value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    failConfiguration('Provider credential references must be valid JSON.', undefined, error);
  }
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

function normalizeRuntimeEnvironment(environment) {
  const providerCredentialReferences = parseProviderCredentialReferences(
    environment.GHOST_RECORDS_PROVIDER_CREDENTIALS_JSON,
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
    providerCredentialReferences,
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

  const normalizedConfiguration = normalizeRuntimeEnvironment(runtimeEnvironment);

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
