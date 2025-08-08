import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemoryOptions } from "@voltagent/core";

/**
 * Workflow statistics interface
 */
export interface WorkflowStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  lastExecutionTime?: Date;
}

export interface SupabaseMemoryOptions extends MemoryOptions {
  /**
   * The URL of the Supabase instance
   *
   */
  supabaseUrl?: string;
  supabaseKey?: string;
  client?: SupabaseClient;

  /**
   * The base table name for the memory, use to customize the prefix appended to all the tables
   *
   * @example
   *  'my_app_memory' => 'my_app_memory_conversations', 'my_app_memory_messages', 'my_app_memory_steps', 'my_app_memory_events'
   *
   * @default "voltagent_memory"
   */
  tableName?: string; // Base table name, defaults to "voltagent_memory"

  /**
   * Whether to enable debug logging
   */
  debug?: boolean; // Whether to enable debug logging, defaults to false
}
