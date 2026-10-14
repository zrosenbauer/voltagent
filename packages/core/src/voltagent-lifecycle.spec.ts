import { afterEach, describe, expect, it, vi } from "vitest";
import { NodeVoltAgentObservability, ServerlessVoltAgentObservability } from "./observability";
import type { IServerProvider } from "./types";
import { type VoltAgent, voltagent } from "./voltagent";

const applications: VoltAgent[] = [];

afterEach(async () => {
  await Promise.allSettled(applications.splice(0).map((app) => app.shutdown()));
  vi.restoreAllMocks();
});

const createServer = () => {
  let running = false;
  return {
    start: vi.fn(async () => {
      running = true;
      return { port: 3141 };
    }),
    stop: vi.fn(async () => {
      running = false;
    }),
    isRunning: () => running,
  } satisfies IServerProvider;
};

describe("application lifecycle", () => {
  it.each([
    ["node", NodeVoltAgentObservability],
    ["serverless", ServerlessVoltAgentObservability],
  ] as const)(
    "flushes logs and shuts down both %s providers when trace export fails",
    async (_, Observability) => {
      const logFlush = vi.fn(async () => {});
      const traceShutdown = vi.fn(async () => {});
      const logShutdown = vi.fn(async () => {});
      const observability = new Observability({
        spanProcessors: [
          {
            onStart: () => {},
            onEnd: () => {},
            forceFlush: async () => {
              throw new Error("Trace export failed");
            },
            shutdown: traceShutdown,
          },
        ],
        logProcessors: [{ onEmit: () => {}, forceFlush: logFlush, shutdown: logShutdown }],
      });
      const app = voltagent({ observability, checkDependencies: false });
      applications.push(app);
      await app.ready();
      await expect(app.shutdown()).rejects.toBeInstanceOf(AggregateError);
      expect(logFlush).toHaveBeenCalledOnce();
      expect(traceShutdown).toHaveBeenCalledOnce();
      expect(logShutdown).toHaveBeenCalledOnce();
    },
  );

  it("awaits and closes MCP transports once without an HTTP server", async () => {
    const start = vi.fn(async () => {});
    const close = vi.fn(async () => {});
    const app = voltagent({
      checkDependencies: false,
      mcpServers: { tools: { initialize: () => {}, startConfiguredTransports: start, close } },
    });
    applications.push(app);
    expect(start).not.toHaveBeenCalled();
    await app.ready();
    expect(start).toHaveBeenCalledOnce();
    await app.shutdown();
    expect(close).toHaveBeenCalledOnce();
  });
  it("defers server factories, telemetry, and signal handlers until ready is called", async () => {
    const server = createServer();
    const factory = vi.fn(() => server);
    const listeners = process.listenerCount("SIGTERM");
    const app = voltagent({ server: factory, checkDependencies: false });
    applications.push(app);
    await Promise.resolve();

    expect(factory).not.toHaveBeenCalled();
    expect(server.start).not.toHaveBeenCalled();
    expect(app.getObservability()).toBeUndefined();
    expect(process.listenerCount("SIGTERM")).toBe(listeners);

    await app.ready();
    expect(factory).toHaveBeenCalledOnce();
    expect(server.isRunning()).toBe(true);
    expect(app.getObservability()).toBeDefined();
    await app.shutdown();
    expect(process.listenerCount("SIGTERM")).toBe(listeners);
  });

  it("shares startup and waits for the server to finish starting", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const server = createServer();
    server.start.mockImplementation(async () => {
      await gate;
      return { port: 3141 };
    });
    const app = voltagent({ server: () => server, checkDependencies: false });
    applications.push(app);
    const first = app.ready();
    expect(app.ready()).toBe(first);
    let resolved = false;
    void first.then(() => {
      resolved = true;
    });
    await vi.waitFor(() => expect(server.start).toHaveBeenCalledOnce());
    expect(resolved).toBe(false);
    release();
    await first;
    expect(resolved).toBe(true);
    expect(app.ready()).toBe(first);
  });

  it("starts and flushes telemetry without configuring a server", async () => {
    const app = voltagent({ checkDependencies: false });
    applications.push(app);
    await app.ready();
    const telemetry = app.getObservability();
    if (!telemetry) throw new Error("Telemetry was not initialized");
    const flush = vi.spyOn(telemetry, "forceFlush");
    const shutdown = vi.spyOn(telemetry, "shutdown");
    await app.shutdown();
    expect(flush).toHaveBeenCalledOnce();
    expect(shutdown).toHaveBeenCalledOnce();
    expect(flush.mock.invocationCallOrder[0]).toBeLessThan(shutdown.mock.invocationCallOrder[0]);
  });

  it("rejects startup errors and releases initialized resources", async () => {
    const server = createServer();
    const failure = new Error("Port is occupied");
    server.start.mockRejectedValue(failure);
    const app = voltagent({ server: () => server, checkDependencies: false });
    applications.push(app);
    await expect(app.ready()).rejects.toBe(failure);
    expect(server.stop).toHaveBeenCalledOnce();
    expect(app.initError).toBe(failure);
    await app.shutdown();
    expect(server.stop).toHaveBeenCalledOnce();
  });

  it("continues cleanup and flushes telemetry when stopping a server fails", async () => {
    const server = createServer();
    const app = voltagent({ server: () => server, checkDependencies: false });
    applications.push(app);
    await app.ready();
    const telemetry = app.getObservability();
    if (!telemetry) throw new Error("Telemetry was not initialized");
    const flush = vi.spyOn(telemetry, "forceFlush");
    const shutdown = vi.spyOn(telemetry, "shutdown");
    server.stop.mockRejectedValue(new Error("Stop failed"));
    await expect(app.shutdown()).rejects.toBeInstanceOf(AggregateError);
    expect(flush).toHaveBeenCalledOnce();
    expect(shutdown).toHaveBeenCalledOnce();
  });

  it("shuts down telemetry even when flushing fails", async () => {
    const app = voltagent({ checkDependencies: false });
    applications.push(app);
    await app.ready();
    const telemetry = app.getObservability();
    if (!telemetry) throw new Error("Telemetry was not initialized");
    vi.spyOn(telemetry, "forceFlush").mockRejectedValue(new Error("Flush failed"));
    const shutdown = vi.spyOn(telemetry, "shutdown");
    await expect(app.shutdown()).rejects.toBeInstanceOf(AggregateError);
    expect(shutdown).toHaveBeenCalledOnce();
  });

  it("shares shutdown and prevents restarting a stopped application", async () => {
    const server = createServer();
    const app = voltagent({ server: () => server, checkDependencies: false });
    applications.push(app);
    await app.ready();
    const first = app.shutdown();
    expect(app.shutdown()).toBe(first);
    await first;
    expect(server.stop).toHaveBeenCalledOnce();
    await expect(app.ready()).rejects.toThrow("shut down");
  });

  it("does not start resources when shut down before ready", async () => {
    const factory = vi.fn(() => createServer());
    const app = voltagent({ server: factory, checkDependencies: false });
    applications.push(app);
    await app.shutdown();
    expect(factory).not.toHaveBeenCalled();
    expect(app.getObservability()).toBeUndefined();
    await expect(app.ready()).rejects.toThrow("shut down");
  });

  it("waits for in-flight startup before stopping resources", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const server = createServer();
    server.start.mockImplementation(async () => {
      await gate;
      return { port: 3141 };
    });
    const app = voltagent({ server: () => server, checkDependencies: false });
    applications.push(app);
    const startup = app.ready();
    await vi.waitFor(() => expect(server.start).toHaveBeenCalledOnce());
    const shutdown = app.shutdown();
    expect(server.stop).not.toHaveBeenCalled();
    release();
    await Promise.all([startup, shutdown]);
    expect(server.stop).toHaveBeenCalledOnce();
  });
});
