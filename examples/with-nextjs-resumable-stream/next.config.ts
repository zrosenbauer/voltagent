import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";

// Support both the repository workspace and a standalone copy of this example.
const workspaceRoot = existsSync(resolve(__dirname, "../../pnpm-workspace.yaml"))
  ? resolve(__dirname, "../..")
  : __dirname;

const nextConfig: NextConfig = {
  outputFileTracingRoot: workspaceRoot,
  turbopack: { root: workspaceRoot },
  // Load the server runtime with Node.js so native storage and logger workers
  // are not bundled into the Next.js route.
  serverExternalPackages: [
    "@voltagent/core",
    "@voltagent/libsql",
    "@voltagent/logger",
    "@libsql/client",
    "libsql",
  ],
};

export default nextConfig;
