import { devLogger } from "@voltagent/internal/dev";
import { isFunction } from "@voltagent/internal/utils";
import type { LLMProvider, LLMProviderConfig } from "../types";

/**
 * Creates a provider for VoltAgent.
 *
 * @example
 * ```typescript
 * const provider = createProvider({
 *   async generateText(options) {
 *     return provider.generateText(options);
 *   },
 *   async streamText(options) {
 *     return provider.generateText(options);
 *   },
 *   async generateObject(options) {
 *     return provider.generateText(options);
 *   },
 *   async streamObject(options) {
 *     // You can also force throw and error to indicate that the provider does not support streaming objects
 *     throw new Error("Not implemented");
 *   },
 *   toMessage(message) {
 *     return message;
 *   },
 *   toTool(tool) {
 *     return tool;
 *   },
 *   getModelIdentifier(model) {
 *     return model.id;
 *   },
 * });
 * ```
 * @param config - The provider config.
 * @returns The VoltAgent provider.
 */
export function createProvider<TProvider>(
  config: LLMProviderConfig<TProvider>,
): LLMProvider<TProvider> {
  assertValidProviderConfig(config);
  return {
    ...config,
  };
}

/**
 * Asserts that the provider config is valid.
 * @param config - The provider config.
 * @throws {Error} If the provider config is invalid.
 */
function assertValidProviderConfig<TProvider>(config: LLMProviderConfig<TProvider>) {
  if (!isFunction(config.generateText)) {
    throw new Error("generateText is required");
  }
  if (!isFunction(config.streamText)) {
    throw new Error("streamText is required");
  }
  if (!isFunction(config.generateObject)) {
    throw new Error("generateObject is required");
  }
  if (!isFunction(config.streamObject)) {
    throw new Error("streamObject is required");
  }
  if (!isFunction(config.toMessage)) {
    throw new Error("toMessage is required");
  }
  if (!isFunction(config.toTool)) {
    devLogger.warn(
      "toTool is not implemented, tools will not be converted to provider-specific tools",
    );
  }
  if (!isFunction(config.getModelIdentifier)) {
    throw new Error("getModelIdentifier is required");
  }
}
