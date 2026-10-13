import type { FlexibleSchema, InferSchema } from "@ai-sdk/provider-utils";
import type { ContextInput } from "./agent";
import type { AgentHooks } from "./hooks";
import type { OperationContext, VoltAgentRuntimeOptions } from "./types";

export type AgentContextSchema = FlexibleSchema<Record<string, unknown>>;

/** Schema input before defaults and transforms; callbacks read the schema output. */
export type InferAgentContextInput<SCHEMA extends AgentContextSchema> = SCHEMA extends {
  readonly "~standard": { readonly types?: { readonly input: infer INPUT } };
}
  ? INPUT
  : InferSchema<SCHEMA>;

/** A normal mutable Map with typed reads and writes for schema-declared keys. */
export interface TypedContext<DATA extends Record<string, unknown>>
  extends Map<string | symbol, unknown> {
  get<KEY extends string | symbol>(
    key: KEY,
  ): KEY extends keyof DATA ? DATA[KEY] | undefined : unknown;
  set<KEY extends string | symbol>(
    key: KEY,
    value: KEY extends keyof DATA ? DATA[KEY] : unknown,
  ): this;
}

export type AgentContext<SCHEMA extends AgentContextSchema> = unknown extends InferSchema<SCHEMA>
  ? Map<string | symbol, unknown>
  : string extends keyof InferSchema<SCHEMA>
    ? Map<string | symbol, unknown>
    : TypedContext<InferSchema<SCHEMA>>;

/** Inputs can be partial because constructor defaults and parent context supply missing keys. */
export type AgentContextInput<SCHEMA extends AgentContextSchema> =
  unknown extends InferSchema<SCHEMA>
    ? ContextInput
    : string extends keyof InferSchema<SCHEMA>
      ? ContextInput
      :
          | (Partial<InferAgentContextInput<SCHEMA>> & Record<string | symbol, unknown>)
          | Extract<ContextInput, Map<string | symbol, unknown>>;

export type AgentContextParameter<SCHEMA extends AgentContextSchema> = {
  context?: AgentContextInput<SCHEMA>;
  voltagent?: Omit<VoltAgentRuntimeOptions, "context"> & {
    context?: AgentContextInput<SCHEMA>;
  };
};

type WithContext<ARGS, CONTEXT extends Map<string | symbol, unknown>> = ARGS extends {
  context: OperationContext;
}
  ? Omit<ARGS, "context"> & { context: Omit<OperationContext, "context"> & { context: CONTEXT } }
  : ARGS;

/** Agent-local hooks share the context type inferred from the agent's schema. */
export type AgentContextHooks<SCHEMA extends AgentContextSchema> =
  unknown extends InferSchema<SCHEMA>
    ? AgentHooks
    : string extends keyof InferSchema<SCHEMA>
      ? AgentHooks
      : {
          [KEY in keyof AgentHooks]: NonNullable<AgentHooks[KEY]> extends (
            args: infer ARGS,
          ) => infer RESULT
            ? (args: WithContext<ARGS, AgentContext<SCHEMA>>) => RESULT
            : AgentHooks[KEY];
        };
