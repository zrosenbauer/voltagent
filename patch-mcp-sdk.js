#!/usr/bin/env node

/**
 * This script fixes the MCP SDK issue with pkce-challenge ES Module
 * It replaces the static require with a dynamic import in the auth.js file
 */

const fs = require("node:fs");
const path = require("node:path");

// For PNPM package structure
const findAuthFiles = () => {
  // Try various paths - regular npm/yarn path and pnpm paths
  const possiblePaths = [
    // Standard path
    path.resolve(
      __dirname,
      "node_modules",
      "@modelcontextprotocol",
      "sdk",
      "dist",
      "cjs",
      "client",
      "auth.js",
    ),
    // PNPM path with version 1.8.0
    path.resolve(
      __dirname,
      "node_modules",
      ".pnpm",
      "@modelcontextprotocol+sdk@1.8.0",
      "node_modules",
      "@modelcontextprotocol",
      "sdk",
      "dist",
      "cjs",
      "client",
      "auth.js",
    ),
    // PNPM path with version 1.7.0
    path.resolve(
      __dirname,
      "node_modules",
      ".pnpm",
      "@modelcontextprotocol+sdk@1.7.0",
      "node_modules",
      "@modelcontextprotocol",
      "sdk",
      "dist",
      "cjs",
      "client",
      "auth.js",
    ),
  ];

  const foundFiles = [];
  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      foundFiles.push(filePath);
    }
  }

  return foundFiles;
};

console.log("Checking if MCP SDK patch is needed...");

// Find all auth.js files
const authFilePaths = findAuthFiles();

if (authFilePaths.length === 0) {
  console.error("Error: Could not find auth.js file in any @modelcontextprotocol/sdk package");
  console.log("Make sure you have installed @modelcontextprotocol/sdk package");
  process.exit(1);
}

console.log(`Found ${authFilePaths.length} auth.js files to patch`);

let patchCount = 0;

// Apply patch to each file
for (const authFilePath of authFilePaths) {
  console.log(`\nProcessing: ${authFilePath}`);

  // Read the file content
  const fileContent = fs.readFileSync(authFilePath, "utf8");

  // Check if the file already contains our patch
  if (fileContent.includes("loadPkceChallenge")) {
    console.log("  ⚠️ File is already patched, skipping");
    continue;
  }

  // Check if the file contains the problematic require
  if (!fileContent.includes('require("pkce-challenge")')) {
    console.log("  ⚠️ File does not contain the expected require statement, skipping");
    continue;
  }

  console.log("  🔄 Applying patch...");

  // The code to replace the problematic require
  const requireLine = 'const pkce_challenge_1 = __importDefault(require("pkce-challenge"));';
  const replacementCode = `let pkce_challenge_1 = { default: null };
async function loadPkceChallenge() {
  if (!pkce_challenge_1.default) {
    const mod = await import("pkce-challenge");
    pkce_challenge_1.default = mod.default;
  }
}`;

  // Replace the require line
  let patchedContent = fileContent.replace(requireLine, replacementCode);

  // Replace the function call to add the loading step
  const challengeCall = "const challenge = await (0, pkce_challenge_1.default)();";
  const replacementCall =
    "await loadPkceChallenge();\n    const challenge = await pkce_challenge_1.default();";
  patchedContent = patchedContent.replace(challengeCall, replacementCall);

  // Write the patched content back to the file
  fs.writeFileSync(authFilePath, patchedContent, "utf8");
  console.log("  ✅ Patched successfully");
  patchCount++;
}

if (patchCount > 0) {
  console.log(`\n✅ Successfully patched ${patchCount} files`);
  console.log("Patch changes:");
  console.log("1. Replaced static require with dynamic import for pkce-challenge");
  console.log("2. Added async loading function to handle the import");
  console.log("\nYou should now be able to run the application without ESM errors.");
} else {
  console.log(
    "\n⚠️ No files were patched. Either they were already patched or did not need patching.",
  );
}
