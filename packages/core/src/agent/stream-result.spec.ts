import { Output, isStepCount, streamText, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { type Agent, defineAgent } from "./agent";
import { createInputGuardrail, createOutputGuardrail } from "./guardrail";
import { AgentTraceContext } from "./open-telemetry/trace-context";

afterEach(() => vi.restoreAllMocks());

const usage = {
  inputTokens: { total: 2, noCache: 2, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 2, text: 2, reasoning: 0 },
};
type ProviderPart = Awaited<
  ReturnType<MockLanguageModelV4["doStream"]>
>["stream"] extends ReadableStream<infer T>
  ? T
  : never;
const finish: ProviderPart = {
  type: "finish",
  usage,
  finishReason: { unified: "stop", raw: "stop" },
};
function readable<T>(parts: T[]) {
  return new ReadableStream<T>({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });
}
async function collect<T>(stream: AsyncIterable<T>) {
  const values: T[] = [];
  for await (const value of stream) values.push(value);
  return values;
}
const textParts = (text: string): ProviderPart[] => [
  { type: "text-start", id: "text" },
  { type: "text-delta", id: "text", delta: text },
  { type: "text-end", id: "text" },
];
function modelForText(text: string) {
  return new MockLanguageModelV4({
    doStream: () => ({
      stream: readable<ProviderPart>([
        { type: "stream-start", warnings: [{ type: "other", message: "test warning" }] },
        {
          type: "response-metadata",
          id: "response-1",
          timestamp: new Date(0),
          modelId: "test-model",
        },
        ...textParts(text),
        { ...finish, providerMetadata: { test: { value: "metadata" } } },
      ]),
      request: { body: "test request" },
      response: { headers: { "x-test": "header" } },
    }),
  });
}
const redact = () =>
  createOutputGuardrail({
    name: "redact",
    handler: ({ outputText }) => ({
      pass: true,
      action: "modify",
      modifiedOutput: outputText.replaceAll("secret", "safe"),
    }),
    streamHandler: ({ part }) =>
      part.type === "text-delta" ? { ...part, text: part.text.replaceAll("secret", "safe") } : part,
  });

describe("AI SDK stream result contract", () => {
  it("delegates native aggregate fields and consumes lazily through result promises", async () => {
    const onEnd = vi.fn();
    const agent = defineAgent({
      name: "native-fields",
      model: modelForText("hello"),
      memory: false,
    });
    const result = await agent.streamText({
      prompt: "hi",
      onEnd,
      runtimeContext: { requestId: "r1" },
      include: { requestBody: true },
    });
    expect(await result.output).toBe("hello");
    expect(await result.content).toEqual([{ type: "text", text: "hello" }]);
    expect(await result.warnings).toEqual([{ type: "other", message: "test warning" }]);
    expect(await result.rawFinishReason).toBe("stop");
    expect(await result.providerMetadata).toEqual({ test: { value: "metadata" } });
    expect(await result.response).toMatchObject({
      id: "response-1",
      headers: { "x-test": "header" },
    });
    expect(await result.request).toMatchObject({ body: "test request" });
    expect(await result.responseMessages).toHaveLength(1);
    expect(await result.finalStep).toMatchObject({
      text: "hello",
      runtimeContext: { requestId: "r1" },
    });
    for (const key of [
      "files",
      "sources",
      "toolCalls",
      "toolResults",
      "staticToolCalls",
      "dynamicToolCalls",
      "staticToolResults",
      "dynamicToolResults",
      "reasoning",
    ] as const) {
      expect(await result[key]).toEqual([]);
    }
    expect(await result.reasoningText).toBeUndefined();
    expect(result.context).toBeInstanceOf(Map);
    expect(Object.keys(result)).toContain("context");
    expect({ ...result }.context).toBe(result.context);
    expect("consumeStream" in result).toBe(true);
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it.each([false, true])(
    "supports readers, piping, replay and concurrent consumers (guardrails=%s)",
    async (guarded) => {
      const onEnd = vi.fn();
      const agent = defineAgent({
        name: "readable",
        model: modelForText("secret"),
        memory: false,
        outputGuardrails: guarded ? [redact()] : [],
      });
      const result = await agent.streamText({ prompt: "hi", onEnd });
      const viaReader: unknown[] = [];
      const read = async () => {
        const reader = result.stream.getReader();
        try {
          while (true) {
            const next = await reader.read();
            if (next.done) break;
            viaReader.push(next.value);
          }
        } finally {
          reader.releaseLock();
        }
      };
      const piped: unknown[] = [];
      await Promise.all([
        read(),
        result.fullStream.pipeTo(
          new WritableStream({
            write: (part) => {
              piped.push(part);
            },
          }),
        ),
        result.consumeStream(),
      ]);
      expect(viaReader).toEqual(piped);
      expect(await collect(result.stream)).toEqual(piped);
      expect((await collect(result.textStream)).join("")).toBe(guarded ? "safe" : "secret");
      expect((await collect(result.textStream)).join("")).toBe(guarded ? "safe" : "secret");
      expect(onEnd).toHaveBeenCalledOnce();
    },
  );

  it("returns typed structured output and native array element streams", async () => {
    const agent = defineAgent({
      name: "arrays",
      model: modelForText('{"elements":[{"name":"one"},{"name":"two"}]}'),
      memory: false,
    });
    const result = await agent.streamText({
      prompt: "hi",
      output: Output.array({ element: z.object({ name: z.string() }) }),
    });
    const elements = [{ name: "one" }, { name: "two" }];
    expect(await result.output).toEqual(elements);
    expect(await collect(result.elementStream)).toEqual(elements);
    expect((await collect(result.partialOutputStream)).at(-1)).toEqual(elements);
    expect((await collect(result.experimental_partialOutputStream)).at(-1)).toEqual(elements);
  });

  it("retains completed tools in native aggregate fields", async () => {
    const execute = vi.fn(() => "created");
    const model = new MockLanguageModelV4({
      doStream: ({ prompt }) => ({
        stream: readable<ProviderPart>(
          prompt.some((message) => message.role === "tool")
            ? [...textParts("done"), finish]
            : [
                { type: "tool-call", toolCallId: "t1", toolName: "create", input: "{}" },
                { ...finish, finishReason: { unified: "tool-calls", raw: "tool_calls" } },
              ],
        ),
      }),
    });
    const agent = defineAgent({
      name: "tools",
      model,
      memory: false,
      tools: { create: tool({ inputSchema: z.object({}), execute }) },
    });
    const result = await agent.streamText({ prompt: "create", stopWhen: isStepCount(3) });
    expect(await result.output).toBe("done");
    expect(await result.toolCalls).toHaveLength(1);
    expect(await result.toolResults).toEqual([
      expect.objectContaining({ toolCallId: "t1", output: "created" }),
    ]);
    expect(await result.steps).toHaveLength(2);
    expect(execute).toHaveBeenCalledOnce();
  });

  it("buffers structured values until final output guardrails finish", async () => {
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    const agent = defineAgent({
      name: "guarded-array",
      model: modelForText('{"elements":[{"name":"secret"}]}'),
      memory: false,
      outputGuardrails: [
        createOutputGuardrail({
          name: "final-redaction",
          handler: async ({ outputText }) => {
            await ready;
            return {
              pass: true,
              action: "modify",
              modifiedOutput: outputText.replaceAll("secret", "safe"),
            };
          },
        }),
      ],
    });
    const result = await agent.streamText({
      prompt: "hi",
      output: Output.array({ element: z.object({ name: z.string() }) }),
    });
    const next = vi.fn();
    const values = collect(result.elementStream).then((value) => {
      next(value);
      return value;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(next).not.toHaveBeenCalled();
    release();
    expect(await values).toEqual([{ name: "safe" }]);
    expect(await result.output).toEqual([{ name: "safe" }]);
    expect(await collect(result.partialOutputStream)).toEqual([[{ name: "safe" }]]);
  });

  it("does not restore original text when all text was filtered", async () => {
    const agent = defineAgent({
      name: "empty",
      model: modelForText("secret"),
      memory: false,
      outputGuardrails: [
        createOutputGuardrail({
          name: "remove",
          handler: () => ({ pass: true }),
          streamHandler: ({ part }) => (part.type === "text-delta" ? null : part),
        }),
      ],
    });
    const result = await agent.streamText("hi");
    expect(await result.output).toBe("");
    expect(await result.text).toBe("");
    expect(await collect(result.textStream)).toEqual([]);
  });

  it("rejects structured parsing after redaction invalidates the schema, without retrying", async () => {
    const model = modelForText('{"name":"secret"}');
    const agent = defineAgent({
      name: "invalidated",
      model,
      memory: false,
      outputGuardrails: [redact()],
    });
    const result = await agent.streamText({
      prompt: "hi",
      output: Output.object({ schema: z.object({ name: z.literal("secret") }) }),
    });
    await expect(result.output).rejects.toThrow();
    await expect(collect(result.partialOutputStream)).rejects.toThrow();
    expect(model.doStreamCalls).toHaveLength(1);
  });

  it("blocks new aggregate and structured accessors on a parallel input rejection", async () => {
    const agent = defineAgent({
      name: "input-block",
      model: modelForText('{"elements":["secret"]}'),
      memory: false,
      inputGuardrails: [
        createInputGuardrail({
          name: "block",
          execution: "parallel",
          handler: () => ({ pass: false, action: "block", message: "Blocked" }),
        }),
      ],
    });
    const result = await agent.streamText({
      prompt: "hi",
      output: Output.array({ element: z.string() }),
    });
    await expect(result.output).rejects.toThrow("Blocked");
    await expect(result.content).rejects.toThrow("Blocked");
    await expect(result.response).rejects.toThrow("Blocked");
    expect(await collect(result.elementStream)).toEqual([]);
    expect(await collect(result.partialOutputStream)).toEqual([]);
    expect(await result.text).toBe("Blocked");
  });

  it.each(["output", "input"] as const)(
    "calls UI onEnd once with the delivered %s-guarded message",
    async (kind) => {
      const onEnd = vi.fn();
      const onFinish = vi.fn();
      const agent = defineAgent({
        name: "ui-callback",
        model: modelForText("secret"),
        memory: false,
        outputGuardrails: kind === "output" ? [redact()] : [],
        inputGuardrails:
          kind === "input"
            ? [
                createInputGuardrail({
                  name: "block",
                  execution: "parallel",
                  handler: () => ({ pass: false, action: "block", message: "Blocked" }),
                }),
              ]
            : [],
      });
      const result = await agent.streamText("hi");
      await collect(result.toUIMessageStream({ onEnd, onFinish }));
      expect(onEnd).toHaveBeenCalledOnce();
      expect(onFinish).not.toHaveBeenCalled();
      expect(onEnd.mock.calls[0][0].responseMessage.parts).toContainEqual(
        expect.objectContaining({ type: "text", text: kind === "output" ? "safe" : "Blocked" }),
      );
    },
  );

  it("supports UI response callbacks and the legacy onFinish alias with guardrails", async () => {
    const onFinish = vi.fn();
    const agent = defineAgent({
      name: "ui-response",
      model: modelForText("secret"),
      memory: false,
      outputGuardrails: [redact()],
    });
    const result = await agent.streamText("hi");
    const response = result.toUIMessageStreamResponse({ onFinish, headers: { "x-test": "yes" } });
    expect(response.headers.get("x-test")).toBe("yes");
    expect(await response.text()).toContain("safe");
    expect(onFinish).toHaveBeenCalledOnce();
  });

  it("parses only the guarded final step after a tool step with text", async () => {
    const model = new MockLanguageModelV4({
      doStream: ({ prompt }) => ({
        stream: readable<ProviderPart>(
          prompt.some((message) => message.role === "tool")
            ? [...textParts('{"name":"secret"}'), finish]
            : [
                ...textParts("Looking up the name."),
                { type: "tool-call", toolCallId: "t1", toolName: "lookup", input: "{}" },
                { ...finish, finishReason: { unified: "tool-calls", raw: "tool_calls" } },
              ],
        ),
      }),
    });
    const agent = defineAgent({
      name: "guarded-steps",
      model,
      memory: false,
      outputGuardrails: [redact()],
      tools: { lookup: tool({ inputSchema: z.object({}), execute: () => "found" }) },
    });
    const result = await agent.streamText({
      prompt: "lookup",
      stopWhen: isStepCount(3),
      output: Output.object({ schema: z.object({ name: z.string() }) }),
    });
    expect(await result.output).toEqual({ name: "safe" });
    expect(await result.text).toBe('{"name":"safe"}');
    expect(await result.steps).toHaveLength(2);
  });

  it("reports guardrail stream failures through consumeStream's error callback", async () => {
    const agent = defineAgent({
      name: "blocked-stream",
      model: modelForText("secret"),
      memory: false,
      outputGuardrails: [
        createOutputGuardrail({
          name: "reject",
          handler: () => ({ pass: false, action: "block", message: "Output blocked" }),
        }),
      ],
    });
    const result = await agent.streamText("hi");
    const onError = vi.fn();
    await result.consumeStream({ onError });
    expect(onError).toHaveBeenCalledOnce();
    await expect(result.output).rejects.toThrow("Output blocked");
  });

  it("surfaces one terminal error after native stream retries are exhausted", async () => {
    const failure = new Error("persistent failure");
    const model = new MockLanguageModelV4({
      doStream: () => ({
        stream: readable<ProviderPart>([
          ...textParts("partial"),
          { type: "error", error: failure },
          { ...finish, finishReason: { unified: "error", raw: "error" } },
        ]),
      }),
    });
    const onError = vi.fn(() => ({ retry: true as const }));
    const terminalError = vi.fn();
    const agent = defineAgent({
      name: "terminal",
      model,
      memory: false,
      maxRetries: 0,
      hooks: { onError: terminalError },
    });
    const result = await agent.streamText({ prompt: "hi", streamRetries: 1, onError });
    const parts = await collect(result.stream);
    expect(parts.filter((part) => part.type === "error")).toHaveLength(1);
    expect(terminalError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledTimes(model.doStreamCalls.length);
  });

  it("preserves SDK stream retry callback results in the legacy object wrapper", async () => {
    let calls = 0;
    const model = new MockLanguageModelV4({
      doStream: () => ({
        stream: readable<ProviderPart>(
          calls++ === 0
            ? [
                ...textParts('{"name":"partial"}'),
                { type: "error", error: new Error("try again") },
                { ...finish, finishReason: { unified: "error", raw: "error" } },
              ]
            : [...textParts('{"name":"recovered"}'), finish],
        ),
      }),
    });
    const agent = defineAgent({ name: "legacy-retry", model, memory: false, maxRetries: 0 });
    const result = await agent.streamObject("hi", z.object({ name: z.string() }), {
      streamRetries: 0,
      onError: () => ({ retry: true as const }),
    });
    // The SDK version determines whether it supports retry requests.
    const outcome = await result.object.then(
      (value) => ({ value, error: undefined }),
      (error) => ({ value: undefined, error }),
    );
    if (model.doStreamCalls.length > 1) {
      expect(outcome.value).toEqual({ name: "recovered" });
      expect(outcome.error).toBeUndefined();
    } else {
      expect(outcome.value).toEqual({ name: "partial" });
      expect(outcome.error).toBeUndefined();
    }
  });

  // This compares against the installed SDK: older v7 releases ignore streamRetries;
  // recent releases recover. The same suite runs against both in compatibility checks.
  it.each([
    { streamRetries: 0, guarded: false },
    { streamRetries: 1, guarded: false },
    { streamRetries: 0, guarded: true },
    { streamRetries: 1, guarded: true },
  ])(
    "preserves native onError retry decisions ($streamRetries, guarded=$guarded)",
    async ({ streamRetries, guarded }) => {
      const failure = new Error("stream failed");
      const makeModel = () => {
        let calls = 0;
        return new MockLanguageModelV4({
          doStream: () => ({
            stream: readable<ProviderPart>(
              calls++ === 0
                ? [
                    ...textParts("partial"),
                    { type: "error", error: failure },
                    { ...finish, finishReason: { unified: "error", raw: "error" } },
                  ]
                : [...textParts("recovered"), finish],
            ),
          }),
        });
      };
      const nativeModel = makeModel();
      const nativeOnError = vi.fn(() => ({ retry: true as const }));
      const native = streamText({
        model: nativeModel,
        prompt: "hi",
        maxRetries: 0,
        streamRetries,
        onError: nativeOnError,
      } as Parameters<typeof streamText>[0]);
      const nativeParts = await collect(native.stream);
      const model = makeModel();
      const endTrace = vi.spyOn(AgentTraceContext.prototype, "end");
      const onError = vi.fn(() => ({ retry: true as const }));
      const hookError = vi.fn();
      const onEnd = vi.fn();
      const agent = defineAgent({
        name: "sdk-stream-retry",
        model,
        maxRetries: 0,
        memory: false,
        hooks: { onError: hookError, onEnd },
        outputGuardrails: guarded ? [redact()] : [],
      });
      const result = await agent.streamText({ prompt: "hi", streamRetries, onError });
      const parts = await collect(result.stream);
      expect(model.doStreamCalls).toHaveLength(nativeModel.doStreamCalls.length);
      expect(await result.output).toEqual(await native.output);
      expect(parts.filter((part) => part.type === "error")).toHaveLength(
        nativeParts.filter((part) => part.type === "error").length,
      );
      expect(onError).toHaveBeenCalledTimes(nativeOnError.mock.calls.length);
      if (model.doStreamCalls.length > 1) {
        expect(hookError).not.toHaveBeenCalled();
        expect(onEnd).toHaveBeenCalledOnce();
        expect(endTrace.mock.calls.filter(([status]) => status === "error")).toEqual([]);
        expect(endTrace.mock.calls.filter(([status]) => status === "completed")).toHaveLength(1);
      } else {
        expect(hookError).toHaveBeenCalledOnce();
      }
    },
  );
});
