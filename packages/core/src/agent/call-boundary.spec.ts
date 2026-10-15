import { APICallError, InvalidPromptError, generateText, streamText, wrapLanguageModel } from "ai";
import type { ModelMessage } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModelProviderRegistry } from "../registries/model-provider-registry";
import { type Agent, defineAgent } from "./agent";
import { AgentTraceContext } from "./open-telemetry/trace-context";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};
const response = {
  content: [{ type: "text" as const, text: "done" }],
  finishReason: { unified: "stop" as const, raw: "stop" },
  usage,
  warnings: [],
};
function streamResponse() {
  return {
    stream: new ReadableStream({
      start(controller) {
        controller.enqueue({ type: "stream-start", warnings: [] });
        controller.enqueue({ type: "text-start", id: "text-1" });
        controller.enqueue({ type: "text-delta", id: "text-1", delta: "done" });
        controller.enqueue({ type: "text-end", id: "text-1" });
        controller.enqueue({ type: "finish", finishReason: response.finishReason, usage });
        controller.close();
      },
    }),
  };
}
const model = (modelId = "default") =>
  new MockLanguageModelV4({ modelId, doGenerate: response, doStream: streamResponse });
const messages: ModelMessage[] = [{ role: "user", content: "hello" }];
const failure = () =>
  new APICallError({
    message: "unavailable",
    url: "https://example.invalid",
    requestBodyValues: {},
    statusCode: 503,
    isRetryable: true,
  });

afterEach(() => vi.restoreAllMocks());

for (const method of ["generateText", "streamText"] as const) {
  describe(`${method} call boundary`, () => {
    it("uses a call model through retry and tracing without changing constructor defaults", async () => {
      const primary = model();
      const backup = model("backup");
      let attempts = 0;
      const next = () => {
        if (attempts++ === 0) throw failure();
      };
      const override = new MockLanguageModelV4({
        modelId: "override",
        doGenerate: () => {
          next();
          return response;
        },
        doStream: () => {
          next();
          return streamResponse();
        },
      });
      const onRetry = vi.fn();
      const onFallback = vi.fn();
      const spans = vi.spyOn(AgentTraceContext.prototype, "createChildSpan");
      const agent = defineAgent({
        name: "override",
        model: [{ model: primary }, { model: backup }],
        instructions: "Help",
        memory: false,
        maxRetries: 1,
        hooks: { onRetry, onFallback },
      });
      const result = await agent[method]({ prompt: "hi", model: override });
      expect(await result.text).toBe("done");
      expect(attempts).toBe(2);
      expect(onRetry).toHaveBeenCalledOnce();
      expect(onRetry.mock.calls[0][0].modelName).toBe("override");
      expect(onFallback).not.toHaveBeenCalled();
      const attemptsSpans = spans.mock.calls.filter(
        ([, , options]) => options?.label === "Model attempt",
      );
      expect(attemptsSpans).toHaveLength(2);
      expect(
        attemptsSpans.every(([, , options]) => options?.attributes?.["llm.model"] === "override"),
      ).toBe(true);
      expect(primary.doGenerateCalls.length + primary.doStreamCalls.length).toBe(0);
      expect(backup.doGenerateCalls.length + backup.doStreamCalls.length).toBe(0);
      const subsequent = await agent[method]({ prompt: "hi" });
      expect(await subsequent.text).toBe("done");
      expect(primary.doGenerateCalls.length + primary.doStreamCalls.length).toBe(1);
    });

    it("does not fall back to constructor models after a call override fails", async () => {
      const primary = model();
      const override = new MockLanguageModelV4({
        doGenerate: () => {
          throw failure();
        },
        doStream: () => {
          throw failure();
        },
      });
      const agent = defineAgent({
        name: "failure",
        model: [{ model: primary }],
        memory: false,
        maxRetries: 0,
      });
      const invoke = async () => {
        const result = await agent[method]({ prompt: "hi", model: override });
        return await result.text;
      };
      await expect(invoke()).rejects.toThrow();
      expect(primary.doGenerateCalls.length + primary.doStreamCalls.length).toBe(0);
    });

    it("supports model router strings and existing AI SDK model middleware", async () => {
      const override = model("routed");
      const middleware = vi.fn(({ params }) => params);
      const wrapped = wrapLanguageModel({
        model: override,
        middleware: { specificationVersion: "v4", transformParams: middleware },
      });
      const resolve = vi
        .spyOn(ModelProviderRegistry.getInstance(), "resolveLanguageModel")
        .mockResolvedValue(wrapped);
      const agent = defineAgent({ name: "router", model: model(), memory: false });
      const result = await agent[method]({ prompt: "hi", model: "openai/test" });
      expect(await result.text).toBe("done");
      expect(resolve).toHaveBeenCalledWith("openai/test");
      expect(middleware).toHaveBeenCalledOnce();
    });

    it("accepts model message prompts and gives instructions precedence over system", async () => {
      const provider = model();
      const agent = defineAgent({
        name: "prompt",
        instructions: "framework",
        model: provider,
        memory: false,
      });
      const result = await agent[method]({
        prompt: messages,
        instructions: "preferred",
        system: "ignored",
      });
      expect(await result.text).toBe("done");
      const prompt = (
        method === "generateText" ? provider.doGenerateCalls : provider.doStreamCalls
      )[0].prompt;
      const system = prompt
        .filter((message) => message.role === "system")
        .map((message) => message.content);
      expect(system).toContain("preferred");
      expect(system).toContain("framework");
      expect(system).not.toContain("ignored");
    });

    it.each([
      { prompt: "hello", messages },
      { prompt: [] },
      { messages: [] },
      { messages: [{ role: "system", content: "untrusted" }, ...messages] },
      { prompt: "hello", instructions: { role: "user", content: "invalid" } },
    ])("rejects invalid caller input before running hooks or the provider: %j", async (request) => {
      const onStart = vi.fn();
      const provider = model();
      const agent = defineAgent({
        name: "validation",
        model: provider,
        memory: false,
        hooks: { onStart },
      });
      // Exercise untyped JavaScript/HTTP input as well as TypeScript callers.
      await expect(agent[method](request as never)).rejects.toBeInstanceOf(InvalidPromptError);
      expect(onStart).not.toHaveBeenCalled();
      expect(provider.doGenerateCalls.length + provider.doStreamCalls.length).toBe(0);
    });

    it("preserves explicitly allowed system message order and framework instructions", async () => {
      const provider = model();
      const agent = defineAgent({
        name: "trusted",
        model: provider,
        instructions: "framework",
        memory: false,
      });
      const result = await agent[method]({
        messages: [
          ...messages,
          { role: "system", content: "trusted" },
          { role: "user", content: "last" },
        ],
        allowSystemInMessages: true,
      });
      expect(await result.text).toBe("done");
      const prompt = (
        method === "generateText" ? provider.doGenerateCalls : provider.doStreamCalls
      )[0].prompt;
      expect(prompt.map((message) => message.role)).toEqual(["system", "user", "system", "user"]);
      expect(prompt[0].content).toBe("framework");
      expect(prompt[2].content).toBe("trusted");
    });

    it("matches native instruction alias precedence", async () => {
      const nativeModel = model();
      const agentModel = model();
      const nativeOptions = {
        model: nativeModel,
        prompt: "hi",
        instructions: "new",
        system: "old",
      };
      const native =
        method === "generateText" ? await generateText(nativeOptions) : streamText(nativeOptions);
      await native.text;
      const agent = defineAgent({
        name: "parity",
        instructions: "",
        model: agentModel,
        memory: false,
      });
      const result = await agent[method]({ prompt: "hi", instructions: "new", system: "old" });
      await result.text;
      const calls = (provider: MockLanguageModelV4) =>
        method === "generateText" ? provider.doGenerateCalls : provider.doStreamCalls;
      expect(calls(agentModel)[0].prompt).toEqual(calls(nativeModel)[0].prompt);
    });
  });
}
