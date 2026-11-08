/**
 * Verify all provider files have correct export names matching registry-bridge expectations.
 * Run: node scripts/verify-provider-exports.cjs
 */
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'lib', 'providers');

const files = {
  'pwc-research-provider.mjs': 'PwCResearchProvider',
  'ey-research-provider.js': 'EYResearchProvider',
  'kpmg-thought-leadership-provider.mjs': 'KPMGThoughtLeadershipProvider',
  'bain-insights-provider.js': 'BainInsightsProvider',
  'accenture-research-provider.js': 'AccentureResearchProvider',
  'mckinsey-global-institute-provider.mjs': 'McKinseyGlobalInstituteProvider',
  'deloitte-insights-provider.js': 'DeloitteInsightsProvider',
  'bcg-henderson-institute-provider.js': 'BCGHendersonInstituteProvider',
  'blackrock-provider.js': 'BlackRockProvider',
  'lancet-provider.mjs': 'LancetProvider',
  'nejm-provider.mjs': 'NEJMProvider',
  'nature-medicine-provider.mjs': 'NatureMedicineProvider',
  'jama-provider.mjs': 'JAMAProvider',
  'johns-hopkins-provider.js': 'JohnsHopkinsProvider',
  'harvard-chan-provider.js': 'HarvardChanProvider',
  'deepmind-research-provider.js': 'DeepMindResearchProvider',
  'openai-research-provider.mjs': 'OpenAIResearchProvider',
  'ai-index-provider.js': 'AIIndexProvider',
  'partnership-ai-provider.mjs': 'PartnershipAIProvider',
  'amazon-science-provider.js': 'AmazonScienceProvider',
  'microsoft-research-provider.mjs': 'MicrosoftResearchProvider',
  'google-ai-research-provider.js': 'GoogleAIResearchProvider',
  'iea-provider.js': 'IEAProvider',
  'irena-provider.js': 'IRENAProvider',
  'rmi-provider.mjs': 'RMIProvider',
  'energy-futures-provider.js': 'EnergyFuturesProvider',
  'ipcc-provider.js': 'IPCCProvider',
  'climate-analytics-provider.js': 'ClimateAnalyticsProvider',
  'nature-provider.mjs': 'NatureProvider',
  'science-provider.mjs': 'ScienceProvider',
  'cell-provider.mjs': 'CellProvider',
  'pnas-provider.mjs': 'PNASProvider',
  'chatham-house-provider.js': 'ChathamHouseProvider',
  'council-foreign-relations-provider.js': 'CouncilForeignRelationsProvider',
  'csis-provider.js': 'CSISProvider',
  'carnegie-endowment-provider.js': 'CarnegieEndowmentProvider',
  'iiss-provider.js': 'IISSProvider',
  'dgap-provider.js': 'DGAPProvider',
  'bruegel-provider.js': 'BruegelProvider',
  'cepr-provider.js': 'CEPRProvider',
  'cgd-provider.js': 'CGDProvider',
  'acet-provider.js': 'ACETProvider',
  'saiia-provider.mjs': 'SAIIAProvider',
  'ast-res-provider.js': 'AstResProvider',
  'berlin-policy-hub-provider.js': 'BerlinPolicyHubProvider',
  'copenhagen-institute-provider.js': 'CopenhagenInstituteProvider',
  'idea-factory-provider.js': 'IdeaFactoryProvider',
};

let ok = 0;
const issues = [];
for (const [file, expectedExport] of Object.entries(files)) {
  const fp = path.join(dir, file);
  if (!fs.existsSync(fp)) {
    issues.push('MISSING: ' + file);
    continue;
  }
  const content = fs.readFileSync(fp, 'utf8');
  const hasConst = content.includes('export const ' + expectedExport);
  const hasClass = content.includes('export class ' + expectedExport);
  if (!hasConst && !hasClass) {
    // Show what IS exported
    const exportMatch = content.match(/export (?:const|class) (\w+)/);
    const actual = exportMatch ? exportMatch[1] : 'NONE';
    issues.push(file + ': expected "' + expectedExport + '" but found "' + actual + '"');
  } else {
    ok++;
  }
}

console.log('Export name verification:');
if (issues.length === 0) {
  console.log('  ALL ' + ok + '/' + ok + ' export names match perfectly');
} else {
  issues.forEach(function(i) { console.log('  ISSUE: ' + i); });
  console.log('  ' + ok + ' OK, ' + issues.length + ' issues');
}
