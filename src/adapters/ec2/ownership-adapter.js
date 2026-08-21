import { createOwnershipAdapter } from '../contracts.js';
import { AwsQueryClientError, createAwsOwnershipClient } from '../aws/client.js';
import { evaluateApprovedExternalPolicy } from '../../policy/approved-external.js';

function observedAt(now) {
  return now().toISOString();
}

function coverageEvent({ scope, status, reason, now }) {
  return {
    component: 'aws-eip-inventory',
    provider: 'aws-ec2',
    scope,
    status,
    reason,
    observedAt: observedAt(now),
  };
}

function failureOutcome({ scope, error, now }) {
  const category = error instanceof AwsQueryClientError ? error.category : 'unknown';
  const retryable = error instanceof AwsQueryClientError ? error.retryable : false;

  return {
    outcome: 'failure',
    coverageEvents: [
      coverageEvent({
        scope,
        status: 'failed',
        reason: category,
        now,
      }),
    ],
    failure: { category, retryable },
  };
}

function policyDetails(policy) {
  return {
    policyId: policy.policyId,
    policyOwner: policy.owner,
    policyReason: policy.reason,
    policyExpiresAt: policy.expiresAt,
  };
}

function awsCredentials(configuration) {
  const route53Credentials = configuration.providerCredentials.find(
    (credential) => credential.provider === 'route53',
  )?.values;

  if (!route53Credentials) return undefined;

  return {
    accessKeyId: route53Credentials.AWS_ACCESS_KEY_ID,
    secretAccessKey: route53Credentials.AWS_SECRET_ACCESS_KEY,
    ...(route53Credentials.AWS_SESSION_TOKEN
      ? { sessionToken: route53Credentials.AWS_SESSION_TOKEN }
      : {}),
  };
}

function associationState(address, credentialAccountId) {
  if (!address.associationId) return 'idle';
  if (
    address.networkInterfaceOwnerId &&
    address.networkInterfaceOwnerId !== credentialAccountId
  ) {
    return 'cross-account-associated';
  }
  return 'associated';
}

function ownershipEvidence({ subject, scope, classification, confidence, coverage, now, details = undefined }) {
  return {
    subject,
    source: 'aws-ec2-eip-inventory',
    scope,
    classification,
    confidence,
    observedAt: observedAt(now),
    coverage,
    ...(details ? { details } : {}),
  };
}

export function createAwsEipOwnershipAdapter({ configuration, fetchImpl, now = () => new Date(), sleep } = {}) {
  if (!configuration?.aws || !Array.isArray(configuration.providerCredentials)) {
    throw new TypeError('AWS EIP ownership adapter requires centralized validated configuration.');
  }

  const credentials = awsCredentials(configuration);
  const policies = configuration.aws.approvedExternalPolicies;
  const regions = configuration.aws.ec2Regions;
  const client = credentials
    ? createAwsOwnershipClient({ credentials, fetchImpl, now, ...(sleep ? { sleep } : {}) })
    : undefined;

  return createOwnershipAdapter({
    async collectEvidence(request) {
      const policyDecision = evaluateApprovedExternalPolicy({
        subject: request.subject,
        scope: request.scope,
        policies,
        now: now(),
      });

      if (policyDecision.status === 'approved') {
        return {
          outcome: 'success',
          evidence: ownershipEvidence({
            subject: request.subject,
            scope: request.scope,
            classification: 'approved-external',
            confidence: 'high',
            coverage: 'complete',
            now,
            details: policyDetails(policyDecision.policy),
          }),
        };
      }

      if (request.subjectType !== 'ipv4') {
        return {
          outcome: 'success',
          evidence: ownershipEvidence({
            subject: request.subject,
            scope: request.scope,
            classification: 'unknown',
            confidence: 'low',
            coverage: 'complete',
            now,
            ...(policyDecision.policy ? { details: policyDetails(policyDecision.policy) } : {}),
          }),
        };
      }

      if (!client || regions.length === 0) {
        return failureOutcome({
          scope: request.scope,
          error: new AwsQueryClientError({
            category: 'configuration',
            message: 'AWS EIP ownership inventory is not configured.',
            retryable: false,
          }),
          now,
        });
      }

      let identity;
      try {
        identity = await client.getCallerIdentity();
      } catch (error) {
        return failureOutcome({ scope: request.scope, error, now });
      }

      const coverageEvents = [];
      for (const region of regions) {
        try {
          const addresses = await client.describeAddresses({ region, publicIp: request.subject });
          const match = addresses.find((address) => address.publicIp === request.subject);
          if (match) {
            return {
              outcome: 'success',
              evidence: ownershipEvidence({
                subject: request.subject,
                scope: request.scope,
                classification: 'owned',
                confidence: 'high',
                coverage: 'complete',
                now,
                details: {
                  credentialAccountId: identity.accountId,
                  region,
                  associationState: associationState(match, identity.accountId),
                  ...(match.allocationId ? { allocationId: match.allocationId } : {}),
                  ...(match.associationId ? { associationId: match.associationId } : {}),
                  ...(match.instanceId ? { instanceId: match.instanceId } : {}),
                  ...(match.networkInterfaceId ? { networkInterfaceId: match.networkInterfaceId } : {}),
                  ...(match.networkInterfaceOwnerId
                    ? { networkInterfaceOwnerId: match.networkInterfaceOwnerId }
                    : {}),
                  ...(policyDecision.policy ? policyDetails(policyDecision.policy) : {}),
                },
              }),
            };
          }
          coverageEvents.push(
            coverageEvent({
              scope: `aws-account:${identity.accountId}:region:${region}`,
              status: 'complete',
              reason: 'complete',
              now,
            }),
          );
        } catch (error) {
          const category = error instanceof AwsQueryClientError ? error.category : 'unknown';
          coverageEvents.push(
            coverageEvent({
              scope: `aws-account:${identity.accountId}:region:${region}`,
              status: 'partial',
              reason: category,
              now,
            }),
          );
        }
      }

      const hasPartialCoverage = coverageEvents.some((event) => event.status !== 'complete');
      return {
        outcome: hasPartialCoverage ? 'partial' : 'success',
        evidence: ownershipEvidence({
          subject: request.subject,
          scope: request.scope,
          classification: hasPartialCoverage ? 'unknown' : 'not-found',
          confidence: hasPartialCoverage ? 'low' : 'high',
          coverage: hasPartialCoverage ? 'partial' : 'complete',
          now,
          details: {
            credentialAccountId: identity.accountId,
            ...(policyDecision.policy ? policyDetails(policyDecision.policy) : {}),
          },
        }),
        ...(hasPartialCoverage ? { coverageEvents } : {}),
      };
    },
  });
}
