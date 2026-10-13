import type { ToolExecuteOptions } from "@voltagent/core";
import type { Page } from "playwright";
import {
  ensureBrowser,
  resetBrowserState as resetBrowserStateInternal,
} from "./playwrightToolHandler.js";

/**
 * Safe browser operation function to handle errors consistently across all browser tools
 * This wraps operations with proper error handling and browser initialization using ToolExecuteOptions.
 */
export async function safeBrowserOperation<T>(
  oc: ToolExecuteOptions,
  operation: (page: Page) => Promise<T>,
): Promise<T> {
  try {
    const { page } = await ensureBrowser(oc);
    return await operation(page);
  } catch (error) {
    const opId = oc?.operationId || "unknown";
    console.error(`[${opId}] Browser operation failed:`, error);
    throw error;
  }
}

/**
 * Export the resetBrowserState function that now requires ToolExecuteOptions.
 * Note: Tools calling this directly will need access to the context.
 */
export const resetBrowserState = async (context: ToolExecuteOptions): Promise<void> => {
  await resetBrowserStateInternal(context);
};
