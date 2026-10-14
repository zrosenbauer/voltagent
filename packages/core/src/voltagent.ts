import type { Logger } from "@voltagent/internal";
import type { A2AServerDeps, A2AServerFactory, A2AServerLike } from "@voltagent/internal/a2a";
import type { MCPServerDeps, MCPServerFactory, MCPServerLike } from "@voltagent/internal/mcp";
import type { DangerouslyAllowAny } from "@voltagent/internal/types";
import { NoOutputGeneratedError } from "ai";
import { A2AServerRegistry } from "./a2a";
import type { Agent } from "./agent/agent";
import { isVoltAgentError } from "./agent/errors";
import type { AgentConversationPersistenceOptions } from "./agent/types";
import { getGlobalLogger } from "./logger";
import { MCPServerRegistry } from "./mcp";
import type { Memory } from "./memory";
import {
  ServerlessVoltAgentObservability,
  type VoltAgentObservability,
  createVoltAgentObservability,
} from "./observability";
import { AgentRegistry } from "./registries/agent-registry";
import { TriggerRegistry } from "./triggers/registry";
import type { VoltAgentTriggerConfig, VoltAgentTriggersConfig } from "./triggers/types";
import type { IServerProvider, IServerlessProvider, VoltAgentOptions } from "./types";
import { isServerlessRuntime } from "./utils/runtime";
import { isValidVoltOpsKeys } from "./utils/voltops-validation";
import { VoltOpsClient } from "./voltops/client";
import type { Workflow } from "./workflow";
import type { WorkflowChain } from "./workflow/chain";
import { WorkflowRegistry } from "./workflow/registry";
import { Workspace } from "./workspace";

/**
 * Main VoltAgent class for managing agents and server
 */
export class VoltAgent {
  private registry: AgentRegistry;
  private workflowRegistry: WorkflowRegistry;
  private serverInstance?: IServerProvider;
  private serverlessProvider?: IServerlessProvider;
  private logger: Logger;
  private observability?: VoltAgentObservability;
  private defaultAgentMemory?: Memory;
  private defaultWorkflowMemory?: Memory;
  private readonly defaultAgentConversationPersistence?: AgentConversationPersistenceOptions;
  private readonly mcpServers = new Set<MCPServerLike>();
  private readonly mcpServerRegistry = new MCPServerRegistry();
  private readonly a2aServers = new Set<A2AServerLike>();
  private readonly a2aServerRegistry = new A2AServerRegistry();
  private readonly ensureEnvironmentBinding: (env?: Record<string, unknown>) => void;
  private readonly triggerRegistry: TriggerRegistry;
  private readonly agentRefs: Record<string, Agent>;
  private lastServerlessRemoteConfig?: {
    tracesUrl: string;
    logsUrl: string;
    headers: Record<string, string>;
  };
  private readyPromise?: Promise<void>;
  private shutdownPromise?: Promise<void>;
  private cleanupPromise?: Promise<void>;
  private telemetryShutdownPromise?: Promise<void>;
  private lifecycle: "created" | "starting" | "ready" | "stopping" | "stopped" | "failed" =
    "created";
  private workspace?: Workspace;
  private workspaceStarted = false;
  private removeShutdownHandlers?: () => void;
  public initError?: unknown;
  public degraded = false;
  constructor(private readonly options: VoltAgentOptions) {
    this.registry = AgentRegistry.getInstance();
    this.workflowRegistry = WorkflowRegistry.getInstance();
    this.triggerRegistry = TriggerRegistry.getInstance();
    this.ensureEnvironmentBinding = () => {
      this.ensureEnvironment();
    };
    this.agentRefs = options.agents ?? {};
    this.defaultAgentMemory = options.agentMemory ?? options.memory;
    this.defaultWorkflowMemory = options.workflowMemory ?? options.memory;
    this.defaultAgentConversationPersistence = options.agentConversationPersistence;
    if (options.memory) {
      this.registry.setGlobalMemory(options.memory);
    }
    if (options.agentMemory) {
      this.registry.setGlobalAgentMemory(options.agentMemory);
    }
    if (options.workflowMemory) {
      this.registry.setGlobalWorkflowMemory(options.workflowMemory);
    }
    if (options.toolRouting) {
      this.registry.setGlobalToolRouting(options.toolRouting);
    }
    if (options.workspace) {
      const workspaceInstance =
        options.workspace instanceof Workspace
          ? options.workspace
          : new Workspace(options.workspace);
      this.registry.setGlobalWorkspace(workspaceInstance);
      this.applyDefaultWorkspaceToAgents(options.agents);
      this.workspace = workspaceInstance;
    }

    // Initialize logger
    const logger = (options.logger || getGlobalLogger()).child({ component: "voltagent" });
    this.logger = logger;

    // Handle unified VoltOps client before observability so factories can reuse it
    if (options.voltOpsClient) {
      this.registry.setGlobalVoltOpsClient(options.voltOpsClient);

      // Note: VoltAgentObservability already handles OpenTelemetry initialization when provided
    }

    // Handle global logger
    if (options.logger) {
      this.registry.setGlobalLogger(options.logger);
      // Buffer management is now handled by LoggerProxy/BufferedLogger
    }

    this.registerAgents(options.agents);
    this.registerTriggers(options.triggers);
    if (options.workflows) {
      this.registerWorkflows(options.workflows);
    }
  }

  /** Starts configured resources once and waits until the application is ready. */
  public ready(): Promise<void> {
    if (this.lifecycle === "stopping" || this.lifecycle === "stopped") {
      return Promise.reject(new Error("Cannot start a shut down VoltAgent application"));
    }
    if (!this.readyPromise) {
      this.lifecycle = "starting";
      this.readyPromise = Promise.resolve().then(async () => {
        try {
          await this.initialize();
          if (this.lifecycle === "starting") {
            this.lifecycle = "ready";
          }
        } catch (error) {
          this.initError = error;
          this.degraded = true;
          if (this.lifecycle === "starting") {
            this.lifecycle = "failed";
          }
          try {
            await this.cleanup();
          } catch (cleanupError) {
            throw new AggregateError(
              [error, cleanupError],
              "Application startup and cleanup failed",
            );
          }
          throw error;
        }
      });
    }
    return this.readyPromise;
  }

  private async initialize(): Promise<void> {
    const options = this.options;
    this.workspaceStarted = Boolean(this.workspace);
    await this.workspace?.init();
    this.autoConfigureVoltOpsClientFromEnv();
    const observabilityOption = options.observability;
    this.observability = observabilityOption
      ? observabilityOption
      : createVoltAgentObservability({
          serviceName: "voltagent",
        });

    if (this.observability) {
      // Set global observability in registry for all agents to use
      this.registry.setGlobalObservability(this.observability);
    }

    // Ensure any existing environment variables are reflected in runtime configuration
    this.ensureEnvironment();

    // Setup graceful shutdown handlers
    this.setupShutdownHandlers();

    // Handle server provider if provided
    if (options.server) {
      this.serverInstance = options.server({
        agentRegistry: this.registry,
        workflowRegistry: this.workflowRegistry,
        logger: this.logger,
        voltOpsClient: this.registry.getGlobalVoltOpsClient(),
        observability: this.observability,
        mcp: {
          registry: this.mcpServerRegistry,
        },
        a2a: {
          registry: this.a2aServerRegistry,
        },
        triggerRegistry: this.triggerRegistry,
        ensureEnvironment: this.ensureEnvironmentBinding,
      });
    }

    if (options.serverless) {
      this.serverlessProvider = options.serverless({
        agentRegistry: this.registry,
        workflowRegistry: this.workflowRegistry,
        logger: this.logger,
        voltOpsClient: this.registry.getGlobalVoltOpsClient(),
        observability: this.observability,
        mcp: {
          registry: this.mcpServerRegistry,
        },
        a2a: {
          registry: this.a2aServerRegistry,
        },
        triggerRegistry: this.triggerRegistry,
        ensureEnvironment: this.ensureEnvironmentBinding,
      });
    }

    if (options.mcpServers) {
      for (const entry of Object.values(options.mcpServers)) {
        this.initializeMCPServer(entry);
      }
    }

    if (options.a2aServers) {
      for (const entry of Object.values(options.a2aServers)) {
        this.initializeA2AServer(entry);
      }
    }

    // Check dependencies if enabled (run in background)
    if (options.checkDependencies !== false) {
      // Run dependency check in background to not block startup
      Promise.resolve().then(() => {
        this.checkDependencies().catch(() => {
          // Silently ignore errors
        });
      });
    }

    if (this.serverInstance) {
      await this.startServer();
    } else {
      await this.startConfiguredMcpTransports();
    }
  }

  serverless(): IServerlessProvider {
    if (!this.serverlessProvider) {
      if (this.options.serverless) {
        throw new Error("Application is not ready. Call and await ready() first.");
      }
      throw new Error("No serverless provider configured. Pass serverless option to VoltAgent");
    }

    return this.serverlessProvider;
  }

  private ensureEnvironment(): void {
    this.autoConfigureVoltOpsClientFromEnv();
    this.syncServerlessObservabilityRemote();
  }

  private autoConfigureVoltOpsClientFromEnv(): void {
    if (this.registry.getGlobalVoltOpsClient()) {
      return;
    }

    if (typeof process === "undefined" || !process?.env) {
      return;
    }

    const publicKey = process.env.VOLTAGENT_PUBLIC_KEY;
    const secretKey = process.env.VOLTAGENT_SECRET_KEY;

    if (!publicKey || !secretKey || !isValidVoltOpsKeys(publicKey, secretKey)) {
      return;
    }

    try {
      const autoClient = new VoltOpsClient({
        publicKey,
        secretKey,
      });

      this.registry.setGlobalVoltOpsClient(autoClient);
      this.logger.debug("VoltOpsClient auto-configured from environment variables");
    } catch (error) {
      // Silent fail - don't break the app
      this.logger.debug("Could not auto-configure VoltOpsClient", { error });
    }
  }

  private syncServerlessObservabilityRemote(): void {
    if (!(this.observability instanceof ServerlessVoltAgentObservability)) {
      return;
    }

    const voltOpsClient = this.registry.getGlobalVoltOpsClient();
    if (!voltOpsClient) {
      return;
    }

    const baseUrl = voltOpsClient.getApiUrl().replace(/\/$/, "");
    const headers = voltOpsClient.getAuthHeaders();
    const nextConfig = {
      tracesUrl: `${baseUrl}/api/public/otel/v1/traces`,
      logsUrl: `${baseUrl}/api/public/otel/v1/logs`,
      headers,
    };

    if (this.isSameServerlessRemoteConfig(nextConfig)) {
      return;
    }

    this.lastServerlessRemoteConfig = {
      tracesUrl: nextConfig.tracesUrl,
      logsUrl: nextConfig.logsUrl,
      headers: { ...nextConfig.headers },
    };

    this.observability.updateServerlessRemote({
      traces: {
        url: nextConfig.tracesUrl,
        headers: nextConfig.headers,
      },
      logs: {
        url: nextConfig.logsUrl,
        headers: nextConfig.headers,
      },
    });
  }

  private isSameServerlessRemoteConfig(nextConfig: {
    tracesUrl: string;
    logsUrl: string;
    headers: Record<string, string>;
  }): boolean {
    const previous = this.lastServerlessRemoteConfig;
    if (!previous) {
      return false;
    }

    if (previous.tracesUrl !== nextConfig.tracesUrl || previous.logsUrl !== nextConfig.logsUrl) {
      return false;
    }

    return this.areHeaderRecordsEqual(previous.headers, nextConfig.headers);
  }

  private areHeaderRecordsEqual(
    left: Record<string, string>,
    right: Record<string, string>,
  ): boolean {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);

    if (leftKeys.length !== rightKeys.length) {
      return false;
    }

    for (const key of leftKeys) {
      if (left[key] !== right[key]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupShutdownHandlers(): void {
    if (typeof process === "undefined" || typeof process.on !== "function") {
      return;
    }

    const handleSignal = async (signal: string) => {
      this.logger.info(`[VoltAgent] Received ${signal}...`);
      const shouldExit = this.isSoleSignalHandler(signal as "SIGTERM" | "SIGINT");

      try {
        // Use the public shutdown method for all cleanup
        await this.shutdown();

        // Only call process.exit if we're the sole handler
        // This allows other frameworks to perform their own cleanup
        if (shouldExit && typeof process.exit === "function") {
          process.exit(0);
        }
      } catch (error) {
        this.logger.error("[VoltAgent] Error during shutdown:", { error });
        if (shouldExit && typeof process.exit === "function") {
          process.exit(1);
        }
      }
    };

    // Use process.once to prevent duplicate handling
    const onTerm = () => handleSignal("SIGTERM");
    const onInt = () => handleSignal("SIGINT");
    process.once("SIGTERM", onTerm);
    process.once("SIGINT", onInt);

    // Handle unhandled promise rejections to prevent server crashes
    // This is particularly important for AI SDK's NoOutputGeneratedError
    const onUnhandledRejection = (reason: unknown) => {
      const isStructuredOutputWrapperError =
        isVoltAgentError(reason) && reason.code === "STRUCTURED_OUTPUT_NOT_GENERATED";
      const isNoOutputGeneratedError =
        isStructuredOutputWrapperError ||
        reason instanceof NoOutputGeneratedError ||
        (reason instanceof Error && reason.name === "AI_NoOutputGeneratedError");

      this.logger.error("[VoltAgent] Unhandled Promise Rejection:", {
        reason: reason instanceof Error ? reason.message : reason,
        stack: reason instanceof Error ? reason.stack : undefined,
        hint: isNoOutputGeneratedError
          ? "Structured output was requested but no final output was generated. If tools are enabled, ensure a final schema-matching response or split into two calls."
          : undefined,
      });
      // Don't crash the server, just log the error
      // In production, you might want to send this to an error tracking service
    };
    process.on("unhandledRejection", onUnhandledRejection);
    this.removeShutdownHandlers = () => {
      process.off("SIGTERM", onTerm);
      process.off("SIGINT", onInt);
      process.off("unhandledRejection", onUnhandledRejection);
    };
  }

  private isSoleSignalHandler(event: "SIGTERM" | "SIGINT"): boolean {
    if (typeof process === "undefined" || typeof process.listeners !== "function") {
      return false;
    }

    return process.listeners(event).length === 1;
  }

  /**
   * Check for dependency updates
   */
  private async checkDependencies(): Promise<void> {
    if (typeof process === "undefined" || isServerlessRuntime() || !process.versions?.node) {
      return;
    }

    // Dependency checks rely on Node-specific tooling; intentionally disabled in edge builds.
    // Consumers can run `pnpm test:all` or `pnpm lint` in Node environments to surface issues.
  }

  /**
   * Register an agent
   */
  public registerTrigger(name: string, config: VoltAgentTriggerConfig): void {
    const normalized =
      typeof config === "function"
        ? {
            handler: config,
          }
        : config;

    const registration = this.triggerRegistry.register(name, {
      ...normalized,
      metadata: {
        ...(normalized.metadata ?? {}),
        agents: this.agentRefs,
      },
    });

    this.logger.info("[VoltAgent] Trigger registered", {
      name: registration.name,
      method: registration.method.toUpperCase(),
      path: registration.path,
    });
  }

  public registerTriggers(triggers?: VoltAgentTriggersConfig): void {
    if (!triggers) {
      return;
    }
    Object.entries(triggers).forEach(([name, config]) => this.registerTrigger(name, config));
  }

  private applyDefaultMemoryToAgent(agent: Agent): void {
    if (!this.defaultAgentMemory) {
      return;
    }
    agent.__setDefaultMemory(this.defaultAgentMemory);
  }

  private applyDefaultConversationPersistenceToAgent(agent: Agent): void {
    if (!this.defaultAgentConversationPersistence) {
      return;
    }
    agent.__setDefaultConversationPersistence?.(this.defaultAgentConversationPersistence);
  }

  private applyDefaultWorkspaceToAgent(agent: Agent): void {
    const workspace = this.registry.getGlobalWorkspace();
    if (!workspace) {
      return;
    }
    agent.__setDefaultWorkspace?.(workspace);
  }

  private applyDefaultWorkspaceToAgents(agents?: Record<string, Agent>): void {
    if (!agents) {
      return;
    }
    Object.values(agents).forEach((agent) => this.applyDefaultWorkspaceToAgent(agent));
  }

  private applyDefaultMemoryToWorkflow(
    workflow: Workflow<
      DangerouslyAllowAny,
      DangerouslyAllowAny,
      DangerouslyAllowAny,
      DangerouslyAllowAny
    >,
  ): void {
    if (!this.defaultWorkflowMemory) {
      return;
    }
    const workflowWithDefaults = workflow as typeof workflow & {
      __setDefaultMemory?: (memory: Memory) => void;
    };
    workflowWithDefaults.__setDefaultMemory?.(this.defaultWorkflowMemory);
  }

  public registerAgent(agent: Agent): void {
    // Register the agent
    this.applyDefaultMemoryToAgent(agent);
    this.applyDefaultConversationPersistenceToAgent(agent);
    this.applyDefaultWorkspaceToAgent(agent);
    agent.__setDefaultToolRouting?.(this.registry.getGlobalToolRouting());
    this.registry.registerAgent(agent);
  }

  /**
   * Register multiple agents
   */
  public registerAgents(agents?: Record<string, Agent>): void {
    if (!agents) {
      return;
    }

    Object.values(agents).forEach((agent) => this.registerAgent(agent));
  }

  /**
   * Start the server
   */
  public async startServer(): Promise<void> {
    if (!this.serverInstance) {
      this.logger.warn("No server provider configured");
      return;
    }

    if (this.serverInstance.isRunning()) {
      this.logger.info("Server is already running");
      return;
    }

    try {
      await this.serverInstance.start();
      await this.startConfiguredMcpTransports();
    } catch (error) {
      this.logger.error(
        `Failed to start server: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Stop the server
   */
  public async stopServer(): Promise<void> {
    if (!this.serverInstance) {
      return;
    }

    if (!this.serverInstance.isRunning()) {
      return;
    }

    try {
      await this.serverInstance.stop();
      this.logger.info("Server stopped");
    } catch (error) {
      this.logger.error(
        `Failed to stop server: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Get all registered agents
   */
  public getAgents(): Agent[] {
    return this.registry.getAllAgents();
  }

  /**
   * Get agent by ID
   */
  public getAgent(id: string): Agent | undefined {
    return this.registry.getAgent(id);
  }

  /**
   * Get agent count
   */
  public getAgentCount(): number {
    return this.registry.getAgentCount();
  }

  /**
   * Register workflows
   */
  public registerWorkflows(
    workflows: Record<
      string,
      | Workflow<DangerouslyAllowAny, DangerouslyAllowAny, DangerouslyAllowAny, DangerouslyAllowAny>
      | WorkflowChain<
          DangerouslyAllowAny,
          DangerouslyAllowAny,
          DangerouslyAllowAny,
          DangerouslyAllowAny,
          DangerouslyAllowAny
        >
    >,
  ): void {
    Object.values(workflows).forEach((workflow) => {
      // If it's a WorkflowChain, convert to Workflow first
      const workflowInstance = "toWorkflow" in workflow ? workflow.toWorkflow() : workflow;
      this.applyDefaultMemoryToWorkflow(workflowInstance);
      this.workflowRegistry.registerWorkflow(workflowInstance);
    });
  }

  /**
   * Register a single workflow
   */
  public registerWorkflow(
    workflow: Workflow<
      DangerouslyAllowAny,
      DangerouslyAllowAny,
      DangerouslyAllowAny,
      DangerouslyAllowAny
    >,
  ): void {
    this.applyDefaultMemoryToWorkflow(workflow);
    this.workflowRegistry.registerWorkflow(workflow);
  }

  /**
   * Get all registered workflows
   */
  public getWorkflows(): Workflow<DangerouslyAllowAny, DangerouslyAllowAny>[] {
    return this.workflowRegistry.getAllWorkflows().map((registered) => registered.workflow);
  }

  /**
   * Get workflow by ID
   */
  public getWorkflow(id: string): Workflow<DangerouslyAllowAny, DangerouslyAllowAny> | undefined {
    const registered = this.workflowRegistry.getWorkflow(id);
    return registered?.workflow;
  }

  /**
   * Get workflow count
   */
  public getWorkflowCount(): number {
    return this.workflowRegistry.getWorkflowCount();
  }

  /**
   * Get observability instance
   */
  public getObservability(): VoltAgentObservability | undefined {
    return this.observability;
  }

  /**
   * Shutdown telemetry (delegates to VoltAgentObservability)
   */
  public shutdownTelemetry(): Promise<void> {
    if (!this.observability) {
      return Promise.resolve();
    }
    this.telemetryShutdownPromise ??= this.runCleanupSteps([
      () => this.observability?.forceFlush(),
      () => this.observability?.shutdown(),
    ]);
    return this.telemetryShutdownPromise;
  }

  /**
   * Gracefully shutdown all VoltAgent resources
   * This includes stopping the server, suspending workflows, and shutting down telemetry
   * Useful for programmatic cleanup or when integrating with other frameworks
   */
  public shutdown(): Promise<void> {
    if (!this.shutdownPromise) {
      this.lifecycle = "stopping";
      this.shutdownPromise = Promise.resolve().then(async () => {
        await this.readyPromise?.catch(() => undefined);
        await this.cleanup();
      });
    }
    return this.shutdownPromise;
  }

  private cleanup(): Promise<void> {
    this.cleanupPromise ??= this.runCleanupSteps([
      () => this.serverInstance?.stop(),
      () => (this.readyPromise ? this.workflowRegistry.suspendAllActiveWorkflows() : undefined),
      () => this.shutdownA2AServers(),
      () => this.shutdownMcpServers(),
      () => (this.workspaceStarted ? this.workspace?.destroy() : undefined),
      () => (this.observability ? this.shutdownTelemetry() : undefined),
      () => this.removeShutdownHandlers?.(),
    ]).finally(() => {
      this.lifecycle = "stopped";
    });
    return this.cleanupPromise;
  }

  private async runCleanupSteps(steps: Array<() => void | Promise<void>>): Promise<void> {
    const errors: unknown[] = [];
    for (const step of steps) {
      try {
        await step();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, "Failed to shut down application resources");
    }
  }

  private initializeMCPServer(mcpServer: MCPServerLike | MCPServerFactory): MCPServerLike {
    const instance: MCPServerLike = typeof mcpServer === "function" ? mcpServer() : mcpServer;

    this.mcpServers.add(instance);
    this.mcpServerRegistry.register(instance, this.getMCPDependencies(), {
      startTransports: this.serverInstance?.isRunning() ?? false,
    });

    return instance;
  }

  private initializeA2AServer(server: A2AServerLike | A2AServerFactory): A2AServerLike {
    const instance: A2AServerLike = typeof server === "function" ? server() : server;

    this.a2aServerRegistry.register(instance, this.getA2ADependencies());
    this.a2aServers.add(instance);

    return instance;
  }

  private async startConfiguredMcpTransports(): Promise<void> {
    const startTasks: Promise<void>[] = [];
    for (const server of this.mcpServers) {
      if (typeof server.startConfiguredTransports === "function") {
        const result = server.startConfiguredTransports();
        if (result && typeof (result as Promise<void>).then === "function") {
          startTasks.push(result as Promise<void>);
        }
      }
    }

    if (startTasks.length > 0) {
      const results = await Promise.allSettled(startTasks);
      const errors = results.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      );
      if (errors.length > 0) {
        throw new AggregateError(errors, "Failed to start MCP transports");
      }
    }
  }

  public getMCPDependencies(): MCPServerDeps {
    return {
      // TODO: fix any types
      agentRegistry: {
        getAllAgents: () => this.registry.getAllAgents() as any,
        getAgent: (id: string) => this.registry.getAgent(id) as any,
      },
      getParentAgentIds: (agentId: string) => this.registry.getParentAgentIds(agentId),
      workflowRegistry: {
        getWorkflow: (id: string) => this.workflowRegistry.getWorkflow(id) as any,
        getAllWorkflows: () => this.workflowRegistry.getAllWorkflows() as any,
        getWorkflowsForApi: () => this.workflowRegistry.getWorkflowsForApi(),
        resumeSuspendedWorkflow: (
          workflowId: string,
          executionId: string,
          resumeData?: unknown,
          resumeStepId?: string,
        ) =>
          this.workflowRegistry.resumeSuspendedWorkflow(
            workflowId,
            executionId,
            resumeData,
            resumeStepId,
          ),
      },
    } as MCPServerDeps;
  }

  private getA2ADependencies(): A2AServerDeps {
    return {
      agentRegistry: {
        getAgent: (id: string) => this.registry.getAgent(id) as any,
        getAllAgents: () => this.registry.getAllAgents() as any,
      },
    } as A2AServerDeps;
  }

  public getServerInstance(): IServerProvider | undefined {
    return this.serverInstance;
  }

  private async shutdownMcpServers(): Promise<void> {
    if (this.mcpServers.size === 0) {
      return;
    }

    this.logger.info("[VoltAgent] Shutting down MCP server transports...");

    await this.runCleanupSteps(
      Array.from(this.mcpServers, (server) => async () => {
        try {
          await server.close?.();
        } finally {
          this.mcpServerRegistry.unregister(server, false);
          this.mcpServers.delete(server);
        }
      }),
    );
  }

  private async shutdownA2AServers(): Promise<void> {
    if (this.a2aServers.size === 0) {
      return;
    }

    for (const server of Array.from(this.a2aServers)) {
      this.a2aServerRegistry.unregister(server);
      this.a2aServers.delete(server);
    }
  }
}

/**
 * Configures an application. Call ready() to start its resources.
 * @param options - Registration, server, memory, and observability configuration.
 * @returns A runtime exposing readiness, registration, and shutdown APIs.
 * @example
 * const app = voltagent({ agents: { assistant }, server: honoServer() });
 * await app.ready();
 */
export function voltagent(options: VoltAgentOptions): VoltAgent {
  return new VoltAgent(options);
}
