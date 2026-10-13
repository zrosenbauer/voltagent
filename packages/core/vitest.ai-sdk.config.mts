import { createRequire } from "node:module";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const sdkModules = process.env.VOLTAGENT_AI_SDK_NODE_MODULES;
if (!sdkModules)
  throw new Error("Run scripts/test-ai-sdk-compatibility.mjs to select an AI SDK version");
const sdk = createRequire(resolve(sdkModules, "../package.json"));

export default defineConfig({
  root: import.meta.dirname,
  resolve: {
    alias: [
      { find: /^ai\/test$/, replacement: sdk.resolve("ai/test") },
      { find: /^ai$/, replacement: sdk.resolve("ai") },
      { find: /^@ai-sdk\/provider-utils$/, replacement: sdk.resolve("@ai-sdk/provider-utils") },
      { find: /^@ai-sdk\/provider$/, replacement: sdk.resolve("@ai-sdk/provider") },
    ],
  },
  test: {
    globals: true,
    environment: "node",
    testTimeout: 10000,
    include: [
      "src/agent/call-boundary.spec.ts",
      "src/agent/context.spec.ts",
      "src/agent/generate-result.spec.ts",
      "src/agent/stream-result.spec.ts",
      "src/agent/native-tool-execution.spec.ts",
      "src/agent/model-retry.spec.ts",
      "src/tool/ai-sdk-tool.spec.ts",
    ],
  },
});
