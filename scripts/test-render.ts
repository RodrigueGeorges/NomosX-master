import { writeFileSync } from 'fs';
async function main() {
  const { renderPositionFirstBriefHTML } = await import('../lib/agent/position-first-renderer');
  const html = renderPositionFirstBriefHTML({
    question: 'Test question on Arctic security',
    classification: { domains: [] } as any,
    casting: { team: [] } as any,
    analysis: {
      verdict: 'US Arctic strategy is converging on Greenland, but the mechanism is economic access, not annexation.',
      whatToWatch: { signals: ['Greenlandic elections'], whatWouldChangeMind: 'Danish veto', horizonCheck: 'Q4 2026' },
    },
    isStrategic: true,
    sources: [
      { title: 'Arctic Security Study', provider: 'rand', year: 2024, authors: [{ name: 'Smith' }] },
      { title: 'Greenland Resources', provider: 'brookings', year: 2023 },
    ],
    position: {
      title: 'Test Publication',
      confidence: 78,
      confidenceLabel: 'high',
      whatChangesMind: ['Arctic governance collapses'],
      objections: ['Counter-argument on feasibility'],
      inBrief: ['First key finding on Arctic routes', 'Second finding on minerals'],
      dominantScenario: 'Managed Competition',
      prospectiveFramework: {
        horizon: '2025-2035',
        predeterminedElements: ['Arctic ice continues receding', 'US maintains Thule presence'],
        criticalUncertainties: [
          { name: 'Great power restraint', poleA: 'rules-bound competition', poleB: 'coercive unilateralism' },
          { name: 'Greenlandic agency', poleA: 'Copenhagen alignment', poleB: 'independence push' },
        ],
        snowLeopards: ['Subsea cable geopolitics'],
        methodologyNote: 'Delphi + Monte Carlo calibration',
      },
      scenarios: [
        { name: 'Managed Competition', probability: '55%', confidenceInterval: [0.42, 0.68], sensitivityScore: 0.25, keyDrivers: ['NATO presence', 'Ice melt rate'], description: 'States compete within governance.', signals: ['Joint patrols continue', 'Investment treaties signed'], narrative: '', axisPosition: 'rules-bound competition, Copenhagen alignment' },
        { name: 'Two-Bloc Arctic', probability: '30%', confidenceInterval: [0.18, 0.45], sensitivityScore: 0.55, keyDrivers: ['Russia posture'], description: 'Hard division.', signals: ['Exclusive zones declared'], axisPosition: 'coercive unilateralism, independence push' },
        { name: 'Chaos Opening', probability: '15%', isWildcard: true, description: 'Unregulated scramble.', signals: [] },
      ],
      recommendations: { immediate: ['Fund Arctic monitoring'], shortTerm: ['Negotiate mineral access'], riskMitigation: ['Diversify supply chains'] },
    } as any,
  } as any);
  writeFileSync('test-render.html', html);
  for (const probe of ['format-badge', 'key-judgments-list', 'pf-matrix-grid', 'pf-matrix-scenario', 'signal-monitor-table', 'decision-logic', 'colophon', 'scenario-table']) {
    console.log(`${probe}: ${html.includes(probe) ? 'OK' : 'MISSING'}`);
  }
  console.log('escapedBadge:', html.includes('&lt;span class=&quot;format-badge'), '| htmlLen:', html.length);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
