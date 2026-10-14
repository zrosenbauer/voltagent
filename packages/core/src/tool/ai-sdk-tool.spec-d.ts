import type { InferToolContext } from "@ai-sdk/provider-utils";
import type { InferToolInput, InferToolOutput } from "ai";
import { tool as aiTool } from "ai";
import { describe, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { defineTool } from "./ai-sdk-tool";

describe("AI SDK tool inference", () => {
  it("accepts client tools without execute or outputSchema like the native helper", () => {
    const definition = {
      description: "Ask the browser for a location",
      inputSchema: z.object({ precise: z.boolean() }),
      contextSchema: z.object({ userId: z.string() }),
    };
    const native = aiTool(definition);
    const client = defineTool({ ...definition, voltagent: { tags: ["browser"] } });

    expectTypeOf(client).toEqualTypeOf(native);
    expectTypeOf<InferToolInput<typeof client>>().toEqualTypeOf<{ precise: boolean }>();
    expectTypeOf<InferToolOutput<typeof client>>().toBeNever();
    expectTypeOf<InferToolContext<typeof client>>().toEqualTypeOf<{ userId: string }>();
  });

  it("infers an explicit client output schema", () => {
    const definition = {
      inputSchema: z.object({}),
      outputSchema: z.object({ latitude: z.number(), longitude: z.number() }),
    };
    expectTypeOf(defineTool(definition)).toEqualTypeOf(aiTool(definition));
  });

  it("keeps execute callable and infers input, output, and context", () => {
    const executable = defineTool({
      inputSchema: z.object({ id: z.string() }),
      contextSchema: z.object({ token: z.string() }),
      execute: ({ id }, { context }) => {
        expectTypeOf(id).toEqualTypeOf<string>();
        expectTypeOf(context.token).toEqualTypeOf<string>();
        return { found: true };
      },
      voltagent: { tags: ["server"] },
    });
    expectTypeOf(executable.execute).toBeFunction();
    expectTypeOf<InferToolOutput<typeof executable>>().toEqualTypeOf<{ found: boolean }>();
    executable.execute({ id: "1" }, { toolCallId: "call", messages: [], context: { token: "t" } });
    // @ts-expect-error - schema input remains checked
    executable.execute({ id: 1 }, { toolCallId: "call", messages: [], context: { token: "t" } });
  });
});
