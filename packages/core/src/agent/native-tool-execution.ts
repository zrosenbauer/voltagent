import type { ToolExecutionOptions } from "@ai-sdk/provider-utils";
import type { ToolExecutionResult } from "../tool";

type Execute = (
  input: unknown,
  options?: ToolExecutionOptions<any>,
) => ToolExecutionResult<unknown>;

export interface NativeToolExecution {
  prepare(): Promise<void>;
  execute(options?: ToolExecutionOptions<any>): ToolExecutionResult<unknown>;
  dispose(failure?: { error: unknown }): void;
}

interface NativeToolExecutor {
  prepare(input: unknown, options: ToolExecutionOptions<any>): Promise<void>;
  dispose(toolCallId: string, failure?: { error: unknown }): void;
}

const executors = new WeakMap<object, NativeToolExecutor>();

/**
 * Await asynchronous VoltAgent preparation before the SDK invokes execute.
 * Keeping execute synchronous lets the SDK distinguish an AsyncIterable from a
 * value/Promise without adding preliminary results to non-streaming tools.
 * Preparation failures are retained by the execution and rethrown from execute:
 * SDK lifecycle callbacks intentionally swallow exceptions.
 */
export function createNativeToolExecutor(
  create: (input: unknown, options?: ToolExecutionOptions<any>) => NativeToolExecution,
): Execute {
  const pending = new Map<string, NativeToolExecution>();
  const execute: Execute = (input, options) => {
    const prepared = options && pending.get(options.toolCallId);
    if (prepared) {
      pending.delete(options.toolCallId);
      return prepared.execute(options);
    }

    // Internal callers such as callTool await preparation themselves. They may
    // receive a promised iterable, which they consume inside their own execution.
    const execution = create(input, options);
    return execution.prepare().then(() => execution.execute(options));
  };

  executors.set(execute, {
    async prepare(input, options) {
      const execution = create(input, options);
      pending.set(options.toolCallId, execution);
      await execution.prepare();
    },
    dispose(toolCallId, failure) {
      pending.get(toolCallId)?.dispose(failure);
      pending.delete(toolCallId);
    },
  });

  return execute;
}

export async function prepareNativeToolExecution(
  execute: unknown,
  input: unknown,
  options: ToolExecutionOptions<any>,
): Promise<void> {
  if (typeof execute === "function") {
    await executors.get(execute)?.prepare(input, options);
  }
}

export function disposeNativeToolExecution(
  execute: unknown,
  toolCallId: string,
  failure?: { error: unknown },
): void {
  if (typeof execute === "function") {
    executors.get(execute)?.dispose(toolCallId, failure);
  }
}
