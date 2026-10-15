import type { ModelMessage } from "@ai-sdk/provider-utils";
import { safeStringify } from "@voltagent/internal";
import { generateText, isStepCount, streamText, tool } from "ai";
import type { ToolSet } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Memory } from "../memory";
import { InMemoryStorageAdapter } from "../memory/adapters/storage/in-memory";
import { createTool, enhanceTool, defineTool as voltTool } from "../tool";
import {
  convertModelMessagesToUIMessages,
  convertResponseMessagesToUIMessages,
} from "../utils/message-converter";
import { type Agent, defineAgent } from "./agent";
import { createInputGuardrail } from "./guardrail";

// Exercise the real SDK execution loop. Only the model provider is mocked.
const usage = {
  inputTokens: { total: 2, noCache: 2, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 2, text: 2, reasoning: 0 },
};
const call = (toolName = "task", input = "{}", toolCallId = "call-1") => ({
  type: "tool-call" as const,
  toolCallId,
  toolName,
  input,
});
const generateModel = (calls = [call()]) =>
  new MockLanguageModelV4({
    doGenerate: {
      content: calls,
      finishReason: { unified: "tool-calls", raw: "tool_calls" },
      usage,
      warnings: [],
    },
  });
const streamModel = () =>
  new MockLanguageModelV4({
    doStream: {
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });
          controller.enqueue(call());
          controller.enqueue({
            type: "finish",
            finishReason: { unified: "tool-calls", raw: "tool_calls" },
            usage,
          });
          controller.close();
        },
      }),
    },
  });
const makeAgent = (tools: ToolSet, model = generateModel()) =>
  defineAgent({
    name: "native-tool-contract",
    model,
    tools,
    memory: false,
    maxRetries: 0,
  });
const request = { prompt: "Run the tool", stopWhen: isStepCount(1) };
async function collect<T>(stream: AsyncIterable<T>) {
  const parts: T[] = [];
  for await (const part of stream) parts.push(part);
  return parts;
}
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const failures = [
  [
    "synchronous throw",
    () => {
      throw new Error("unavailable");
    },
  ],
  ["rejected promise", () => Promise.reject(new Error("unavailable"))],
] as const;

describe("native tool execution contracts", () => {
  it.each(failures)(
    "preserves %s as tool-error, including callbacks and model messages",
    async (_name, execute) => {
      const toModelOutput = vi.fn(() => ({ type: "text" as const, value: "converted" }));
      const tools = { task: tool({ inputSchema: z.object({}), execute, toModelOutput }) };
      const native = await generateText({ model: generateModel(), tools, ...request });
      const onToolExecutionEnd = vi.fn();
      const result = await makeAgent(tools).generateText({ ...request, onToolExecutionEnd });
      expect(result.content.map((p) => p.type)).toEqual(native.content.map((p) => p.type));
      expect(result.toolResults).toHaveLength(0);
      expect(onToolExecutionEnd.mock.calls[0][0].toolOutput).toMatchObject({
        type: "tool-error",
        error: { message: "unavailable" },
      });
      expect(result.response.messages).toEqual(native.response.messages);
      expect(toModelOutput).not.toHaveBeenCalled();
    },
  );

  it("keeps thrown error identity and explicit error-shaped return values", async () => {
    const failure = { code: "unavailable" };
    const tools = {
      task: tool({
        inputSchema: z.object({}),
        execute: () => {
          throw failure;
        },
      }),
      domain: tool({
        inputSchema: z.object({}),
        execute: () => ({ error: true, code: "not-found" }),
      }),
    };
    const result = await makeAgent(
      tools,
      generateModel([call(), call("domain", "{}", "call-2")]),
    ).generateText(request);
    const error = result.content.find((p) => p.type === "tool-error");
    expect(error?.error).toBe(failure);
    expect(result.toolResults[0].output).toEqual({ error: true, code: "not-found" });
  });

  it("lets the model continue after an unrecovered tool error", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: [
        {
          content: [call()],
          finishReason: { unified: "tool-calls", raw: "tool_calls" },
          usage,
          warnings: [],
        },
        {
          content: [{ type: "text", text: "I can try another approach." }],
          finishReason: { unified: "stop", raw: "stop" },
          usage,
          warnings: [],
        },
      ],
    });
    const tools = {
      task: tool({
        inputSchema: z.object({}),
        execute: () => {
          throw new Error("unavailable");
        },
      }),
    };
    const result = await makeAgent(tools, model).generateText({
      ...request,
      stopWhen: isStepCount(2),
    });
    expect(result.text).toBe("I can try another approach.");
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].content.some((p) => p.type === "tool-error")).toBe(true);
  });

  it("preserves explicit recovery and calls tool/end/error hooks once", async () => {
    const failure = new Error("unavailable");
    const onEnd = vi.fn();
    const onToolEnd = vi.fn();
    const onToolError = vi.fn(() => ({ output: { recovered: true } }));
    const tools = {
      task: voltTool({
        inputSchema: z.object({}),
        execute: () => {
          throw failure;
        },
        voltagent: { hooks: { onEnd } },
      }),
    };
    const result = await makeAgent(tools).generateText({
      ...request,
      hooks: { onToolError, onToolEnd },
    });
    expect(result.toolResults[0].output).toEqual({ recovered: true });
    expect(onToolError).toHaveBeenCalledOnce();
    expect(onToolError.mock.calls[0][0]).toMatchObject({ originalError: failure });
    expect(onEnd).toHaveBeenCalledOnce();
    expect(onToolEnd).toHaveBeenCalledOnce();
  });

  const streams = [
    [
      "generator function",
      async function* () {
        yield "first";
        yield "last";
      },
    ],
    [
      "function returning an iterable",
      () =>
        (async function* () {
          yield "first";
          yield "last";
        })(),
    ],
    ["empty iterable", () => (async function* () {})()],
    [
      "undefined final value",
      () =>
        (async function* () {
          yield "first";
          yield undefined;
        })(),
    ],
    ["ordinary value", () => "last"],
    ["promise", async () => "last"],
  ] as const;
  it.each(streams)("matches SDK preliminary/final results for %s", async (_name, execute) => {
    const tools = {
      task: enhanceTool(tool({ inputSchema: z.object({}), execute }), { tags: ["visible"] }),
    };
    const native = streamText({ model: streamModel(), tools, ...request });
    const volt = await makeAgent(tools, streamModel()).streamText({
      ...request,
      hooks: { onToolStart: async () => {} },
    });
    const [expected, actual] = await Promise.all([collect(native.stream), collect(volt.stream)]);
    const results = (parts: typeof expected) =>
      parts
        .filter((p) => p.type === "tool-result")
        .map((p) => ({ output: p.output, preliminary: p.preliminary }));
    expect(results(actual)).toEqual(results(expected));
  });

  it.each(["generate", "stream"] as const)(
    "treats a promised iterable as an ordinary SDK output in %s",
    async (mode) => {
      const iterated = vi.fn();
      const output = (async function* () {
        iterated();
        yield "last";
      })();
      const tools = {
        task: tool({
          inputSchema: z.object({}),
          execute: async () => output,
          // Keep the opaque value serializable for the model without consuming it.
          toModelOutput: () => ({ type: "text" as const, value: "opaque output" }),
        }),
      };

      if (mode === "generate") {
        const native = await generateText({ model: generateModel(), tools, ...request });
        const volt = await makeAgent(tools).generateText(request);
        expect(native.toolResults).toHaveLength(1);
        expect(volt.toolResults).toHaveLength(1);
        expect(native.toolResults[0].output).toBe(output);
        expect(volt.toolResults[0].output).toBe(output);
      } else {
        const native = streamText({ model: streamModel(), tools, ...request });
        const volt = await makeAgent(tools, streamModel()).streamText(request);
        for (const parts of await Promise.all([collect(native.stream), collect(volt.stream)])) {
          const results = parts.filter((part) => part.type === "tool-result");
          expect(results).toHaveLength(1);
          expect(results[0].output).toBe(output);
          expect(results[0].preliminary).not.toBe(true);
        }
      }
      expect(iterated).not.toHaveBeenCalled();
    },
  );

  it("forwards progress before the iterator completes when only metadata is added", async () => {
    const release = deferred<void>();
    const first = deferred<void>();
    const tools = {
      task: enhanceTool(
        tool({
          inputSchema: z.object({}),
          execute: () =>
            (async function* () {
              yield "progress";
              await release.promise;
              yield "done";
            })(),
        }),
        { name: "Progress" },
      ),
    };
    const result = await makeAgent(tools, streamModel()).streamText(request);
    const parts: unknown[] = [];
    const consuming = (async () => {
      for await (const part of result.stream) {
        if (part.type === "tool-result") {
          parts.push(part.output);
          first.resolve();
        }
      }
    })();
    try {
      await first.promise;
      expect(parts).toEqual(["progress"]);
    } finally {
      release.resolve();
      await consuming;
    }
    expect(parts).toEqual(["progress", "done", "done"]);
  });

  it("preserves final output overrides without exposing the untransformed final value", async () => {
    const order: string[] = [];
    const tools = {
      task: voltTool({
        inputSchema: z.object({}),
        execute: () =>
          (async function* () {
            yield "progress";
            yield "private final";
          })(),
        voltagent: {
          hooks: {
            onEnd: () => {
              order.push("tool");
              return { output: "tool final" };
            },
          },
        },
      }),
    };
    const result = await makeAgent(tools, streamModel()).streamText({
      ...request,
      hooks: {
        onToolEnd: ({ output }) => {
          order.push("agent");
          expect(output).toBe("tool final");
          return { output: "public final" };
        },
      },
    });
    const parts = (await collect(result.stream)).filter((p) => p.type === "tool-result");
    expect(parts.map((p) => p.output)).toEqual(["progress", "public final", "public final"]);
    expect(order).toEqual(["tool", "agent"]);
  });

  it("awaits asynchronous start hooks and propagates their errors without executing the tool", async () => {
    const gate = deferred<void>();
    const started = deferred<void>();
    const execute = vi.fn(() => "done");
    const failure = new Error("blocked by hook");
    const agent = makeAgent({
      task: voltTool({
        inputSchema: z.object({}),
        execute,
        voltagent: {
          hooks: {
            onStart: async () => {
              started.resolve();
              await gate.promise;
              throw failure;
            },
          },
        },
      }),
    });
    const running = agent.generateText(request);
    await started.promise;
    expect(execute).not.toHaveBeenCalled();
    gate.resolve();
    const result = await running;
    expect(execute).not.toHaveBeenCalled();
    expect(result.content.find((p) => p.type === "tool-error")?.error).toBe(failure);
  });

  it.each(["generate", "stream"] as const)(
    "starts the tool timeout after start hooks and shares its signal with end hooks in %s",
    async (mode) => {
      const startEntered = deferred<void>();
      const releaseStart = deferred<void>();
      const executeEntered = deferred<void>();
      const releaseExecute = deferred<void>();
      const operation = new AbortController();
      const toolTimeout = new AbortController();
      const timeoutError = new DOMException("Tool timed out", "TimeoutError");
      const signals: { start?: AbortSignal; execute?: AbortSignal; end?: AbortSignal } = {};
      const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
      const timeoutMs = 321;
      const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) =>
        // Trigger only the tool timeout manually to avoid wall-clock timing assertions.
        ms === timeoutMs ? toolTimeout.signal : nativeTimeout(ms),
      );
      const tools = {
        task: voltTool({
          inputSchema: z.object({}),
          execute: async (_input, { abortSignal }) => {
            signals.execute = abortSignal;
            executeEntered.resolve();
            await releaseExecute.promise;
            abortSignal?.throwIfAborted();
            return "done";
          },
          voltagent: {
            hooks: {
              onStart: async ({ options }) => {
                signals.start = options?.toolContext?.abortSignal;
                startEntered.resolve();
                await releaseStart.promise;
              },
              onEnd: ({ options }) => {
                signals.end = options?.toolContext?.abortSignal;
              },
            },
          },
        }),
      };
      const options = {
        ...request,
        abortSignal: operation.signal,
        timeout: { toolMs: timeoutMs },
      };
      const running =
        mode === "generate"
          ? makeAgent(tools).generateText(options)
          : makeAgent(tools, streamModel())
              .streamText(options)
              .then((result) => collect(result.stream));
      try {
        await startEntered.promise;
        expect(signals.start).toBeInstanceOf(AbortSignal);
        expect(timeout).not.toHaveBeenCalledWith(timeoutMs);
        expect(signals.execute).toBeUndefined();
        releaseStart.resolve();
        await executeEntered.promise;
        expect(timeout).toHaveBeenCalledWith(timeoutMs);
        expect(signals.execute).not.toBe(signals.start);
        toolTimeout.abort(timeoutError);
        expect(signals.execute?.aborted).toBe(true);
        expect(signals.start?.aborted).toBe(false);
        releaseExecute.resolve();

        const result = await running;
        const content = Array.isArray(result) ? result : result.content;
        expect(content.find((part) => part.type === "tool-error")?.error).toBe(timeoutError);
        expect(signals.end).toBe(signals.execute);
        expect(operation.signal.aborted).toBe(false);
      } finally {
        releaseStart.resolve();
        releaseExecute.resolve();
        timeout.mockRestore();
      }
    },
  );

  it("does not implicitly validate or transform native outputSchema", async () => {
    const outputSchema = z.string().transform((value) => value.trim());
    const tools = {
      task: tool({ inputSchema: z.object({}), outputSchema, execute: () => " value " }),
    };
    const result = await makeAgent(tools).generateText(request);
    expect(result.toolResults[0].output).toBe(" value ");
  });

  it("validates final outputs and hook overrides only when requested", async () => {
    const tools = {
      task: voltTool({
        inputSchema: z.object({}),
        outputSchema: z.string().transform(async (value) => value.trim()),
        execute: () => " value ",
        voltagent: { validateOutput: true },
      }),
    };
    expect((await makeAgent(tools).generateText(request)).toolResults[0].output).toBe("value");
    const result = await makeAgent(tools).generateText({
      ...request,
      hooks: { onToolEnd: () => ({ output: 123 }) },
    });
    expect(result.content.some((p) => p.type === "tool-error")).toBe(true);
  });

  it("does not require progress values to match the final output schema", async () => {
    const tools = {
      task: voltTool({
        inputSchema: z.object({}),
        outputSchema: z.object({ done: z.boolean() }),
        execute: () =>
          (async function* () {
            yield { progress: "loading" } as never;
            yield { done: true };
          })(),
        voltagent: { validateOutput: true },
      }),
    };
    const result = await makeAgent(tools, streamModel()).streamText(request);
    const outputs = (await collect(result.stream))
      .filter((p) => p.type === "tool-result")
      .map((p) => p.output);
    expect(outputs).toEqual([{ progress: "loading" }, { done: true }, { done: true }]);
  });

  it("keeps legacy output validation and serialized errors", async () => {
    const task = createTool({
      name: "task",
      description: "Legacy",
      parameters: z.object({}),
      outputSchema: z.string().transform((v) => v.trim()),
      execute: async () => " value ",
    });
    const agent = defineAgent({
      name: "legacy-contract",
      model: generateModel(),
      tools: [task],
      memory: false,
      maxRetries: 0,
    });
    expect((await agent.generateText(request)).toolResults[0].output).toBe("value");
    task.execute = async () => {
      throw new Error("legacy failure");
    };
    expect((await agent.generateText(request)).toolResults[0].output).toMatchObject({
      error: true,
      message: "legacy failure",
    });
  });

  it("uses current prepareStep context and complete metadata for routed native tools", async () => {
    const execute = vi.fn((_input, { context }) => context.tenant);
    const task = voltTool({
      inputSchema: z.object({}),
      contextSchema: z.object({ tenant: z.string() }),
      outputSchema: z.string().transform((v) => v.trim()),
      execute,
      voltagent: { name: "Tenant lookup", validateOutput: true },
    });
    const agent = defineAgent({
      name: "routing-contract",
      model: generateModel([call("callTool", safeStringify({ name: "task", args: {} }))]),
      tools: { task },
      memory: false,
      maxRetries: 0,
      toolRouting: { enforceSearchBeforeCall: false },
    });
    const result = await agent.generateText({
      ...request,
      toolsContext: { task: { tenant: "old" } },
      prepareStep: () => ({ toolsContext: { task: { tenant: " updated " } } }),
    });
    expect(execute.mock.calls[0][1].context).toEqual({ tenant: " updated " });
    expect(result.toolResults[0].output).toBe("updated");
  });

  it("keeps native approvals ahead of execution", async () => {
    const execute = vi.fn(() => "done");
    const onStart = vi.fn();
    const tools = {
      task: voltTool({
        inputSchema: z.object({}),
        needsApproval: true,
        execute,
        voltagent: { hooks: { onStart } },
      }),
    };
    const result = await makeAgent(tools).generateText(request);
    expect(result.content.some((p) => p.type === "tool-approval-request")).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "waits for a parallel guardrail with telemetry disabled (pass=%s)",
    async (pass) => {
      const decision = deferred<void>();
      const modelCalled = deferred<void>();
      const execute = vi.fn(() => "done");
      const model = streamModel();
      const original = model.doStream.bind(model);
      model.doStream = async (options) => {
        modelCalled.resolve();
        return original(options);
      };
      const agent = defineAgent({
        name: "guardrail-contract",
        model,
        tools: { task: tool({ inputSchema: z.object({}), execute }) },
        memory: false,
        maxRetries: 0,
        inputGuardrails: [
          createInputGuardrail({
            id: "wait",
            name: "wait",
            execution: "parallel",
            handler: async () => {
              await decision.promise;
              return { pass, message: "blocked" };
            },
          }),
        ],
      });
      const result = await agent.streamText({ ...request, telemetry: { isEnabled: false } });
      const consuming = collect(result.stream);
      await modelCalled.promise;
      expect(execute).not.toHaveBeenCalled();
      decision.resolve();
      await consuming;
      expect(execute).toHaveBeenCalledTimes(pass ? 1 : 0);
    },
  );

  it("preserves SDK options, callback isolation, and concurrent tool context", async () => {
    const calls: unknown[] = [];
    const tools = {
      task: tool({
        inputSchema: z.object({}),
        contextSchema: z.object({ tenant: z.string() }),
        execute: (_input, options) => {
          calls.push(options);
          return "done";
        },
      }),
    };
    const agent = makeAgent(tools, generateModel([call(), call("task", "{}", "call-2")]));
    await agent.generateText({
      ...request,
      toolsContext: { task: { tenant: "tenant-1" } },
      onToolExecutionStart: () => {
        throw new Error("observer");
      },
      onToolExecutionEnd: () => {
        throw new Error("observer");
      },
    });
    expect(calls).toHaveLength(2);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          toolCallId: "call-1",
          context: { tenant: "tenant-1" },
          abortSignal: expect.any(AbortSignal),
          messages: expect.any(Array),
        }),
        expect.objectContaining({ toolCallId: "call-2" }),
      ]),
    );
  });

  it("preserves native errors in UI streams and persisted message conversion", async () => {
    const tools = {
      task: tool({
        inputSchema: z.object({}),
        execute: () => {
          throw new Error("unavailable");
        },
      }),
    };
    const streamed = await makeAgent(tools, streamModel()).streamText(request);
    const ui = await collect(
      streamed.toUIMessageStream({ onError: (error) => (error as Error).message }),
    );
    expect(ui).toContainEqual(
      expect.objectContaining({
        type: "tool-output-error",
        toolCallId: "call-1",
        errorText: "unavailable",
      }),
    );
    const result = await makeAgent(tools).generateText(request);
    for (const messages of [
      convertModelMessagesToUIMessages(result.response.messages as ModelMessage[]),
      await convertResponseMessagesToUIMessages(result.response.messages),
    ]) {
      expect(messages.flatMap((m) => m.parts)).toContainEqual(
        expect.objectContaining({
          type: "tool-task",
          state: "output-error",
          errorText: expect.stringContaining("unavailable"),
        }),
      );
    }
  });
  it("preserves preliminary results before an iterator throws", async () => {
    const failure = new Error("stream failed");
    const tools = {
      task: tool({
        inputSchema: z.object({}),
        execute: () =>
          (async function* () {
            yield "progress";
            throw failure;
          })(),
      }),
    };
    const native = streamText({ model: streamModel(), tools, ...request });
    const volt = await makeAgent(tools, streamModel()).streamText(request);
    const outputs = (parts: Awaited<ReturnType<typeof collect<any>>>) =>
      parts
        .filter((p) => p.type === "tool-result" || p.type === "tool-error")
        .map((p) => ({
          type: p.type,
          output: p.output,
          error: p.error,
          preliminary: p.preliminary,
        }));
    expect(outputs(await collect(volt.stream))).toEqual(outputs(await collect(native.stream)));
  });

  it("closes an aborted iterator and ends its tool span once", async () => {
    const controller = new AbortController();
    const entered = deferred<void>();
    const cleanedUp = vi.fn();
    const spanEnded = vi.fn();
    const tools = {
      task: voltTool({
        inputSchema: z.object({}),
        execute: (_input, { abortSignal }) =>
          (async function* () {
            try {
              const aborted = new Promise<void>((resolve) => {
                abortSignal?.addEventListener("abort", () => resolve(), { once: true });
              });
              yield "progress";
              entered.resolve();
              await aborted;
              abortSignal?.throwIfAborted();
            } finally {
              cleanedUp();
            }
          })(),
        voltagent: {
          hooks: {
            onStart: ({ options }) => {
              const span = options?.parentToolSpan;
              if (span) {
                const end = span.end.bind(span);
                vi.spyOn(span, "end").mockImplementation((...args) => {
                  spanEnded();
                  end(...args);
                });
              }
            },
          },
        },
      }),
    };
    const result = await makeAgent(tools, streamModel()).streamText({
      ...request,
      abortSignal: controller.signal,
    });
    const consuming = collect(result.stream);
    await entered.promise;
    controller.abort(new Error("cancelled"));
    await consuming;
    await vi.waitFor(() => expect(cleanedUp).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(spanEnded).toHaveBeenCalledOnce());
  });

  it("keeps errors in persisted messages and conversation execution history", async () => {
    const memory = new Memory({ storage: new InMemoryStorageAdapter() });
    const agent = defineAgent({
      name: "memory-contract",
      model: generateModel(),
      maxRetries: 0,
      memory,
      tools: {
        task: tool({
          inputSchema: z.object({}),
          execute: () => {
            throw new Error("unavailable");
          },
        }),
      },
    });
    const result = await agent.generateText({
      ...request,
      userId: "user",
      conversationId: "conversation",
      conversationPersistence: { mode: "step", flushOnToolResult: true },
    });
    expect(result.toolResults).toHaveLength(0);
    const messages = await memory.getMessages("user", "conversation");
    expect(messages.flatMap((m) => m.parts)).toContainEqual(
      expect.objectContaining({
        type: "tool-task",
        state: "output-error",
        errorText: expect.stringContaining("unavailable"),
      }),
    );
    const steps = await memory.getConversationSteps("user", "conversation");
    expect(steps).toContainEqual(
      expect.objectContaining({
        type: "tool_result",
        result: expect.objectContaining({ error: true, message: "unavailable" }),
      }),
    );
  });

  it("leaves client-side tools without an execute handler", async () => {
    const tools = { task: tool({ inputSchema: z.object({}) }) };
    const native = await generateText({ model: generateModel(), tools, ...request });
    const onToolStart = vi.fn();
    const result = await makeAgent(tools).generateText({ ...request, hooks: { onToolStart } });
    expect(result.content).toEqual(native.content);
    expect(onToolStart).not.toHaveBeenCalled();
  });
  it("closes preparation as an error when an SDK integration fails before execute", async () => {
    const failure = new Error("integration failed");
    const execute = vi.fn(() => "done");
    const ended = vi.fn();
    const agent = makeAgent({ task: tool({ inputSchema: z.object({}), execute }) });
    const result = await agent.generateText({
      ...request,
      hooks: {
        onToolStart: ({ context }) => {
          const end = context.traceContext.endChildSpan.bind(context.traceContext);
          vi.spyOn(context.traceContext, "endChildSpan").mockImplementation((...args) => {
            ended(...args);
            return end(...args);
          });
        },
      },
      telemetry: {
        integrations: {
          executeTool: () => {
            throw failure;
          },
        },
      },
    });
    expect(execute).not.toHaveBeenCalled();
    expect(result.content.find((p) => p.type === "tool-error")?.error).toBe(failure);
    expect(ended).toHaveBeenCalledWith(
      expect.anything(),
      "error",
      expect.objectContaining({ error: failure }),
    );
  });
});
