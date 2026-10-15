import { NoOutputGeneratedError, Output, generateText, isStepCount, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { type Agent, defineAgent } from "./agent";
import { createOutputGuardrail } from "./guardrail";
import { createOutputMiddleware } from "./middleware";
import { AgentTraceContext } from "./open-telemetry/trace-context";

afterEach(() => vi.restoreAllMocks());

const usage = {
  inputTokens: { total: 2, noCache: 2, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 2, text: 2, reasoning: 0 },
};
function responseForText(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    finishReason: { unified: "stop" as const, raw: "stop" },
    usage,
    warnings: [{ type: "other" as const, message: "test warning" }],
    providerMetadata: { test: { value: "metadata" } },
    request: { body: "test request" },
    response: {
      id: "response-1",
      timestamp: new Date(0),
      modelId: "test-model",
      headers: { "x-test": "header" },
    },
  };
}
const redact = () =>
  createOutputGuardrail({
    name: "redact",
    handler: ({ outputText }) => ({
      pass: true,
      action: "modify",
      modifiedOutput: outputText.replaceAll("secret", "safe"),
    }),
  });

describe("AI SDK generate result contract", () => {
  it("preserves native results and runtime context when the text is unchanged", async () => {
    const model = new MockLanguageModelV4({ doGenerate: responseForText("hello") });
    const runtimeContext = { requestId: "request-1" };
    const native = await generateText({ model, prompt: "hi", runtimeContext });
    const onEnd = vi.fn();
    const agent = defineAgent({ name: "native-fields", model, memory: false });
    const result = await agent.generateText({ prompt: "hi", runtimeContext, onEnd });

    for (const key of [
      "text",
      "output",
      "content",
      "usage",
      "totalUsage",
      "finishReason",
      "rawFinishReason",
      "warnings",
      "providerMetadata",
      "request",
      "response",
      "responseMessages",
      "files",
      "sources",
      "toolCalls",
      "toolResults",
      "staticToolCalls",
      "dynamicToolCalls",
      "staticToolResults",
      "dynamicToolResults",
      "reasoning",
      "reasoningText",
    ] as const) {
      expect(result[key]).toEqual(native[key]);
    }
    expect(result.finalStep.runtimeContext).toBe(runtimeContext);
    expect(result.steps[0].runtimeContext).toBe(runtimeContext);
    expect(result.context).toBeInstanceOf(Map);
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it.each([
    { name: "default text", text: "secret", output: undefined, expected: "safe" },
    { name: "explicit text", text: "secret", output: Output.text(), expected: "safe" },
    {
      name: "object",
      text: '{"answer":"secret"}',
      output: Output.object({ schema: z.object({ answer: z.string() }) }),
      expected: { answer: "safe" },
    },
    {
      name: "array",
      text: '{"elements":[{"answer":"secret"}]}',
      output: Output.array({ element: z.object({ answer: z.string() }) }),
      expected: [{ answer: "safe" }],
    },
    {
      name: "JSON",
      text: '{"answer":"secret"}',
      output: Output.json(),
      expected: { answer: "safe" },
    },
    {
      name: "choice",
      text: '{"result":"secret"}',
      output: Output.choice({ options: ["secret", "safe"] }),
      expected: "safe",
    },
  ])(
    "returns sanitized $name output while preserving native diagnostics",
    async ({ text, output, expected }) => {
      const onEnd = vi.fn();
      const hookOnEnd = vi.fn();
      const agent = defineAgent({
        name: "guarded-output",
        model: new MockLanguageModelV4({ doGenerate: responseForText(text) }),
        memory: false,
        outputGuardrails: [redact()],
        hooks: { onEnd: hookOnEnd },
      });
      const result = await agent.generateText({ prompt: "hi", output, onEnd });

      expect(result.text).toBe(text.replaceAll("secret", "safe"));
      expect(result.output).toEqual(expected);
      expect(result.finalStep.text).toBe(text);
      expect(result.steps[0].text).toBe(text);
      expect(result.content).toEqual([{ type: "text", text }]);
      expect(result.responseMessages[0].content).toEqual([{ type: "text", text }]);
      expect(onEnd).toHaveBeenCalledOnce();
      expect(onEnd.mock.calls[0][0].text).toBe(text);
      expect(hookOnEnd).toHaveBeenCalledOnce();
      expect(hookOnEnd.mock.calls[0][0].output.text).toBe(result.text);
    },
  );

  it("parses only after both middleware and guardrails have modified the text", async () => {
    const output = Output.object({ schema: z.object({ answer: z.string() }) });
    const parse = vi.spyOn(output, "parseCompleteOutput");
    const agent = defineAgent({
      name: "transformed-output",
      model: new MockLanguageModelV4({ doGenerate: responseForText('{"answer":"original"}') }),
      memory: false,
      outputMiddlewares: [
        createOutputMiddleware<string>({
          name: "replace",
          handler: ({ output }) => output.replace("original", "secret"),
        }),
      ],
      outputGuardrails: [redact()],
    });
    const result = await agent.generateText({ prompt: "hi", output });
    expect(result.output).toEqual({ answer: "safe" });
    expect(parse.mock.calls.map(([value]) => value.text)).toEqual([
      '{"answer":"original"}',
      '{"answer":"safe"}',
    ]);
  });

  it("preserves empty middleware replacements in text and output", async () => {
    const agent = defineAgent({
      name: "empty-output",
      model: new MockLanguageModelV4({ doGenerate: responseForText("secret") }),
      memory: false,
      outputMiddlewares: [createOutputMiddleware<string>({ name: "empty", handler: () => "" })],
    });
    const result = await agent.generateText("hi");
    expect(result.text).toBe("");
    expect(result.output).toBe("");
  });

  it("preserves native output identity and parses once when final text is unchanged", async () => {
    const output = Output.object({
      schema: z.object({ answer: z.string().transform((s) => s.length) }),
    });
    const parse = vi.spyOn(output, "parseCompleteOutput");
    const agent = defineAgent({
      name: "unchanged-output",
      model: new MockLanguageModelV4({ doGenerate: responseForText('{"answer":"hello"}') }),
      memory: false,
      outputGuardrails: [redact()],
      outputMiddlewares: [
        createOutputMiddleware<string>({ name: "identity", handler: ({ output }) => output }),
      ],
    });
    const result = await agent.generateText({ prompt: "hi", output });
    expect(parse).toHaveBeenCalledOnce();
    expect(result.output).toBe(await parse.mock.results[0].value);
    expect(result.output).toEqual({ answer: 5 });
  });

  it.each(["not JSON", '{"answer":123}'])(
    "rejects invalid transformed output (%s) without replaying tools or providers",
    async (replacement) => {
      const execute = vi.fn(() => "created");
      const doGenerate = vi.fn(({ prompt }: Parameters<MockLanguageModelV4["doGenerate"]>[0]) =>
        prompt.some((message: { role: string }) => message.role === "tool")
          ? responseForText('{"answer":"secret"}')
          : {
              ...responseForText("working"),
              content: [
                { type: "tool-call" as const, toolCallId: "t1", toolName: "create", input: "{}" },
              ],
              finishReason: { unified: "tool-calls" as const, raw: "tool_calls" },
            },
      );
      const fallback = vi.fn(() => responseForText('{"answer":"fallback"}'));
      const onEnd = vi.fn();
      const onError = vi.fn();
      const onRetry = vi.fn();
      const onFallback = vi.fn();
      const end = vi.spyOn(AgentTraceContext.prototype, "end");
      const agent = defineAgent({
        name: "invalid-output",
        model: [
          { model: new MockLanguageModelV4({ doGenerate }) },
          { model: new MockLanguageModelV4({ doGenerate: fallback }) },
        ],
        memory: false,
        tools: { create: tool({ inputSchema: z.object({}), execute }) },
        maxRetries: 2,
        maxMiddlewareRetries: 2,
        hooks: { onEnd, onError, onRetry, onFallback },
        outputMiddlewares: [
          createOutputMiddleware<string>({ name: "replace", handler: () => replacement }),
        ],
      });
      await expect(
        agent.generateText({
          prompt: "create",
          output: Output.object({ schema: z.object({ answer: z.string() }) }),
          stopWhen: isStepCount(3),
        }),
      ).rejects.toMatchObject({ name: "AI_NoObjectGeneratedError" });
      expect(doGenerate).toHaveBeenCalledTimes(2);
      expect(execute).toHaveBeenCalledOnce();
      expect(fallback).not.toHaveBeenCalled();
      expect(onRetry).not.toHaveBeenCalled();
      expect(onFallback).not.toHaveBeenCalled();
      expect(onEnd).toHaveBeenCalledOnce();
      expect(onEnd.mock.calls[0][0]).toMatchObject({ output: undefined, error: expect.any(Error) });
      expect(onError).toHaveBeenCalledOnce();
      expect(end).toHaveBeenCalledWith("error", expect.any(Error));
    },
  );

  it("retains the native missing-output getter when the loop ends on a tool step", async () => {
    const agent = defineAgent({
      name: "tool-only",
      model: new MockLanguageModelV4({
        doGenerate: {
          ...responseForText(""),
          content: [{ type: "tool-call", toolCallId: "t1", toolName: "create", input: "{}" }],
          finishReason: { unified: "tool-calls", raw: "tool_calls" },
        },
      }),
      memory: false,
      tools: { create: tool({ inputSchema: z.object({}), execute: () => "created" }) },
      outputGuardrails: [redact()],
    });
    const result = await agent.generateText({ prompt: "create", stopWhen: isStepCount(1) });
    expect(result.toolResults).toHaveLength(1);
    expect(() => result.output).toThrow(NoOutputGeneratedError);
  });

  it("parses custom output from final-step text using final-step metadata", async () => {
    const textOutput = Output.text();
    const parse = vi.fn(textOutput.parseCompleteOutput);
    const output = { ...textOutput, parseCompleteOutput: parse };
    const model = new MockLanguageModelV4({
      doGenerate: ({ prompt }) =>
        prompt.some((message) => message.role === "tool")
          ? responseForText("secret")
          : {
              ...responseForText("working"),
              content: [
                { type: "text", text: "working" },
                { type: "tool-call", toolCallId: "t1", toolName: "create", input: "{}" },
              ],
              finishReason: { unified: "tool-calls", raw: "tool_calls" },
            },
    });
    const agent = defineAgent({
      name: "custom-output",
      model,
      memory: false,
      tools: { create: tool({ inputSchema: z.object({}), execute: () => "created" }) },
      outputGuardrails: [redact()],
    });
    const result = await agent.generateText({ prompt: "create", output, stopWhen: isStepCount(3) });
    expect(result.text).toBe("safe");
    expect(result.output).toBe("safe");
    expect(parse).toHaveBeenLastCalledWith(
      { text: "safe" },
      {
        response: result.finalStep.response,
        usage: result.finalStep.usage,
        finishReason: result.finalStep.finishReason,
      },
    );
    expect(result.totalUsage.totalTokens).toBe(8);
    expect(result.finalStep.usage.totalTokens).toBe(4);
    expect(result.steps[0].text).toBe("working");
  });

  it.each([
    { text: "secret", output: undefined, expected: "safe" },
    {
      text: '{"answer":"secret"}',
      output: Output.object({ schema: z.object({ answer: z.string() }) }),
      expected: { answer: "safe" },
    },
  ])("returns guarded output for a subagent bail ($text)", async ({ text, output, expected }) => {
    const { agent, execute } = bailingAgent(text);
    const result = await agent.generateText({
      prompt: "delegate",
      output,
      stopWhen: isStepCount(3),
    });
    expect(result.text).toBe(text.replaceAll("secret", "safe"));
    expect(result.output).toEqual(expected);
    expect(result.finishReason).toBe("bail");
    expect(execute).toHaveBeenCalledOnce();
  });

  it("rejects an invalid structured bail output through the error hooks", async () => {
    const onError = vi.fn();
    const { agent, execute } = bailingAgent("invalid JSON", onError);
    await expect(
      agent.generateText({
        prompt: "delegate",
        output: Output.object({ schema: z.object({ answer: z.string() }) }),
        stopWhen: isStepCount(3),
      }),
    ).rejects.toMatchObject({ name: "AI_NoObjectGeneratedError" });
    expect(execute).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
  });

  it("handles synchronous custom parser failures for bail output", async () => {
    const error = new Error("custom parser failed");
    const onError = vi.fn();
    const { agent } = bailingAgent("secret", onError);
    await expect(
      agent.generateText({
        prompt: "delegate",
        stopWhen: isStepCount(3),
        output: {
          ...Output.text(),
          parseCompleteOutput() {
            throw error;
          },
        },
      }),
    ).rejects.toBe(error);
    expect(onError).toHaveBeenCalledOnce();
  });
});

function bailingAgent(text: string, onError = vi.fn()) {
  const execute = vi.fn(() => [{ agentName: "child", response: text, bailed: true }]);
  const agent = defineAgent({
    name: "bailed-output",
    model: new MockLanguageModelV4({
      doGenerate: ({ abortSignal }) => {
        abortSignal?.throwIfAborted();
        return {
          ...responseForText(""),
          content: [{ type: "tool-call", toolCallId: "t1", toolName: "delegate", input: "{}" }],
          finishReason: { unified: "tool-calls", raw: "tool_calls" },
        };
      },
    }),
    memory: false,
    hooks: { onError },
    tools: { delegate: tool({ inputSchema: z.object({}), execute }) },
    outputGuardrails: [redact()],
  });
  return { agent, execute };
}
