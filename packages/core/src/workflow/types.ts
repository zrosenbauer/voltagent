import type { DangerouslyAllowAny } from "@voltagent/internal/types";
import type * as TF from "type-fest";
import type { z } from "zod";
import type { BaseMessage } from "../agent/providers";
import type { UserContext } from "../agent/types";
import type {
  InternalBaseWorkflowInputSchema,
  InternalExtractWorkflowInputData,
} from "./internal/types";
import type { WorkflowStep } from "./steps";

export interface WorkflowRunOptions {
  /**
   * The active step, this can be used to track the current step in a workflow
   * @default 0
   */
  active?: number;
  /**
   * The execution ID, this can be used to track the current execution in a workflow
   * @default uuidv4
   */
  executionId?: string;
  /**
   * The conversation ID, this can be used to track the current conversation in a workflow
   */
  conversationId?: string;
  /**
   * The user ID, this can be used to track the current user in a workflow
   */
  userId?: string;
}

/**
 * The status of a workflow
 */
export type WorkflowStateStatus = "pending" | "running" | "completed" | "failed";

/**
 * The state of a workflow
 */
export type WorkflowState<INPUT, RESULT> = {
  /**
   * The execution ID, this can be used to track the current execution in a workflow
   */
  executionId: string;
  /**
   * The conversation ID, this can be used to track the current conversation in a workflow
   */
  conversationId?: string;
  /**
   * The user ID, this can be used to track the current user in a workflow
   */
  userId?: string;
  /**
   * The user context, this can be used to track the current user in a workflow
   */
  userContext?: UserContext;
  /**
   * The active step, this can be used to track the current step in a workflow
   */
  active: number;
  /**
   * The start time of the workflow
   */
  startAt: Date;
  /**
   * The end time of the workflow
   */
  endAt: Date | null;
  /**
   * The status of the workflow
   */
  status: WorkflowStateStatus;
  /**
   * The initial input data to the workflow
   */
  input: InternalExtractWorkflowInputData<INPUT>;
  /**
   * The current data being processed
   */
  data: DangerouslyAllowAny;
  /**
   * The result of workflow execution, null until execution is complete
   */
  result: RESULT | null;
  /**
   * The error of the workflow
   */
  error: Error | null;
};

/**
 * Hooks for the workflow
 * @param DATA - The type of the data
 * @param RESULT - The type of the result
 */
export type WorkflowHooks<DATA, RESULT> = {
  /**
   * Called when the workflow starts
   * @param state - The current state of the workflow
   * @returns void
   */
  onStart?: (state: WorkflowState<DATA, RESULT>) => Promise<void>;
  /**
   * Called when a step starts
   * @param state - The current state of the workflow
   * @returns void
   */
  onStepStart?: (state: WorkflowState<DATA, RESULT>) => Promise<void>;
  /**
   * Called when a step ends
   * @param state - The current state of the workflow
   * @returns void
   */
  onStepEnd?: (state: WorkflowState<DATA, RESULT>) => Promise<void>;
  /**
   * Called when the workflow ends
   * @param state - The current state of the workflow
   * @returns void
   */
  onEnd?: (state: WorkflowState<DATA, RESULT>) => Promise<void>;
};

export type WorkflowInput<INPUT_SCHEMA extends InternalBaseWorkflowInputSchema> =
  TF.IsUnknown<INPUT_SCHEMA> extends true
    ? BaseMessage | BaseMessage[] | string
    : INPUT_SCHEMA extends z.ZodTypeAny
      ? z.infer<INPUT_SCHEMA>
      : undefined;

export type WorkflowResult<RESULT_SCHEMA extends z.ZodTypeAny> = RESULT_SCHEMA extends z.ZodTypeAny
  ? z.infer<RESULT_SCHEMA>
  : RESULT_SCHEMA;

export type WorkflowConfig<
  INPUT_SCHEMA extends InternalBaseWorkflowInputSchema,
  RESULT_SCHEMA extends z.ZodTypeAny,
> = {
  /**
   * Unique identifier for the workflow
   */
  id: string;
  /**
   * Human-readable name for the workflow
   */
  name: string;
  /**
   * Description of what the workflow does
   */
  purpose?: string;
  /**
   * Schema for the input data
   */
  input?: INPUT_SCHEMA;
  /**
   * Schema for the result data
   */
  result: RESULT_SCHEMA;
  /**
   * Hooks for the workflow
   */
  hooks?: WorkflowHooks<WorkflowInput<INPUT_SCHEMA>, WorkflowResult<RESULT_SCHEMA>>;
};

/**
 * A workflow instance that can be executed
 */
export type Workflow<
  INPUT_SCHEMA extends InternalBaseWorkflowInputSchema,
  RESULT_SCHEMA extends z.ZodTypeAny,
> = {
  /**
   * Unique identifier for the workflow
   */
  id: string;
  /**
   * Human-readable name for the workflow
   */
  name: string;
  /**
   * Description of what the workflow does
   * @default "No purpose provided"
   */
  purpose: string;
  /**
   * Array of steps to execute in order
   */
  steps: WorkflowStep<WorkflowInput<INPUT_SCHEMA>, DangerouslyAllowAny, DangerouslyAllowAny>[];
  /**
   * Execute the workflow with the given input
   * @param input - The input to the workflow
   * @returns The result of the workflow
   */
  run: (input: WorkflowInput<INPUT_SCHEMA>) => Promise<{
    executionId: string;
    startAt: Date;
    endAt: Date;
    status: "completed";
    result: z.infer<RESULT_SCHEMA>;
  }>;
};
