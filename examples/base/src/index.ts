import { openai } from "@ai-sdk/openai";
import { Agent, Memory, VoltAgent, VoltAgentObservability } from "@voltagent/core";
import { createPinoLogger } from "@voltagent/logger";
import { honoServer } from "@voltagent/server-hono";
import { z } from "zod";

// Import Memory and TelemetryStore from core
import { AiSdkEmbeddingAdapter, InMemoryVectorAdapter } from "@voltagent/core";
import { LibSQLMemoryAdapter, LibSQLVectorAdapter } from "@voltagent/libsql";

// Create logger
const logger = createPinoLogger({
  name: "base",
  level: "info",
});

// Define working memory schema for structured context
const workingMemorySchema = z.object({
  userPreferences: z.object({
    favoriteThings: z.array(z.string()).optional(),
    communicationStyle: z.enum(["casual", "formal", "technical"]).optional(),
    interests: z.array(z.string()).optional(),
  }),
  context: z.object({
    currentProject: z.string().optional(),
    goals: z.array(z.string()).optional(),
    importantNotes: z.array(z.string()).optional(),
  }),
});

// Create Memory instance with vector support for semantic search and working memory
const memory = new Memory({
  storage: new LibSQLMemoryAdapter({
    storageLimit: 100, // Keep last 100 messages per conversation
  }),
  embedding: new AiSdkEmbeddingAdapter(openai.embedding("text-embedding-3-small")),
  vector: new LibSQLVectorAdapter(),
  enableCache: true,
  workingMemory: {
    enabled: true,
    scope: "conversation", // Store working memory per conversation
    schema: workingMemorySchema, // Use structured JSON format
  },
});

const agent = new Agent({
  name: "Base Agent",
  instructions: "You are a helpful assistant",
  model: openai("gpt-4o-mini"),
  memory: memory,
});

new VoltAgent({
  agents: { agent },
  server: honoServer(),
  logger,
  observability: new VoltAgentObservability(),
});

(async () => {
  /* const response = await agent.generateText("Hello, how are you?", {
		userId: "user-1",
		conversationId: "conv-1",
	}); */

  const conversations = await memory.getConversationsByUserId("user-1");
  console.log(conversations);

  const messages = await memory.getMessages("user-1", "conv-1");
  console.log(JSON.stringify(messages, null, 2));
})();
