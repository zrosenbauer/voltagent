import type { LLMProvider as BaseLLMProvider } from "@voltagent/core";

export type LLMProvider<TProvider> = BaseLLMProvider<TProvider>;

export type LLMProviderConfig<TProvider> = LLMProvider<TProvider>;
