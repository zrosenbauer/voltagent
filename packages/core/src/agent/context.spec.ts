import { APICallError, Output, isStepCount, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Agent } from "./agent";
import { createInputMiddleware, createOutputMiddleware } from "./middleware";
import type { OperationContext } from "./types";

const usage = {
  inputTokens: { total: 2, noCache: 2, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 2, text: 2, reasoning: 0 },
};
const response = (text: string) => ({
  content: [{ type: "text" as const, text }],
  finishReason: { unified: "stop" as const, raw: "stop" },
  usage,
  warnings: [],
});
function modelForText(text: string) {
  return new MockLanguageModelV4({
    doGenerate: () => response(text),
    doStream: () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "text-start", id: "text" });
          controller.enqueue({ type: "text-delta", id: "text", delta: text });
          controller.enqueue({ type: "text-end", id: "text" });
          controller.enqueue({
            type: "finish",
            usage,
            finishReason: { unified: "stop", raw: "stop" },
          });
          controller.close();
        },
      }),
    }),
  });
}
const operations = ["generateText", "streamText", "generateObject", "streamObject"] as const;
async function invoke(
  agent: Agent,
  operation: (typeof operations)[number],
  context?: Map<string | symbol, unknown> | Record<string, unknown>,
) {
  const options = { voltagent: { context } };
  switch (operation) {
    case "generateText":
      return agent.generateText("hi", options);
    case "streamText": {
      const result = await agent.streamText("hi", options);
      await result.text;
      return result;
    }
    case "generateObject":
      return agent.generateObject("hi", z.object({ answer: z.string() }), options);
    case "streamObject": {
      const result = await agent.streamObject("hi", z.object({ answer: z.string() }), options);
      await result.object;
      return result;
    }
  }
}

describe("schema-validated context", () => {
  it.each(operations)(
    "validates context before middleware, hooks and dynamic values in %s",
    async (operation) => {
      const model = modelForText('{"answer":"ready"}');
      const order: string[] = [];
      const shared = new Map<string | symbol, unknown>([
        ["tenant", "acme"],
        ["extra", true],
      ]);
      const agent = new Agent({
        name: "typed-context",
        memory: false,
        contextSchema: z
          .object({ tenant: z.string(), language: z.string().default("tr") })
          .superRefine(() => {
            order.push("validate");
          }),
        model: ({ context }) => {
          expect(context).toBe(shared);
          expect(context.get("language")).toBe("tr");
          return model;
        },
        instructions: ({ context }) => {
          order.push("instructions");
          return `Reply in ${context.get("language")}`;
        },
        tools: ({ context }) => {
          expect(context.get("tenant")).toBe("acme");
          return [];
        },
        inputMiddlewares: [
          createInputMiddleware({
            name: "check",
            handler: ({ context }) => {
              order.push("middleware");
              expect(context.context.get("language")).toBe("tr");
            },
          }),
        ],
        hooks: {
          onStart: ({ context }) => {
            order.push("start");
            expect(context.context).toBe(shared);
          },
        },
      });
      const result = await invoke(agent, operation, shared);
      expect(order).toEqual(["validate", "middleware", "instructions", "start"]);
      expect(order.filter((value) => value === "validate")).toHaveLength(1);
      expect(result.context).toBe(shared);
      expect(result.context.get("extra")).toBe(true);
      const calls = operation.startsWith("stream") ? model.doStreamCalls : model.doGenerateCalls;
      expect(calls[0].prompt).toContainEqual(
        expect.objectContaining({ role: "system", content: "Reply in tr" }),
      );
    },
  );

  it.each(operations)(
    "rejects invalid and missing merged context before %s execution",
    async (operation) => {
      const model = modelForText('{"answer":"unused"}');
      const instructions = vi.fn(() => "Help");
      const onStart = vi.fn();
      const agent = new Agent({
        name: "invalid",
        model,
        instructions,
        memory: false,
        contextSchema: z.object({ tenant: z.string() }),
        hooks: { onStart },
      });
      for (const context of [{ tenant: 123 }, undefined]) {
        await expect(invoke(agent, operation, context)).rejects.toMatchObject({
          name: "AgentContextValidationError",
          code: "INVALID_CONTEXT",
          httpStatus: 400,
          cause: expect.objectContaining({ name: "AI_TypeValidationError" }),
        });
      }
      expect(instructions).not.toHaveBeenCalled();
      expect(onStart).not.toHaveBeenCalled();
      expect(model.doGenerateCalls).toHaveLength(0);
      expect(model.doStreamCalls).toHaveLength(0);
    },
  );

  it("merges constructor defaults, legacy input and namespaced input before validation", async () => {
    const agent = new Agent({
      name: "merge",
      model: modelForText("ready"),
      memory: false,
      contextSchema: z.object({
        tenant: z.string(),
        language: z.string(),
        budget: z.string().transform(Number),
      }),
      context: { tenant: "acme", language: "en", budget: "100" },
      instructions: ({ context }) => `Budget: ${context.get("budget")}`,
    });
    const result = await agent.generateText({
      prompt: "hi",
      context: { language: "legacy" },
      options: { voltagent: { context: { language: "tr" } } },
    });
    expect(Object.fromEntries(result.context)).toEqual({
      tenant: "acme",
      language: "tr",
      budget: 100,
    });
  });

  it("applies field defaults to an omitted context", async () => {
    const agent = new Agent({
      name: "defaults",
      model: modelForText("ready"),
      memory: false,
      instructions: "Help",
      contextSchema: z.object({ language: z.string().default("tr") }),
    });
    expect((await agent.generateText("hi")).context.get("language")).toBe("tr");
  });

  it("does not mutate constructor defaults or leak schema defaults between invocations", async () => {
    const defaults = new Map<string | symbol, unknown>([["budget", "100"]]);
    const agent = new Agent({
      name: "isolated",
      model: modelForText("ready"),
      memory: false,
      context: defaults,
      contextSchema: z.object({
        budget: z.string().transform(async (value) => Number(value)),
        language: z.string().default("tr"),
      }),
      instructions: "Help",
      hooks: {
        onEnd: ({ context }) => {
          context.context.set("visited", true);
        },
      },
    });
    const [one, two] = await Promise.all([agent.generateText("one"), agent.generateText("two")]);
    expect(one.context).not.toBe(two.context);
    expect(one.context.get("budget")).toBe(100);
    expect(two.context.get("budget")).toBe(100);
    expect(Object.fromEntries(defaults)).toEqual({ budget: "100" });
  });

  it("preserves explicit Map identity, extra keys and symbols after successful validation", async () => {
    const key = Symbol("extension");
    const shared = new Map<string | symbol, unknown>([
      ["tenant", " acme "],
      [key, { id: 1 }],
      ["extra", true],
    ]);
    const agent = new Agent({
      name: "shared",
      model: modelForText("ready"),
      memory: false,
      instructions: "Help",
      contextSchema: z.object({ tenant: z.string().trim() }),
    });
    const result = await agent.generateText("hi", { context: shared });
    expect(result.context).toBe(shared);
    expect(shared.get("tenant")).toBe("acme");
    expect(shared.get(key)).toEqual({ id: 1 });
    expect(shared.get("extra")).toBe(true);
  });

  it("does not partially modify shared context on validation failure", async () => {
    const shared = new Map<string | symbol, unknown>([["tenant", 123]]);
    const agent: Agent = new Agent({
      name: "atomic",
      model: modelForText("unused"),
      memory: false,
      instructions: "Help",
      context: { language: "tr" },
      contextSchema: z.object({ tenant: z.string(), language: z.string() }),
    });
    await expect(agent.generateText("hi", { context: shared })).rejects.toMatchObject({
      code: "INVALID_CONTEXT",
    });
    expect(Object.fromEntries(shared)).toEqual({ tenant: 123 });
  });

  it("inherits parent context and shares child updates through an agent tool", async () => {
    let childContext: Map<string | symbol, unknown> | undefined;
    const child = new Agent({
      id: "child",
      name: "Child",
      model: modelForText("child result"),
      memory: false,
      contextSchema: z.object({ tenant: z.string(), language: z.string().default("tr") }),
      context: { tenant: "constructor", childDefault: true },
      instructions: "Help",
      hooks: {
        onStart: ({ context }) => {
          childContext = context.context;
          context.context.set("childVisited", true);
        },
      },
    });
    const parentModel = new MockLanguageModelV4({
      doGenerate: ({ prompt }) =>
        prompt.some((m) => m.role === "tool")
          ? response("done")
          : {
              ...response(""),
              content: [
                {
                  type: "tool-call",
                  toolCallId: "t1",
                  toolName: "child_tool",
                  input: '{"prompt":"hi"}',
                },
              ],
              finishReason: { unified: "tool-calls", raw: "tool_calls" },
            },
    });
    const parent = new Agent({
      name: "Parent",
      model: parentModel,
      memory: false,
      instructions: "Delegate",
      tools: [child.toTool({ context: { tenant: "tool", language: "en" } })],
    });
    const result = await parent.generateText("hi", {
      context: { tenant: "parent" },
      stopWhen: isStepCount(3),
    });
    expect(childContext).toBe(result.context);
    expect(result.context.get("tenant")).toBe("parent");
    expect(result.context.get("language")).toBe("en");
    expect(result.context.get("childDefault")).toBe(true);
    expect(result.context.get("childVisited")).toBe(true);
  });

  it("rejects invalid parent values without replacing them with call or constructor values", async () => {
    const agent = new Agent({
      name: "parent-priority",
      model: modelForText("unused"),
      memory: false,
      instructions: "Help",
      contextSchema: z.object({ tenant: z.string() }),
      context: { tenant: "default" },
    });
    const parentContext = new Map<string | symbol, unknown>([["tenant", 123]]);
    const parent = {
      context: parentContext,
      abortController: new AbortController(),
    } as OperationContext;
    await expect(
      agent.generateText("hi", {
        context: { tenant: "runtime", extra: true },
        parentOperationContext: parent,
      }),
    ).rejects.toMatchObject({ code: "INVALID_CONTEXT" });
    expect(Object.fromEntries(parentContext)).toEqual({ tenant: 123 });
  });

  it("validates once across fallback and middleware retries", async () => {
    const validate = vi.fn();
    const failing = new MockLanguageModelV4({
      doGenerate: () => {
        throw new APICallError({
          message: "unavailable",
          url: "https://example.invalid",
          requestBodyValues: {},
          statusCode: 503,
          isRetryable: false,
        });
      },
    });
    const fallback = modelForText("ready");
    const agent = new Agent({
      name: "retries",
      memory: false,
      instructions: "Help",
      contextSchema: z.object({ tenant: z.string() }).superRefine(validate),
      model: [
        { model: failing, maxRetries: 0 },
        { model: fallback, maxRetries: 0 },
      ],
      maxMiddlewareRetries: 1,
      outputMiddlewares: [
        createOutputMiddleware<string>({
          name: "retry",
          handler: ({ output, retryCount, abort }) => {
            if (retryCount === 0) abort("again", { retry: true });
            return output;
          },
        }),
      ],
    });
    expect((await agent.generateText("hi", { context: { tenant: "acme" } })).text).toBe("ready");
    expect(validate).toHaveBeenCalledOnce();
    expect(fallback.doGenerateCalls).toHaveLength(2);
  });

  it("honors cancellation before and after asynchronous validation without committing defaults", async () => {
    const abort = new AbortController();
    const context = new Map<string | symbol, unknown>();
    const validate = vi.fn(async () => {
      abort.abort(new Error("cancelled"));
    });
    const model = modelForText("unused");
    const agent = new Agent({
      name: "abort",
      model,
      instructions: "Help",
      memory: false,
      contextSchema: z.object({ language: z.string().default("tr") }).superRefine(validate),
    });
    await expect(agent.generateText("hi", { context, abortSignal: abort.signal })).rejects.toThrow(
      "cancelled",
    );
    await expect(agent.streamText("hi", { context, abortSignal: abort.signal })).rejects.toThrow(
      "cancelled",
    );
    expect(validate).toHaveBeenCalledOnce();
    expect(context.size).toBe(0);
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it("uses validated context in a dynamic tool closure and preserves structured output", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: ({ prompt }) =>
        prompt.some((m) => m.role === "tool")
          ? response('{"answer":"ready"}')
          : {
              ...response(""),
              content: [{ type: "tool-call", toolCallId: "t1", toolName: "lookup", input: "{}" }],
              finishReason: { unified: "tool-calls", raw: "tool_calls" },
            },
    });
    const execute = vi.fn();
    const agent = new Agent({
      name: "tools",
      model,
      memory: false,
      instructions: "Help",
      contextSchema: z.object({ tenant: z.string().trim() }),
      tools: ({ context }) => ({
        lookup: tool({
          inputSchema: z.object({}),
          execute: () => {
            execute(context.get("tenant"));
            return "found";
          },
        }),
      }),
    });
    const result = await agent.generateText({
      prompt: "hi",
      context: { tenant: " acme " },
      output: Output.object({ schema: z.object({ answer: z.string() }) }),
      stopWhen: isStepCount(3),
    });
    expect(result.output).toEqual({ answer: "ready" });
    expect(execute).toHaveBeenCalledWith("acme");
  });
});
