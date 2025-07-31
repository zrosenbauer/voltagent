import type { DangerouslyAllowAny } from "@voltagent/internal/types";
import type { z } from "zod";
import type { Agent } from "../../agent/agent";
import type {
  InternalAnyWorkflowStep,
  InternalExtractWorkflowInputData,
  InternalWorkflowFunc,
  InternalWorkflowStep,
  InternalWorkflowStepConfig,
} from "../internal/types";
import type { Workflow, WorkflowRunOptions } from "../types";

export type WorkflowStepType =
  | "agent"
  | "func"
  | "conditional-when"
  | "parallel-all"
  | "parallel-race";

export interface WorkflowStepAgent<INPUT, DATA, RESULT, SUSPEND, RESUME>
  extends InternalWorkflowStep<INPUT, DATA, RESULT, SUSPEND, RESUME> {
  type: "agent";
  agent: Agent<{ llm: DangerouslyAllowAny }>;
}

export type WorkflowStepFuncConfig<INPUT, DATA, RESULT, SUSPEND, RESUME> =
  InternalWorkflowStepConfig<{
    execute: InternalWorkflowFunc<INPUT, DATA, RESULT, SUSPEND, RESUME>;
    inputSchema?: z.ZodTypeAny;
    outputSchema?: z.ZodTypeAny;
    suspendSchema?: z.ZodTypeAny;
    resumeSchema?: z.ZodTypeAny;
  }>;

export interface WorkflowStepFunc<INPUT, DATA, RESULT, SUSPEND, RESUME>
  extends InternalWorkflowStep<INPUT, DATA, RESULT, SUSPEND, RESUME> {
  type: "func";
}

export interface WorkflowStepWorkflow<INPUT, DATA, RESULT, SUSPEND, RESUME>
  extends InternalWorkflowStep<INPUT, DATA, RESULT, SUSPEND, RESUME> {
  type: "workflow";
  workflow: InternalWorkflow<INPUT, DATA, RESULT>;
}

export type WorkflowStepTapConfig<INPUT, DATA, _RESULT, SUSPEND, RESUME> =
  InternalWorkflowStepConfig<{
    execute: InternalWorkflowFunc<INPUT, DATA, DangerouslyAllowAny, SUSPEND, RESUME>;
    inputSchema?: z.ZodTypeAny;
    suspendSchema?: z.ZodTypeAny;
    resumeSchema?: z.ZodTypeAny;
  }>;

export interface WorkflowStepTap<INPUT, DATA, _RESULT, SUSPEND, RESUME>
  extends InternalWorkflowStep<INPUT, DATA, DATA, SUSPEND, RESUME> {
  type: "tap";
}

export type WorkflowStepConditionalWhenConfig<INPUT, DATA, RESULT, SUSPEND, RESUME> =
  InternalWorkflowStepConfig<{
    condition: InternalWorkflowFunc<INPUT, DATA, boolean, SUSPEND, RESUME>;
    step: InternalAnyWorkflowStep<INPUT, DATA, RESULT, SUSPEND, RESUME>;
    inputSchema?: z.ZodTypeAny;
    outputSchema?: z.ZodTypeAny;
    suspendSchema?: z.ZodTypeAny;
    resumeSchema?: z.ZodTypeAny;
  }>;

export interface WorkflowStepConditionalWhen<INPUT, DATA, RESULT, SUSPEND, RESUME>
  extends InternalWorkflowStep<
    INPUT,
    DATA,
    InternalExtractWorkflowInputData<DATA> | RESULT,
    SUSPEND,
    RESUME
  > {
  type: "conditional-when";
  condition: InternalWorkflowFunc<INPUT, DATA, boolean, SUSPEND, RESUME>;
}

export type WorkflowStepParallelRaceConfig<INPUT, DATA, RESULT> = InternalWorkflowStepConfig<{
  steps: ReadonlyArray<InternalAnyWorkflowStep<INPUT, DATA, RESULT>>;
}>;

export interface WorkflowStepParallelRace<INPUT, DATA, RESULT, SUSPEND, RESUME>
  extends InternalWorkflowStep<INPUT, DATA, RESULT, SUSPEND, RESUME> {
  type: "parallel-race";
  steps: ReadonlyArray<InternalAnyWorkflowStep<INPUT, DATA, RESULT, SUSPEND, RESUME>>;
}

export type WorkflowStepParallelAllConfig<STEPS> = InternalWorkflowStepConfig<{
  readonly steps: STEPS;
}>;

export interface WorkflowStepParallelAll<INPUT, DATA, RESULT, SUSPEND, RESUME>
  extends InternalWorkflowStep<INPUT, DATA, RESULT, SUSPEND, RESUME> {
  type: "parallel-all";
  steps: ReadonlyArray<InternalAnyWorkflowStep>;
}

export type WorkflowStep<
  INPUT,
  DATA,
  RESULT,
  SUSPEND = DangerouslyAllowAny,
  RESUME = DangerouslyAllowAny,
> =
  | WorkflowStepAgent<INPUT, DATA, RESULT, SUSPEND, RESUME>
  | WorkflowStepFunc<INPUT, DATA, RESULT, SUSPEND, RESUME>
  | WorkflowStepConditionalWhen<INPUT, DATA, RESULT, SUSPEND, RESUME>
  | WorkflowStepParallelAll<INPUT, DATA, RESULT, SUSPEND, RESUME>
  | WorkflowStepTap<INPUT, DATA, RESULT, SUSPEND, RESUME>
  | WorkflowStepParallelRace<INPUT, DATA, RESULT, SUSPEND, RESUME>
  | WorkflowStepWorkflow<INPUT, DATA, RESULT, SUSPEND, RESUME>;

/**
 * Internal type to allow overriding the run method for the workflow
 */
export interface InternalWorkflow<_INPUT, DATA, RESULT>
  extends Omit<Workflow<DangerouslyAllowAny, DangerouslyAllowAny>, "run"> {
  run: (
    input: InternalExtractWorkflowInputData<DATA>,
    options?: InternalWorkflowRunOptions,
  ) => Promise<{
    executionId: string;
    startAt: Date;
    endAt: Date;
    status: "completed";
    result: RESULT;
  }>;
}

export interface InternalWorkflowRunOptions extends WorkflowRunOptions {}
