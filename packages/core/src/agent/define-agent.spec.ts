import { Output, isStepCount } from "ai";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineTool } from "../tool/ai-sdk-tool";
import { defineAgent } from "./define-agent";

const usage = {
  inputTokens: { total: 2, noCache: 2, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 2, text: 2, reasoning: 0 },
};
const finishReason = { unified: "stop" as const, raw: "stop" };
const textModel = (text = "Hello") =>
  new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: "text", text }],
      finishReason,
      usage,
      warnings: [],
    },
    doStream: () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "text-1" },
          { type: "text-delta", id: "text-1", delta: text },
          { type: "text-end", id: "text-1" },
          { type: "finish", finishReason, usage },
        ],
      }),
    }),
  });

describe("defineAgent", () => {
  it("preserves the existing generation API, defaults, and native request settings", async () => {
    const model = textModel();
    const agent = defineAgent({
      name: "assistant",
      model,
      instructions: "Be concise",
      temperature: 0.2,
      maxRetries: 0,
      memory: false,
    });
    const result = await agent.generateText({ prompt: "Hello" });

    expect(agent.id).toBe("assistant");
    expect(agent.maxSteps).toBe(5);
    expect(result.text).toBe("Hello");
    expect(model.doGenerateCalls[0].temperature).toBe(0.2);
    expect(model.doGenerateCalls[0].prompt[0]).toMatchObject({
      role: "system",
      content: "Be concise",
    });
  });

  it("executes defineTool through the native SDK loop and follows up with its result", async () => {
    const execute = vi.fn(({ location }: { location: string }) => ({ location, temperature: 21 }));
    const weather = defineTool({
      description: "Read the weather",
      inputSchema: z.object({ location: z.string() }),
      execute,
      voltagent: { tags: ["weather"] },
    });
    const model = new MockLanguageModelV4({
      doGenerate: [
        {
          content: [
            {
              type: "tool-call",
              toolCallId: "weather-1",
              toolName: "weather",
              input: '{"location":"Paris"}',
            },
          ],
          finishReason: { unified: "tool-calls", raw: "tool_calls" },
          usage,
          warnings: [],
        },
        {
          content: [{ type: "text", text: "Paris is 21 degrees" }],
          finishReason,
          usage,
          warnings: [],
        },
      ],
    });
    const agent = defineAgent({
      name: "weather",
      instructions: "Read the weather",
      model,
      tools: { weather },
      stopWhen: isStepCount(2),
      maxRetries: 0,
      memory: false,
    });

    const result = await agent.generateText({ prompt: "Weather in Paris?" });

    expect(execute).toHaveBeenCalledOnce();
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].toolResults[0].output).toEqual({ location: "Paris", temperature: 21 });
    expect(result.text).toBe("Paris is 21 degrees");
    expect(agent.getToolsForApi()[0].tags).toEqual(["weather"]);
  });

  it("streams native results with structured output", async () => {
    const agent = defineAgent({
      name: "structured",
      instructions: "Return JSON",
      id: "structured-id",
      model: textModel('{"answer":42}'),
      maxRetries: 0,
      memory: false,
    });
    const result = await agent.streamText({
      prompt: "Answer",
      output: Output.object({ schema: z.object({ answer: z.number() }) }),
    });
    const chunks: string[] = [];
    for await (const chunk of result.textStream) chunks.push(chunk);

    expect(agent.id).toBe("structured-id");
    expect(chunks.join("")).toBe('{"answer":42}');
    expect(await result.output).toEqual({ answer: 42 });
  });

  it("keeps native tool approval requests from executing a protected tool", async () => {
    const execute = vi.fn(() => "secret");
    const agent = defineAgent({
      name: "approval",
      instructions: "Run tools",
      model: new MockLanguageModelV4({
        doGenerate: {
          content: [
            { type: "tool-call", toolCallId: "protected-1", toolName: "protected", input: "{}" },
          ],
          finishReason: { unified: "tool-calls", raw: "tool_calls" },
          usage,
          warnings: [],
        },
      }),
      tools: { protected: defineTool({ inputSchema: z.object({}), needsApproval: true, execute }) },
      maxRetries: 0,
      memory: false,
    });

    const result = await agent.generateText({ prompt: "Run it" });

    expect(execute).not.toHaveBeenCalled();
    expect(result.content.some((part) => part.type === "tool-approval-request")).toBe(true);
  });

  it("preserves dynamic instructions, validated context, and VoltAgent hooks", async () => {
    const model = textModel();
    const onStart = vi.fn();
    const agent = defineAgent({
      name: "tenant",
      model,
      contextSchema: z.object({ tenantId: z.string() }),
      instructions: ({ context }) => `Tenant: ${context.get("tenantId")}`,
      hooks: { onStart },
      maxRetries: 0,
      memory: false,
    });

    const result = await agent.generateText({
      prompt: "Hello",
      voltagent: { context: { tenantId: "tenant-1" } },
    });

    expect(model.doGenerateCalls[0].prompt[0]).toMatchObject({ content: "Tenant: tenant-1" });
    expect(onStart).toHaveBeenCalledOnce();
    expect(result.context.get("tenantId")).toBe("tenant-1");
  });

  it("accepts defined agents as existing subagents", () => {
    const child = defineAgent({
      name: "child",
      model: textModel(),
      instructions: "Help the supervisor",
      memory: false,
    });
    const supervisor = defineAgent({
      name: "supervisor",
      model: textModel(),
      instructions: "Delegate work",
      subAgents: [child],
      memory: false,
    });

    expect(supervisor.getSubAgents()).toEqual([child]);
  });
});
