import { Output } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { defineTool } from "../tool/ai-sdk-tool";
import type { Agent } from "./agent";
import { defineAgent } from "./define-agent";

describe("defineAgent inference", () => {
  it("requires the context inferred from native tool schemas at the existing call boundary", async () => {
    const tools = {
      lookup: defineTool({
        inputSchema: z.object({ key: z.string() }),
        contextSchema: z.object({ tenantId: z.string() }),
        execute: ({ key }, { context }) => {
          expectTypeOf(context.tenantId).toEqualTypeOf<string>();
          return key;
        },
      }),
    };
    const agent = defineAgent({
      name: "contextual",
      model: new MockLanguageModelV4(),
      tools,
      instructions: "Look up keys",
    });
    await agent.generateText({
      prompt: "Find a key",
      toolsContext: { lookup: { tenantId: "t1" } },
    });

    // @ts-expect-error Required tool context must be supplied at the call boundary.
    await agent.generateText({ prompt: "Find a key" });
  });

  it("retains the existing Agent contract, validated context, and per-call output inference", async () => {
    const tools = {
      lookup: defineTool({
        inputSchema: z.object({ key: z.string() }),
        execute: ({ key }) => ({ value: key.length }),
      }),
    };
    const contextSchema = z.object({ tenantId: z.string() });
    const agent = defineAgent({
      name: "typed",
      model: new MockLanguageModelV4(),
      tools,
      contextSchema,
      instructions: ({ context }) => {
        expectTypeOf(context.get("tenantId")).toEqualTypeOf<string | undefined>();
        return "Look up keys";
      },
    });

    expectTypeOf(agent).toEqualTypeOf<Agent<typeof tools, typeof contextSchema>>();
    const generated = await agent.generateText({
      prompt: "Find a key",
      output: Output.object({ schema: z.object({ answer: z.number() }) }),
      runtimeContext: { requestId: "r1" },
      voltagent: { context: { tenantId: "t1" } },
    });
    expectTypeOf(generated.output).toEqualTypeOf<{ answer: number }>();
    expectTypeOf(generated.context.get("tenantId")).toEqualTypeOf<string | undefined>();
    expectTypeOf(generated.finalStep.runtimeContext.requestId).toEqualTypeOf<string>();
  });

  it("keeps native tools assignable and execute callable without casts", () => {
    const lookup = defineTool({
      inputSchema: z.object({ key: z.string() }),
      execute: ({ key }) => key.length,
    });
    expectTypeOf(lookup.execute).toBeFunction();
    expectTypeOf(
      lookup.execute({ key: "key" }, { toolCallId: "call-1", messages: [], context: {} }),
    ).toEqualTypeOf<number | PromiseLike<number> | AsyncIterable<number>>();
  });
});
