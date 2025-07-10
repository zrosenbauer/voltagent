import { match } from "ts-pattern";
import type {
  InferWorkflowSteps,
  InternalAnyWorkflowStep,
  InternalInferWorkflowStepsResult,
  InternalWorkflowFunc,
} from "../internal/types";
import { defaultStepConfig } from "../internal/utils";
import { matchStep } from "./helpers";
import type { WorkflowStepParallelAll, WorkflowStepParallelAllConfig } from "./types";

/**
 * Creates a parallel execution step that runs multiple steps simultaneously and waits for all to complete
 *
 * @example
 * ```ts
 * const w = createWorkflow(
 *   andAll([
 *     andThen(async (data) => {
 *       const userInfo = await fetchUserInfo(data.userId);
 *       return { userInfo };
 *     }),
 *     andThen(async (data) => {
 *       const permissions = await fetchPermissions(data.userId);
 *       return { permissions };
 *     }),
 *     andAgent(
 *       (data) => `Generate recommendations for user ${data.userId}`,
 *       agent,
 *       { schema: z.object({ recommendations: z.array(z.string()) }) }
 *     )
 *   ]),
 *   andThen(async (data) => {
 *     // data is now an array: [{ userInfo }, { permissions }, { recommendations }]
 *     return { combined: data.flat() };
 *   })
 * );
 * ```
 *
 * @param steps - Array of workflow steps to execute in parallel
 * @returns A workflow step that executes all steps simultaneously and returns their results as an array
 */
export function andAll<
  INPUT,
  DATA,
  RESULT,
  STEPS extends
    | Array<InternalAnyWorkflowStep<INPUT, DATA, RESULT>>
    | InternalWorkflowFunc<INPUT, DATA, Array<InternalAnyWorkflowStep<INPUT, DATA, RESULT>>>,
  INFERRED_RESULT = InternalInferWorkflowStepsResult<InferWorkflowSteps<STEPS>>,
>({ steps, ...config }: WorkflowStepParallelAllConfig<STEPS>) {
  return {
    ...defaultStepConfig(config),
    type: "parallel-all",
    steps: steps as unknown as InternalAnyWorkflowStep<INPUT, DATA, INFERRED_RESULT>[],
    execute: async (data, state) => {
      const finalSteps = await match(steps)
        .returnType<Promise<ReadonlyArray<InternalAnyWorkflowStep<INPUT, DATA, RESULT>>>>()
        .when(
          (s) => isStepFunc<INPUT, DATA, RESULT>(s),
          (s) => s(data, state),
        )
        .when(
          (s) => isStepArray<INPUT, DATA, RESULT>(s),
          (s) => Promise.resolve(s),
        )
        .otherwise(() => {
          throw new Error("Invalid steps");
        });
      const promises = finalSteps.map((step) => matchStep(step).execute(data, state));
      return (await Promise.all(promises)) as INFERRED_RESULT;
    },
  } satisfies WorkflowStepParallelAll<INPUT, DATA, INFERRED_RESULT>;
}

function isStepFunc<INPUT, DATA, RESULT>(
  steps: unknown,
): steps is InternalWorkflowFunc<
  INPUT,
  DATA,
  ReadonlyArray<InternalAnyWorkflowStep<INPUT, DATA, RESULT>>
> {
  return typeof steps === "function" && !Array.isArray(steps);
}

function isStepArray<INPUT, DATA, RESULT>(
  steps: unknown,
): steps is ReadonlyArray<InternalAnyWorkflowStep<INPUT, DATA, RESULT>> {
  return Array.isArray(steps);
}
