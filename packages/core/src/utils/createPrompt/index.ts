/**
 * Prompt management utilities for agent prompt tuning
 */

/**
 * Type for prompt template variables
 */
export type PromptVariables = Record<string, string | number | boolean | undefined>;

/**
 * Type for prompt template definition
 */
export type PromptTemplate = {
  template: string;
  variables?: PromptVariables;
};

/**
 * Creates a customizable prompt from a template with variable placeholders
 *
 * @param options - Template configuration with default variables
 * @returns Function that generates the prompt with provided variables
 */
export const createPrompt = (options: PromptTemplate) => {
  const { template, variables: defaultVariables = {} } = options;

  /**
   * Generate a prompt with given variables merged with defaults
   *
   * @param customVariables - Custom variables to override defaults
   * @returns The processed prompt string with variables inserted
   */
  return (customVariables: PromptVariables = {}): string => {
    const mergedVariables = { ...defaultVariables, ...customVariables };

    return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
      const trimmedKey = key.trim();
      return mergedVariables[trimmedKey]?.toString() || "";
    });
  };
};
