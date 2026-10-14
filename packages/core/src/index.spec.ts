import { describe, it } from "vitest";
import defaultVoltagent, { defineAgent, defineTool, defineWorkflow, voltagent } from "./index";
import * as publicApi from "./index";
import { voltagent as internalVoltagent } from "./voltagent";

describe("exports", () => {
  it.todo("should have expected exports for all types", () => {
    // TODO: Add tests to make sure our main exports are ALWAYS available, and that we don't break them
  });

  it("should export the bootstrap factory as default", () => {
    expect(defaultVoltagent).toBe(internalVoltagent);
  });

  it("should export the bootstrap factory", () => {
    expect(voltagent).toBe(internalVoltagent);
  });

  it("should export canonical authoring factories without legacy aliases", () => {
    expect(defineAgent).toBeTypeOf("function");
    expect(defineTool).toBeTypeOf("function");
    expect(defineWorkflow).toBeTypeOf("function");
    expect(voltagent).toBeTypeOf("function");
    expect(publicApi).not.toHaveProperty("VoltAgent");
    expect(publicApi).not.toHaveProperty("defineVoltAgent");
    expect(publicApi).not.toHaveProperty("Agent");
    expect(publicApi).not.toHaveProperty("tool");
    expect(publicApi).not.toHaveProperty("createWorkflow");
  });
});
