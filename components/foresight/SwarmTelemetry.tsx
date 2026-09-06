"use client";

import type { ForesightTelemetry } from "@/lib/foresight";
import { Activity, Brain, GitBranch, Layers, MessageSquare, Shield, Users, Zap } from "lucide-react";

interface SwarmTelemetryProps {
  telemetry: ForesightTelemetry;
}

export function SwarmTelemetry({ telemetry }: SwarmTelemetryProps) {
  const items = [
    { icon: Users, label: "Trajectory runs", value: telemetry.swarmSize.toLocaleString() },
    { icon: Brain, label: "Stakeholder voices", value: String(telemetry.voicePersonas) },
    { icon: Activity, label: "Simulation ticks", value: String(telemetry.tickCount) },
    { icon: MessageSquare, label: "Signal posts", value: String(telemetry.socialPostCount) },
    { icon: Zap, label: "Model ticks", value: String(telemetry.llmTickCount) },
    { icon: Layers, label: "Seed runs", value: String(telemetry.seedRuns) },
    { icon: GitBranch, label: "Monte Carlo", value: telemetry.monteCarloRuns.toLocaleString() },
    {
      icon: Shield,
      label: "Adversarial",
      value: telemetry.adversarialValidated ? "PASS" : "REVIEW",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className="border border-black/[0.06] bg-black/20 p-3"
          >
            <Icon size={14} className="text-black/40 mb-2" />
            <div className="text-[9px] text-black/45 uppercase tracking-[0.14em] font-mono">
              {item.label}
            </div>
            <div className="text-sm font-semibold text-black/85 font-mono mt-0.5">{item.value}</div>
          </div>
        );
      })}

      <div className="col-span-2 lg:col-span-4 border border-black/[0.06] bg-black/20 p-3 flex flex-wrap gap-4 text-[11px] font-mono text-black/40">
        <span>
          Evidence graph: {telemetry.graphNodes} nodes · {telemetry.graphEdges} edges (
          {telemetry.graphMethod})
        </span>
        <span>
          Sources: {telemetry.sourceCount} · quality {telemetry.sourceQualityAvg.toFixed(0)}/100
        </span>
        <span>MC converged: {telemetry.monteCarloConverged ? "yes" : "no"}</span>
        {telemetry.totalCostUsd != null && <span>Run cost: ${telemetry.totalCostUsd.toFixed(2)}</span>}
      </div>
    </div>
  );
}
