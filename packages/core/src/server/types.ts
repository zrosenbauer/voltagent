import type { Context } from "hono";
import type { AgentHistoryEntry } from "../agent/history";
import type { AgentStatus } from "../agent/types";
import type { ToolStatusInfo as CoreToolStatusInfo, ToolStatus } from "../tool";

export type ApiContext = Context;

export type ToolStatusInfo = CoreToolStatusInfo;

export type AgentResponse = {
  id: string;
  name: string;
  description: string;
  status: AgentStatus;
  model: string;
  tools: ToolStatusInfo[];
  memory?: Record<string, any>;
  subAgents:
    | Record<string, any>[]
    | {
        id: string;
        name: string;
        description: string;
        status: AgentStatus;
        model: string;
        tools?: ToolStatusInfo[];
        memory?: Record<string, any>;
      }[];
};

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};
