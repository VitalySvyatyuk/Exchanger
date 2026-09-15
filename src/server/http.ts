import "server-only";
import type { z } from "zod";

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

type FetchJsonOptions<T> = {
  schema: z.ZodType<T>;
  headers?: Record<string, string>;
  /** Per attempt. */
  timeoutMs?: number;
  /** Retries after the first attempt. */
  retries?: number;
};

const MAX_RETRY_DELAY_MS = 5_000;

function isRetryable(status: number) {
  return status === 429 || status >= 500;
}

/** Delay before the next attempt: Retry-After if given, else backoff with jitter. */
function retryDelay(attempt: number, response?: Response): number {
  const retryAfter = response?.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const ms = Number.isFinite(seconds)
      ? seconds * 1000
      : new Date(retryAfter).getTime() - Date.now();
    if (ms >= 0) return Math.min(ms, MAX_RETRY_DELAY_MS);
  }
  const backoff = 250 * 2 ** attempt;
  return Math.min(backoff + Math.random() * backoff, MAX_RETRY_DELAY_MS);
}

/**
 * GET a JSON resource with a timeout, retries on network errors, 429 and
 * 5xx responses, and schema validation of the body.
 */
export async function fetchJson<T>(
  url: string,
  { schema, headers, timeoutMs = 5_000, retries = 2 }: FetchJsonOptions<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    let response: Response | undefined;
    try {
      response = await fetch(url, {
        headers: { accept: "application/json", ...headers },
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });

      if (response.ok) {
        const parsed = schema.safeParse(await response.json());
        if (!parsed.success) {
          // A malformed body won't fix itself on retry.
          throw new HttpError(`Unexpected response from ${url}`);
        }
        return parsed.data;
      }

      lastError = new HttpError(
        `${url} responded with ${response.status}`,
        response.status,
      );
      if (!isRetryable(response.status)) throw lastError;
    } catch (error) {
      if (error instanceof HttpError && !isRetryable(error.status ?? 0)) {
        throw error;
      }
      // Network error or timeout: retry.
      lastError = error;
    }

    if (attempt < retries) {
      await new Promise((resolve) =>
        setTimeout(resolve, retryDelay(attempt, response)),
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new HttpError(`Request to ${url} failed`);
}
