import { APICallError, Output, isStepCount, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Memory } from "../memory";
import { InMemoryStorageAdapter } from "../memory/adapters/storage/in-memory";
import { type Agent, defineAgent } from "./agent";

const usage = {
  inputTokens: { total: 2, noCache: 2, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 2, text: 2, reasoning: 0 },
};
const toolCall = {
  type: "tool-call" as const,
  toolCallId: "order-1",
  toolName: "order",
  input: "{}",
};
const toolResponse = {
  content: [toolCall],
  finishReason: { unified: "tool-calls" as const, raw: "tool_calls" },
  usage,
  warnings: [],
};
const textResponse = {
  content: [{ type: "text" as const, text: "done" }],
  finishReason: { unified: "stop" as const, raw: "stop" },
  usage,
  warnings: [],
};
const failure = (isRetryable = true) =>
  new APICallError({
    message: "provider unavailable",
    url: "https://example.invalid",
    requestBodyValues: {},
    statusCode: 503,
    isRetryable,
  });
const request = { prompt: "Create an order", stopWhen: isStepCount(3) };
async function collect<T>(stream: AsyncIterable<T>) {
  const parts: T[] = [];
  for await (const part of stream) parts.push(part);
  return parts;
}
function readable<T>(parts: T[]) {
  return new ReadableStream<T>({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });
}
type ProviderPart = Awaited<
  ReturnType<MockLanguageModelV4["doStream"]>
>["stream"] extends ReadableStream<infer Part>
  ? Part
  : never;
const streamResponse = (withTool = false) => ({
  stream: readable<ProviderPart>([
    { type: "stream-start", warnings: [] },
    ...(withTool
      ? [toolCall]
      : [
          { type: "text-start", id: "text-1" },
          { type: "text-delta", id: "text-1", delta: "done" },
          { type: "text-end", id: "text-1" },
        ]),
    {
      type: "finish",
      finishReason: { unified: withTool ? "tool-calls" : "stop", raw: "stop" },
      usage,
    },
  ]),
});

afterEach(() => vi.restoreAllMocks());

describe("model-call retry and fallback", () => {
  it.each(["retry", "fallback"] as const)(
    "does not replay a completed tool on %s",
    async (recovery) => {
      let failed = false;
      const primary = new MockLanguageModelV4({
        modelId: "primary",
        doGenerate: async ({ prompt }) => {
          if (!prompt.some((message) => message.role === "tool")) return toolResponse;
          if (!failed || recovery === "fallback") {
            failed = true;
            throw failure();
          }
          return textResponse;
        },
      });
      const secondary = new MockLanguageModelV4({ modelId: "secondary", doGenerate: textResponse });
      const execute = vi.fn(() => "order-created");
      const onRetry = vi.fn();
      const onFallback = vi.fn();
      const onStepEnd = vi.fn();
      const memory = new Memory({ storage: new InMemoryStorageAdapter() });
      const agent = defineAgent({
        name: "retry-contract",
        memory,
        model:
          recovery === "retry"
            ? primary
            : [
                { model: primary, maxRetries: 0 },
                { model: secondary, maxRetries: 0 },
              ],
        maxRetries: recovery === "retry" ? 1 : 0,
        tools: { order: tool({ inputSchema: z.object({}), execute }) },
        hooks: { onRetry, onFallback },
      });
      const result = await agent.generateText({
        ...request,
        onStepEnd,
        userId: "user",
        conversationId: "retry",
      });
      expect(result.text).toBe("done");
      expect(execute).toHaveBeenCalledOnce();
      expect(onStepEnd).toHaveBeenCalledTimes(2);
      expect(result.steps).toHaveLength(2);
      expect(result.totalUsage.totalTokens).toBe(8);
      const history = await memory.getConversationSteps("user", "retry");
      expect(history.filter((step) => step.type === "tool_result")).toHaveLength(1);
      const calls = recovery === "retry" ? primary.doGenerateCalls : secondary.doGenerateCalls;
      expect(calls.at(-1)?.prompt).toContainEqual(
        expect.objectContaining({
          role: "tool",
          content: expect.arrayContaining([expect.objectContaining({ toolCallId: "order-1" })]),
        }),
      );
      expect(onRetry).toHaveBeenCalledTimes(recovery === "retry" ? 1 : 0);
      expect(onFallback).toHaveBeenCalledTimes(recovery === "fallback" ? 1 : 0);
    },
  );

  it.each(["throw", "event"] as const)(
    "recovers the next streaming step after a tool (%s)",
    async (kind) => {
      let failed = false;
      const model = new MockLanguageModelV4({
        doStream: async ({ prompt }) => {
          if (!prompt.some((message) => message.role === "tool")) return streamResponse(true);
          if (!failed) {
            failed = true;
            if (kind === "throw") throw failure();
            return {
              stream: readable<ProviderPart>([
                { type: "stream-start", warnings: [] },
                { type: "error", error: failure() },
              ]),
            };
          }
          return streamResponse();
        },
      });
      const execute = vi.fn(() => "order-created");
      const onError = vi.fn();
      const agent = defineAgent({
        name: "stream-retry-contract",
        model,
        memory: false,
        maxRetries: 1,
        tools: { order: tool({ inputSchema: z.object({}), execute }) },
      });
      const result = await agent.streamText({ ...request, onError });
      const parts = await collect(result.stream);
      expect(await result.text).toBe("done");
      expect(execute).toHaveBeenCalledOnce();
      expect(model.doStreamCalls).toHaveLength(3);
      expect(parts.filter((part) => part.type === "tool-result")).toHaveLength(1);
      expect(parts.filter((part) => part.type === "error")).toHaveLength(0);
      expect(onError).not.toHaveBeenCalled();
    },
  );

  it("keeps the fallback model for subsequent steps, skips disabled entries, and resolves once", async () => {
    const primary = new MockLanguageModelV4({
      modelId: "primary",
      doGenerate: async () => {
        throw failure(false);
      },
    });
    const secondary = new MockLanguageModelV4({
      modelId: "secondary",
      doGenerate: [toolResponse, textResponse],
    });
    const resolvePrimary = vi.fn(() => primary);
    const resolveSecondary = vi.fn(() => secondary);
    const disabled = vi.fn(() => {
      throw new Error("disabled");
    });
    const execute = vi.fn(() => "order-created");
    const onRetry = vi.fn();
    const onFallback = vi.fn();
    const spans: Array<{ attributes?: Record<string, unknown>; end: ReturnType<typeof vi.spyOn> }> =
      [];
    const agent = defineAgent({
      name: "sticky-fallback",
      memory: false,
      maxRetries: 2,
      model: [
        { model: disabled, enabled: false },
        { model: resolvePrimary },
        { id: "secondary", model: resolveSecondary },
      ],
      tools: { order: tool({ inputSchema: z.object({}), execute }) },
      hooks: {
        onRetry,
        onFallback,
        onStart: ({ context }) => {
          const create = context.traceContext.createChildSpan.bind(context.traceContext);
          vi.spyOn(context.traceContext, "createChildSpan").mockImplementation(
            (name, type, options) => {
              const span = create(name, type, options);
              if (options?.label === "Model attempt")
                spans.push({ attributes: options.attributes, end: vi.spyOn(span, "end") });
              return span;
            },
          );
        },
      },
    });
    const result = await agent.generateText(request);
    expect(result.text).toBe("done");
    expect(result.response.modelId).toBe("secondary");
    expect(primary.doGenerateCalls).toHaveLength(1);
    expect(secondary.doGenerateCalls).toHaveLength(2);
    expect(resolvePrimary).toHaveBeenCalledOnce();
    expect(resolveSecondary).toHaveBeenCalledOnce();
    expect(disabled).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledOnce();
    expect(onRetry).not.toHaveBeenCalled();
    expect(onFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: "execute",
        fromModel: "primary",
        nextModel: "secondary",
        attempt: 1,
      }),
    );
    expect(spans).toHaveLength(3);
    expect(spans.map((span) => span.attributes?.["llm.model"])).toEqual([
      "primary",
      "secondary",
      "secondary",
    ]);
    for (const span of spans) expect(span.end).toHaveBeenCalledOnce();
  });

  it("preserves resolution fallback hooks", async () => {
    const onFallback = vi.fn();
    const model = new MockLanguageModelV4({ doGenerate: textResponse });
    const agent = defineAgent({
      name: "resolution-fallback",
      memory: false,
      maxRetries: 0,
      model: [
        {
          id: "missing",
          model: () => {
            throw new Error("resolution failed");
          },
        },
        { model },
      ],
      hooks: { onFallback },
    });
    expect((await agent.generateText(request)).text).toBe("done");
    expect(onFallback).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "resolve", fromModel: "missing", nextModelIndex: 1 }),
    );
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it("honors Retry-After and per-call retries while resetting attempts for each model step", async () => {
    const nativeTimeout = globalThis.setTimeout;
    const delays: number[] = [];
    vi.spyOn(globalThis, "setTimeout").mockImplementation((callback, ms, ...args) => {
      if (ms !== undefined) delays.push(ms);
      return nativeTimeout(callback, 0, ...args);
    });
    let calls = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async ({ prompt }) => {
        calls++;
        if (calls % 2 === 1)
          throw new APICallError({
            message: "rate limited",
            url: "https://example.invalid",
            requestBodyValues: {},
            statusCode: 429,
            isRetryable: true,
            responseHeaders: { "Retry-After": "30" },
          });
        return prompt.some((message) => message.role === "tool") ? textResponse : toolResponse;
      },
    });
    const onRetry = vi.fn();
    const agent = defineAgent({
      name: "retry-budgets",
      model: [{ model, maxRetries: 0 }],
      maxRetries: 0,
      memory: false,
      tools: { order: tool({ inputSchema: z.object({}), execute: () => "order-created" }) },
      hooks: { onRetry },
    });
    expect((await agent.generateText({ ...request, maxRetries: 1 })).text).toBe("done");
    expect(model.doGenerateCalls).toHaveLength(4);
    expect(
      onRetry.mock.calls.map(([event]) => [event.attempt, event.nextAttempt, event.maxRetries]),
    ).toEqual([
      [1, 2, 1],
      [1, 2, 1],
    ]);
    expect(delays.filter((ms) => ms === 30_000)).toHaveLength(2);
  });

  it("aborts backoff without another attempt or fallback", async () => {
    const controller = new AbortController();
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw failure();
      },
    });
    const secondary = new MockLanguageModelV4({ doGenerate: textResponse });
    const onFallback = vi.fn();
    const agent = defineAgent({
      name: "abort-retry",
      memory: false,
      maxRetries: 3,
      model: [{ model }, { model: secondary }],
      hooks: {
        onFallback,
        onRetry: () => controller.abort(new DOMException("cancelled", "AbortError")),
      },
    });
    await expect(
      agent.generateText({ ...request, abortSignal: controller.signal }),
    ).rejects.toThrow();
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(secondary.doGenerateCalls).toHaveLength(0);
    expect(onFallback).not.toHaveBeenCalled();
  });

  it("stops retry backoff when the SDK step timeout expires", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw failure();
      },
    });
    const secondary = new MockLanguageModelV4({ doGenerate: textResponse });
    const onRetry = vi.fn();
    const onFallback = vi.fn();
    const agent = defineAgent({
      name: "step-timeout",
      memory: false,
      maxRetries: 3,
      model: [{ model }, { model: secondary }],
      hooks: { onRetry, onFallback },
    });
    await expect(agent.generateText({ ...request, timeout: { stepMs: 50 } })).rejects.toThrow();
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onFallback).not.toHaveBeenCalled();
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(secondary.doGenerateCalls).toHaveLength(0);
  });

  it("does not invoke a fallback provider if cancellation arrives during model resolution", async () => {
    const controller = new AbortController();
    const primary = new MockLanguageModelV4({
      doGenerate: async () => {
        throw failure(false);
      },
    });
    const secondary = new MockLanguageModelV4({ doGenerate: textResponse });
    const agent = defineAgent({
      name: "abort-resolution",
      memory: false,
      maxRetries: 0,
      model: [
        { model: primary },
        {
          model: async () => {
            controller.abort(new DOMException("cancelled", "AbortError"));
            return secondary;
          },
        },
      ],
    });
    await expect(
      agent.generateText({ ...request, abortSignal: controller.signal }),
    ).rejects.toThrow();
    expect(primary.doGenerateCalls).toHaveLength(1);
    expect(secondary.doGenerateCalls).toHaveLength(0);
  });

  it.each(["generateObject", "streamObject"] as const)(
    "keeps fallback in the legacy %s adapter",
    async (operation) => {
      const primary = new MockLanguageModelV4({
        doGenerate: async () => {
          throw failure(false);
        },
        doStream: async () => {
          throw failure(false);
        },
      });
      const secondary = new MockLanguageModelV4({
        doGenerate: { ...textResponse, content: [{ type: "text", text: '{"result":"done"}' }] },
        doStream: () => ({
          stream: readable<ProviderPart>([
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "json" },
            { type: "text-delta", id: "json", delta: '{"result":"done"}' },
            { type: "text-end", id: "json" },
            { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
          ]),
        }),
      });
      const onFallback = vi.fn();
      const agent = defineAgent({
        name: "object-recovery",
        memory: false,
        maxRetries: 0,
        model: [{ model: primary }, { model: secondary }],
        hooks: { onFallback },
      });
      const schema = z.object({ result: z.string() });
      if (operation === "generateObject") {
        expect((await agent.generateObject("Return JSON", schema)).object).toEqual({
          result: "done",
        });
      } else {
        const result = await agent.streamObject("Return JSON", schema);
        await collect(result.textStream);
        expect(await result.object).toEqual({ result: "done" });
      }
      expect(onFallback).toHaveBeenCalledWith(expect.objectContaining({ operation }));
    },
  );

  it("discards a failed stream prelude and closes its reader before fallback", async () => {
    const cancelled = vi.fn();
    const primary = new MockLanguageModelV4({
      doStream: () => ({
        stream: new ReadableStream<ProviderPart>({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings: [] });
            controller.enqueue({ type: "response-metadata", id: "failed-response" });
            controller.enqueue({ type: "error", error: failure(false) });
          },
          cancel: cancelled,
        }),
      }),
    });
    const secondary = new MockLanguageModelV4({ doStream: () => streamResponse() });
    const agent = defineAgent({
      name: "stream-prelude",
      memory: false,
      maxRetries: 0,
      model: [{ model: primary }, { model: secondary }],
    });
    const result = await agent.streamText(request);
    const parts = await collect(result.stream);
    expect(await result.text).toBe("done");
    expect(parts.filter((part) => part.type === "start-step")).toHaveLength(1);
    expect(parts.filter((part) => part.type === "error")).toHaveLength(0);
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it("preserves current step settings and contexts across fallback", async () => {
    const primary = new MockLanguageModelV4({
      doGenerate: async () => {
        throw failure(false);
      },
    });
    const secondary = new MockLanguageModelV4({ doGenerate: [toolResponse, textResponse] });
    const execute = vi.fn((_input, { context }) => context.tenant);
    const prepareStep = vi.fn(() => ({
      toolChoice: "auto" as const,
      providerOptions: { custom: { flag: true } },
      toolsContext: { order: { tenant: "updated" } },
    }));
    const agent = defineAgent({
      name: "step-settings",
      memory: false,
      maxRetries: 0,
      model: [{ model: primary }, { model: secondary }],
      tools: {
        order: tool({
          inputSchema: z.object({}),
          contextSchema: z.object({ tenant: z.string() }),
          execute,
        }),
      },
    });
    const result = await agent.generateText({
      ...request,
      temperature: 0.2,
      prepareStep,
      toolsContext: { order: { tenant: "initial" } },
    });
    expect(result.text).toBe("done");
    expect(secondary.doGenerateCalls[0]).toEqual(primary.doGenerateCalls[0]);
    expect(secondary.doGenerateCalls[0]).toMatchObject({
      temperature: 0.2,
      providerOptions: { custom: { flag: true } },
    });
    expect(execute.mock.calls[0][1].context).toEqual({ tenant: "updated" });
    expect(prepareStep).toHaveBeenCalledTimes(2);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid retry count %s before provider execution",
    async (maxRetries) => {
      const model = new MockLanguageModelV4({ doGenerate: textResponse });
      const agent = defineAgent({ name: "invalid-retries", model, memory: false });
      await expect(agent.generateText({ ...request, maxRetries })).rejects.toThrow(
        "maxRetries must be a non-negative integer",
      );
      expect(model.doGenerateCalls).toHaveLength(0);
    },
  );

  it("does not restart tools when structured output is missing", async () => {
    const model = new MockLanguageModelV4({ doGenerate: toolResponse });
    const secondary = new MockLanguageModelV4({ doGenerate: textResponse });
    const execute = vi.fn(() => "order-created");
    const onRetry = vi.fn();
    const onFallback = vi.fn();
    const agent = defineAgent({
      name: "no-output-replay",
      memory: false,
      maxRetries: 1,
      model: [{ model }, { model: secondary }],
      tools: { order: tool({ inputSchema: z.object({}), execute }) },
      hooks: { onRetry, onFallback },
    });
    await expect(
      agent.generateText({
        ...request,
        stopWhen: isStepCount(1),
        output: Output.object({ schema: z.object({ result: z.string() }) }),
      }),
    ).rejects.toThrow();
    expect(execute).toHaveBeenCalledOnce();
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(secondary.doGenerateCalls).toHaveLength(0);
    expect(onRetry).not.toHaveBeenCalled();
    expect(onFallback).not.toHaveBeenCalled();
  });

  it("retries an explicit prepareStep model without using the agent's fallback list", async () => {
    const primary = new MockLanguageModelV4({ doGenerate: textResponse });
    let calls = 0;
    const selected = new MockLanguageModelV4({
      doGenerate: async () => {
        if (++calls === 1) throw failure();
        return textResponse;
      },
    });
    const prepareStep = vi.fn(() => ({ model: selected }));
    const agent = defineAgent({
      name: "step-override",
      model: primary,
      memory: false,
      maxRetries: 1,
    });
    expect((await agent.generateText({ ...request, prepareStep })).text).toBe("done");
    expect(selected.doGenerateCalls).toHaveLength(2);
    expect(primary.doGenerateCalls).toHaveLength(0);
    expect(prepareStep).toHaveBeenCalledOnce();
  });

  it("keeps the completed tool step when streaming falls back", async () => {
    const primary = new MockLanguageModelV4({
      modelId: "primary",
      doStream: async ({ prompt }) => {
        if (prompt.some((message) => message.role === "tool")) throw failure(false);
        return streamResponse(true);
      },
    });
    const secondary = new MockLanguageModelV4({
      modelId: "secondary",
      doStream: () => streamResponse(),
    });
    const execute = vi.fn(() => "order-created");
    const onFallback = vi.fn();
    const agent = defineAgent({
      name: "stream-fallback",
      memory: false,
      maxRetries: 0,
      model: [{ model: primary }, { model: secondary }],
      tools: { order: tool({ inputSchema: z.object({}), execute }) },
      hooks: { onFallback },
    });
    const result = await agent.streamText(request);
    const parts = await collect(result.stream);
    expect(await result.text).toBe("done");
    expect(execute).toHaveBeenCalledOnce();
    expect(parts.filter((part) => part.type === "finish-step")).toHaveLength(2);
    expect(secondary.doStreamCalls[0].prompt.some((message) => message.role === "tool")).toBe(true);
    expect(onFallback).toHaveBeenCalledOnce();
  });

  it.each(["event", "read"] as const)(
    "does not replay a stream after content begins (%s)",
    async (kind) => {
      const error = failure();
      let releaseFailure = () => {};
      const afterPartial = new Promise<void>((resolve) => {
        releaseFailure = resolve;
      });
      const model = new MockLanguageModelV4({
        doStream: () => ({
          stream: new ReadableStream<ProviderPart>({
            start(controller) {
              controller.enqueue({ type: "stream-start", warnings: [] });
              controller.enqueue({ type: "text-start", id: "text" });
              controller.enqueue({ type: "text-delta", id: "text", delta: "partial" });
            },
            async pull(controller) {
              await afterPartial;
              if (kind === "read") controller.error(error);
              else {
                controller.enqueue({ type: "error", error });
                controller.close();
              }
            },
          }),
        }),
      });
      const secondary = new MockLanguageModelV4({ doStream: () => streamResponse() });
      const onRetry = vi.fn();
      const onFallback = vi.fn();
      const onError = vi.fn();
      const agent = defineAgent({
        name: "committed-stream",
        memory: false,
        maxRetries: 1,
        model: [{ model }, { model: secondary }],
        hooks: { onRetry, onFallback },
      });
      const result = await agent.streamText({ ...request, onError });
      const text: string[] = [];
      const errors: unknown[] = [];
      try {
        for await (const part of result.stream) {
          if (part.type === "text-delta") {
            text.push(part.text);
            releaseFailure();
          }
          if (part.type === "error") errors.push(part.error);
        }
      } catch (error) {
        errors.push(error);
      }
      expect(text).toEqual(["partial"]);
      expect(errors).toContain(error);
      expect(model.doStreamCalls).toHaveLength(1);
      expect(secondary.doStreamCalls).toHaveLength(0);
      expect(onRetry).not.toHaveBeenCalled();
      expect(onFallback).not.toHaveBeenCalled();
      if (kind === "event") expect(onError).toHaveBeenCalledOnce();
    },
  );
});
