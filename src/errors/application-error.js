import { redact } from '../logging/redact.js';

export class ApplicationError extends Error {
  constructor({ message, code, statusCode = 500, details = undefined, cause = undefined }) {
    super(message, { cause });
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  toSafeJSON() {
    return {
      code: this.code,
      message: this.message,
      ...(this.details === undefined ? {} : { details: redact(this.details) }),
    };
  }
}

export class ConfigurationError extends ApplicationError {
  constructor({ message, details = undefined, cause = undefined }) {
    super({
      message,
      code: 'CONFIGURATION_INVALID',
      statusCode: 500,
      details,
      cause,
    });
  }
}

export class ValidationError extends ApplicationError {
  constructor({ message, details = undefined, cause = undefined }) {
    super({
      message,
      code: 'VALIDATION_FAILED',
      statusCode: 400,
      details,
      cause,
    });
  }
}
