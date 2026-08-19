/**
 * MCP (Model Context Protocol) — NomosX Sprint 6 (Gap 7)
 *
 * Expose les outils NomosX comme un MCP server + consomme des MCP servers externes.
 * Inspiré de :
 * - Model Context Protocol (Anthropic, novembre 2024)
 * - Bee Agent Framework (MCP natif)
 * - Mastra (MCP support)
 *
 * Le problème :
 * Le Tool Registry NomosX est propriétaire. MCP est le standard émergent pour
 * l'intégration d'outils (8000+ servers existent, Cursor/Claude/Continue/Bee l'ont adopté).
 *
 * Architecture :
 * 1. MCP Server — expose nos tools (`search_sources`, `read_source`, `query_knowledge_graph`)
 *    au format MCP pour que des clients externes (Claude Desktop, Cursor, etc.) les utilisent
 * 2. MCP Client — consomme des MCP servers externes (filesystem, git, browser, db, slack...)
 *    et les convertit en outils du Tool Registry
 *
 * Intégration : complète le `lib/agent/tool-registry.ts` existant.
 */

import type { ToolDefinition } from '../../llm/unified-llm';

// ─── Types MCP simplifiés (protocol basé sur JSON-RPC) ─────────────────────

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

export interface MCPToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export interface MCPClient {
  name: string;
  tools: MCPTool[];
  callTool: (name: string, args: Record<string, any>) => Promise<MCPToolResult>;
  disconnect: () => Promise<void>;
}

export interface MCPServerConfig {
  /** Server name */
  name: string;
  /** Command to run the server (for stdio transport) */
  command?: string;
  /** Args for the command */
  args?: string[];
  /** URL for SSE/WebSocket transport */
  url?: string;
  /** Transport type */
  transport?: 'stdio' | 'sse' | 'websocket';
  /** For stdio: env vars */
  env?: Record<string, string>;
}

// ─── Expose NomosX tools as MCP Server ───────────────────────────────────────

/**
 * NomosX tools exposed as MCP tools.
 * These match the existing tool definitions from `tool-registry.ts`.
 */
export const NOMOSX_MCP_TOOLS: MCPTool[] = [
  {
    name: 'nomos_search_sources',
    description: 'Search for academic/policy sources on a specific sub-topic.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        providers: { type: 'string' },
        max_results: { type: 'number', default: 10 },
      },
      required: ['query'],
    },
  },
  {
    name: 'nomos_read_source',
    description: 'Read the full content of a specific source by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        source_id: { type: 'string' },
      },
      required: ['source_id'],
    },
  },
  {
    name: 'nomos_query_knowledge_graph',
    description: 'Query the NomosX knowledge graph for related concepts.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        top_k: { type: 'number', default: 5 },
      },
      required: ['query'],
    },
  },
  {
    name: 'nomos_request_debate',
    description: 'Request an adversarial debate on a topic where sources disagree.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string' },
        source_ids: { type: 'string' },
      },
      required: ['topic'],
    },
  },
];

/**
 * Convert NomosX tools to MCP tool list (JSON-RPC init response).
 */
export function listMcpTools(): { tools: MCPTool[] } {
  return { tools: NOMOSX_MCP_TOOLS };
}

/**
 * Handle an incoming MCP tool call for NomosX tools.
 * This is a thin adapter over the existing internal functions.
 *
 * @param name - The MCP tool name
 * @param args - The arguments
 * @param handlers - Internal handlers for each NomosX tool
 */
export async function handleMcpToolCall(
  name: string,
  args: Record<string, any>,
  handlers: {
    searchSources: (query: string, providers?: string[]) => Promise<{ sourceIds: string[]; titles?: string[] }>;
    readSource: (sourceId: string) => Promise<string>;
    queryKnowledgeGraph: (query: string, topK?: number) => Promise<string>;
    requestDebate: (topic: string, sourceIds?: string[]) => Promise<string>;
  },
): Promise<MCPToolResult> {
  try {
    switch (name) {
      case 'nomos_search_sources': {
        const { query, providers, max_results } = args;
        const result = await handlers.searchSources(query, providers);
        const sources = result.titles
          ? result.sourceIds.map((id, i) => `${id}: ${result.titles?.[i] || ''}`)
          : result.sourceIds;
        return {
          content: [{ type: 'text', text: `Found ${result.sourceIds.length} sources:\n${sources.slice(0, max_results ?? 10).join('\n')}` }],
        };
      }

      case 'nomos_read_source': {
        const { source_id } = args;
        const content = await handlers.readSource(source_id);
        return { content: [{ type: 'text', text: content.slice(0, 8000) }] };
      }

      case 'nomos_query_knowledge_graph': {
        const { query, top_k } = args;
        const content = await handlers.queryKnowledgeGraph(query, top_k ?? 5);
        return { content: [{ type: 'text', text: content }] };
      }

      case 'nomos_request_debate': {
        const { topic, source_ids } = args;
        const content = await handlers.requestDebate(topic, source_ids?.split(','));
        return { content: [{ type: 'text', text: content }] };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : 'unknown'}` }],
      isError: true,
    };
  }
}

// ─── MCP Client (consume external servers) ────────────────────────────────────

/**
 * Convert MCP tools to NomosX ToolDefinitions.
 * This lets the ReAct loop use external MCP tools as if they were native.
 */
export function mcpToolsToNomosTools(serverName: string, mcpTools: MCPTool[]): ToolDefinition[] {
  return mcpTools.map(mcpTool => ({
    name: `${serverName}_${mcpTool.name}`.replace(/[^a-zA-Z0-9_]/g, '_'),
    description: `[MCP ${serverName}] ${mcpTool.description}`,
    parameters: mcpTool.inputSchema as any,
  }));
}

/**
 * Registry of connected MCP clients.
 */
const mcpClients = new Map<string, MCPClient>();

export function registerMcpClient(name: string, client: MCPClient): void {
  mcpClients.set(name, client);
}

export function getMcpClient(name: string): MCPClient | undefined {
  return mcpClients.get(name);
}

export function listMcpClients(): string[] {
  return Array.from(mcpClients.keys());
}

/**
 * Get all MCP tools from all connected clients, as NomosX ToolDefinitions.
 */
export function getAllMcpToolsAsNomos(): ToolDefinition[] {
  const tools: ToolDefinition[] = [];
  for (const [name, client] of mcpClients) {
    tools.push(...mcpToolsToNomosTools(name, client.tools));
  }
  return tools;
}

/**
 * Execute an external MCP tool from the ReAct loop.
 */
export async function executeMcpTool(
  fullToolName: string, // e.g., "filesystem_readFile"
  args: Record<string, any>,
): Promise<{ success: boolean; result: string; error?: string }> {
  const [serverName, ...toolParts] = fullToolName.split('_');
  const toolName = toolParts.join('_');

  const client = mcpClients.get(serverName);
  if (!client) {
    return { success: false, result: '', error: `MCP client not connected: ${serverName}` };
  }

  try {
    const result = await client.callTool(toolName, args);
    const text = result.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');

    return { success: !result.isError, result: text, error: result.isError ? text : undefined };
  } catch (err) {
    return { success: false, result: '', error: err instanceof Error ? err.message : 'unknown' };
  }
}

// ─── Simple stdio MCP client (placeholder for real transport) ────────────────

/**
 * Create a simple stdio-based MCP client.
 * This is a minimal implementation. In production, use the official MCP SDK.
 */
export async function createStdioMcpClient(
  config: MCPServerConfig,
): Promise<MCPClient> {
  // Placeholder: real implementation would spawn a child process and handle JSON-RPC
  console.log(`[MCP] Connecting to ${config.name} via ${config.transport || 'stdio'}: ${config.command} ${config.args?.join(' ')}`);

  return {
    name: config.name,
    tools: [],
    callTool: async (name: string, args: Record<string, any>) => {
      return {
        content: [{ type: 'text', text: `Placeholder: called ${name} with ${JSON.stringify(args)}` }],
      };
    },
    disconnect: async () => {
      console.log(`[MCP] Disconnected from ${config.name}`);
    },
  };
}

// ─── Recommended MCP servers for research agents ─────────────────────────────

export const RECOMMENDED_MCP_SERVERS: MCPServerConfig[] = [
  {
    name: 'filesystem',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', 'C:/Users/DELL/Desktop/NomosX-master'],
    transport: 'stdio',
  },
  {
    name: 'github',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    transport: 'stdio',
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_TOKEN || '' },
  },
  {
    name: 'puppeteer',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    transport: 'stdio',
  },
  {
    name: 'postgresql',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgresql', process.env.DATABASE_URL || ''],
    transport: 'stdio',
  },
];
