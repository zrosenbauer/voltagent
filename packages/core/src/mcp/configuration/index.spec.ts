import * as configModule from "./index";

// Mock the MCPClient module
jest.mock("../client", () => {
  // Create real mock functions so we can test them
  const connectMock = jest.fn().mockResolvedValue(undefined);
  const disconnectMock = jest.fn().mockResolvedValue(undefined);
  const listToolsMock = jest.fn().mockResolvedValue({});
  const getAgentToolsMock = jest.fn().mockResolvedValue({});

  const MCPClientMock = jest.fn().mockImplementation(() => ({
    connect: connectMock,
    disconnect: disconnectMock,
    listTools: listToolsMock,
    getAgentTools: getAgentToolsMock,
  }));

  // Add mock functions to the client prototype so we can access them
  MCPClientMock.prototype.connect = connectMock;
  MCPClientMock.prototype.disconnect = disconnectMock;
  MCPClientMock.prototype.listTools = listToolsMock;
  MCPClientMock.prototype.getAgentTools = getAgentToolsMock;

  return {
    MCPClient: MCPClientMock,
  };
});

import { MCPClient } from "../client";
// Import after mocking
import { MCPConfiguration } from "./index";

describe("MCPConfiguration", () => {
  // Common test data generator to ensure unique configurations for each test
  const createTestServers = (testId: string) => ({
    server1: {
      type: "http" as const,
      url: `http://localhost:3000/${testId}`,
    },
    server2: {
      type: "http" as const,
      url: `http://localhost:3001/${testId}`,
    },
  });

  // Keep track of configuration instances to clean up
  const configInstances: MCPConfiguration[] = [];

  // Reset mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Clean up after each test
  afterEach(async () => {
    // Disconnect all instances we've created
    for (const instance of configInstances) {
      await instance.disconnect();
    }
    configInstances.length = 0;

    // Also try to clean up any other instances (belt and suspenders)
    // Access to the real mcpConfigurationInstances map
    const mcpConfigurationInstancesMap = (configModule as any).mcpConfigurationInstances;
    if (mcpConfigurationInstancesMap) {
      const instances = Array.from(mcpConfigurationInstancesMap.values());
      for (const instance of instances as MCPConfiguration[]) {
        await instance.disconnect();
      }
    }
  });

  describe("constructor", () => {
    it("should create a new instance with provided servers", () => {
      const testId = "test1";
      const testServers = createTestServers(testId);
      const config = new MCPConfiguration({
        id: `unique-id-${testId}`,
        servers: testServers,
      });
      configInstances.push(config);

      expect(config).toBeInstanceOf(MCPConfiguration);
    });

    it("should use provided ID if given", () => {
      const testId = "test2";
      const testServers = createTestServers(testId);
      const customId = `custom-id-${testId}`;

      const config = new MCPConfiguration({
        id: customId,
        servers: testServers,
      });
      configInstances.push(config);

      // We can't directly test the private id property, but we can test that
      // creating another instance with the same ID returns the same instance
      const config2 = new MCPConfiguration({
        id: customId,
        servers: testServers,
      });
      // Don't add config2 to configInstances as it's the same as config

      // Here we use toEqual instead of toBe because we should get the same instance with the same ID
      expect(config).toEqual(config2);
    });

    it("should throw error when creating duplicate instance without explicit ID", async () => {
      const testId = "test3";
      const testServers = createTestServers(testId);

      // Create the first instance
      const firstConfig = new MCPConfiguration({
        id: `custom-id-${testId}`,
        servers: testServers,
      });
      configInstances.push(firstConfig);

      // We'll test this in a different way
      // We need to test the control mechanism in the MCPConfiguration class
      // Let's try to create a second instance with the same server configuration

      // First let's remove the existing instance and create a new one with the same configuration
      // And before doing that, let's mock the generateId method so it doesn't generate independent IDs

      // Since we can't know the ID created from our first instance,
      // we'll use a different approach

      // First, get the original generateId method
      const originalGenerateId = (MCPConfiguration.prototype as any).generateId;

      try {
        // Mock the generateId method to return a fixed ID
        // This way we'll try to create a new instance with the same ID
        (MCPConfiguration.prototype as any).generateId = () => {
          return "fixed-test-id";
        };

        // Remove the first instance and create a new one with the same ID
        await firstConfig.disconnect();
        configInstances.pop();

        // Create a new instance with the same ID
        const config1 = new MCPConfiguration({
          servers: testServers,
        });
        configInstances.push(config1);

        // Now try to create a second instance with the same generated ID
        // this should throw an error
        expect(() => {
          new MCPConfiguration({
            servers: testServers,
          });
        }).toThrow(/MCPConfiguration was initialized multiple times/);
      } finally {
        // Restore the original generateId method
        (MCPConfiguration.prototype as any).generateId = originalGenerateId;
      }
    });
  });

  describe("disconnect", () => {
    it("should disconnect all clients and remove from instance cache", async () => {
      const testId = "test4";
      const testServers = createTestServers(testId);
      const config = new MCPConfiguration({
        id: `unique-id-${testId}`,
        servers: testServers,
      });
      configInstances.push(config);

      // Force client creation
      await config.getClients();

      // Spy on internal methods
      const deleteMapSpy = jest.spyOn(Map.prototype, "delete");
      const clearMapSpy = jest.spyOn(Map.prototype, "clear");

      await config.disconnect();

      // Check if client disconnect method was called directly
      expect(MCPClient.prototype.disconnect).toHaveBeenCalled();

      // Verify instance was removed from cache and clients were cleared
      expect(deleteMapSpy).toHaveBeenCalled();
      expect(clearMapSpy).toHaveBeenCalled();
    });
  });

  describe("getTools", () => {
    it("should return tools from all servers as an array", async () => {
      const testId = "test5";
      const testServers = createTestServers(testId);
      const config = new MCPConfiguration({
        id: `unique-id-${testId}`,
        servers: testServers,
      });
      configInstances.push(config);

      // Setup mock tools for each server
      const server1Tools = { tool1: { name: "tool1", function: "test1" } };
      const server2Tools = { tool2: { name: "tool2", function: "test2" } };

      // Configure the mock for each client instance
      (MCPClient.prototype.listTools as jest.Mock)
        .mockResolvedValueOnce(server1Tools)
        .mockResolvedValueOnce(server2Tools);

      (MCPClient.prototype.getAgentTools as jest.Mock)
        .mockResolvedValueOnce(server1Tools)
        .mockResolvedValueOnce(server2Tools);

      const tools = await config.getTools();

      // Now we expect an array of tools
      expect(Array.isArray(tools)).toBe(true);
      expect(tools).toHaveLength(2);

      // Check if the array contains both tools
      expect(tools).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "tool1", function: "test1" }),
          expect.objectContaining({ name: "tool2", function: "test2" }),
        ]),
      );
    });

    it("should handle errors when retrieving tools", async () => {
      const testId = "test6";
      const testServers = createTestServers(testId);
      const config = new MCPConfiguration({
        id: `unique-id-${testId}`,
        servers: testServers,
      });
      configInstances.push(config);

      // Configure client.connect method to throw an error for server1
      (MCPClient.prototype.connect as jest.Mock)
        .mockRejectedValueOnce(new Error("Connection failed"))
        .mockResolvedValueOnce(undefined);

      // Configure server2 to work normally
      const server2Tools = { tool2: { name: "tool2", function: "test2" } };
      (MCPClient.prototype.listTools as jest.Mock).mockResolvedValueOnce(server2Tools);

      (MCPClient.prototype.getAgentTools as jest.Mock).mockResolvedValueOnce(server2Tools);

      // Spy on console.error
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      const tools = await config.getTools();

      // Should still return tools from the successful server as an array
      expect(Array.isArray(tools)).toBe(true);
      expect(tools).toHaveLength(1);
      expect(tools[0]).toEqual(
        expect.objectContaining({
          name: "tool2",
          function: "test2",
        }),
      );

      // Should log error
      expect(consoleErrorSpy).toHaveBeenCalled();

      // Restore console.error
      consoleErrorSpy.mockRestore();
    });
  });

  describe("getToolsets", () => {
    it("should return tools grouped by server name with getTools method", async () => {
      const testId = "test7";
      const testServers = createTestServers(testId);
      const config = new MCPConfiguration({
        id: `unique-id-${testId}`,
        servers: testServers,
      });
      configInstances.push(config);

      // Setup mock tools for each server
      const server1Tools = { tool1: { name: "tool1", function: "test1" } };
      const server2Tools = { tool2: { name: "tool2", function: "test2" } };

      // Configure the mock for each client instance
      (MCPClient.prototype.listTools as jest.Mock)
        .mockResolvedValueOnce(server1Tools)
        .mockResolvedValueOnce(server2Tools);

      (MCPClient.prototype.getAgentTools as jest.Mock)
        .mockResolvedValueOnce(server1Tools)
        .mockResolvedValueOnce(server2Tools);

      const toolsets = await config.getToolsets();

      // Expect toolsets to be grouped by server names and include getTools method
      expect(toolsets.server1).toBeDefined();
      expect(toolsets.server2).toBeDefined();

      // Check the tools properties exist
      expect(toolsets.server1.tool1).toEqual(
        expect.objectContaining({
          name: "tool1",
          function: "test1",
        }),
      );
      expect(toolsets.server2.tool2).toEqual(
        expect.objectContaining({
          name: "tool2",
          function: "test2",
        }),
      );

      // Check getTools method exists and returns the expected array
      expect(typeof toolsets.server1.getTools).toBe("function");
      expect(typeof toolsets.server2.getTools).toBe("function");

      // Test the getTools method returns the expected array
      const server1ToolsArray = toolsets.server1.getTools();
      expect(Array.isArray(server1ToolsArray)).toBe(true);
      expect(server1ToolsArray).toHaveLength(1);
      expect(server1ToolsArray[0]).toEqual(
        expect.objectContaining({
          name: "tool1",
          function: "test1",
        }),
      );
    });

    it("should not include servers with no tools", async () => {
      const testId = "test8";
      const testServers = createTestServers(testId);
      const config = new MCPConfiguration({
        id: `unique-id-${testId}`,
        servers: testServers,
      });
      configInstances.push(config);

      // First client has tools
      const server1Tools = { tool1: { name: "tool1", function: "test1" } };
      (MCPClient.prototype.listTools as jest.Mock)
        .mockResolvedValueOnce(server1Tools)
        .mockResolvedValueOnce({});

      (MCPClient.prototype.getAgentTools as jest.Mock)
        .mockResolvedValueOnce(server1Tools)
        .mockResolvedValueOnce({});

      const toolsets = await config.getToolsets();

      // Should only include server1
      expect(toolsets.server1).toBeDefined();
      expect(toolsets.server2).toBeUndefined();

      // Check the server1 tools
      expect(toolsets.server1.tool1).toEqual(
        expect.objectContaining({
          name: "tool1",
          function: "test1",
        }),
      );

      // Check getTools method
      expect(typeof toolsets.server1.getTools).toBe("function");
    });
  });

  describe("getAgentToolsets", () => {
    it("should return agent tools grouped by server name with getTools method", async () => {
      const testId = "test9";
      const testServers = createTestServers(testId);
      const config = new MCPConfiguration({
        id: `unique-id-${testId}`,
        servers: testServers,
      });
      configInstances.push(config);

      // Setup mock tools for each server
      const server1Tools = { tool1: { name: "tool1", function: "test1" } };
      const server2Tools = { tool2: { name: "tool2", function: "test2" } };

      // Configure the mock for each client instance
      (MCPClient.prototype.getAgentTools as jest.Mock)
        .mockResolvedValueOnce(server1Tools)
        .mockResolvedValueOnce(server2Tools);

      const agentToolsets = await config.getToolsets();

      // Expect tools to be grouped by server names
      expect(agentToolsets.server1).toBeDefined();
      expect(agentToolsets.server2).toBeDefined();

      // Check individual tools
      expect(agentToolsets.server1.tool1).toEqual(
        expect.objectContaining({
          name: "tool1",
          function: "test1",
        }),
      );
      expect(agentToolsets.server2.tool2).toEqual(
        expect.objectContaining({
          name: "tool2",
          function: "test2",
        }),
      );

      // Check getTools method exists
      expect(typeof agentToolsets.server1.getTools).toBe("function");
      expect(typeof agentToolsets.server2.getTools).toBe("function");
    });

    it("should handle errors from specific servers gracefully", async () => {
      const testId = "test10";
      const testServers = createTestServers(testId);
      const config = new MCPConfiguration({
        id: `unique-id-${testId}`,
        servers: testServers,
      });
      configInstances.push(config);

      // Completely clear all mocks
      jest.clearAllMocks();

      // Configure connect method - throw error on first call, succeed on second
      (MCPClient.prototype.connect as jest.Mock)
        .mockRejectedValueOnce(new Error("Connection failed"))
        .mockResolvedValueOnce(undefined);

      // Create correct tools object for the working server
      const server2Tools = { tool2: { name: "tool2", function: "test2" } };

      // Completely reset the getAgentTools method
      // In previous tests we used mockResolvedValueOnce calls, so
      // those previous test calls could affect this one
      (MCPClient.prototype.getAgentTools as jest.Mock).mockReset();
      (MCPClient.prototype.getAgentTools as jest.Mock).mockImplementation(() => {
        return Promise.resolve(server2Tools);
      });

      // Spy on console.error
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      const agentToolsets = await config.getToolsets();

      // Expected output - only server2 works
      expect(agentToolsets.server1).toBeUndefined();
      expect(agentToolsets.server2).toBeDefined();

      // Check server2 tools
      expect(agentToolsets.server2.tool2).toEqual(
        expect.objectContaining({
          name: "tool2",
          function: "test2",
        }),
      );

      // Check getTools method
      expect(typeof agentToolsets.server2.getTools).toBe("function");

      // Should log error
      expect(consoleErrorSpy).toHaveBeenCalled();

      // Restore console.error
      consoleErrorSpy.mockRestore();
    });
  });

  describe("getClient", () => {
    it("should return a connected client for a valid server name", async () => {
      const testId = "test11";
      const testServers = createTestServers(testId);
      const config = new MCPConfiguration({
        id: `unique-id-${testId}`,
        servers: testServers,
      });
      configInstances.push(config);

      const client = await config.getClient("server1");

      expect(client).toBeDefined();
      expect(MCPClient).toHaveBeenCalledWith({
        clientInfo: {
          name: "server1",
          version: "1.0.0",
        },
        server: testServers.server1,
      });
      expect(MCPClient.prototype.connect).toHaveBeenCalled();
    });

    it("should return undefined for an invalid server name", async () => {
      const testId = "test12";
      const testServers = createTestServers(testId);
      const config = new MCPConfiguration({
        id: `unique-id-${testId}`,
        servers: testServers,
      });
      configInstances.push(config);

      const client = await config.getClient("nonexistentServer" as any);

      expect(client).toBeUndefined();
    });

    it("should reuse existing client instance if already connected", async () => {
      const testId = "test13";
      const testServers = createTestServers(testId);
      const config = new MCPConfiguration({
        id: `unique-id-${testId}`,
        servers: testServers,
      });
      configInstances.push(config);

      const client1 = await config.getClient("server1");

      // Reset the spy counters so we can properly count subsequent calls
      jest.clearAllMocks();

      const client2 = await config.getClient("server1");

      expect(client1).toBe(client2);
      // A new client should not be created
      expect(MCPClient).not.toHaveBeenCalled();
    });
  });

  describe("getClients", () => {
    it("should return connected clients for all servers", async () => {
      const testId = "test14";
      const testServers = createTestServers(testId);
      const config = new MCPConfiguration({
        id: `unique-id-${testId}`,
        servers: testServers,
      });
      configInstances.push(config);

      const clients = await config.getClients();

      expect(clients).toBeDefined();
      expect(clients.server1).toBeDefined();
      expect(clients.server2).toBeDefined();
      expect(MCPClient).toHaveBeenCalledTimes(2);

      // Check that connect method was called for both clients
      expect(MCPClient.prototype.connect).toHaveBeenCalledTimes(2);
    });
  });
});
