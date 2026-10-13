// Compile against the built declarations and the selected consumer AI SDK version.
import { type ModelMessage, Output, type generateText, type streamText, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";
import {
  Agent,
  type GenerateTextOptions,
  type StreamTextOptions,
  enhanceTool,
  tool as voltTool,
} from "../dist/index";

const model = new MockLanguageModelV4();
const clientTool = voltTool({
  inputSchema: z.object({ precise: z.boolean() }),
  voltagent: { tags: ["client"] },
});
const serverTool = voltTool({
  inputSchema: z.object({ id: z.string() }),
  execute: ({ id }) => id.length,
});
serverTool.execute({ id: "1" }, { toolCallId: "call", messages: [], context: {} });
const clientAgent = new Agent({
  name: "client",
  instructions: "Use the client tools when needed.",
  model,
  tools: { location: clientTool },
});
await clientAgent.generateText({ prompt: "Where am I?" });
const lookup = enhanceTool(
  tool({
    inputSchema: z.object({ id: z.string() }),
    contextSchema: z.object({ token: z.string() }),
    execute: (_input, { context }) => context.token.length,
  }),
  { tags: ["external"] },
);
const tools = { lookup };
const output = Output.object({ schema: z.object({ answer: z.string() }) });
const agent = new Agent({
  name: "consumer",
  instructions: ({ context }) => context.get("language") ?? "en",
  contextSchema: z.object({ language: z.enum(["en", "tr"]).default("en") }),
  model,
  tools,
});
const messages: ModelMessage[] = [{ role: "user", content: "hello" }];
const request = {
  model,
  prompt: messages,
  toolsContext: { lookup: { token: "token" } },
  runtimeContext: { requestId: "request" },
  output,
  voltagent: { context: { language: "tr" as const } },
};
const result = await agent.generateText(request);
const streamed = await agent.streamText(request);
const text: string = result.output.answer;
const streamedText: string = (await streamed.output).answer;
const requestId: string = result.finalStep.runtimeContext.requestId;
const toolResult: number = result.staticToolResults[0].output;
const language: "tr" | "en" | undefined = result.context.get("language");
void [text, streamedText, requestId, toolResult, language];

// New SDK options and callback return types must remain usable without a VoltAgent update.
type NativeGenerate = Parameters<typeof generateText>[0];
type NativeStream = Parameters<typeof streamText>[0];
type Managed = "model" | "prompt" | "messages" | "tools" | "output" | "toolsContext" | "_internal";
type AssertNever<T extends never> = T;
export type MissingGenerateOptions = AssertNever<
  Exclude<keyof NativeGenerate, Managed | keyof GenerateTextOptions>
>;
export type MissingStreamOptions = AssertNever<
  Exclude<keyof NativeStream, Managed | keyof StreamTextOptions>
>;
declare const nativeOnError: NativeStream["onError"];
await agent.streamText({ ...request, onError: nativeOnError });
// @ts-expect-error - generateText has no stream chunk callback
await agent.generateText({ ...request, onChunk: () => {} });
// @ts-expect-error - toolsContext is still required by the native tool schema
await agent.generateText({ model, prompt: messages });
