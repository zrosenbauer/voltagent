import type { DangerouslyAllowAny } from "@voltagent/internal/types";
import type { z } from "zod";
import type { Agent } from "../agent/agent";
import { createWorkflow } from "./core";
import type {
  InternalAnyWorkflowStep,
  InternalBaseWorkflowInputSchema,
  InternalInferWorkflowStepsResult,
  InternalWorkflowFunc,
} from "./internal/types";
import {
  type WorkflowStep,
  type WorkflowStepParallelAllConfig,
  type WorkflowStepParallelRaceConfig,
  andAgent,
  andAll,
  andRace,
  andTap,
  andThen,
  andWhen,
  andWorkflow,
} from "./steps";
import type { InternalWorkflow, WorkflowStepFunc } from "./steps/types";
import type {
  Workflow,
  WorkflowConfig,
  WorkflowExecutionResult,
  WorkflowInput,
  WorkflowRunOptions,
} from "./types";

/**
 * Agent configuration for the chain
 */
export type AgentConfig<SCHEMA extends z.ZodTypeAny> = {
  schema: SCHEMA;
};

/**
 * A workflow chain that provides a fluent API for building workflows
 *
 * @example
 * ```ts
 * const workflow = createWorkflowChain({
 *   id: "user-processing",
 *   name: "User Processing Workflow",
 *   purpose: "Process user data and generate personalized content",
 *   input: z.object({ userId: z.string(), userType: z.enum(["admin", "user"]) }),
 *   result: z.object({ processed: z.boolean(), content: z.string() }),
 *   memory: new LibSQLStorage({ url: "file:memory.db" }) // Optional workflow-specific memory
 * })
 *   .andThen({
 *     id: "fetch-user",
 *     execute: async ({ data }) => {
 *       const userInfo = await fetchUserInfo(data.userId);
 *       return { ...data, userInfo };
 *     }
 *   })
 *   .andWhen({
 *     id: "admin-permissions",
 *     condition: async ({ data }) => data.userType === "admin",
 *     execute: async ({ data }) => ({ ...data, permissions: ["read", "write", "delete"] })
 *   })
 *   .andAgent(
 *     ({ data }) => `Generate personalized content for ${data.userInfo.name}`,
 *     agent,
 *     { schema: z.object({ content: z.string() }) }
 *   )
 *   .andThen({
 *     id: "finalize-result",
 *     execute: async ({ data }) => ({
 *       processed: true,
 *       content: data.content
 *     })
 *   });
 *
 * // Run with optional memory override
 * const result = await workflow.run(
 *   { userId: "123", userType: "admin" },
 *   { memory: new LibSQLStorage({ url: "file:memory.db" }) }
 * );
 * ```
 */
export class WorkflowChain<
  INPUT_SCHEMA extends InternalBaseWorkflowInputSchema,
  RESULT_SCHEMA extends z.ZodTypeAny,
  CURRENT_DATA = WorkflowInput<INPUT_SCHEMA>,
> {
  private steps: WorkflowStep<
    WorkflowInput<INPUT_SCHEMA>,
    DangerouslyAllowAny,
    DangerouslyAllowAny
  >[] = [];
  private config: WorkflowConfig<INPUT_SCHEMA, RESULT_SCHEMA>;

  constructor(config: WorkflowConfig<INPUT_SCHEMA, RESULT_SCHEMA>) {
    this.config = config;
  }

  /**
   * Creates an agent step for a workflow
   *
   * @example
   * ```ts
   * const w = createWorkflowChain({
   *   id: "greeting-workflow",
   *   input: z.object({ name: z.string() }),
   *   result: z.string()
   * })
   *   .andAgent(
   *     ({ data }) => `Generate a greeting for the user ${data.name}`,
   *     agent,
   *     { schema: z.object({ greeting: z.string() }) }
   *   )
   *   .andThen({
   *     id: "extract-greeting",
   *     execute: async ({ data }) => data.greeting
   *   })
   * ```
   *
   * @param task - The task (prompt) to execute for the agent, can be a string or a function that returns a string
   * @param agent - The agent to execute the task using `generateObject`
   * @param config - The config for the agent (schema) `generateObject` call
   * @returns A workflow step that executes the agent with the task
   */
  public andAgent<SCHEMA extends z.ZodTypeAny>(
    task: string | InternalWorkflowFunc<INPUT_SCHEMA, CURRENT_DATA, string, any, any>,
    agent: Agent<{ llm: DangerouslyAllowAny }>,
    config: AgentConfig<SCHEMA>,
  ): WorkflowChain<INPUT_SCHEMA, RESULT_SCHEMA, z.infer<SCHEMA>> {
    const step = andAgent(task, agent, config) as unknown as WorkflowStep<
      WorkflowInput<INPUT_SCHEMA>,
      CURRENT_DATA,
      z.infer<SCHEMA> | DangerouslyAllowAny
    >;
    this.steps.push(step);
    return this as unknown as WorkflowChain<INPUT_SCHEMA, RESULT_SCHEMA, z.infer<SCHEMA>>;
  }

  /**
   * Add a function step to the workflow
   *
   * @example
   * ```ts
   * const workflow = createWorkflowChain(config)
   *   .andThen({
   *     id: "process",
   *     execute: async ({ data }) => {
   *       const processed = await someAsyncOperation(data.value);
   *       return { ...data, processed };
   *     }
   *   })
   *   .andThen({
   *     id: "enrich",
   *     execute: async ({ data }) => {
   *       const enriched = await enrichData(data.processed);
   *       return { ...data, enriched };
   *     }
   *   });
   * ```
   *
   * @param config - Step configuration
   * @returns A new chain with the function step added
   */
  public andThen<
    NEW_DATA,
    SUSPEND_SCHEMA extends z.ZodTypeAny | undefined = undefined,
    RESUME_SCHEMA extends z.ZodTypeAny | undefined = undefined,
  >(config: WorkflowStepFunc<INPUT_SCHEMA, CURRENT_DATA, NEW_DATA, SUSPEND_SCHEMA, RESUME_SCHEMA>) {
    const step = andThen(config);
    this.steps.push(step as DangerouslyAllowAny);
    return this as unknown as WorkflowChain<INPUT_SCHEMA, RESULT_SCHEMA, NEW_DATA>;
  }

  /**
   * Add a conditional step that executes when a condition is true
   *
   * @example
   * ```ts
   * const workflow = createWorkflowChain(config)
   *   .andWhen({
   *     id: "admin-permissions",
   *     condition: async ({ data }) => data.userType === "admin",
   *     execute: async ({ data }) => ({ ...data, permissions: ["read", "write", "delete"] })
   *   })
   *   .andWhen({
   *     id: "high-value-flag",
   *     condition: async ({ data }) => data.value > 1000,
   *     execute: async ({ data }) => ({ ...data, flagged: true, requiresReview: true })
   *   })
   *   .andWhen({
   *     id: "process-pending",
   *     condition: async ({ data }) => data.status === "pending",
   *     execute: async ({ data }) => {
   *       const result = await agent.generateObject(
   *         `Process pending request for ${data.userId}`,
   *         z.object({ processed: z.boolean() })
   *       );
   *       return { ...data, ...result.object };
   *     }
   *   });
   * ```
   *
   * @param condition - Function that determines if the step should execute based on the current data
   * @param stepInput - Either a workflow step or an agent to execute when the condition is true
   * @returns A new chain with the conditional step added
   */
  public andWhen(config: any): WorkflowChain<INPUT_SCHEMA, RESULT_SCHEMA, CURRENT_DATA> {
    const finalStep = andWhen(config) as WorkflowStep<WorkflowInput<INPUT_SCHEMA>, any, any>;
    this.steps.push(finalStep);
    return this as unknown as WorkflowChain<INPUT_SCHEMA, RESULT_SCHEMA, CURRENT_DATA>;
  }

  /**
   * Add a tap step to the workflow
   *
   * @example
   * ```ts
   * const workflow = createWorkflowChain(config)
   *   .andTap({
   *     id: "log-translation",
   *     execute: async ({ data }) => {
   *       console.log("🔄 Translating text:", data);
   *     }
   *   })
   *   .andThen({
   *     id: "return-translation",
   *     // the input data is still the same as the andTap ONLY executes, it doesn't return anything
   *     execute: async ({ data }) => {
   *       return { ...data, translatedText: data.translatedText };
   *     }
   *   });
   * ```
   *
   * @param fn - The async function to execute with the current workflow data
   * @returns A new chain with the tap step added
   */
  public andTap(config: any): any {
    const finalStep = andTap(config) as WorkflowStep<WorkflowInput<INPUT_SCHEMA>, any, any, any>;
    this.steps.push(finalStep);
    return this;
  }

  /**
   * Add a workflow step to the workflow
   *
   * @example
   * ```ts
   * import { myWorkflow } from "./my-workflow";
   *
   * const workflow = createWorkflowChain(config)
   *   .andThen({
   *     id: "fetch-user",
   *     execute: async ({ data }) => {
   *       const userInfo = await fetchUserInfo(data.userId);
   *       return { userInfo };
   *     }
   *   })
   *   .andWorkflow(myWorkflow)
   * ```
   */
  public andWorkflow<NEW_DATA>(
    workflow: InternalWorkflow<INPUT_SCHEMA, CURRENT_DATA, NEW_DATA>,
  ): WorkflowChain<INPUT_SCHEMA, RESULT_SCHEMA, NEW_DATA> {
    this.steps.push(
      andWorkflow(workflow) as unknown as WorkflowStep<
        WorkflowInput<INPUT_SCHEMA>,
        CURRENT_DATA,
        NEW_DATA
      >,
    );
    return this as unknown as WorkflowChain<INPUT_SCHEMA, RESULT_SCHEMA, NEW_DATA>;
  }

  /**
   * Add a parallel execution step that runs multiple steps simultaneously and waits for all to complete
   *
   * @example
   * ```ts
   * const workflow = createWorkflowChain(config)
   *   .andAll({
   *     id: "parallel-fetch",
   *     steps: [
   *       {
   *         id: "fetch-user",
   *         execute: async ({ data }) => {
   *           const userInfo = await fetchUserInfo(data.userId);
   *           return { userInfo };
   *         }
   *       },
   *       {
   *         id: "fetch-permissions",
   *         execute: async ({ data }) => {
   *           const permissions = await fetchPermissions(data.userId);
   *           return { permissions };
   *         }
   *       },
   *       {
   *         id: "generate-recommendations",
   *         execute: async ({ data }) => {
   *           const result = await agent.generateObject(
   *             `Generate recommendations for user ${data.userId}`,
   *             z.object({ recommendations: z.array(z.string()) })
   *           );
   *           return result.object;
   *         }
   *       }
   *     ]
   *   })
   *   .andThen({
   *     id: "combine-results",
   *     execute: async ({ data }) => {
   *       // data is now an array: [{ userInfo }, { permissions }, { recommendations }]
   *       return { combined: data.flat() };
   *     }
   *   });
   * ```
   *
   * @param steps - Array of workflow steps to execute in parallel
   * @returns A new chain with the parallel step added
   */
  public andAll<
    NEW_DATA,
    STEPS extends ReadonlyArray<
      InternalAnyWorkflowStep<WorkflowInput<INPUT_SCHEMA>, CURRENT_DATA, NEW_DATA>
    >,
    INFERRED_RESULT = InternalInferWorkflowStepsResult<STEPS>,
  >({
    steps,
    ...config
  }: WorkflowStepParallelAllConfig<STEPS>): WorkflowChain<
    INPUT_SCHEMA,
    RESULT_SCHEMA,
    INFERRED_RESULT
  > {
    this.steps.push(andAll({ steps, ...config }));
    return this as unknown as WorkflowChain<INPUT_SCHEMA, RESULT_SCHEMA, INFERRED_RESULT>;
  }

  /**
   * Add a race execution step that runs multiple steps simultaneously and returns the first completed result
   *
   * @example
   * ```ts
   * const workflow = createWorkflowChain(config)
   *   .andRace({
   *     id: "race-data-sources",
   *     steps: [
   *       {
   *         id: "check-cache",
   *         execute: async ({ data }) => {
   *           // Fast operation
   *           const cacheResult = await checkCache(data.query);
   *           return { source: "cache", result: cacheResult };
   *         }
   *       },
   *       {
   *         id: "query-database",
   *         execute: async ({ data }) => {
   *           // Slower operation
   *           const dbResult = await queryDatabase(data.query);
   *           return { source: "database", result: dbResult };
   *         }
   *       },
   *       {
   *         id: "ai-fallback",
   *         execute: async ({ data }) => {
   *           const result = await agent.generateObject(
   *             `Generate fallback response for: ${data.query}`,
   *             z.object({ source: z.literal("ai"), result: z.string() })
   *           );
   *           return result.object;
   *         }
   *       }
   *     ]
   *   })
   *   .andThen({
   *     id: "process-result",
   *     execute: async ({ data }) => {
   *       // data is the result from whichever step completed first
   *       return { finalResult: data.result, source: data.source };
   *     }
   *   });
   * ```
   *
   * @param steps - Array of workflow steps to execute in parallel
   * @returns A new chain with the race step added
   */
  public andRace<
    NEW_DATA,
    STEPS extends ReadonlyArray<
      InternalAnyWorkflowStep<WorkflowInput<INPUT_SCHEMA>, CURRENT_DATA, NEW_DATA>
    >,
    INFERRED_RESULT = InternalInferWorkflowStepsResult<STEPS>[number],
  >({
    steps,
    ...config
  }: WorkflowStepParallelRaceConfig<STEPS, CURRENT_DATA, NEW_DATA>): WorkflowChain<
    INPUT_SCHEMA,
    RESULT_SCHEMA,
    INFERRED_RESULT
  > {
    this.steps.push(andRace(config as unknown as DangerouslyAllowAny));
    return this as unknown as WorkflowChain<INPUT_SCHEMA, RESULT_SCHEMA, INFERRED_RESULT>;
  }

  /**
   * Convert the current chain to a runnable workflow
   */
  public toWorkflow(): Workflow<INPUT_SCHEMA, RESULT_SCHEMA> {
    return createWorkflow<INPUT_SCHEMA, RESULT_SCHEMA>(
      this.config,
      // @ts-expect-error - upstream types work and this is nature of how the createWorkflow function is typed using variadic args
      ...this.steps,
    );
  }

  /**
   * Execute the workflow with the given input
   */
  async run(
    input: WorkflowInput<INPUT_SCHEMA>,
    options?: WorkflowRunOptions,
  ): Promise<WorkflowExecutionResult<RESULT_SCHEMA>> {
    const workflow = createWorkflow<INPUT_SCHEMA, RESULT_SCHEMA>(
      this.config,
      // @ts-expect-error - upstream types work and this is nature of how the createWorkflow function is typed using variadic args
      ...this.steps,
    );
    return (await workflow.run(
      input,
      options,
    )) as unknown as WorkflowExecutionResult<RESULT_SCHEMA>;
  }
}

/**
 * Creates a new workflow chain with the given configuration
 */
export function createWorkflowChain<
  INPUT_SCHEMA extends InternalBaseWorkflowInputSchema,
  RESULT_SCHEMA extends z.ZodTypeAny,
>(config: WorkflowConfig<INPUT_SCHEMA, RESULT_SCHEMA>) {
  return new WorkflowChain<INPUT_SCHEMA, RESULT_SCHEMA, WorkflowInput<INPUT_SCHEMA>>(config);
}

/*
|------------------
| Internals
|------------------
*/

// type ExecuteFunc<
//   INPUT_SCHEMA extends z.ZodTypeAny,
//   OUTPUT_SCHEMA extends z.ZodTypeAny,
//   SUSPEND_SCHEMA extends z.ZodTypeAny,
//   RESUME_SCHEMA extends z.ZodTypeAny,
// > = (context: {
//   data: z.infer<INPUT_SCHEMA>;
//   state: any;
//   getStepData: (stepId: string) => { input: any; output: any } | undefined;
//   suspend: (
//     reason?: string,
//     suspendData?: SUSPEND_SCHEMA extends z.ZodTypeAny ? z.infer<SUSPEND_SCHEMA> : unknown,
//   ) => Promise<never>;
//   resumeData?: RESUME_SCHEMA extends z.ZodTypeAny ? z.infer<RESUME_SCHEMA> : unknown;
// }) => Promise<z.infer<OUTPUT_SCHEMA>>;

// type InferZodSchema<SCHEMA extends z.ZodTypeAny | undefined = undefined> =
//   SCHEMA extends z.ZodTypeAny ? z.infer<SCHEMA> : unknown;
