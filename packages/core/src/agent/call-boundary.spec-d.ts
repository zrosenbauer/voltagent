import type { ModelMessage, generateText, streamText } from "ai";
import { Output, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { Agent, type GenerateTextOptions, type StreamTextOptions } from "./agent";

const model = new MockLanguageModelV4();
const messages: ModelMessage[] = [{ role: "user", content: "hello" }];
const tools = { lookup: tool({ inputSchema: z.object({ id: z.string() }), execute: () => 42 }) };
const output = Output.object({ schema: z.object({ answer: z.string() }) });
type Context = { tenant: string };
type NativeGenerate = Parameters<typeof generateText<typeof tools, Context, typeof output>>[0];
type NativeStream = Parameters<typeof streamText<typeof tools, Context, typeof output>>[0];
type Generate = GenerateTextOptions<
  typeof output,
  NonNullable<NativeGenerate["providerOptions"]>,
  typeof tools,
  Context
>;
type Stream = StreamTextOptions<
  NonNullable<NativeStream["providerOptions"]>,
  typeof tools,
  Context,
  typeof output
>;

describe("native call input types", () => {
  it("accepts model overrides and message prompts without losing inference", async () => {
    const agent = new Agent({ name: "typed", instructions: "Help", model, tools });
    const result = await agent.generateText({
      model,
      prompt: messages,
      output,
      runtimeContext: { tenant: "acme" },
    });
    expectTypeOf(result.output).toEqualTypeOf<{ answer: string }>();
    expectTypeOf(result.finalStep.runtimeContext.tenant).toEqualTypeOf<string>();
    expectTypeOf(result.staticToolResults[0].output).toEqualTypeOf<number>();
    const stream = await agent.streamText({
      model,
      prompt: messages,
      output,
      runtimeContext: { tenant: "acme" },
    });
    expectTypeOf(stream.output).resolves.toEqualTypeOf<{ answer: string }>();
    await agent.generateText("hi", { model });
    await agent.streamText({ prompt: messages, options: { model } });
    await agent.generateText({ prompt: "hi", model: "openai/gpt-4o-mini" });
    // @ts-expect-error - prompt and messages are mutually exclusive
    await agent.generateText({ prompt: "hi", messages });
    // @ts-expect-error - prompt and messages are mutually exclusive
    await agent.streamText({ prompt: messages, messages });
  });

  it("derives callbacks and method-specific settings from the corresponding SDK function", () => {
    expectTypeOf<Generate["onStart"]>().toEqualTypeOf<NativeGenerate["onStart"]>();
    expectTypeOf<Generate["onEnd"]>().toEqualTypeOf<NativeGenerate["onEnd"]>();
    expectTypeOf<Generate["onStepEnd"]>().toEqualTypeOf<NativeGenerate["onStepEnd"]>();
    expectTypeOf<Generate["include"]>().toEqualTypeOf<NativeGenerate["include"]>();
    expectTypeOf<Stream["onStart"]>().toEqualTypeOf<NativeStream["onStart"]>();
    expectTypeOf<Stream["onEnd"]>().toEqualTypeOf<NativeStream["onEnd"]>();
    expectTypeOf<Stream["onError"]>().toEqualTypeOf<NativeStream["onError"]>();
    expectTypeOf<Stream["onChunk"]>().toEqualTypeOf<NativeStream["onChunk"]>();
    expectTypeOf<Stream["onAbort"]>().toEqualTypeOf<NativeStream["onAbort"]>();
    expectTypeOf<Stream["include"]>().toEqualTypeOf<NativeStream["include"]>();
  });

  it("rejects stream-only options on generateText", async () => {
    const agent = new Agent({ name: "methods", instructions: "Help", model });
    // @ts-expect-error - chunk callbacks require streaming
    await agent.generateText({ prompt: "hi", onChunk: () => {} });
    // @ts-expect-error - stream error callbacks require streaming
    await agent.generateText({ prompt: "hi", onError: () => {} });
    // @ts-expect-error - transforms require streaming
    await agent.generateText({ prompt: "hi", experimental_transform: [] });
    // @ts-expect-error - stream recovery requires streaming
    await agent.generateText({ prompt: "hi", streamRetries: 1 });
    // @ts-expect-error - internal SDK test options are not public agent options
    await agent.generateText({ prompt: "hi", _internal: {} });
    await agent.streamText({
      prompt: "hi",
      onChunk: () => {},
      onError: () => {},
      experimental_transform: [],
    });
  });
});
