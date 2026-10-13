import { Output, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { Agent } from "./agent";
import type { AgentContext, TypedContext } from "./context";

const model = new MockLanguageModelV4();
const schema = z.object({
  tenantId: z.string(),
  language: z.enum(["tr", "en"]).default("tr"),
  budget: z.string().transform(Number),
});

describe("schema-typed agent context", () => {
  it("infers validated context in existing dynamic values and agent-local hooks", () => {
    const agent = new Agent({
      name: "typed",
      contextSchema: schema,
      instructions: ({ context }) => {
        expectTypeOf(context.get("language")).toEqualTypeOf<"tr" | "en" | undefined>();
        expectTypeOf(context.get("budget")).toEqualTypeOf<number | undefined>();
        context.set("budget", 100);
        // @ts-expect-error - writes to declared keys use their validated output type
        context.set("budget", "100");
        context.set("extension", { arbitrary: true });
        expectTypeOf(context.get("extension")).toBeUnknown();
        return "Help";
      },
      model: ({ context }) => {
        expectTypeOf(context.get("tenantId")).toEqualTypeOf<string | undefined>();
        return model;
      },
      tools: ({ context }) => {
        expectTypeOf(context.get("language")).toEqualTypeOf<"tr" | "en" | undefined>();
        return [];
      },
      hooks: {
        onStart: ({ context }) => {
          expectTypeOf(context.context.get("budget")).toEqualTypeOf<number | undefined>();
        },
        onRetry: (args) => {
          if (args.source === "llm") expectTypeOf(args.attempt).toEqualTypeOf<number>();
          expectTypeOf(args.context.context.get("tenantId")).toEqualTypeOf<string | undefined>();
        },
      },
    });
    expectTypeOf(agent).toMatchTypeOf<Agent>();
  });

  it("checks schema input in defaults and both call forms while preserving result inference", async () => {
    const agent = new Agent({
      name: "inputs",
      model,
      instructions: "Help",
      contextSchema: schema,
      context: { tenantId: "acme", budget: "100" },
    });
    const generated = await agent.generateText({
      prompt: "hi",
      voltagent: { context: { language: "en" } },
      output: Output.object({ schema: z.object({ answer: z.string() }) }),
      runtimeContext: { requestId: "r1" },
    });
    expectTypeOf(generated.output).toEqualTypeOf<{ answer: string }>();
    expectTypeOf(generated.context.get("budget")).toEqualTypeOf<number | undefined>();
    expectTypeOf(generated.finalStep.runtimeContext.requestId).toEqualTypeOf<string>();
    await agent.generateText("hi"); // Constructor/parent values may satisfy required keys.
    await agent.streamText("hi", { context: { budget: "200" } });
    await agent.generateText({
      prompt: "hi",
      options: { voltagent: { context: { language: "tr" } } },
    });
    await agent.generateText("hi", {
      // @ts-expect-error - callers pass schema input, not transformed output
      context: { budget: 200 },
    });
    await agent.streamText("hi", {
      // @ts-expect-error - schema literals are checked in the namespaced form
      voltagent: { context: { language: "de" } },
    });
    new Agent({
      name: "invalid",
      model,
      instructions: "Help",
      contextSchema: schema,
      // @ts-expect-error - constructor context uses the same input types
      context: { tenantId: 123 },
    });
    agent.toTool({ context: { tenantId: "acme" } });
    agent.toTool({
      // @ts-expect-error - tool defaults also use the agent's context input type
      context: { budget: 200 },
    });
  });

  it("retains native tool inference and required toolsContext", async () => {
    const agent = new Agent({
      name: "tools",
      model,
      instructions: "Help",
      contextSchema: z.object({ tenant: z.string() }),
      tools: {
        lookup: tool({
          inputSchema: z.object({}),
          contextSchema: z.object({ token: z.string() }),
          execute: () => "found",
        }),
      },
    });
    const result = await agent.generateText({
      prompt: "hi",
      voltagent: { context: { tenant: "acme" } },
      toolsContext: { lookup: { token: "token" } },
    });
    expectTypeOf(result.staticToolCalls[0].toolName).toEqualTypeOf<"lookup">();
    // @ts-expect-error - agent context does not satisfy a native tool's independent context schema
    await agent.generateText({ prompt: "hi", voltagent: { context: { tenant: "acme" } } });
  });

  it("returns typed context in streaming and legacy structured methods", async () => {
    const agent = new Agent({
      name: "results",
      model,
      instructions: "Help",
      contextSchema: schema,
    });
    const streamed = await agent.streamText({
      prompt: "hi",
      context: { tenantId: "acme", budget: "100" },
    });
    const generated = await agent.generateObject("hi", z.object({ answer: z.string() }), {
      context: { tenantId: "acme", budget: "100" },
    });
    const objectStream = await agent.streamObject("hi", z.object({ answer: z.string() }), {
      context: { tenantId: "acme", budget: "100" },
    });
    expectTypeOf(streamed.context).toEqualTypeOf<AgentContext<typeof schema>>();
    expectTypeOf(generated.context.get("budget")).toEqualTypeOf<number | undefined>();
    expectTypeOf(objectStream.context.get("tenantId")).toEqualTypeOf<string | undefined>();
    expectTypeOf<AgentContext<typeof schema>>().toMatchTypeOf<
      TypedContext<z.output<typeof schema>>
    >();
  });

  it("preserves unschematized Map behavior", async () => {
    const agent = new Agent({
      name: "plain",
      model,
      instructions: ({ context }) => {
        expectTypeOf(context).toEqualTypeOf<Map<string | symbol, unknown>>();
        return "Help";
      },
    });
    const result = await agent.generateText("hi", { context: new Map([["anything", 1]]) });
    expectTypeOf(result.context).toEqualTypeOf<Map<string | symbol, unknown>>();
  });

  it("removes the unreleased callOptions and prepareCall API", () => {
    new Agent({
      name: "removed",
      model,
      instructions: "Help",
      // @ts-expect-error - use contextSchema
      callOptionsSchema: schema,
    });
    new Agent({
      name: "removed",
      model,
      instructions: "Help",
      // @ts-expect-error - use existing dynamic configuration functions
      prepareCall: () => ({ instructions: "Help" }),
    });
    const agent = new Agent({ name: "plain", model, instructions: "Help" });
    agent.generateText("hi", {
      voltagent: {
        // @ts-expect-error - context is the only VoltAgent application data channel
        callOptions: { tenantId: "acme" },
      },
    });
  });
});
