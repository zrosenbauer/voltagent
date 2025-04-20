import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  splitting: false,
  sourcemap: true,
  clean: true,
  target: "es2020",
  outDir: "dist",
  minify: false,
  dts: true,
});
