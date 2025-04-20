import { Hono } from "hono";
import { cors } from "hono/cors";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import type { AgentHistoryEntry } from "../agent/history";
import { AgentEventEmitter } from "../events";
import { AgentRegistry } from "./registry";
import type { AgentResponse, ApiContext, ApiResponse } from "./types";
import {
  checkForUpdates,
  updateAllPackages,
  updateSinglePackage,
  type PackageUpdateInfo,
} from "../utils/update";

const app = new Hono();

// Nerdy landing page
app.get("/", (c) => {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Voltagent Core API</title>
        <style>
            body {
                background-color: #2a2a2a; /* Slightly lighter dark */
                color: #cccccc; /* Light gray text */
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                text-align: center;
            }
            .container {
                padding: 40px;
            }
            h1 {
                color: #eeeeee; /* Brighter heading */
                border-bottom: 1px solid #555555; /* Subtler border */
                padding-bottom: 10px;
                margin-bottom: 20px;
                font-weight: 500; /* Slightly lighter font weight */
            }
            p {
                font-size: 1.1em;
                margin-bottom: 30px;
                line-height: 1.6;
            }
            a {
                color: #64b5f6; /* Light blue link */
                text-decoration: none;
                font-weight: bold;
                border: 1px solid #64b5f6;
                padding: 10px 15px;
                border-radius: 4px;
                transition: background-color 0.2s, color 0.2s;
            }
            a:hover {
                background-color: #64b5f6;
                color: #2a2a2a;
            }
            .logo {
              font-size: 1.8em; /* Slightly smaller logo */
              font-weight: bold;
              margin-bottom: 30px;
              color: #eeeeee;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="logo">VoltAgent</div>
            <h1>API Running ⚡</h1>
            <p>Manage and monitor your agents via the Developer Console.</p>
            <a href="https://console.voltagent.dev" target="_blank" style="margin-bottom: 30px; display: inline-block;">Go to Developer Console</a>
            <div class="support-links" style="margin-top: 15px;">
              <p style="margin-bottom: 15px;">If you find VoltAgent useful, please consider giving us a <a href="http://github.com/voltAgent/voltagent" target="_blank" style="border: none; padding: 0; font-weight: bold; color: #64b5f6;"> star on GitHub ⭐</a>!</p>
              <p>Need support or want to connect with the community? Join our <a href="https://s.voltagent.dev/discord" target="_blank" style="border: none; padding: 0; font-weight: bold; color: #64b5f6;">Discord server</a>.</p>
            </div>
        </div>
        <script>
            console.log("%c⚡ VoltAgent Activated ⚡ %c", "color: #64b5f6; font-size: 1.5em; font-weight: bold;", "color: #cccccc; font-size: 1em;");
        </script>
    </body>
    </html>
  `;
  return c.html(html);
});

app.use("/*", cors());
// Store WebSocket connections for each agent
const agentConnections = new Map<string, Set<WebSocket>>();

// Get all agents
app.get("/agents", (c: ApiContext) => {
  const registry = AgentRegistry.getInstance();
  const agents = registry.getAllAgents();

  const response: ApiResponse<AgentResponse[]> = {
    success: true,
    data: agents.map((agent) => {
      const fullState = agent.getFullState();

      // Ensure subAgents conform to the AgentResponse type
      return {
        ...fullState,
        tools: agent.getToolsForApi(),
        subAgents:
          fullState.subAgents?.map((subAgent: any) => ({
            id: subAgent.id || "",
            name: subAgent.name || "",
            description: subAgent.description || "",
            status: subAgent.status || "idle",
            model: subAgent.model || "",
            tools: subAgent.tools || [],
            memory: subAgent.memory,
          })) || [],
      } as any;
    }),
  };

  return c.json(response);
});

// Get agent by ID
app.get("/agents/:id", (c: ApiContext) => {
  const id = c.req.param("id");
  const registry = AgentRegistry.getInstance();
  const agent = registry.getAgent(id);

  if (!agent) {
    const response: ApiResponse<null> = {
      success: false,
      error: "Agent not found",
    };
    return c.json(response, 404);
  }

  const response: ApiResponse<AgentResponse> = {
    success: true,
    data: {
      ...agent.getFullState(),
      tools: agent.getToolsForApi() as any,
    },
  };

  return c.json(response);
});

// Get agent count
app.get("/agents/count", (c: ApiContext) => {
  const registry = AgentRegistry.getInstance();
  const count = registry.getAgentCount();

  const response: ApiResponse<{ count: number }> = {
    success: true,
    data: { count },
  };

  return c.json(response);
});

// Get agent history
app.get("/agents/:id/history", async (c: ApiContext) => {
  const id = c.req.param("id");
  const registry = AgentRegistry.getInstance();
  const agent = registry.getAgent(id);

  if (!agent) {
    const response: ApiResponse<null> = {
      success: false,
      error: "Agent not found",
    };
    return c.json(response, 404);
  }

  const history = await agent.getHistory();

  const response: ApiResponse<AgentHistoryEntry[]> = {
    success: true,
    data: history,
  };

  return c.json(response);
});

// Enable CORS for all routes
app.use(
  "/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["Content-Length", "X-Kuma-Revision"],
    maxAge: 600,
    credentials: true,
  }),
);

// Generate text response
app.post("/agents/:id/text", async (c: ApiContext) => {
  const id = c.req.param("id");
  const registry = AgentRegistry.getInstance();
  const agent = registry.getAgent(id);

  if (!agent) {
    const response: ApiResponse<null> = {
      success: false,
      error: "Agent not found",
    };
    return c.json(response, 404);
  }

  try {
    const body = await c.req.json();
    const { input, options = {} } = body;

    const response = await agent.generateText(input, options);
    return c.json({ success: true, data: response });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate text",
      },
      500,
    );
  }
});

// Stream text response
app.post("/agents/:id/stream", async (c: ApiContext) => {
  const id = c.req.param("id");
  const registry = AgentRegistry.getInstance();
  const agent = registry.getAgent(id);

  if (!agent) {
    const response: ApiResponse<null> = {
      success: false,
      error: "Agent not found",
    };
    return c.json(response, 404);
  }

  try {
    const body = await c.req.json();
    const { input, options = {} } = body;

    // Create a ReadableStream
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const response = await agent.streamText(input, {
            ...options,
            userId: "1",
          });

          // Handle the stream
          for await (const chunk of response.textStream) {
            // Format the chunk as SSE data with additional metadata
            const data = {
              text: chunk,
              timestamp: new Date().toISOString(),
              type: "text",
            };
            const sseMessage = `data: ${JSON.stringify(data)}\n\n`;

            // Encode and send the message
            controller.enqueue(new TextEncoder().encode(sseMessage));
          }

          // Send completion message
          const completionData = {
            done: true,
            timestamp: new Date().toISOString(),
            type: "completion",
          };
          const completionMessage = `data: ${JSON.stringify(completionData)}\n\n`;
          controller.enqueue(new TextEncoder().encode(completionMessage));

          // Close the stream
          controller.close();
        } catch (error) {
          // Send error message
          const errorData = {
            error: error instanceof Error ? error.message : "Streaming failed",
            timestamp: new Date().toISOString(),
            type: "error",
          };
          const errorMessage = `data: ${JSON.stringify(errorData)}\n\n`;
          controller.enqueue(new TextEncoder().encode(errorMessage));
          controller.close();
        }
      },
    });

    // Return the stream with SSE headers
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to stream text",
      },
      500,
    );
  }
});

// Generate object response
app.post("/agents/:id/object", async (c: ApiContext) => {
  const id = c.req.param("id");
  const registry = AgentRegistry.getInstance();
  const agent = registry.getAgent(id);

  if (!agent) {
    const response: ApiResponse<null> = {
      success: false,
      error: "Agent not found",
    };
    return c.json(response, 404);
  }

  try {
    const body = await c.req.json();
    const { input, schema, options = {} } = body;

    const response = await agent.generateObject(input, schema, options);
    return c.json({ success: true, data: response });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate object",
      },
      500,
    );
  }
});

// Stream object response
app.post("/agents/:id/stream-object", async (c: ApiContext) => {
  const id = c.req.param("id");
  const registry = AgentRegistry.getInstance();
  const agent = registry.getAgent(id);

  if (!agent) {
    const response: ApiResponse<null> = {
      success: false,
      error: "Agent not found",
    };
    return c.json(response, 404);
  }

  try {
    const body = await c.req.json();
    const { input, schema, options = {} } = body;

    // Set up SSE headers
    c.header("Content-Type", "text/event-stream");
    c.header("Cache-Control", "no-cache");
    c.header("Connection", "keep-alive");

    // Create a stream from the agent's streamObject method
    const stream = await agent.streamObject(input, schema, options);

    // Return the stream
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to stream object",
      },
      500,
    );
  }
});

// Execute a tool directly
app.post("/agents/:id/tools/:toolName/execute", async (c: ApiContext) => {
  // Get agent ID and decode URI component to handle spaces and special characters
  const encodedId = c.req.param("id");
  const id = decodeURIComponent(encodedId);

  // Get and decode tool name
  const encodedToolName = c.req.param("toolName");
  const toolName = decodeURIComponent(encodedToolName);

  console.log(`[API] Execute tool request for agent: "${id}", tool: "${toolName}"`);

  const registry = AgentRegistry.getInstance();
  const agent = registry.getAgent(id);

  if (!agent) {
    console.log(`[API] Agent not found: "${id}"`);
    const response: ApiResponse<null> = {
      success: false,
      error: `Agent not found: ${id}`,
    };
    return c.json(response, 404);
  }

  try {
    const body = await c.req.json();
    const { params = {} } = body;

    // Find the tool in the agent's tools
    const tools = agent.getTools();
    const tool = tools.find((t) => t.name === toolName);

    if (!tool) {
      console.log(`[API] Tool not found: "${toolName}" for agent: "${id}"`);
      return c.json(
        {
          success: false,
          error: `Tool '${toolName}' not found for this agent`,
        },
        404,
      );
    }

    console.log(`[API] Executing tool "${toolName}" with params:`, params);

    // Execute the tool
    const result = await tool.execute(params);

    console.log(`[API] Tool "${toolName}" executed successfully`);
    return c.json({
      success: true,
      data: { result },
    });
  } catch (error) {
    console.error(`[API] Error executing tool "${toolName}":`, error);

    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to execute tool",
      },
      500,
    );
  }
});

// Check for updates
app.get("/updates", async (c: ApiContext) => {
  try {
    const updates = await checkForUpdates();

    // npm-check package directly provides the bump value (major, minor, patch)
    // We can use the data as is
    const response: ApiResponse<{
      hasUpdates: boolean;
      updates: PackageUpdateInfo[];
      count: number;
    }> = {
      success: true,
      data: {
        hasUpdates: updates.hasUpdates,
        updates: updates.updates as any,
        count: updates.count,
      },
    };

    return c.json(response);
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to check for updates",
      },
      500,
    );
  }
});

// Perform update for all packages
app.post("/updates", async (c: ApiContext) => {
  try {
    const result = await updateAllPackages();

    return c.json({
      success: result.success,
      data: {
        message: result.message,
        updatedPackages: result.updatedPackages || [],
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Failed to update all packages:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to perform update",
      },
      500,
    );
  }
});

// Update single package
app.post("/updates/:packageName", async (c: ApiContext) => {
  try {
    const packageName = c.req.param("packageName");

    const result = await updateSinglePackage(packageName);

    return c.json({
      success: result.success,
      data: {
        message: result.message,
        packageName: result.packageName,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Failed to update package:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update package",
      },
      500,
    );
  }
});

export { app as default };

// Create WebSocket server
export const createWebSocketServer = () => {
  const wss = new WebSocketServer({ noServer: true });

  // Subscribe to history updates
  AgentEventEmitter.getInstance().onHistoryUpdate((agentId, historyEntry) => {
    const connections = agentConnections.get(agentId);
    if (!connections) return;

    // Extract the sequence number added by the emitter
    const sequenceNumber = historyEntry._sequenceNumber || Date.now();

    const message = JSON.stringify({
      type: "HISTORY_UPDATE",
      success: true,
      sequenceNumber,
      data: historyEntry,
    });

    connections.forEach((ws) => {
      if (ws.readyState === 1) {
        // WebSocket.OPEN
        ws.send(message);
      }
    });
  });

  // Subscribe to new history entry created events
  AgentEventEmitter.getInstance().onHistoryEntryCreated((agentId, historyEntry) => {
    const connections = agentConnections.get(agentId);
    if (!connections) return;

    const message = JSON.stringify({
      type: "HISTORY_CREATED",
      success: true,
      data: historyEntry,
    });

    connections.forEach((ws) => {
      if (ws.readyState === 1) {
        // WebSocket.OPEN
        ws.send(message);
      }
    });
  });

  wss.on("connection", (ws, req) => {
    // Extract agent ID from URL - new URL structure /ws/agents/:id
    const url = new URL(req.url || "", "ws://localhost");
    const pathParts = url.pathname.split("/");

    if (url.pathname === "/ws") {
      // Send a test message when connection is established
      ws.send(
        JSON.stringify({
          type: "CONNECTION_TEST",
          success: true,
          data: {
            message: "WebSocket test connection successful",
            timestamp: new Date().toISOString(),
          },
        }),
      );

      ws.on("message", (message) => {
        try {
          const data = JSON.parse(message.toString());
          // Echo the message back
          ws.send(
            JSON.stringify({
              type: "ECHO",
              success: true,
              data,
            }),
          );
        } catch (error) {
          console.error("[WebSocket] Failed to parse message:", error);
        }
      });

      return;
    }

    // New URL structure: /ws/agents/:id
    // ["", "ws", "agents", ":id"]
    const agentId = pathParts.length >= 4 ? decodeURIComponent(pathParts[3]) : null;

    if (!agentId) {
      ws.close();
      return;
    }

    // Add connection to the agent's connection set
    if (!agentConnections.has(agentId)) {
      agentConnections.set(agentId, new Set());
    }
    agentConnections.get(agentId)?.add(ws);

    // Get agent and send initial full state
    const agent = AgentRegistry.getInstance().getAgent(agentId);
    if (agent) {
      // Get history
      const history = agent.getHistory();

      if (history && history.length > 0) {
        // Send all history entries in one message
        ws.send(
          JSON.stringify({
            type: "HISTORY_LIST",
            success: true,
            data: history,
          }),
        );

        // Also check if there's an active history entry and send it individually
        const activeHistory = history.find(
          (entry) => entry.status !== "completed" && entry.status !== "error",
        );

        if (activeHistory) {
          ws.send(
            JSON.stringify({
              type: "HISTORY_UPDATE",
              success: true,
              data: activeHistory,
            }),
          );
        }
      }
    }

    ws.on("close", () => {
      // Remove connection from the agent's connection set
      agentConnections.get(agentId)?.delete(ws);
      if (agentConnections.get(agentId)?.size === 0) {
        agentConnections.delete(agentId);
      }
    });

    ws.on("error", (error) => {
      console.error("[WebSocket] Error:", error);
    });
  });

  return wss;
};
