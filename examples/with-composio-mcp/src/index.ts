import { MCPConfiguration, Memory, defineAgent, voltagent } from "@voltagent/core";
import { LibSQLMemoryAdapter } from "@voltagent/libsql";
import { createPinoLogger } from "@voltagent/logger";
import { honoServer } from "@voltagent/server-hono";

(async () => {
  try {
    const logger = createPinoLogger({
      name: "with-composio-mcp",
      level: "info",
    });

    const mcpConfig = new MCPConfiguration({
      servers: {
        composio: {
          type: "http",
          url: "https://mcp.composio.dev/composio/server/YOUR-SERVER-ID",
        },
      },
    });

    const agent = defineAgent({
      name: "Composio MCP Agent",
      instructions: "A helpful assistant using a lightweight provider",
      tools: await mcpConfig.getTools(),
      model: "openai/gpt-4o-mini",
      memory: new Memory({
        storage: new LibSQLMemoryAdapter({
          url: "file:./.voltagent/memory.db",
        }),
      }),
    });

    await voltagent({
      agents: {
        agent,
      },
      logger,
      server: honoServer({ port: 3141 }),
    }).ready();
  } catch (error) {
    console.error("Failed to initialize VoltAgent:", error);
  }
})();
