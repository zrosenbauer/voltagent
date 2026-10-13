import { ClientHTTPError } from "./client-http-errors";

/** Invalid merged context, rejected before the agent's execution lifecycle starts. */
export class AgentContextValidationError extends ClientHTTPError {
  override readonly cause: unknown;

  constructor(cause: unknown) {
    super("AgentContextValidationError", 400, "INVALID_CONTEXT", "Invalid agent context");
    this.cause = cause;
  }
}
