import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";

const repo = resolve(import.meta.dirname, "..");
const core = join(repo, "packages/core");
const version = process.argv[2] ?? "7";
if (!/^7(?:\.\d+\.\d+)?$/.test(version)) {
  throw new Error(
    "Expected an AI SDK 7 version (for example 7.0.0) or 7 for the latest compatible release",
  );
}
let temporary;
const run = (command, args, env = process.env) => {
  const result = spawnSync(command, args, { cwd: repo, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.signal ?? result.status})`);
};
const diagnosticsHost = {
  getCanonicalFileName: (path) => path,
  getCurrentDirectory: () => repo,
  getNewLine: () => "\n",
};
const checkTypes = (files, options) => {
  const program = ts.createProgram(files, options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) {
    process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, diagnosticsHost));
    throw new Error("AI SDK compatibility typecheck failed");
  }
};

try {
  let sdkModules = process.env.VOLTAGENT_AI_SDK_NODE_MODULES;
  if (!sdkModules) {
    temporary = mkdtempSync(join(tmpdir(), "voltagent-ai-sdk-compat-"));
    writeFileSync(join(temporary, "package.json"), '{"private":true,"type":"module"}\n');
    run(process.platform === "win32" ? "npm.cmd" : "npm", [
      "install",
      "--prefix",
      temporary,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      `ai@${version}`,
      "zod@^4",
    ]);
    sdkModules = join(temporary, "node_modules");
  }
  const sdk = createRequire(resolve(sdkModules, "../package.json"));
  const installed = JSON.parse(readFileSync(sdk.resolve("ai/package.json"), "utf8")).version;
  if (!installed.startsWith("7.") || (version !== "7" && version !== installed)) {
    throw new Error(`Expected ai@${version}, found ai@${installed}`);
  }
  console.log(
    `Checking AI SDK ${installed}: runtime contracts, source types, published declarations`,
  );
  run(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["exec", "vitest", "run", "--config", "packages/core/vitest.ai-sdk.config.mts"],
    { ...process.env, VOLTAGENT_AI_SDK_NODE_MODULES: sdkModules },
  );

  const paths = Object.fromEntries(
    ["ai", "ai/test", "@ai-sdk/provider-utils", "@ai-sdk/provider"].map((name) => [
      name,
      [join(dirname(sdk.resolve(name)), "index.d.ts")],
    ]),
  );
  const configPath = join(core, "tsconfig.json");
  const rawConfig = ts.readConfigFile(configPath, ts.sys.readFile);
  if (rawConfig.error)
    throw new Error(ts.flattenDiagnosticMessageText(rawConfig.error.messageText, "\n"));
  const config = ts.parseJsonConfigFileContent(rawConfig.config, ts.sys, core, {
    noEmit: true,
    baseUrl: repo,
    paths,
  });
  if (config.errors.length)
    throw new Error(ts.formatDiagnosticsWithColorAndContext(config.errors, diagnosticsHost));
  checkTypes(config.fileNames, config.options);
  checkTypes([join(core, "compatibility/consumer.ts")], { ...config.options, rootDir: core });
  console.log(`AI SDK ${installed} compatibility checks passed`);
} finally {
  if (temporary) rmSync(temporary, { recursive: true, force: true });
}
