/**
 * Learning-write freeze gate (audit correction #11).
 *
 * NomosX carries ~a dozen memory/learning subsystems (episodic memory,
 * knowledge graph, agent-memory lessons, skill bank, experience bank,
 * learning cycle, agent performance). None has been proven by replay to
 * improve outcomes — they write on every run and their reads feed prompts,
 * so an unproven writer can silently degrade future runs.
 *
 * Policy: writes are FROZEN by default. Reads of already-accumulated
 * memory are untouched (existing data still informs prompts). Re-enable
 * per-subsystem re-activation only after replay evidence shows the writer
 * earns its keep:
 *
 *   NOMOSX_LEARNING_WRITES=1   → all learning writes enabled
 *   (unset / anything else)    → frozen
 */
export function learningWritesEnabled(): boolean {
  return process.env.NOMOSX_LEARNING_WRITES === '1';
}
