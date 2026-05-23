/**
 * Render Simulated Outcomes section for publication HTML
 */

import type { SimulationReport } from "@/lib/agent/simulation-agent";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderSimulationHtmlSection(report: SimulationReport): string {
  const out = report.output;
  const rows = out.scenarios
    .map((s) => {
      const ci = s.confidenceInterval;
      return `<tr>
        <td>${esc(s.name)}</td>
        <td><strong>${(s.empiricalProbability * 100).toFixed(0)}%</strong></td>
        <td>${(ci[0] * 100).toFixed(0)}–${(ci[1] * 100).toFixed(0)}%</td>
        <td>${esc(s.trajectory)}</td>
        <td>${esc(s.keyDrivers.slice(0, 3).join(", "))}</td>
      </tr>`;
    })
    .join("\n");

  const redTeam = out.redTeamChallenge
    ? `<div class="foresight-redteam"><h3>Adversarial challenge</h3><p>${esc(out.redTeamChallenge)}</p></div>`
    : "";

  const exec = out.executiveBrief
    ? `<p class="foresight-executive">${esc(out.executiveBrief)}</p>`
    : "";

  return `
<section id="simulated-outcomes" class="foresight-outcomes" data-nomosx-foresight="v3">
  <h2>Simulated Outcomes</h2>
  <p class="foresight-methodology">
    NomosX Foresight Engine — ${out.swarmSize} agents, ${out.seedRuns} seeds,
    ${out.monteCarloRuns} Monte Carlo runs. Scenarios are weighted projections, not predictions.
  </p>
  ${exec}
  <table class="foresight-scenarios">
    <thead><tr><th>Scenario</th><th>P emp.</th><th>IC 90%</th><th>Trend</th><th>Drivers</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  ${redTeam}
  <p class="foresight-disclaimer"><em>
    Methodological note: empirical probabilities emerge from multi-agent simulation calibrated on ranked academic sources.
    They express scenario weight, not certainty. See interactive Foresight panel for full telemetry.
  </em></p>
</section>`;
}

export function appendSimulationToHtml(html: string, section: string): string {
  if (html.includes('data-nomosx-foresight=')) return html;
  if (html.includes("</article>")) {
    return html.replace("</article>", `${section}\n</article>`);
  }
  return `${html}\n${section}`;
}

export function htmlHasForesightSection(html: string): boolean {
  return html.includes("data-nomosx-foresight=") || html.includes('id="simulated-outcomes"');
}
