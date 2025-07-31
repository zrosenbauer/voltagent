import type { DangerouslyAllowAny } from "@voltagent/internal/types";
import { vi } from "vitest";
import type { WorkflowExecuteContext } from "../../workflow/internal/types";

export type MockWorkflowExecuteContext = WorkflowExecuteContext<
  DangerouslyAllowAny,
  DangerouslyAllowAny,
  DangerouslyAllowAny,
  DangerouslyAllowAny
>;

/**
 * Get a mock execute context
 * @returns A mock execute context
 */
export function createMockWorkflowExecuteContext(
  overrides: Partial<MockWorkflowExecuteContext> = {},
): MockWorkflowExecuteContext {
  return {
    data: overrides.data ?? ({} as DangerouslyAllowAny),
    state: overrides.state ?? ({} as DangerouslyAllowAny),
    getStepData: overrides.getStepData ?? (() => undefined),
    suspend: overrides.suspend ?? vi.fn(),
    logger: overrides.logger ?? {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn(),
    },
  };
}
