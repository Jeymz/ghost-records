import { validateDomainObject } from '../domain/validate.js';
import { createHistoricalEvidenceRepository } from '../persistence/repositories/historical-evidence-repository.js';
import { hashStructuredEvidence } from './evidence-hash.js';

function snapshotFingerprint(observation) {
  return hashStructuredEvidence({
    chain: observation.chain,
    terminalName: observation.terminalName,
    terminalAnswers: observation.terminalAnswers,
    rcode: observation.rcode,
    coverage: observation.coverage,
  });
}

function toPlain(record) {
  return record?.get ? record.get({ plain: true }) : record;
}

export function createHistoricalEvidenceService({ persistence }) {
  const repository = createHistoricalEvidenceRepository(persistence.models);

  return Object.freeze({
    async recordResolutionSnapshot(request) {
      const validated = validateDomainObject('resolutionSnapshotRequest', request);
      const baseline = toPlain(
        await repository.findLatestResolutionSnapshot({
          scope: validated.scope,
          declaredTarget: validated.observation.queryName,
        }),
      );
      const evidenceHash = snapshotFingerprint(validated.observation);
      const record = await repository.recordResolutionSnapshot({
        ...validated,
        evidenceHash,
      });

      return Object.freeze({
        record: toPlain(record),
        drift: !baseline
          ? 'no-baseline'
          : baseline.evidenceHash === evidenceHash
            ? 'unchanged'
            : 'changed',
        baseline: baseline
          ? Object.freeze({
              observedAt: baseline.observedAt,
              evidenceHash: baseline.evidenceHash,
            })
          : undefined,
      });
    },

    async recordRegistrationObservation(observation) {
      const validated = validateDomainObject('registrationObservation', observation);
      return toPlain(await repository.recordRegistrationObservation(validated));
    },

    async recordPolicyDecision(decision) {
      const validated = validateDomainObject('policyDecisionHistory', decision);
      return toPlain(await repository.recordPolicyDecision(validated));
    },
  });
}
