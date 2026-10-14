import { createServer } from "node:http";
import { voltagent } from "@voltagent/core";
import { honoServer } from "@voltagent/server-hono";
import { expect, it, vi } from "vitest";

it("waits for HTTP startup and drains requests before flushing telemetry", async () => {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  if (!address || typeof address === "string") throw new Error("No TCP address allocated");
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );

  let release!: () => void;
  let markStarted!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const finishRequest = vi.fn();
  const app = voltagent({
    checkDependencies: false,
    server: honoServer({
      port,
      hostname: "127.0.0.1",
      enableWebSocket: false,
      configureApp: (server) => {
        server.get("/lifecycle", async (context) => {
          markStarted();
          await gate;
          finishRequest();
          return context.text("ready");
        });
      },
    }),
  });

  const url = `http://127.0.0.1:${port}/lifecycle`;
  try {
    expect(app.getServerInstance()).toBeUndefined();
    await app.ready();
    const telemetry = app.getObservability();
    if (!telemetry) throw new Error("Telemetry was not initialized");
    const flush = vi.spyOn(telemetry, "forceFlush");
    const response = fetch(url);
    await started;
    const shutdown = app.shutdown();
    expect(flush).not.toHaveBeenCalled();
    release();
    expect(await (await response).text()).toBe("ready");
    await shutdown;
    expect(flush).toHaveBeenCalledOnce();
    expect(finishRequest.mock.invocationCallOrder[0]).toBeLessThan(
      flush.mock.invocationCallOrder[0],
    );
    await expect(fetch(url)).rejects.toThrow();
  } finally {
    release();
    await app.shutdown();
    vi.restoreAllMocks();
  }
});

it("closes connected WebSocket clients before completing shutdown", async () => {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  if (!address || typeof address === "string") throw new Error("No TCP address allocated");
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );

  const app = voltagent({
    checkDependencies: false,
    server: honoServer({ port, hostname: "127.0.0.1" }),
  });
  let socket: WebSocket | undefined;
  try {
    await app.ready();
    const client = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    socket = client;
    await new Promise<void>((resolve, reject) => {
      client.addEventListener("open", () => resolve(), { once: true });
      client.addEventListener("error", reject, { once: true });
    });
    const closed = new Promise<CloseEvent>((resolve) => {
      client.addEventListener("close", resolve, { once: true });
    });
    await app.shutdown();
    expect((await closed).code).toBe(1001);
    expect(client.readyState).toBe(WebSocket.CLOSED);
  } finally {
    socket?.close();
    await app.shutdown();
  }
});
