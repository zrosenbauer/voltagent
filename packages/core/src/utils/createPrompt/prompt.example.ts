import { createPrompt } from "./index";

// Example 1: Basic prompt template
const basicPrompt = createPrompt({
  template: `You are a helpful assistant that {{role}}.
Task: {{task}}`,
  variables: { role: "simplifies complex topics", task: "" },
});

// Generate prompt with default variables
const prompt1 = basicPrompt();
console.log("Basic prompt with defaults:");
console.log(prompt1);

// Generate prompt with custom variables
const prompt2 = basicPrompt({ task: "Explain quantum computing to a 10-year-old" });
console.log("\nPrompt with custom task:");
console.log(prompt2);

// Example 2: More complex template with system and user messages
const chatPrompt = createPrompt({
  template: `System: {{system}}
User: {{userMessage}}
Assistant:`,
  variables: {
    system: "You are a knowledgeable AI assistant",
    userMessage: "",
  },
});

const customerServicePrompt = chatPrompt({
  system: "You are a customer service representative for a tech company",
  userMessage: "My device is not turning on. What should I do?",
});

console.log("\nCustomer service prompt:");
console.log(customerServicePrompt);

// Example 3: Agent prompt with dynamic context
const agentPrompt = createPrompt({
  template: `You are an AI agent with the following capabilities: {{capabilities}}.
Your current goal is: {{goal}}
Available context: {{context}}
Task: {{task}}`,
  variables: {
    capabilities: "web search, code execution, API access",
    goal: "",
    context: "",
    task: "",
  },
});

console.log("\nAgent prompt:");
console.log(
  agentPrompt({
    goal: "Help the user solve a programming problem",
    context: "User is working with Node.js and Express",
    task: "Debug an error in a REST API endpoint",
  }),
);
