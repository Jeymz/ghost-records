import { PersistenceError, ValidationError } from '../../errors/application-error.js';

function requireObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError({ message: `${name} must be a structured object.` });
  }
  return value;
}

function requireDate(value, name) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError({ message: `${name} must be a valid date.` });
  }
  return date;
}

export function createHistoricalEvidenceRepository(models) {
  const {
    resolutionSnapshot,
    registrationObservation,
    policyDecision,
    findingHistory,
  } = models;

  return Object.freeze({
    async recordResolutionSnapshot(snapshot, { transaction } = {}) {
      const value = requireObject(snapshot, 'Resolution snapshot');
      try {
        return await resolutionSnapshot.create(
          {
            scope: value.scope,
            declaredTarget: value.observation.queryName,
            terminalName: value.observation.terminalName,
            chain: value.observation.chain,
            terminalAnswers: value.observation.answerRecords,
            rcode: value.observation.rcode,
            coverage: value.observation.coverage,
            queryCount: value.observation.resolverEvidence.queryCount,
            resolverLimits: {
              maxQueries: value.observation.resolverEvidence.maxQueries,
              maxDepth: value.observation.resolverEvidence.maxDepth,
              timeoutMs: value.observation.resolverEvidence.timeoutMs,
            },
            evidenceHash: value.evidenceHash,
            observedAt: requireDate(value.observation.observedAt, 'Resolution observation time'),
          },
          { transaction },
        );
      } catch (error) {
        throw new PersistenceError({
          message: 'Unable to record the resolution snapshot.',
          details: { operation: 'record-resolution-snapshot' },
          cause: error,
        });
      }
    },

    async findLatestResolutionSnapshot({ scope, declaredTarget }) {
      return resolutionSnapshot.findOne({
        where: { scope, declaredTarget },
        order: [['observedAt', 'DESC'], ['id', 'DESC']],
      });
    },

    async recordRegistrationObservation(observation, { transaction } = {}) {
      const value = requireObject(observation, 'Registration observation');
      try {
        return await registrationObservation.create(
          {
            domain: value.domain,
            handle: value.handle ?? null,
            sourceRoot: value.sourceRoot,
            registrarHandle: value.registrarHandle ?? null,
            statuses: value.statuses,
            events: value.events,
            nameservers: value.nameservers,
            responseHash: value.responseHash,
            coverageStatus: value.coverageStatus,
            coverageReason: value.coverageReason ?? null,
            observedAt: requireDate(value.observedAt, 'Registration observation time'),
          },
          { transaction },
        );
      } catch (error) {
        throw new PersistenceError({
          message: 'Unable to record the minimized registration observation.',
          details: { operation: 'record-registration-observation' },
          cause: error,
        });
      }
    },

    async findLatestRegistrationObservation(domain) {
      return registrationObservation.findOne({
        where: { domain },
        order: [['observedAt', 'DESC'], ['id', 'DESC']],
      });
    },

    async recordPolicyDecision(decision, { transaction } = {}) {
      const value = requireObject(decision, 'Policy decision');
      try {
        return await policyDecision.create(
          {
            policyId: value.policyId ?? null,
            scope: value.scope,
            target: value.target,
            decision: value.decision,
            owner: value.owner ?? null,
            reason: value.reason ?? null,
            expiresAt: value.expiresAt ? requireDate(value.expiresAt, 'Policy expiry') : null,
            evaluatedAt: requireDate(value.evaluatedAt, 'Policy evaluation time'),
          },
          { transaction },
        );
      } catch (error) {
        throw new PersistenceError({
          message: 'Unable to record the policy decision.',
          details: { operation: 'record-policy-decision' },
          cause: error,
        });
      }
    },

    async recordFindingHistory(entry, { transaction } = {}) {
      const value = requireObject(entry, 'Finding history entry');
      try {
        return await findingHistory.create(
          {
            findingKey: value.findingKey,
            status: value.status,
            severity: value.severity,
            evidenceRefs: value.evidenceRefs,
            firstSeenAt: requireDate(value.firstSeenAt, 'Finding first-seen time'),
            lastSeenAt: requireDate(value.lastSeenAt, 'Finding last-seen time'),
            recordedAt: requireDate(value.recordedAt, 'Finding recorded time'),
          },
          { transaction },
        );
      } catch (error) {
        throw new PersistenceError({
          message: 'Unable to record finding history.',
          details: { operation: 'record-finding-history' },
          cause: error,
        });
      }
    },
  });
}
