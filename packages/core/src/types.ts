/**
 * Basic type definitions for VoltAgent Core
 */

/**
 * Retry configuration for error handling
 */
export interface RetryConfig {
  /**
   * Maximum number of retry attempts
   * @default 3
   */
  maxRetries?: number;

  /**
   * Initial delay between retries in milliseconds
   * @default 1000
   */
  initialDelay?: number;

  /**
   * Backoff multiplier for exponential backoff
   * @default 2
   */
  backoffMultiplier?: number;

  /**
   * Maximum delay between retries in milliseconds
   * @default 30000
   */
  maxDelay?: number;

  /**
   * Callback function called when an error occurs
   * Return true to retry, false to abort
   * @param error The error that occurred
   * @param attempt Current attempt number (1-based)
   * @param maxRetries Maximum number of retries
   * @returns Boolean indicating whether to retry
   */
  onError?:
    | ((error: Error, attempt: number, maxRetries: number) => boolean | Promise<boolean>)
    | null;
}
