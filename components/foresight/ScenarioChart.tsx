'use client';

import { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadialBarChart, RadialBar, Legend, ComposedChart, Line, ErrorBar,
} from 'recharts';

export interface ScenarioData {
  name: string;
  description: string;
  probability: number; // 0-1
  confidenceInterval: [number, number]; // [lower, upper] 0-1
  baseRate: number;
  expertEstimate: number;
  calibratedProbability: number;
  sensitivityScore: number; // 0-1
  keyDrivers: string[];
  blockers: string[];
  signals: string[];
}

interface ScenarioChartProps {
  scenarios: ScenarioData[];
  convergenceScore: number;
  brierScoreEstimate: number;
}

/**
 * Interactive scenario visualization with Recharts.
 * Shows probability bars with confidence intervals, base rate comparison,
 * and sensitivity analysis.
 */
export function ScenarioChart({ scenarios, convergenceScore, brierScoreEstimate }: ScenarioChartProps) {
  const [view, setView] = useState<'probability' | 'comparison' | 'sensitivity'>('probability');
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);

  // Format data for Recharts
  const probData = useMemo(() =>
    scenarios.map(s => ({
      name: s.name.length > 25 ? s.name.slice(0, 25) + '…' : s.name,
      fullName: s.name,
      probability: Math.round(s.probability * 100),
      ciLow: Math.round(s.confidenceInterval[0] * 100),
      ciHigh: Math.round(s.confidenceInterval[1] * 100),
      error: [
        Math.round((s.probability - s.confidenceInterval[0]) * 100),
        Math.round((s.confidenceInterval[1] - s.probability) * 100),
      ],
    })),
    [scenarios]
  );

  const comparisonData = useMemo(() =>
    scenarios.map(s => ({
      name: s.name.length > 20 ? s.name.slice(0, 20) + '…' : s.name,
      'Base Rate': Math.round(s.baseRate * 100),
      'Expert Estimate': Math.round(s.expertEstimate * 100),
      'Calibrated': Math.round(s.calibratedProbability * 100),
    })),
    [scenarios]
  );

  const sensitivityData = useMemo(() =>
    scenarios.map(s => ({
      name: s.name.length > 20 ? s.name.slice(0, 20) + '…' : s.name,
      sensitivity: Math.round(s.sensitivityScore * 100),
      fill: s.sensitivityScore > 0.7 ? '#ef4444' : s.sensitivityScore > 0.4 ? '#f59e0b' : '#22c55e',
    })),
    [scenarios]
  );

  const convergenceData = [{
    name: 'Convergence',
    value: Math.round(convergenceScore * 100),
    fill: convergenceScore > 0.7 ? '#22c55e' : convergenceScore > 0.4 ? '#f59e0b' : '#ef4444',
  }];

  const selected = scenarios.find(s => s.name === selectedScenario);

  return (
    <div className="w-full space-y-4">
      {/* View toggle */}
      <div className="flex gap-2 text-xs">
        <button
          onClick={() => setView('probability')}
          className={`px-3 py-1.5 rounded-md font-mono uppercase tracking-wider transition-colors ${
            view === 'probability' ? 'bg-black/10 text-black' : 'text-black/50 hover:text-black/70'
          }`}
        >
          Probability + CI
        </button>
        <button
          onClick={() => setView('comparison')}
          className={`px-3 py-1.5 rounded-md font-mono uppercase tracking-wider transition-colors ${
            view === 'comparison' ? 'bg-black/10 text-black' : 'text-black/50 hover:text-black/70'
          }`}
        >
          Base Rate vs Expert vs Calibrated
        </button>
        <button
          onClick={() => setView('sensitivity')}
          className={`px-3 py-1.5 rounded-md font-mono uppercase tracking-wider transition-colors ${
            view === 'sensitivity' ? 'bg-black/10 text-black' : 'text-black/50 hover:text-black/70'
          }`}
        >
          Sensitivity
        </button>
      </div>

      {/* Convergence + Brier score summary */}
      <div className="flex gap-6 items-center text-xs text-black/60">
        <div className="flex items-center gap-2">
          <span className="font-mono uppercase tracking-wider text-black/40">Convergence</span>
          <span className={`font-bold ${convergenceScore > 0.7 ? 'text-green-400' : convergenceScore > 0.4 ? 'text-amber-400' : 'text-red-400'}`}>
            {Math.round(convergenceScore * 100)}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono uppercase tracking-wider text-black/40">Brier Est.</span>
          <span className="font-bold text-black/80">{brierScoreEstimate.toFixed(3)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono uppercase tracking-wider text-black/40">Scenarios</span>
          <span className="font-bold text-black/80">{scenarios.length}</span>
        </div>
      </div>

      {/* Main chart */}
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {view === 'probability' ? (
            <ComposedChart data={probData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,10,15,0.05)" />
              <XAxis
                dataKey="name"
                tick={{ fill: 'rgba(10,10,15,0.5)', fontSize: 11 }}
                tickLine={{ stroke: 'rgba(10,10,15,0.1)' }}
                interval={0}
                angle={-15}
                textAnchor="end"
                height={60}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: 'rgba(10,10,15,0.5)', fontSize: 11 }}
                tickLine={{ stroke: 'rgba(10,10,15,0.1)' }}
                label={{ value: '%', angle: -90, position: 'insideLeft', fill: 'rgba(10,10,15,0.4)' }}
              />
              <Tooltip
                contentStyle={{
                  background: 'rgba(255,255,255,0.95)',
                  border: '1px solid rgba(10,10,15,0.1)',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                labelStyle={{ color: 'rgba(10,10,15,0.8)' }}
                formatter={(value: any, name: any) => {
                  if (name === 'probability') return [`${value}%`, 'Probability'];
                  return [value, name];
                }}
              />
              <Bar
                dataKey="probability"
                fill="rgba(99, 102, 241, 0.7)"
                stroke="rgba(99, 102, 241, 1)"
                radius={[4, 4, 0, 0]}
                onClick={(data: any) => setSelectedScenario(data.fullName)}
                cursor="pointer"
              >
                <ErrorBar
                  dataKey="error"
                  width={4}
                  strokeWidth={1.5}
                  stroke="rgba(10,10,15,0.4)"
                />
              </Bar>
            </ComposedChart>
          ) : view === 'comparison' ? (
            <BarChart data={comparisonData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,10,15,0.05)" />
              <XAxis
                dataKey="name"
                tick={{ fill: 'rgba(10,10,15,0.5)', fontSize: 11 }}
                tickLine={{ stroke: 'rgba(10,10,15,0.1)' }}
                interval={0}
                angle={-15}
                textAnchor="end"
                height={60}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: 'rgba(10,10,15,0.5)', fontSize: 11 }}
                tickLine={{ stroke: 'rgba(10,10,15,0.1)' }}
              />
              <Tooltip
                contentStyle={{
                  background: 'rgba(255,255,255,0.95)',
                  border: '1px solid rgba(10,10,15,0.1)',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                formatter={(value: any) => [`${value}%`, '']}
              />
              <Legend wrapperStyle={{ fontSize: '11px', color: 'rgba(10,10,15,0.6)' }} />
              <Bar dataKey="Base Rate" fill="rgba(148, 163, 184, 0.6)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Expert Estimate" fill="rgba(251, 191, 36, 0.6)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Calibrated" fill="rgba(99, 102, 241, 0.8)" radius={[3, 3, 0, 0]} />
            </BarChart>
          ) : (
            <BarChart data={sensitivityData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,10,15,0.05)" />
              <XAxis
                dataKey="name"
                tick={{ fill: 'rgba(10,10,15,0.5)', fontSize: 11 }}
                tickLine={{ stroke: 'rgba(10,10,15,0.1)' }}
                interval={0}
                angle={-15}
                textAnchor="end"
                height={60}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: 'rgba(10,10,15,0.5)', fontSize: 11 }}
                tickLine={{ stroke: 'rgba(10,10,15,0.1)' }}
                label={{ value: 'Fragility', angle: -90, position: 'insideLeft', fill: 'rgba(10,10,15,0.4)' }}
              />
              <Tooltip
                contentStyle={{
                  background: 'rgba(255,255,255,0.95)',
                  border: '1px solid rgba(10,10,15,0.1)',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                formatter={(value: any) => [`${value}% fragile`, 'Sensitivity']}
              />
              <Bar dataKey="sensitivity" radius={[4, 4, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Selected scenario detail */}
      {selected && (
        <div className="border border-black/10 rounded-lg p-4 space-y-3 bg-black/[0.02]">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-black">{selected.name}</h4>
            <span className="text-xs font-mono text-black/40">
              {(selected.probability * 100).toFixed(0)}% | CI: [{(selected.confidenceInterval[0] * 100).toFixed(0)}%, {(selected.confidenceInterval[1] * 100).toFixed(0)}%]
            </span>
          </div>
          <p className="text-xs text-black/60">{selected.description}</p>

          {selected.keyDrivers.length > 0 && (
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-green-400/60">Key Drivers</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {selected.keyDrivers.map((d, i) => (
                  <span key={i} className="text-[11px] px-2 py-0.5 rounded bg-green-500/10 text-green-300/80 border border-green-500/20">
                    {d}
                  </span>
                ))}
              </div>
            </div>
          )}

          {selected.blockers.length > 0 && (
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-red-400/60">Blockers</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {selected.blockers.map((b, i) => (
                  <span key={i} className="text-[11px] px-2 py-0.5 rounded bg-red-500/10 text-red-300/80 border border-red-500/20">
                    {b}
                  </span>
                ))}
              </div>
            </div>
          )}

          {selected.signals.length > 0 && (
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400/60">Signals to Watch</span>
              <ul className="mt-1 space-y-0.5">
                {selected.signals.map((s, i) => (
                  <li key={i} className="text-[11px] text-black/50">→ {s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Click hint */}
      {!selected && view === 'probability' && (
        <p className="text-[10px] text-black/30 text-center font-mono uppercase tracking-wider">
          Click a bar to see scenario details
        </p>
      )}
    </div>
  );
}
