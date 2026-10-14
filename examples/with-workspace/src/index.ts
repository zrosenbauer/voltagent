import path from "node:path";
import {
  InMemoryVectorAdapter,
  LocalSandbox,
  Memory,
  NodeFilesystemBackend,
  Workspace,
  defineAgent,
  voltagent,
} from "@voltagent/core";
import { LibSQLMemoryAdapter, LibSQLVectorAdapter } from "@voltagent/libsql";
import { createPinoLogger } from "@voltagent/logger";
import { honoServer } from "@voltagent/server-hono";

// Create logger
const logger = createPinoLogger({
  name: "with-workspace",
  level: "info",
});

// Create Memory instance with vector support for semantic search and working memory
const memory = new Memory({
  storage: new LibSQLMemoryAdapter(),
  embedding: "openai/text-embedding-3-small",
  vector: new LibSQLVectorAdapter(),
  generateTitle: true,
});

const workspaceRoot = path.resolve(process.cwd(), "workspace");

const workspace = new Workspace({
  id: "workspace-example",
  name: "Workspace Playwright Example",
  filesystem: {
    backend: new NodeFilesystemBackend({
      rootDir: workspaceRoot,
      virtualMode: true,
    }),
  },
  sandbox: new LocalSandbox({
    rootDir: workspaceRoot,
  }),
  search: {
    autoIndexPaths: [{ path: "/", glob: "**/*.{md,txt,csv}" }],
    embedding: "openai/text-embedding-3-small",
    vector: new InMemoryVectorAdapter(),
  },
  skills: {
    rootPaths: ["/skills"],
  },
});

const agent = defineAgent({
  name: "Workspace Playwright Agent",
  instructions: ["You are a helpful browser automation assistant."].join(" "),
  model: "openai/gpt-4o-mini",
  memory,
  workspace,
  workspaceSkillsPrompt: {
    includeAvailable: true,
    includeActivated: true,
  },
});

await voltagent({
  agents: { agent },
  server: honoServer(),
  logger,
}).ready();
