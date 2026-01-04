#!/usr/bin/env node
/**
 * Agent Orchestration Server
 * 
 * A Model Context Protocol server that enables multiple AI agents to share
 * memory, coordinate tasks, and collaborate effectively across IDEs and CLI tools.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getDatabase, closeDatabase } from './database.js';
import {
  registerAgentTools,
  registerMemoryTools,
  registerTaskTools,
  registerCoordinationTools,
  registerUtilityTools,
} from './tools/index.js';

// Create server instance
const server = new McpServer({
  name: 'agent-orchestration',
  version: '1.0.0',
});

// Register all tools
registerAgentTools(server);
registerMemoryTools(server);
registerTaskTools(server);
registerCoordinationTools(server);
registerUtilityTools(server);

// Main entry point
async function main(): Promise<void> {
  // Initialize database
  const db = getDatabase();
  console.error(`Agent Orchestration server started. Database: ${db.dbPath}`);

  // Create stdio transport
  const transport = new StdioServerTransport();

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.error('Shutting down...');
    closeDatabase();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.error('Shutting down...');
    closeDatabase();
    process.exit(0);
  });

  // Connect and run
  await server.connect(transport);
}

// Run the server
main().catch((error) => {
  console.error('Fatal error:', error);
  closeDatabase();
  process.exit(1);
});
