import type { LanguageModelV1CallOptions } from "ai";

export type VercelProviderOptions = Omit<
  LanguageModelV1CallOptions,
  "messages" | "model" | "tools" | "maxSteps" | "schema"
>;
