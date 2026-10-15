import { MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { type Agent, defineAgent } from "./agent/agent";
import { MemoryPersistQueue } from "./agent/memory-persist-queue";
import { Memory } from "./memory";
import { InMemoryStorageAdapter } from "./memory/adapters/storage/in-memory";
import { ServerlessVoltAgentObservability } from "./observability";
import { AgentRegistry } from "./registries/agent-registry";
import { voltagent } from "./voltagent";
import { VoltOpsClient } from "./voltops/client";
import { defineWorkflow } from "./workflow";
import { WorkflowRegistry } from "./workflow/registry";
import { andThen } from "./workflow/steps";
import { Workspace } from "./workspace";

const createModel = (text = "Response") =>
  new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    },
  });

const resetRegistries = () => {
  const agentRegistry = AgentRegistry.getInstance() as {
    agents?: Map<string, unknown>;
    agentRelationships?: Map<string, unknown>;
  };
  agentRegistry.agents?.clear();
  agentRegistry.agentRelationships?.clear();
  AgentRegistry.getInstance().setGlobalAgentMemory(undefined);
  AgentRegistry.getInstance().setGlobalWorkflowMemory(undefined);
  AgentRegistry.getInstance().setGlobalMemory(undefined);
  AgentRegistry.getInstance().setGlobalWorkspace(undefined);
  AgentRegistry.getInstance().setGlobalToolRouting(undefined);

  const workflowRegistry = WorkflowRegistry.getInstance() as {
    workflows?: Map<string, unknown>;
    activeExecutions?: Map<string, unknown>;
  };
  workflowRegistry.workflows?.clear();
  workflowRegistry.activeExecutions?.clear();
};

describe("VoltAgent defaults", () => {
  beforeEach(() => {
    resetRegistries();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetRegistries();
  });

  it("applies agentMemory to registered agents without explicit memory", () => {
    const agentMemory = new Memory({ storage: new InMemoryStorageAdapter() });
    const agent = defineAgent({
      name: "assistant",
      instructions: "Be helpful.",
      model: "openai/gpt-4o-mini",
    });

    voltagent({
      agents: { assistant: agent },
      agentMemory,
      checkDependencies: false,
    });

    expect(agent.getMemory()).toBe(agentMemory);
  });

  it("applies title generation when default memory is assigned to a preconstructed agent", async () => {
    const agentMemory = new Memory({
      storage: new InMemoryStorageAdapter(),
      generateTitle: true,
    });
    const model = createModel("Global Memory Title");
    const agent = defineAgent({
      name: "assistant",
      instructions: "Be helpful.",
      model,
    });

    const voltAgent = voltagent({
      agents: { assistant: agent },
      memory: agentMemory,
      checkDependencies: false,
    });

    await agent.generateText("Plan a weekend trip to Rome.", {
      userId: "user-1",
      conversationId: "conversation-1",
    });

    const conversation = await agentMemory.getConversation("conversation-1");
    expect(conversation?.title).toBe("Global Memory Title");

    await voltAgent.shutdown();
  });

  it("applies workspace to preconstructed registered agents without explicit workspace", async () => {
    const workspace = new Workspace({ id: "global-workspace" });
    const agent = defineAgent({
      name: "assistant",
      instructions: "Be helpful.",
      model: "openai/gpt-4o-mini",
    });

    expect(agent.getWorkspace()).toBeUndefined();
    expect(agent.getTools()).toHaveLength(0);

    const voltAgent = voltagent({
      agents: { assistant: agent },
      workspace,
      checkDependencies: false,
    });

    expect(agent.getWorkspace()).toBe(workspace);
    expect(agent.maxSteps).toBe(100);
    expect(agent.getTools().map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["ls", "read_file", "execute_command", "workspace_search"]),
    );

    const retrievedAgent = voltAgent.getAgent("assistant");
    expect(retrievedAgent).toBe(agent);
    expect(retrievedAgent?.getWorkspace()).toBe(workspace);
    expect(retrievedAgent?.getTools().map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["ls", "read_file", "execute_command", "workspace_search"]),
    );

    await voltAgent.ready;
    await voltAgent.shutdown();
  });

  it("applies workflowMemory to registered workflows without explicit memory", () => {
    const workflowMemory = new Memory({ storage: new InMemoryStorageAdapter() });
    const workflow = defineWorkflow(
      {
        id: "workflow-default-memory",
        name: "Workflow Default Memory",
        input: z.object({ value: z.string() }),
        result: z.object({ value: z.string() }),
      },
      andThen({
        id: "echo",
        execute: async ({ data }) => data,
      }),
    );

    voltagent({
      workflows: { workflow },
      workflowMemory,
      checkDependencies: false,
    });

    expect(workflow.memory).toBe(workflowMemory);
  });

  it("uses shared memory as fallback for agents and workflows", () => {
    const sharedMemory = new Memory({ storage: new InMemoryStorageAdapter() });
    const agent = defineAgent({
      name: "assistant",
      instructions: "Be helpful.",
      model: "openai/gpt-4o-mini",
    });
    const workflow = defineWorkflow(
      {
        id: "workflow-shared-memory",
        name: "Workflow Shared Memory",
        input: z.object({ value: z.string() }),
        result: z.object({ value: z.string() }),
      },
      andThen({
        id: "echo",
        execute: async ({ data }) => data,
      }),
    );

    voltagent({
      agents: { assistant: agent },
      workflows: { workflow },
      memory: sharedMemory,
      checkDependencies: false,
    });

    expect(agent.getMemory()).toBe(sharedMemory);
    expect(workflow.memory).toBe(sharedMemory);
  });

  it("applies default agent conversation persistence when agent does not configure it", async () => {
    const scheduleSave = vi.spyOn(MemoryPersistQueue.prototype, "scheduleSave");
    const agent = defineAgent({
      name: "assistant",
      instructions: "Be helpful.",
      model: createModel(),
    });

    const app = voltagent({
      agents: { assistant: agent },
      agentConversationPersistence: {
        mode: "finish",
        debounceMs: 10,
        flushOnToolResult: false,
      },
      checkDependencies: false,
    });

    await agent.generateText("Hello", {
      userId: "persistence-user",
      conversationId: "persistence-conversation",
    });
    expect(scheduleSave).not.toHaveBeenCalled();
    await app.shutdown();
  });

  it("preserves explicit agent conversation persistence config", async () => {
    const scheduleSave = vi.spyOn(MemoryPersistQueue.prototype, "scheduleSave");
    const agent = defineAgent({
      name: "assistant",
      instructions: "Be helpful.",
      model: createModel(),
      conversationPersistence: {
        mode: "step",
        debounceMs: 25,
        flushOnToolResult: true,
      },
    });

    const app = voltagent({
      agents: { assistant: agent },
      agentConversationPersistence: {
        mode: "finish",
        debounceMs: 0,
        flushOnToolResult: false,
      },
      checkDependencies: false,
    });

    await agent.generateText("Hello", {
      userId: "persistence-user",
      conversationId: "persistence-conversation",
    });
    expect(scheduleSave).toHaveBeenCalledOnce();
    await app.shutdown();
  });

  it("does not recreate serverless observability remote config when unchanged", async () => {
    const observability = new ServerlessVoltAgentObservability();
    const updateSpy = vi.spyOn(observability, "updateServerlessRemote");

    const mockVoltOpsClient = new VoltOpsClient({
      baseUrl: "https://api.voltops.example",
      publicKey: "pk_test_public_key",
      secretKey: "sk_test_secret_key",
    });

    let ensureEnvironmentHook: ((env?: Record<string, unknown>) => void) | undefined;

    const voltAgent = voltagent({
      observability,
      voltOpsClient: mockVoltOpsClient,
      checkDependencies: false,
      serverless: (deps) => {
        ensureEnvironmentHook = deps.ensureEnvironment;
        return {
          handleRequest: async () => new Response(null, { status: 200 }),
          toCloudflareWorker: () => ({
            fetch: async () => new Response(null, { status: 200 }),
          }),
          toVercelEdge: () => async () => new Response(null, { status: 200 }),
          toDeno: () => async () => new Response(null, { status: 200 }),
          auto: () => ({
            fetch: async () => new Response(null, { status: 200 }),
          }),
        };
      },
    });

    await voltAgent.ready;
    expect(updateSpy).toHaveBeenCalledTimes(1);

    ensureEnvironmentHook?.();
    ensureEnvironmentHook?.();

    expect(updateSpy).toHaveBeenCalledTimes(1);
    await voltAgent.shutdown();
  });
});
