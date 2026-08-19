import { ValidationError } from '../errors/application-error.js';
import { validateDomainObject } from '../domain/validate.js';

function requireOperation(operation, adapterType) {
  if (typeof operation !== 'function') {
    throw new ValidationError({
      message: `${adapterType} adapters require an operation function.`,
    });
  }
}

export function createProviderAdapter({ provider, collect }) {
  requireOperation(collect, 'Provider');

  return Object.freeze({
    provider,
    async collect(request) {
      const validatedRequest = validateDomainObject(
        'providerCollectionRequest',
        request,
      );

      if (validatedRequest.provider !== provider) {
        throw new ValidationError({
          message: 'Provider adapter request provider does not match the adapter provider.',
          details: {
            adapterProvider: provider,
            requestProvider: validatedRequest.provider,
          },
        });
      }

      const outcome = await collect(validatedRequest);
      const validatedOutcome = validateDomainObject(
        'providerCollectionOutcome',
        outcome,
      );

      if (validatedOutcome.provider !== provider) {
        throw new ValidationError({
          message: 'Provider adapter outcome provider does not match the adapter provider.',
          details: {
            adapterProvider: provider,
            outcomeProvider: validatedOutcome.provider,
          },
        });
      }

      return validatedOutcome;
    },
  });
}

export function createOwnershipAdapter({ collectEvidence }) {
  requireOperation(collectEvidence, 'Ownership');

  return Object.freeze({
    async collectEvidence(request) {
      const validatedRequest = validateDomainObject(
        'ownershipEvidenceRequest',
        request,
      );
      const outcome = await collectEvidence(validatedRequest);

      return validateDomainObject('ownershipEvidenceOutcome', outcome);
    },
  });
}
