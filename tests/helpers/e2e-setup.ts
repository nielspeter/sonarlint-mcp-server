import { spawn, ChildProcess } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/**
 * E2E Test Helper for MCP Server
 *
 * Provides utilities to:
 * - Start/stop the MCP server
 * - Create MCP client
 * - Call MCP tools
 * - Manage test lifecycle
 */

export class MCPTestClient {
  private serverProcess: ChildProcess | null = null;
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;

  /**
   * Start the MCP server and connect a client
   */
  async start(): Promise<void> {
    // Start the MCP server process
    this.serverProcess = spawn('node', ['dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });

    if (!this.serverProcess.stdin || !this.serverProcess.stdout) {
      throw new Error('Failed to create server process stdio streams');
    }

    // Log server stderr for debugging
    this.serverProcess.stderr?.on('data', (data) => {
      console.error('[Server]', data.toString());
    });

    // Create transport using the server's stdio
    this.transport = new StdioClientTransport({
      command: 'node',
      args: ['dist/index.js'],
    });

    // Create MCP client
    this.client = new Client(
      {
        name: 'sonarlint-test-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    // Connect client to server
    await this.client.connect(this.transport);

    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  /**
   * Call an MCP tool
   */
  async callTool(name: string, args: Record<string, any>): Promise<any> {
    if (!this.client) {
      throw new Error('Client not started. Call start() first.');
    }

    const result = await this.client.callTool({
      name,
      arguments: args,
    });

    return result;
  }

  /**
   * List available tools
   */
  async listTools(): Promise<any> {
    if (!this.client) {
      throw new Error('Client not started. Call start() first.');
    }

    const result = await this.client.listTools();
    return result;
  }

  /**
   * Stop the MCP server and clean up
   */
  async stop(): Promise<void> {
    // Close client connection
    if (this.client) {
      await this.client.close();
      this.client = null;
    }

    // Close transport
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }

    // Kill server process
    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');

      // Wait for process to exit
      await new Promise<void>((resolve) => {
        this.serverProcess!.on('exit', () => resolve());
        // Force kill after 5 seconds if not exited
        setTimeout(() => {
          if (this.serverProcess && !this.serverProcess.killed) {
            this.serverProcess.kill('SIGKILL');
          }
          resolve();
        }, 5000);
      });

      this.serverProcess = null;
    }
  }

  /**
   * Helper: Analyze a file
   */
  async analyzeFile(filePath: string): Promise<any> {
    return this.callTool('analyze_file', { filePath });
  }

  /**
   * Helper: Apply all quick fixes
   */
  async applyAllQuickFixes(filePath: string): Promise<any> {
    return this.callTool('apply_all_quick_fixes', { filePath });
  }

  /**
   * Helper: Health check
   */
  async healthCheck(): Promise<any> {
    return this.callTool('health_check', {});
  }
}

/**
 * Create and start an MCP test client
 */
export async function createTestClient(): Promise<MCPTestClient> {
  const client = new MCPTestClient();
  await client.start();
  return client;
}
