/**
 * MCP (Model Context Protocol) — NomosX Sprint 6 (Gap 7)
 *
 * @see ROADMAP_2026.md — Gap 7
 */

export {
  listMcpTools,
  handleMcpToolCall,
  mcpToolsToNomosTools,
  getAllMcpToolsAsNomos,
  executeMcpTool,
  registerMcpClient,
  getMcpClient,
  listMcpClients,
  createStdioMcpClient,
  NOMOSX_MCP_TOOLS,
  RECOMMENDED_MCP_SERVERS,
} from './mcp';
export type {
  MCPTool,
  MCPToolResult,
  MCPClient,
  MCPServerConfig,
} from './mcp';
