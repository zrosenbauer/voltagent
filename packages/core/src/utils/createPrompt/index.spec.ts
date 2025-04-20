import { createPrompt, type PromptTemplate, type PromptVariables } from "./index";

describe("createPrompt", () => {
  it("should create a prompt with default variables", () => {
    const options: PromptTemplate = {
      template: "Hello, {{name}}! Your role is {{role}}.",
      variables: { name: "World", role: "tester" },
    };
    const prompt = createPrompt(options);
    expect(prompt()).toBe("Hello, World! Your role is tester.");
  });

  it("should override default variables with custom variables", () => {
    const options: PromptTemplate = {
      template: "Hello, {{name}}! Your role is {{role}}.",
      variables: { name: "World", role: "tester" },
    };
    const prompt = createPrompt(options);
    const customVariables: PromptVariables = { name: "Developer" };
    expect(prompt(customVariables)).toBe("Hello, Developer! Your role is tester.");
  });

  it("should handle custom variables when no defaults are provided", () => {
    const options: PromptTemplate = {
      template: "Task: {{task}}, Status: {{status}}",
    };
    const prompt = createPrompt(options);
    const customVariables: PromptVariables = { task: "Coding", status: "In Progress" };
    expect(prompt(customVariables)).toBe("Task: Coding, Status: In Progress");
  });

  it("should handle missing variables by replacing with an empty string", () => {
    const options: PromptTemplate = {
      template: "Hello, {{name}}! Age: {{age}}",
      variables: { name: "Test" },
    };
    const prompt = createPrompt(options);
    expect(prompt()).toBe("Hello, Test! Age: ");
  });

  it("should handle variables of different types (number, boolean)", () => {
    const options: PromptTemplate = {
      template: "Value: {{val}}, Active: {{isActive}}",
    };
    const prompt = createPrompt(options);
    const customVariables: PromptVariables = { val: 123, isActive: true };
    expect(prompt(customVariables)).toBe("Value: 123, Active: true");
  });

  it("should return the template string if no variables are present", () => {
    const options: PromptTemplate = {
      template: "This is a static template.",
    };
    const prompt = createPrompt(options);
    expect(prompt()).toBe("This is a static template.");
  });

  it("should handle templates with no variables even if variables are provided", () => {
    const options: PromptTemplate = {
      template: "Static text.",
      variables: { unused: "value" },
    };
    const prompt = createPrompt(options);
    expect(prompt({ another: "ignored" })).toBe("Static text.");
  });

  it("should handle empty template string", () => {
    const options: PromptTemplate = {
      template: "",
      variables: { key: "value" },
    };
    const prompt = createPrompt(options);
    expect(prompt()).toBe("");
  });

  it("should handle multiple occurrences of the same variable", () => {
    const options: PromptTemplate = {
      template: "{{thing}} is {{thing}}.",
      variables: { thing: "Good" },
    };
    const prompt = createPrompt(options);
    expect(prompt()).toBe("Good is Good.");
  });

  it("should trim whitespace within variable placeholders", () => {
    const options: PromptTemplate = {
      template: "Value is {{  myVar  }}.",
      variables: { myVar: "42" },
    };
    const prompt = createPrompt(options);
    expect(prompt()).toBe("Value is 42.");
  });

  it("should handle undefined and null values in variables gracefully (as empty strings)", () => {
    const options: PromptTemplate = {
      template: "Name: {{name}}, Role: {{role}}",
    };
    const prompt = createPrompt(options);
    // @ts-expect-error Testing potentially undefined values
    const customVariables: PromptVariables = { name: undefined, role: null };
    expect(prompt(customVariables)).toBe("Name: , Role: ");
  });
});
