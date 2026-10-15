import { type StepResult, type ToolSet, generateText } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defineAgent } from "./agent";
import { MemoryPersistQueue } from "./memory-persist-queue";
import type { AgentConversationPersistenceOptions, OperationContext } from "./types";

vi.mock("ai", async () => ({
  ...(await vi.importActual<typeof import("ai")>("ai")),
  generateText: vi.fn(),
}));

const mockGeneration = (events: StepResult<ToolSet>[]) => {
  vi.mocked(generateText).mockImplementation(async (options) => {
    for (const event of events) {
      for (const callback of [options.onStepEnd].flat()) await callback?.(event);
    }
    return {
      text: "checkpoint",
      finishReason: "stop",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      response: events.at(-1)?.response,
      steps: events,
    } as Awaited<ReturnType<typeof generateText>>;
  });
};

type QueueMock = {
  scheduleSave: ReturnType<typeof vi.fn>;
  flush: ReturnType<typeof vi.fn>;
};

type StepEventInput = Pick<StepResult<ToolSet>, "content" | "response">;

const toStepResult = (event: StepEventInput): StepResult<ToolSet> =>
  ({
    ...event,
    text: event.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join(""),
    toolCalls: event.content.filter((part) => part.type === "tool-call"),
    toolResults: event.content.filter((part) => part.type === "tool-result"),
  }) as StepResult<ToolSet>;

const createStepEvent = (content: StepEventInput["content"]) =>
  toStepResult({
    content,
    response: {
      messages: [
        {
          role: "assistant",
          content: [{ type: "text", text: "checkpoint" }],
        },
      ],
    },
  });

const createHarness = (overrides: AgentConversationPersistenceOptions) => {
  const queue: QueueMock = {
    scheduleSave: vi
      .spyOn(MemoryPersistQueue.prototype, "scheduleSave")
      .mockImplementation(() => {}),
    flush: vi.spyOn(MemoryPersistQueue.prototype, "flush").mockResolvedValue(undefined),
  };
  const agent = defineAgent({
    name: "step-persistence-agent",
    instructions: "Test",
    model: new MockLanguageModelV4({}),
    conversationPersistence: {
      mode: "step",
      debounceMs: 200,
      flushOnToolResult: true,
      ...overrides,
    },
  });

  const recordStepResultsSpy = vi
    .spyOn(agent.getMemoryManager(), "saveConversationSteps")
    .mockResolvedValue(undefined);
  const handler = async (
    event: StepResult<ToolSet>,
    assertCheckpoint: (context: OperationContext) => void,
  ) => {
    mockGeneration([event]);
    await agent.generateText("checkpoint", {
      userId: "user-1",
      conversationId: "conv-1",
      hooks: { onStepEnd: ({ context }) => assertCheckpoint(context) },
    });
  };

  return {
    queue,
    handler,
    recordStepResultsSpy,
  };
};

describe("Step-level persistence", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("schedules debounced persistence for non-tool steps in step mode", async () => {
    expect.assertions(4);
    const { handler, queue, recordStepResultsSpy } = createHarness({ mode: "step" });

    await handler(createStepEvent([{ type: "text", text: "hello" }]), (oc) => {
      expect(queue.scheduleSave).toHaveBeenCalledTimes(1);
      expect(queue.scheduleSave).toHaveBeenCalledWith(expect.anything(), oc);
      expect(queue.flush).not.toHaveBeenCalled();
      expect(recordStepResultsSpy).toHaveBeenCalledWith(oc, expect.any(Array), "user-1", "conv-1");
    });
  });

  it("flushes immediately when a tool result arrives in step mode", async () => {
    expect.assertions(4);
    const { handler, queue, recordStepResultsSpy } = createHarness({ mode: "step" });

    await handler(
      createStepEvent([
        {
          type: "tool-result",
          toolName: "search",
          toolCallId: "call-1",
          output: { ok: true },
        },
      ]),
      (oc) => {
        expect(queue.flush).toHaveBeenCalledTimes(1);
        expect(queue.flush).toHaveBeenCalledWith(expect.anything(), oc);
        expect(queue.scheduleSave).not.toHaveBeenCalled();
        expect(recordStepResultsSpy).toHaveBeenCalledWith(
          oc,
          expect.any(Array),
          "user-1",
          "conv-1",
        );
      },
    );
  });

  it("keeps finish mode behavior without incremental checkpoints", async () => {
    expect.assertions(3);
    const { handler, queue, recordStepResultsSpy } = createHarness({ mode: "finish" });

    await handler(createStepEvent([{ type: "text", text: "hello" }]), () => {
      expect(queue.scheduleSave).not.toHaveBeenCalled();
      expect(queue.flush).not.toHaveBeenCalled();
      expect(recordStepResultsSpy).not.toHaveBeenCalled();
    });
  });

  it("reuses assistant message id across step checkpoints after intermediate flushes", async () => {
    const agent = defineAgent({
      name: "step-persistence-agent",
      instructions: "Test",
      model: new MockLanguageModelV4({}),
      conversationPersistence: { mode: "step", debounceMs: 0, flushOnToolResult: true },
    });

    const saveMessage = vi
      .spyOn(agent.getMemoryManager(), "saveMessage")
      .mockResolvedValue(undefined);
    vi.spyOn(agent.getMemoryManager(), "saveConversationSteps").mockResolvedValue(undefined);
    const events: StepResult<ToolSet>[] = [];
    const handler = async (event: StepResult<ToolSet>) => {
      events.push(event);
    };

    await handler(
      toStepResult({
        content: [
          {
            type: "tool-call",
            toolName: "calc",
            toolCallId: "call-1",
            input: { a: 2, b: 2 },
          },
        ],
        response: {
          messages: [
            {
              id: "m1",
              role: "assistant",
              content: [
                {
                  type: "tool-call",
                  toolName: "calc",
                  toolCallId: "call-1",
                  input: { a: 2, b: 2 },
                },
              ],
            },
          ],
        },
      }),
    );

    await handler(
      toStepResult({
        content: [
          {
            type: "tool-result",
            toolName: "calc",
            toolCallId: "call-1",
            output: { result: 4 },
          },
        ],
        response: {
          messages: [
            {
              id: "m2",
              role: "assistant",
              content: [
                {
                  type: "tool-call",
                  toolName: "calc",
                  toolCallId: "call-1",
                  input: { a: 2, b: 2 },
                },
                {
                  type: "tool-result",
                  toolName: "calc",
                  toolCallId: "call-1",
                  output: { result: 4 },
                },
              ],
            },
          ],
        },
      }),
    );

    await handler(
      toStepResult({
        content: [
          {
            type: "tool-result",
            toolName: "calc",
            toolCallId: "call-1",
            output: { result: 4 },
          },
          {
            type: "text",
            text: "The result is 4.",
          },
        ],
        response: {
          messages: [
            {
              id: "m3",
              role: "assistant",
              content: [
                {
                  type: "tool-call",
                  toolName: "calc",
                  toolCallId: "call-1",
                  input: { a: 2, b: 2 },
                },
                {
                  type: "tool-result",
                  toolName: "calc",
                  toolCallId: "call-1",
                  output: { result: 4 },
                },
                {
                  type: "text",
                  text: "The result is 4.",
                },
              ],
            },
          ],
        },
      }),
    );

    mockGeneration(events);
    await agent.generateText("Calculate", { userId: "user-1", conversationId: "conv-1" });

    const persistedAssistantIds = saveMessage.mock.calls
      .map((call) => call[1])
      .filter((message) => message?.role === "assistant")
      .map((message) => message.id);

    expect(persistedAssistantIds.length).toBeGreaterThan(1);
    const stringAssistantIds = persistedAssistantIds.filter(
      (messageId): messageId is string =>
        typeof messageId === "string" && messageId.trim().length > 0,
    );
    expect(stringAssistantIds).toHaveLength(persistedAssistantIds.length);
    expect(new Set(stringAssistantIds).size).toBe(1);
  });
});
