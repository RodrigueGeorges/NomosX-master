/**
 * Tool Registry — NomosX
 *
 * Définit les outils que les agents ReAct peuvent appeler pendant leur
 * raisonnement. Chaque outil est une fonction avec un schéma JSON.
 *
 * Patterns :
 * - Tool design best practices (2026) : verbs, snake_case, descriptions claires
 * - LLMCompiler : parallel tool calling support
 * - GRETEL : execution-grounded validation
 *
 * Les outils sont injectés dans la boucle ReAct (react-loop.ts) et exécutés
 * quand le LLM les demande.
 */

import type { ToolDefinition } from '../llm/unified-llm';
import { getAllMcpToolsAsNomos, executeMcpTool } from './mcp';

// ─── Tool Definitions (schemas for the LLM) ────────────────────────────────

let BASE_ANALYST_TOOLS: ToolDefinition[] = [
  {
    name: "search_sources",
    description:
      "Search for academic/policy sources on a specific sub-topic. Use when you notice an evidence gap — a claim you want to make but have no source for. Returns source IDs and titles.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query — be specific (e.g., 'carbon tax impact on developing countries GDP')",
        },
        providers: {
          type: "string",
          description: "Comma-separated provider list (e.g., 'openalex,crossref,worldbank'). Omit for default mix.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "read_source",
    description:
      "Read the full content of a specific source by its index (1-based). Use when you need to verify a claim against the actual source text, or extract more detail from a promising source.",
    parameters: {
      type: "object",
      properties: {
        source_index: {
          type: "number",
          description: "The 1-based index of the source to read (e.g., 3 for [SRC-3])",
        },
      },
      required: ["source_index"],
    },
  },
  {
    name: "request_debate",
    description:
      "Request an adversarial debate on a specific question where sources disagree. Use when you detect a contradiction between sources and want a structured pro/con analysis to resolve it.",
    parameters: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "The specific question to debate (e.g., 'Does carbon tax reduce emissions by 10% or 20%?')",
        },
        source_indices: {
          type: "string",
          description: "Comma-separated source indices involved in the disagreement (e.g., '3,7')",
        },
      },
      required: ["topic"],
    },
  },
  {
    name: "request_more_sources",
    description:
      "Request additional sources from specific providers to diversify the evidence base. Use when you notice all sources come from the same provider or same theoretical framework.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query for the additional sources",
        },
        reason: {
          type: "string",
          description: "Why you need more sources (e.g., 'All current sources are neoclassical — need heterodox perspectives')",
        },
        providers: {
          type: "string",
          description: "Comma-separated providers to search (e.g., 'openalex,nber,imf')",
        },
      },
      required: ["query", "reason"],
    },
  },
  {
    name: "query_knowledge_graph",
    description:
      "Query the knowledge graph for cross-domain connections. Use when you suspect a connection between this topic and another domain that isn't obvious from the sources alone.",
    parameters: {
      type: "object",
      properties: {
        concept: {
          type: "string",
          description: "The concept to explore in the knowledge graph (e.g., 'carbon pricing', 'monetary policy transmission')",
        },
      },
      required: ["concept"],
    },
  },
  {
    name: "finish",
    description:
      "Signal that you have completed your analysis and are ready to produce the final output. Call this when you have sufficient evidence and have resolved any contradictions.",
    parameters: {
      type: "object",
      properties: {
        confidence: {
          type: "string",
          enum: ["high", "medium", "low"],
          description: "Your confidence level in the analysis",
        },
      },
      required: ["confidence"],
    },
  },
];

/** Names of native NomosX tools (anything else with an underscore is treated as MCP). */
const NATIVE_TOOL_NAMES = new Set(BASE_ANALYST_TOOLS.map(t => t.name));

/** Get the analyst tools, optionally augmented with connected MCP servers. */
export function getAnalystTools(useMCP = false): ToolDefinition[] {
  if (useMCP) {
    return [...BASE_ANALYST_TOOLS, ...getAllMcpToolsAsNomos()];
  }
  return BASE_ANALYST_TOOLS;
}

// Backward-compatible export
export const ANALYST_TOOLS = BASE_ANALYST_TOOLS;

// ─── Tool Executor ─────────────────────────────────────────────────────────

export interface ToolExecutionContext {
  query: string;
  sources: any[];
  readings: any[];
  /** Function to search for sources (delegates to scout()) */
  searchFn: (query: string, providers?: string[]) => Promise<{ sourceIds: string[]; titles: string[] }>;
  /** Function to read a source by index */
  readFn: (sourceIndex: number) => Promise<{ title: string; abstract: string; fullText?: string } | null>;
  /** Function to trigger a debate */
  debateFn: (topic: string, sourceIndices: number[]) => Promise<{ pro: string; con: string; synthesis: string }>;
  /** Function to query the knowledge graph */
  kgFn: (concept: string) => Promise<{ connections: string[]; bridges: string[] }>;
}

export interface ToolExecutionResult {
  toolName: string;
  success: boolean;
  result: string; // Stringified result for the LLM
  newSources?: string[]; // IDs of new sources found
  error?: string;
}

/**
 * Execute a tool call requested by the LLM.
 * Returns the result as a string (to be fed back as a tool message).
 */
export async function executeTool(
  toolCall: { name: string; arguments: string },
  ctx: ToolExecutionContext
): Promise<ToolExecutionResult> {
  let args: any;
  try {
    args = JSON.parse(toolCall.arguments || "{}");
  } catch {
    return {
      toolName: toolCall.name,
      success: false,
      result: "",
      error: "Invalid JSON arguments",
    };
  }

  try {
    switch (toolCall.name) {
      case "search_sources": {
        const providers = args.providers
          ? args.providers.split(",").map((p: string) => p.trim()).filter(Boolean)
          : undefined;
        const result = await ctx.searchFn(args.query, providers);
        return {
          toolName: "search_sources",
          success: true,
          result: JSON.stringify({
            found: result.sourceIds.length,
            sourceIds: result.sourceIds.slice(0, 10),
            titles: result.titles.slice(0, 10),
            message: result.sourceIds.length > 0
              ? `Found ${result.sourceIds.length} sources. Use read_source to examine specific ones.`
              : "No sources found. Try a different query or providers.",
          }),
          newSources: result.sourceIds,
        };
      }

      case "read_source": {
        const idx = Math.floor(args.source_index) - 1; // 1-based to 0-based
        if (idx < 0 || idx >= ctx.sources.length) {
          return {
            toolName: "read_source",
            success: false,
            result: "",
            error: `Invalid source index ${args.source_index}. Available: 1-${ctx.sources.length}`,
          };
        }
        const result = await ctx.readFn(idx + 1);
        if (!result) {
          return {
            toolName: "read_source",
            success: false,
            result: "",
            error: "Could not read source (no abstract or full text available)",
          };
        }
        return {
          toolName: "read_source",
          success: true,
          result: JSON.stringify({
            title: result.title,
            content: (result.fullText || result.abstract || "").slice(0, 4000),
            hasFullText: !!result.fullText,
          }),
        };
      }

      case "request_debate": {
        const indices = args.source_indices
          ? args.source_indices.split(",").map((s: string) => parseInt(s.trim(), 10)).filter((n: number) => !isNaN(n))
          : [];
        const result = await ctx.debateFn(args.topic, indices);
        return {
          toolName: "request_debate",
          success: true,
          result: JSON.stringify({
            topic: args.topic,
            pro: result.pro,
            con: result.con,
            synthesis: result.synthesis,
            message: "Debate completed. Use the synthesis to resolve the contradiction in your analysis.",
          }),
        };
      }

      case "request_more_sources": {
        const providers = args.providers
          ? args.providers.split(",").map((p: string) => p.trim()).filter(Boolean)
          : undefined;
        const result = await ctx.searchFn(args.query, providers);
        return {
          toolName: "request_more_sources",
          success: true,
          result: JSON.stringify({
            reason: args.reason,
            found: result.sourceIds.length,
            newTitles: result.titles.slice(0, 5),
            message: result.sourceIds.length > 0
              ? `Added ${result.sourceIds.length} new sources. They are now available via read_source.`
              : "No additional sources found from these providers.",
          }),
          newSources: result.sourceIds,
        };
      }

      case "query_knowledge_graph": {
        const result = await ctx.kgFn(args.concept);
        return {
          toolName: "query_knowledge_graph",
          success: true,
          result: JSON.stringify({
            concept: args.concept,
            connections: result.connections.slice(0, 10),
            bridges: result.bridges.slice(0, 5),
            message: result.connections.length > 0
              ? `Found ${result.connections.length} cross-domain connections and ${result.bridges.length} bridges.`
              : "No knowledge graph connections found for this concept.",
          }),
        };
      }

      case "finish": {
        return {
          toolName: "finish",
          success: true,
          result: JSON.stringify({
            confidence: args.confidence || "medium",
            message: "Analysis complete. Produce your final output now.",
          }),
        };
      }

      default: {
        // Try to execute as an MCP tool if the name is not a native tool and looks like server_tool
        if (!NATIVE_TOOL_NAMES.has(toolCall.name) && toolCall.name.includes('_')) {
          const mcpResult = await executeMcpTool(toolCall.name, args);
          return {
            toolName: toolCall.name,
            success: mcpResult.success,
            result: mcpResult.result,
            error: mcpResult.error,
          };
        }
        return {
          toolName: toolCall.name,
          success: false,
          result: "",
          error: `Unknown tool: ${toolCall.name}`,
        };
      }
    }
  } catch (err) {
    return {
      toolName: toolCall.name,
      success: false,
      result: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
