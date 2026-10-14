import { defineAgent, defineTool } from "@voltagent/core";
import { z } from "zod";

// Tools definitions - those without execute are automatically client-side
const tools = {
  // Client-side automatic defineTool (no execute function)
  getLocation: defineTool({
    description: "Get the user's current location",
    inputSchema: z.object({}),
  }),

  // Client-side interactive tool
  readClipboard: defineTool({
    description: "Read the content from the user's clipboard (requires permission)",
    inputSchema: z.object({}),
  }),

  // Server-side defineTool (has execute function)
  getWeather: defineTool({
    description: "Get current weather for a city",
    inputSchema: z.object({
      city: z.string().describe("City name"),
    }),
    execute: async ({ city }) => {
      // Simulate weather API
      const temperature = Math.floor(Math.random() * 30) + 10;
      return {
        temperature: `${temperature}°C`,
        condition: "sunny",
        city,
      };
    },
  }),
};

export const agent = defineAgent({
  id: "assistant",
  name: "Assistant",
  instructions: "You are a helpful assistant that demonstrates client-side tools in VoltAgent.",
  model: "openai/gpt-4o-mini",
  tools,
});
