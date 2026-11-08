import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
import { runMonteCarloSimulation } from '../lib/agent/simulation-agent';

async function main() {
  const scenarios = [
    { name: 'A', description: 'a', assumptions: {}, priorProbability: 0.4 },
    { name: 'B', description: 'b', assumptions: {}, priorProbability: 0.3 },
    { name: 'C', description: 'c', assumptions: {}, priorProbability: 0.2 },
    { name: 'D', description: 'd', assumptions: {}, priorProbability: 0.1 },
  ];
  const parameters = { momentum: 0.5, uncertainty: 0.3, adoption: 0.5 };
  const r = await runMonteCarloSimulation({ scenarios, parameters, runs: 3000, seed: 42 });
  console.log('NEUTRAL (auto assumptions):', JSON.stringify(r.probabilities), 'converged:', r.converged, 'runs:', r.runsUsed);

  // Explicit assumptions: B matches parameters exactly → should win more
  const scenarios2 = scenarios.map((s) => s.name === 'B'
    ? { ...s, assumptions: { momentum: 0.5, uncertainty: 0.3, adoption: 0.5 } }
    : { ...s, assumptions: { momentum: 0.05, uncertainty: 0.05, adoption: 0.05 } });
  const r2 = await runMonteCarloSimulation({ scenarios: scenarios2, parameters, runs: 3000, seed: 42 });
  console.log('EVIDENCE-FAVORED B:', JSON.stringify(r2.probabilities));

  // Determinism
  const r3 = await runMonteCarloSimulation({ scenarios, parameters, runs: 1000, seed: 42 });
  const r4 = await runMonteCarloSimulation({ scenarios, parameters, runs: 1000, seed: 42 });
  console.log('DETERMINISTIC:', JSON.stringify(r3.probabilities) === JSON.stringify(r4.probabilities));
}
main().catch(e => { console.error(e); process.exit(1); });
