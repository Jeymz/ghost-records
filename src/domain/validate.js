import Ajv from 'ajv';

import { ValidationError } from '../errors/application-error.js';
import {
  domainSchemas,
  dnsObservationSchema,
  dnsResolutionRequestSchema,
  dnsResolutionBatchRequestSchema,
  dnsRecordSchema,
  dnsZoneSchema,
  findingSchema,
  ownershipEvidenceOutcomeSchema,
  ownershipEvidenceRequestSchema,
  ownershipEvidenceSchema,
  providerAccountSchema,
  providerCollectionOutcomeSchema,
  providerCollectionRequestSchema,
  registrationObservationRequestSchema,
  registrationObservationSchema,
  resolutionSnapshotRequestSchema,
  policyDecisionHistorySchema,
  scanArtifactSchema,
  scanJobSchema,
  coverageEventSchema,
} from './schemas.js';

const ajv = new Ajv({ allErrors: true, strict: true });

for (const schema of domainSchemas) {
  ajv.addSchema(schema);
}

export const DOMAIN_SCHEMA_IDS = Object.freeze({
  providerAccount: providerAccountSchema.$id,
  dnsZone: dnsZoneSchema.$id,
  dnsRecord: dnsRecordSchema.$id,
  dnsObservation: dnsObservationSchema.$id,
  dnsResolutionRequest: dnsResolutionRequestSchema.$id,
  dnsResolutionBatchRequest: dnsResolutionBatchRequestSchema.$id,
  ownershipEvidence: ownershipEvidenceSchema.$id,
  coverageEvent: coverageEventSchema.$id,
  scanJob: scanJobSchema.$id,
  finding: findingSchema.$id,
  scanArtifact: scanArtifactSchema.$id,
  providerCollectionRequest: providerCollectionRequestSchema.$id,
  providerCollectionOutcome: providerCollectionOutcomeSchema.$id,
  ownershipEvidenceRequest: ownershipEvidenceRequestSchema.$id,
  ownershipEvidenceOutcome: ownershipEvidenceOutcomeSchema.$id,
  registrationObservationRequest: registrationObservationRequestSchema.$id,
  registrationObservation: registrationObservationSchema.$id,
  resolutionSnapshotRequest: resolutionSnapshotRequestSchema.$id,
  policyDecisionHistory: policyDecisionHistorySchema.$id,
});

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nestedValue of Object.values(value)) {
      deepFreeze(nestedValue);
    }
  }

  return value;
}

function formatSchemaErrors(errors) {
  return (errors ?? []).map(({ instancePath, keyword, message, params }) => ({
    instancePath,
    keyword,
    message,
    params,
  }));
}

export function validateDomainObject(schemaName, value) {
  const schemaId = DOMAIN_SCHEMA_IDS[schemaName];

  if (!schemaId) {
    throw new ValidationError({
      message: 'Unknown canonical domain schema requested.',
      details: { schemaName },
    });
  }

  const validator = ajv.getSchema(schemaId);
  let candidate;

  try {
    candidate = structuredClone(value);
  } catch (error) {
    throw new ValidationError({
      message: 'Canonical domain object must be cloneable structured data.',
      details: { schemaName },
      cause: error,
    });
  }

  if (!validator(candidate)) {
    throw new ValidationError({
      message: 'Canonical domain object validation failed.',
      details: {
        schemaName,
        errors: formatSchemaErrors(validator.errors),
      },
    });
  }

  return deepFreeze(candidate);
}
