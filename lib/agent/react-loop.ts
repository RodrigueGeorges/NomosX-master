/**
 * ReAct Loop — NomosX
 *
 * La boucle ReAct (Reason → Act → Observe → Reason) bornée.
 * C'est le cœur du système agentique : un agent qui peut appeler des outils
 * en cours de raisonnement, observer les résultats, et continuer à réfléchir.
 *
 * Patterns implémentés :
 * - ReAct (Yao et al., 2023) : Thought → Action → Observation
 * - StateAct (ACL 2025 REALM) : self-prompting + state tracking
 * - ReflAct (EMNLP 2025) : goal-state reflection à chaque step
 * - Perplexity Agent API : bounded loop avec max_steps
 * - LLMCompiler : parallel tool calling (quand le LLM demande plusieurs outils)
 *
 * Bornes de sécurité :
 * - max_steps : limite le nombre d'itérations (contrôle coût)
 * - max_cost_usd : budget hard cap
 * - max_context_tokens : évite le context bloat (COMPASS pattern)
 *
 * L'agent décide lui-même quand il a fini (tool "finish" ou réponse sans tool_calls).
 */

import { callLLM } from '../llm/unified-llm';
import type { LLMRequest, LLMResponse, ToolDefinition, ToolCall } from '../llm/unified-llm';
import { executeTool, type ToolExecutionContext, type ToolExecutionResult } from './tool-registry';
import { createSWUCBBandit, refrainDecide, swUcbUpdate, type SWUCBBanditState } from './budget-forcing';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ReActConfig {
  /** System prompt — defines the agent's role and reasoning style */
  systemPrompt: string;
  /** Tools available to the agent */
  tools: ToolDefinition[];
  /** Max iterations (Thought → Action → Observation). Default: 10 */
  maxSteps: number;
  /** Hard budget cap in USD. Stops the loop if exceeded. */
  maxCostUsd: number;
  /** LLM task type for routing */
  task: LLMRequest['task'];
  /** Temperature for reasoning (lower = more deterministic) */
  temperature?: number;
  /** Max tokens per LLM call */
  maxTokens?: number;
  /** Label for logging */
  label?: string;
}

export interface ReActStep {
  step: number;
  thought: string; // The LLM's reasoning (content before tool calls)
  toolCalls?: ToolCall[];
  toolResults?: ToolExecutionResult[];
  costUsd: number;
  durationMs: number;
}

export interface ReActResult {
  /** Final answer produced by the agent */
  finalAnswer: string;
  /** Whether the agent called "finish" explicitly or just stopped */
  finishedExplicitly: boolean;
  /** Steps taken */
  steps: ReActStep[];
  /** Total cost */
  totalCostUsd: number;
  /** Total duration */
  totalDurationMs: number;
  /** New source IDs discovered during reasoning */
  discoveredSourceIds: string[];
  /** Why the loop ended: "finish" | "max_steps" | "budget" | "no_tool_calls" | "error" */
  stopReason: 'finish' | 'max_steps' | 'budget' | 'no_tool_calls' | 'error';
}

// ─── Main ReAct Loop ────────────────────────────────────────────────────────

/**
 * Run a bounded ReAct loop.
 *
 * The agent receives the initial input, then iteratively:
 * 1. Reasons about the current state (Thought)
 * 2. Calls tools if needed (Action)
 * 3. Observes the results (Observation)
 * 4. Repeats until it calls "finish" or produces a final answer without tool calls
 *
 * @param config - Loop configuration (system prompt, tools, bounds)
 * @param initialInput - The user's question/task
 * @param toolCtx - Context for tool execution (search, read, debate functions)
 */
export async function reactLoop(
  config: ReActConfig,
  initialInput: string,
  toolCtx: ToolExecutionContext,
): Promise<ReActResult> {
  const label = config.label || 'ReAct';
  const startTime = Date.now();
  let totalCost = 0;
  let step = 0;
  const steps: ReActStep[] = [];
  const discoveredSourceIds: string[] = [];

  // K3: REFRAIN — SW-UCB bandit for adaptive early-stopping
  const refrainBandit: SWUCBBanditState = createSWUCBBandit(10, 1.414, 3);
  let lastPrmScore = 0.5; // Estimated quality score (updated each step)
  let lastProgressScore = 0.5; // Estimated progress score

  // Build initial message history
  // StateAct pattern: inject goal reminder at every step via system prompt
  const messages: LLMRequest['messages'] = [
    { role: 'system', content: config.systemPrompt },
    { role: 'user', content: initialInput },
  ];

  while (step < config.maxSteps) {
    // Budget check (hard cap)
    if (totalCost >= config.maxCostUsd) {
      console.log(`[${label}] Stopping: budget exceeded ($${totalCost.toFixed(4)} >= $${config.maxCostUsd})`);
      // Force a final answer with current context
      const finalResult = await forceFinalAnswer(config, messages, label);
      totalCost += finalResult.costUsd;
      return {
        finalAnswer: finalResult.content,
        finishedExplicitly: false,
        steps,
        totalCostUsd: totalCost,
        totalDurationMs: Date.now() - startTime,
        discoveredSourceIds,
        stopReason: 'budget',
      };
    }

    step++;
    const stepStart = Date.now();
    console.log(`[${label}] Step ${step}/${config.maxSteps} (cost: $${totalCost.toFixed(4)})`);

    // Call LLM with tools
    let response: LLMResponse;
    try {
      response = await callLLM({
        messages,
        tools: config.tools,
        toolChoice: 'auto',
        task: config.task,
        temperature: config.temperature ?? 0.3,
        maxTokens: config.maxTokens ?? 4000,
        enableCache: true,
      });
    } catch (err) {
      console.error(`[${label}] LLM call failed at step ${step}:`, err);
      return {
        finalAnswer: '',
        finishedExplicitly: false,
        steps,
        totalCostUsd: totalCost,
        totalDurationMs: Date.now() - startTime,
        discoveredSourceIds,
        stopReason: 'error',
      };
    }

    totalCost += response.costUsd;
    const stepDuration = Date.now() - stepStart;

    // Check if the model wants to call tools
    const toolCalls = response.toolCalls;
    const hasFinishCall = toolCalls?.some(tc => tc.name === 'finish') ?? false;

    // If no tool calls or "finish" was called → we have the final answer
    if (!toolCalls?.length || hasFinishCall) {
      const thought = response.content || '';
      steps.push({
        step,
        thought,
        toolCalls,
        costUsd: response.costUsd,
        durationMs: stepDuration,
      });

      console.log(`[${label}] Completed in ${step} steps, $${totalCost.toFixed(4)}, ${Date.now() - startTime}ms`);

      return {
        finalAnswer: thought,
        finishedExplicitly: hasFinishCall,
        steps,
        totalCostUsd: totalCost,
        totalDurationMs: Date.now() - startTime,
        discoveredSourceIds,
        stopReason: hasFinishCall ? 'finish' : 'no_tool_calls',
      };
    }

    // Execute tool calls (potentially in parallel — LLMCompiler pattern)
    const toolResults: ToolExecutionResult[] = [];
    const executableCalls = toolCalls.filter(tc => tc.name !== 'finish');

    if (executableCalls.length > 1) {
      // Parallel execution for independent tools
      console.log(`[${label}] Executing ${executableCalls.length} tools in parallel`);
      const results = await Promise.allSettled(
        executableCalls.map(tc => executeTool(tc, toolCtx))
      );
      for (const r of results) {
        if (r.status === 'fulfilled') {
          toolResults.push(r.value);
          if (r.value.newSources) {
            discoveredSourceIds.push(...r.value.newSources);
          }
        } else {
          toolResults.push({
            toolName: 'unknown',
            success: false,
            result: '',
            error: r.reason?.message || 'Tool execution failed',
          });
        }
      }
    } else if (executableCalls.length === 1) {
      const result = await executeTool(executableCalls[0], toolCtx);
      toolResults.push(result);
      if (result.newSources) {
        discoveredSourceIds.push(...result.newSources);
      }
    }

    // Log the step
    steps.push({
      step,
      thought: response.content || '',
      toolCalls,
      toolResults,
      costUsd: response.costUsd,
      durationMs: stepDuration,
    });

    // Add assistant message (with tool calls) to history
    messages.push({
      role: 'assistant',
      content: response.content || '',
      tool_calls: toolCalls,
    });

    // Add tool results to history (tool role messages)
    for (let i = 0; i < toolResults.length; i++) {
      const result = toolResults[i];
      const originalCall = executableCalls[i];
      messages.push({
        role: 'tool',
        content: result.success ? result.result : `Error: ${result.error}`,
        tool_call_id: originalCall?.id || `call_${step}_${i}`,
      });
    }

    // K3: REFRAIN — adaptive early-stopping via SW-UCB bandit
    // Estimate PRM score from response quality signals
    const responseLength = (response.content || '').length;
    const hasCitations = /\[SRC-\d+\]|\[E\d+\]/.test(response.content || '');
    const hasHedging = /\b(may|might|possibly|perhaps|uncertain|unclear)\b/i.test(response.content || '');
    lastPrmScore = Math.min(1, 0.3 + (responseLength / 2000) * 0.3 + (hasCitations ? 0.2 : 0) - (hasHedging ? 0.1 : 0));
    // Estimate progress: are we discovering new sources or making tool calls?
    const newSourcesThisStep = toolResults.some(r => r.newSources && r.newSources.length > 0);
    lastProgressScore = newSourcesThisStep ? 0.8 : (toolCalls.length > 0 ? 0.5 : 0.2);

    const refrainDecision = refrainDecide(
      refrainBandit,
      lastPrmScore,
      step,
      config.maxSteps,
      totalCost,
      config.maxCostUsd,
      lastProgressScore,
    );

    // Update bandit with the reward (PRM score as proxy)
    const reward = lastPrmScore * 0.5 + lastProgressScore * 0.5;
    swUcbUpdate(refrainBandit, 'continue', reward);

    if (refrainDecision.action === 'force_synthesis') {
      console.log(`[${label}] REFRAIN: ${refrainDecision.reason} — forcing final answer`);
      const finalResult = await forceFinalAnswer(config, messages, label);
      totalCost += finalResult.costUsd;
      return {
        finalAnswer: finalResult.content,
        finishedExplicitly: false,
        steps,
        totalCostUsd: totalCost,
        totalDurationMs: Date.now() - startTime,
        discoveredSourceIds,
        stopReason: 'budget',
      };
    }

    if (refrainDecision.action === 'extend_reasoning' && refrainDecision.injectionToken) {
      messages.push({
        role: 'user',
        content: refrainDecision.injectionToken,
      });
    }

    // ReflAct pattern: goal-state reflection every 3 steps
    // Inject a brief reminder to keep the agent aligned with the goal
    if (step % 3 === 0 && step < config.maxSteps - 1) {
      messages.push({
        role: 'user',
        content: `[GOAL REMINDER] You are at step ${step}/${config.maxSteps}. Remember your goal: ${initialInput.slice(0, 200)}. If you have enough evidence, call "finish". If not, continue searching.`,
      });
    }

    // Context bloat prevention (COMPASS pattern)
    // If the message history is getting too long, summarize older tool results
    if (messages.length > 20) {
      compactMessageHistory(messages, label);
    }
  }

  // Max steps reached — force a final answer
  console.log(`[${label}] Max steps (${config.maxSteps}) reached — forcing final answer`);
  const finalResult = await forceFinalAnswer(config, messages, label);
  totalCost += finalResult.costUsd;

  return {
    finalAnswer: finalResult.content,
    finishedExplicitly: false,
    steps,
    totalCostUsd: totalCost,
    totalDurationMs: Date.now() - startTime,
    discoveredSourceIds,
    stopReason: 'max_steps',
  };
}

// ─── Helper: Force a final answer ───────────────────────────────────────────

async function forceFinalAnswer(
  config: ReActConfig,
  messages: LLMRequest['messages'],
  label: string,
): Promise<{ content: string; costUsd: number }> {
  try {
    const response = await callLLM({
      messages: [
        ...messages,
        { role: 'user', content: 'Based on all the evidence gathered above, produce your final analysis now. Do not call any more tools.' },
      ],
      // No tools — force JSON final answer
      jsonMode: true,
      task: config.task,
      temperature: config.temperature ?? 0.3,
      maxTokens: config.maxTokens ?? 8000,
      enableCache: true,
    });
    return { content: response.content, costUsd: response.costUsd };
  } catch (err) {
    console.error(`[${label}] Force final answer failed:`, err);
    return { content: '', costUsd: 0 };
  }
}

// ─── Helper: Compact message history (COMPASS Context Manager) ──────────────

function compactMessageHistory(messages: LLMRequest['messages'], label: string): void {
  // Keep: system, first user, last 6 messages
  // Summarize: middle tool results into a single "context summary"
  if (messages.length <= 20) return;

  const system = messages[0];
  const firstUser = messages[1];
  const last6 = messages.slice(-6);
  const middle = messages.slice(2, -6);

  // Summarize tool results from the middle
  const toolSummaries: string[] = [];
  for (const msg of middle) {
    if (msg.role === 'tool' && msg.content) {
      try {
        const parsed = JSON.parse(msg.content);
        if (parsed.found !== undefined) {
          toolSummaries.push(`Searched: found ${parsed.found} sources`);
        } else if (parsed.title) {
          toolSummaries.push(`Read: ${parsed.title.slice(0, 60)}`);
        } else if (parsed.topic) {
          toolSummaries.push(`Debated: ${parsed.topic.slice(0, 60)}`);
        } else if (parsed.concept) {
          toolSummaries.push(`KG query: ${parsed.concept.slice(0, 60)}`);
        }
      } catch {
        // Keep raw if not JSON
        if (msg.content.length < 200) toolSummaries.push(msg.content.slice(0, 100));
      }
    }
  }

  const summaryMsg: LLMRequest['messages'][0] = {
    role: 'user',
    content: `[CONTEXT SUMMARY — previous tool results compacted]\n${toolSummaries.slice(0, 15).join('\n')}\n[END SUMMARY — continue with the recent messages below]`,
  };

  messages.length = 0;
  messages.push(system, firstUser, summaryMsg, ...last6);
  console.log(`[${label}] Context compacted: ${middle.length + 8} → ${messages.length} messages`);
}
