/**
 * Structured Enterprise Error Taxonomy & Rate-Limit Backoff Engine.
 */

export class AppError extends Error {
  public code: string;
  public statusCode?: number;
  public details?: any;

  constructor(message: string, code = "APP_ERROR", statusCode?: number, details?: any) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class NetworkError extends AppError {
  constructor(message = "Network connection unavailable. Operating in offline mode.") {
    super(message, "NETWORK_ERROR", 0);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Session expired. Please sign in again.") {
    super(message, "AUTH_ERROR", 401);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super(message, "FORBIDDEN", 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "The requested asset was not found.") {
    super(message, "NOT_FOUND", 404);
  }
}

export class ConflictError extends AppError {
  public serverAsset?: any;
  constructor(
    message = "This asset was modified by another user. Please resolve changes.",
    serverAsset?: any
  ) {
    super(message, "CONFLICT", 412, serverAsset);
    this.serverAsset = serverAsset;
  }
}

export class RateLimitError extends AppError {
  public retryAfterSeconds: number;
  constructor(message = "Rate limit exceeded. Please wait.", retryAfterSeconds = 2) {
    super(message, "RATE_LIMITED", 429);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 400);
  }
}

/**
 * Execute an asynchronous operation with exponential backoff for Microsoft Graph 429 throttling.
 */
export async function withRateLimitRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (err: any) {
      attempt++;
      const isRateLimit =
        err?.statusCode === 429 ||
        err?.status === 429 ||
        err instanceof RateLimitError ||
        err?.message?.includes("429") ||
        err?.message?.includes("rate limit");

      if (isRateLimit && attempt <= maxRetries) {
        const retryAfterSec =
          Number(err?.retryAfterSeconds) ||
          Number(err?.headers?.get?.("Retry-After")) ||
          Math.pow(2, attempt) + Math.random() * 0.5;

        const waitMs = Math.min(retryAfterSec * 1000, 10000);
        console.warn(`Rate limit hit (429). Retrying attempt ${attempt}/${maxRetries} after ${waitMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      throw err;
    }
  }
}
