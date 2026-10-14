import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createNamedAiSdkTool, defineTool, getVoltAgentToolMetadata } from "./ai-sdk-tool";

describe("AI SDK tool helper", () => {
  it("preserves a client-side definition and keeps framework metadata out of it", () => {
    const inputSchema = z.object({ precise: z.boolean() });
    const client = defineTool({ inputSchema, voltagent: { tags: ["browser"] } });
    expect(client.inputSchema).toBe(inputSchema);
    expect(client.execute).toBeUndefined();
    expect(client.outputSchema).toBeUndefined();
    expect(client).not.toHaveProperty("voltagent");
    expect(getVoltAgentToolMetadata(client)?.tags).toEqual(["browser"]);
    expect(createNamedAiSdkTool("location", client).isClientSide()).toBe(true);
  });

  it("preserves the native execute function and its context", async () => {
    const execute = (input: { id: string }, options: { context: { prefix: string } }) =>
      `${options.context.prefix}${input.id}`;
    const server = defineTool({
      inputSchema: z.object({ id: z.string() }),
      contextSchema: z.object({ prefix: z.string() }),
      execute,
    });
    expect(server.execute).toBe(execute);
    expect(
      await server.execute(
        { id: "1" },
        { toolCallId: "call", messages: [], context: { prefix: "item-" } },
      ),
    ).toBe("item-1");
  });
});
