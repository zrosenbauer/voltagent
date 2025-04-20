import { AgentEventEmitter } from "./index";

describe("AgentEventEmitter", () => {
  let eventEmitter: AgentEventEmitter;

  beforeEach(() => {
    // Reset the singleton instance before each test
    (AgentEventEmitter as any).instance = null;
    eventEmitter = AgentEventEmitter.getInstance();
  });

  describe("getInstance", () => {
    it("should return the same instance on multiple calls", () => {
      const instance1 = AgentEventEmitter.getInstance();
      const instance2 = AgentEventEmitter.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe("agentRegistered events", () => {
    it("should emit and receive agent registered events", (done) => {
      const agentId = "test-agent";

      eventEmitter.onAgentRegistered((receivedAgentId) => {
        expect(receivedAgentId).toBe(agentId);
        done();
      });

      eventEmitter.emitAgentRegistered(agentId);
    });

    it("should allow unsubscribing from agent registered events", () => {
      const callback = jest.fn();
      const unsubscribe = eventEmitter.onAgentRegistered(callback);

      eventEmitter.emitAgentRegistered("test-agent");
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();
      eventEmitter.emitAgentRegistered("test-agent-2");
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe("agentUnregistered events", () => {
    it("should emit and receive agent unregistered events", (done) => {
      const agentId = "test-agent";

      eventEmitter.onAgentUnregistered((receivedAgentId) => {
        expect(receivedAgentId).toBe(agentId);
        done();
      });

      eventEmitter.emitAgentUnregistered(agentId);
    });

    it("should allow unsubscribing from agent unregistered events", () => {
      const callback = jest.fn();
      const unsubscribe = eventEmitter.onAgentUnregistered(callback);

      eventEmitter.emitAgentUnregistered("test-agent");
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();
      eventEmitter.emitAgentUnregistered("test-agent-2");
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });
});
