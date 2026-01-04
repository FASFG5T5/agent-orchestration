
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

// Zod schema for mcp_config.json
const McpConfigSchema = z.object({
  mcpServers: z.record(
    z.object({
      command: z.string(),
      args: z.array(z.string()).optional(),
      env: z.record(z.string()).optional(),
    })
  ),
});

type McpConfig = z.infer<typeof McpConfigSchema>;
type McpClient = Client;

const clients: Map<string, McpClient> = new Map();

/**
 * Load MCP config from the current working directory
 */
function loadMcpConfig(): McpConfig | null {
  const configPath = path.resolve(process.cwd(), 'mcp_config.json');
  if (!fs.existsSync(configPath)) {
    console.warn(`[Proxy] No mcp_config.json found at ${configPath}`);
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const json = JSON.parse(content);
    return McpConfigSchema.parse(json);
  } catch (error) {
    console.error(`[Proxy] Failed to load mcp_config.json:`, error);
    return null;
  }
}

/**
 * Connect to downstream MCP servers defined in the config
 */
async function connectToDownstreamServers(): Promise<void> {
  const config = loadMcpConfig();
  if (!config) return;

  for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
    // Skip self to prevent infinite loops if misconfigured
    if (name === 'agent-orchestration') continue;

    try {
      console.error(`[Proxy] Connecting to downstream server: ${name}`);
      
      const env: Record<string, string> = { ...process.env } as unknown as Record<string, string>;
      if (serverConfig.env) {
        Object.assign(env, serverConfig.env);
      }

      const transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args,
        env,
      });

      const client = new Client(
        {
          name: `proxy-${name}`,
          version: '1.0.0',
        },
        {
          capabilities: {},
        }
      );

      await client.connect(transport);
      clients.set(name, client);
      console.error(`[Proxy] Connected to ${name}`);
    } catch (error) {
      console.error(`[Proxy] Failed to connect to ${name}:`, error);
    }
  }
}

/**
 * Register tools from downstream servers onto the main orchestration server
 */
export async function registerProxyTools(server: McpServer): Promise<void> {
  await connectToDownstreamServers();

  for (const [serverName, client] of clients.entries()) {
    try {
      const result = await client.listTools();
      
      for (const tool of result.tools) {
        // Prefix tool name to avoid collisions and indicate source
        const proxyToolName = `${serverName}_${tool.name}`;
        
        console.error(`[Proxy] Registering tool: ${proxyToolName}`);

        // Note: We use a passthrough schema because converting JSON Schema back to Zod is complex.
        // This loses some validation info in the proxy declaration but allows execution to flow.
        server.tool(
          proxyToolName,
          tool.description || `Proxy tool from ${serverName}`,
          {
             // We define a broad schema that accepts any property
             // This effectively mimics 'any' object but satisfies ZodRawShape type
             ...Object.keys(tool.inputSchema.properties || {}).reduce((acc, key) => ({
                 ...acc,
                 [key]: z.any().optional().describe('Proxied argument') 
             }), {})
          },
          async (args) => {
            console.error(`[Proxy] Forwarding call to ${proxyToolName}`);
            const result = await client.callTool({
              name: tool.name,
              arguments: args,
            });
            return result as any;
          }
        );
      }
    } catch (error) {
      console.error(`[Proxy] Failed to list tools for ${serverName}:`, error);
    }
  }
}
