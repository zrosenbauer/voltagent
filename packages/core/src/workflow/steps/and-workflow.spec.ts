import { vi, describe, expect, it, beforeEach } from "vitest";
import { z } from "zod";
import type { DangerouslyAllowAny } from "@voltagent/internal/types";
import { createWorkflow } from "../core";
import { WorkflowRegistry } from "../registry";
import { andThen } from "./and-then";
import { andWorkflow } from "./and-workflow";

describe("andWorkflow", () => {
  beforeEach(() => {
    // Clear registry before each test
    const registry = WorkflowRegistry.getInstance();
    (registry as any).workflows.clear();
  });

  it("should execute the nested workflow with the provided context", async () => {
    const mockWorkflow = {
      id: "mock-workflow",
      name: "Mock Workflow",
      purpose: "Test purpose",
      run: vi.fn().mockResolvedValue({
        result: { processed: true, value: 42 },
        executionId: "test-execution",
        workflowId: "mock-workflow",
        status: "completed",
      }),
    };

    const step = andWorkflow<DangerouslyAllowAny, DangerouslyAllowAny, DangerouslyAllowAny>(
      mockWorkflow as DangerouslyAllowAny,
    );

    const context = {
      data: { input: "test-data" },
      state: {
        active: 1,
        executionId: "parent-execution",
        conversationId: "test-conversation",
        userId: "test-user",
        userContext: { role: "admin" },
      },
      getStepData: () => undefined,
    };

    const result = await step.execute(context as DangerouslyAllowAny);

    expect(result).toEqual({ processed: true, value: 42 });
    expect(mockWorkflow.run).toHaveBeenCalledWith(
      { input: "test-data" },
      {
        active: 1,
        executionId: "parent-execution",
        conversationId: "test-conversation",
        userId: "test-user",
        userContext: { role: "admin" },
      },
    );
  });

  it("should inherit properties from the nested workflow", () => {
    const mockWorkflow = {
      id: "nested-id",
      name: "Nested Name",
      purpose: "Nested Purpose",
      run: vi.fn(),
    };

    const step = andWorkflow<DangerouslyAllowAny, DangerouslyAllowAny, DangerouslyAllowAny>(
      mockWorkflow as DangerouslyAllowAny,
    );

    expect(step.id).toBe("nested-id");
    expect(step.name).toBe("Nested Name");
    expect(step.purpose).toBe("Nested Purpose");
    expect(step.type).toBe("workflow");
  });

  it("should handle nested workflow errors", async () => {
    const mockError = new Error("Nested workflow failed");
    const mockWorkflow = {
      id: "error-workflow",
      name: "Error Workflow",
      run: vi.fn().mockRejectedValue(mockError),
    };

    const step = andWorkflow<DangerouslyAllowAny, DangerouslyAllowAny, DangerouslyAllowAny>(
      mockWorkflow as DangerouslyAllowAny,
    );

    const context = {
      data: { input: "test" },
      state: {
        active: 1,
        executionId: "test-execution",
      },
      getStepData: () => undefined,
    };

    await expect(step.execute(context as DangerouslyAllowAny)).rejects.toThrow(
      "Nested workflow failed",
    );
  });

  it("should pass data correctly to nested workflow", async () => {
    const mockWorkflow = {
      id: "data-workflow",
      name: "Data Workflow",
      run: vi.fn().mockImplementation(async (data) => ({
        result: { received: data },
        executionId: "test",
        workflowId: "data-workflow",
        status: "completed",
      })),
    };

    const step = andWorkflow<DangerouslyAllowAny, DangerouslyAllowAny, DangerouslyAllowAny>(
      mockWorkflow as DangerouslyAllowAny,
    );

    const testData = { foo: "bar", nested: { value: 123 } };
    const context = {
      data: testData,
      state: {
        active: 1,
        executionId: "test",
      },
      getStepData: () => undefined,
    };

    const result = await step.execute(context as DangerouslyAllowAny);

    expect(result).toEqual({ received: testData });
    expect(mockWorkflow.run).toHaveBeenCalledWith(testData, expect.any(Object));
  });

  // Integration test - test with memory support
  it("should run the nested workflow with memory support", async () => {
    // Create a mock memory for the test
    const mockMemory = {
      createExecution: vi.fn().mockResolvedValue(undefined),
      updateExecution: vi.fn().mockResolvedValue(undefined),
      getExecution: vi.fn().mockResolvedValue(null),
      getConversationHistory: vi.fn().mockResolvedValue([]),
      createSuspension: vi.fn().mockResolvedValue(undefined),
      getSuspension: vi.fn().mockResolvedValue(null),
      updateSuspension: vi.fn().mockResolvedValue(undefined),
    };

    const nestedWorkflow = createWorkflow(
      {
        id: "nested",
        name: "nested",
        memory: mockMemory as DangerouslyAllowAny,
        result: z.object({
          processed: z.boolean(),
          workflow: z.string(),
          count: z.number(),
        }),
      },
      andThen({
        id: "nested-step",
        execute: async () => {
          return { workflow: "is-nested", processed: true, count: 1 };
        },
      }),
      andThen({
        id: "nested-step-2",
        execute: async (ctx) => {
          return { workflow: "is-nested", processed: true, count: ctx.data.count + 1 };
        },
      }),
    );

    const workflow = createWorkflow(
      {
        id: "root",
        name: "root",
        memory: mockMemory as DangerouslyAllowAny,
        result: z.object({
          processed: z.boolean(),
          workflow: z.string(),
          count: z.number(),
        }),
      },
      andThen({
        id: "root-step",
        execute: async () => {
          return { processed: false, workflow: "root", count: 0 };
        },
      }),
      andWorkflow(nestedWorkflow as DangerouslyAllowAny),
    );

    // Register workflows to registry
    const registry = WorkflowRegistry.getInstance();
    registry.registerWorkflow(workflow);
    registry.registerWorkflow(nestedWorkflow);

    const result = await workflow.run({});

    expect(result.result).toEqual({
      processed: true,
      workflow: "is-nested",
      count: 2,
    });
  });
});
