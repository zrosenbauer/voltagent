/**
 * Event statuses
 */
export type EventStatus = "idle" | "working" | "completed" | "error";

/**
 * Standard event data interface
 */
export interface StandardEventData {
  // ID indicating which node is affected
  affectedNodeId: string;

  // Event status
  status: EventStatus;

  // Timestamp
  timestamp: string;

  // Input data - to be used consistently for all event types
  input?: any;

  // Output data - to be used consistently for all event types
  output?: any;

  // In case of error
  error?: any;

  // Error message (user-friendly message)
  errorMessage?: string;

  // For tool-specific additional information and other custom information
  metadata?: Record<string, any>;
}

/**
 * Standard timeline event
 */
export interface StandardTimelineEvent {
  id: string;
  timestamp: Date;
  name: string;
  data: StandardEventData;
  agentId: string;
  historyId: string;
}
