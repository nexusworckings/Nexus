export class InterviewError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
  }
}

export class SchemaError extends InterviewError {
  constructor(code, message, serviceId = null, location = null) {
    super(code, message, { serviceId, location });
    this.name = 'SchemaError';
    this.serviceId = serviceId;
    this.location = location;
  }
}

export class StateError extends InterviewError {
  constructor(code, message, details = {}) {
    super(code, message, details);
    this.name = 'StateError';
  }
}

export class FlowError extends InterviewError {
  constructor(code, message, details = {}) {
    super(code, message, details);
    this.name = 'FlowError';
  }
}

export class InferenceError extends InterviewError {
  constructor(code, message, details = {}) {
    super(code, message, details);
    this.name = 'InferenceError';
  }
}

export class AIAdapterError extends InterviewError {
  constructor(code, message, cause = null) {
    super(code, message);
    this.name = 'AIAdapterError';
    this.cause = cause;
  }
}

export class AITimeoutError extends AIAdapterError {
  constructor(message = 'Request timed out', cause = null) {
    super('AI_TIMEOUT', message, cause);
    this.name = 'AITimeoutError';
  }
}

export class AINetworkError extends AIAdapterError {
  constructor(message = 'Network error occurred', cause = null) {
    super('AI_NETWORK_ERROR', message, cause);
    this.name = 'AINetworkError';
  }
}

export class AIBadResponseError extends AIAdapterError {
  constructor(message = 'Bad response from AI', cause = null) {
    super('AI_BAD_RESPONSE', message, cause);
    this.name = 'AIBadResponseError';
  }
}

export class AIInvalidJSONError extends AIAdapterError {
  constructor(message = 'Invalid JSON in API response', cause = null) {
    super('AI_INVALID_JSON', message, cause);
    this.name = 'AIInvalidJSONError';
  }
}

export class AIRateLimitError extends AIAdapterError {
  constructor(message = 'Rate limit exceeded', cause = null) {
    super('AI_RATE_LIMIT', message, cause);
    this.name = 'AIRateLimitError';
  }
}

export class AIAuthError extends AIAdapterError {
  constructor(message = 'Authentication failed', cause = null) {
    super('AI_AUTH_ERROR', message, cause);
    this.name = 'AIAuthError';
  }
}

export class AIConfigurationError extends AIAdapterError {
  constructor(message = 'Configuration error', cause = null) {
    super('AI_CONFIGURATION_ERROR', message, cause);
    this.name = 'AIConfigurationError';
  }
}

export class InterpreterError extends InterviewError {
  constructor(code, message, details = {}) {
    super(code, message, details);
    this.name = 'InterpreterError';
  }
}

export class ValidationError extends InterviewError {
  constructor(code, message, details = {}) {
    super(code, message, details);
    this.name = 'ValidationError';
  }
}
