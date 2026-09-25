/**
 * Schools of Thought — rival epistemic traditions per contested domain.
 *
 * A PhD-level debate is not "thesis vs generic counter" — it is a clash of
 * established schools with named positions, canonical claims, and known
 * critiques. This registry gives the debate agent real opponents: the
 * steel-man is built FROM a school's position, not invented on the spot.
 *
 * Coverage: the most contested domains first. Each school carries its core
 * claims and its standard critique — enough to run a real adversarial pass.
 */

export interface SchoolOfThought {
  school: string;          // e.g. "Realism"
  position: string;        // one-line position
  keyClaims: string[];     // what this school asserts
  standardCritique: string; // the strongest argument AGAINST it
}

export const SCHOOLS_OF_THOUGHT: Record<string, SchoolOfThought[]> = {
  economics: [
    { school: 'Mainstream/New Keynesian', position: 'Markets coordinate but fail under rigidities; demand management works', keyClaims: ['Sticky prices create real monetary effects', 'Fiscal multipliers positive in slumps', 'Inflation expectations anchor policy'], standardCritique: 'Microfounded DSGE models failed in 2008 — elegant but empirically fragile' },
    { school: 'Austrian', position: 'Intervention distorts price signals; credit cycles are policy-made', keyClaims: ['Artificially low rates cause malinvestment', 'Central planning faces knowledge problem', 'Deflation is not the enemy'], standardCritique: 'Predicted hyperinflation post-2008 — wrong; no formal models, weak empirics' },
    { school: 'Post-Keynesian/MMT-adjacent', position: 'Money is endogenous; sovereign currency issuers face inflation not solvency constraints', keyClaims: ['Banks create money ex nihilo', 'Unemployment is a policy choice for currency issuers', 'Debt ratios mislead for monetary sovereigns'], standardCritique: 'Underspecifies inflation mechanism; fiscal dominance risk real (2021-23 inflation)' },
  ],
  'political-economy': [
    { school: 'Liberal/Institutionalist', position: 'Open markets + institutions maximize welfare', keyClaims: ['Comparative advantage holds', 'Institutions solve commitment problems', 'Trade raises all boats (with redistribution)'], standardCritique: 'Underestimates power asymmetry and adjustment costs (China shock)' },
    { school: 'Marxist/Critical', position: 'Capital accumulation drives policy; crises are systemic', keyClaims: ['Profit squeeze drives crisis tendencies', 'State serves capital structurally', 'Unequal exchange structures North-South'], standardCritique: 'Weak predictive record; underprices genuine reform capacity' },
    { school: 'Varieties of Capitalism', position: 'Distinct capitalist models persist via institutional complementarities', keyClaims: ['LME vs CME equilibria', 'Comparative institutional advantage', 'No convergence to one model'], standardCritique: 'Static — struggles with rapid change and platform capitalism' },
  ],
  geopolitics: [
    { school: 'Offensive Realism', position: 'Great powers maximize power; conflict is structural', keyClaims: ['Anarchy forces self-help', 'Regional hegemony is the goal', 'China-US rivalry is structural, not personal'], standardCritique: 'Underpredicts cooperation; ignores domestic politics and norms' },
    { school: 'Liberal Institutionalism', position: 'Institutions dampen anarchy; interdependence raises war costs', keyClaims: ['Regimes reduce uncertainty', 'Economic interdependence pacifies', 'International law constrains'], standardCritique: 'Ukraine/Gaza show limits; institutions reflect power more than constrain it' },
    { school: 'Constructivist/English School', position: 'Anarchy is what states make of it; identity and norms shape interests', keyClaims: ['Enemies are socially constructed', 'Norm diffusion changes state behavior', 'International society exists beyond anarchy'], standardCritique: 'Falsifiability problems; slow-moving norms vs fast-moving conflicts' },
  ],
  'international-relations': [
    { school: 'Realism', position: 'Power and security competition dominate', keyClaims: ['States are unitary rational actors', 'Relative gains trump absolute', 'Alliances are marriages of convenience'], standardCritique: 'Explains war better than peace; domestic blind spot' },
    { school: 'Liberalism', position: 'Domestic politics + institutions + interdependence shape outcomes', keyClaims: ['Democratic peace (contested)', 'Trade creates constituencies for peace', 'IOs provide real constraint'], standardCritique: 'Western-centric; overstates democratic peace evidence' },
    { school: 'Dependency/Global South', position: 'IR theory is Northern; hierarchy and empire are constitutive', keyClaims: ['Core-periphery is the structure', 'Intervention reproduces hierarchy', 'Non-Western agency erased from canon'], standardCritique: 'Can underweight agency of Southern states themselves' },
  ],
  'conflict-studies': [
    { school: 'Greed vs Grievance (Collier)', position: 'Rebellion needs feasibility + loot, grievance alone is insufficient', keyClaims: ['Natural resources fuel civil war', 'Opportunity structure > motive', 'Grievance discourse masks greed'], standardCritique: 'Econometric proxies misread; grievances are real and measured badly' },
    { school: 'Grievance/Political', position: 'Horizontal inequalities and exclusion drive violence', keyClaims: ['Group inequality predicts conflict (Stewart)', 'Political exclusion radicalizes', 'Identity is mobilizational fuel'], standardCritique: 'Struggles to explain timing — grievance is constant, war is not' },
    { school: 'Commitment Problems (Fearon)', position: 'War is bargaining failure — credible commitment and information asymmetry', keyClaims: ['States cannot credibly promise future restraint', 'Preventive war logic', 'Private information causes miscalculation'], standardCritique: 'Rationalist frame misses honor, identity, irrationality' },
  ],
  'development-studies': [
    { school: 'Randomistas/Experimental', position: 'Poverty is soluble through tested micro-interventions', keyClaims: ['RCTs identify what works', 'Small nudges compound', 'Evidence before ideology'], standardCritique: 'Cannot answer structural questions; external validity crisis' },
    { school: 'Structuralist/Dependency', position: 'Underdevelopment is produced by the global system', keyClaims: ['Terms of trade deteriorate', 'Aid reproduces dependence', 'Structural transformation needs state'], standardCritique: 'Import substitution record was poor; agency of Southern elites ignored' },
    { school: 'Post-Development', position: '"Development" is a discursive trap — alternatives to development, not development alternatives', keyClaims: ['Development discourse produces the South', 'Local/buen vivir alternatives', 'Growth itself is the problem'], standardCritique: 'Romanticizes poverty; offers no resource mobilization path' },
  ],
  finance: [
    { school: 'Efficient Markets', position: 'Prices reflect information; alpha is mostly luck', keyClaims: ['EMH holds in weak/semi-strong form', 'Active management underperforms net of fees', 'Bubbles are hard to identify ex ante'], standardCritique: '2008, meme stocks, crypto — gross violations unaddressed' },
    { school: 'Behavioral Finance', position: 'Systematic biases create exploitable mispricing', keyClaims: ['Overreaction/underreaction anomalies', 'Limits to arbitrage preserve mispricing', 'Sentiment moves prices'], standardCritique: 'Anomaly zoo — many effects vanish post-publication' },
    { school: 'Minsky/Financial Instability', position: 'Stability breeds instability; finance is inherently fragile', keyClaims: ['Hedge→speculative→Ponzi cycle', 'Leverage builds in calm', 'Crises are endogenous'], standardCritique: 'Timing unpredictable; policy implications vague' },
  ],
  security: [
    { school: 'Traditional/Realist Security', position: 'State survival and military balance are the core', keyClaims: ['Deterrence works (mostly)', 'Capabilities > intentions', 'Alliances aggregate power'], standardCritique: 'Misses non-state threats, human security, internal wars' },
    { school: 'Human Security', position: 'The referent is the individual — poverty, disease, rights are security', keyClaims: ['Freedom from fear/want', 'Responsibility to protect', 'Development IS security'], standardCritique: 'Concept stretching — everything becomes security, nothing is prioritized' },
    { school: 'Critical/Securitization (Copenhagen)', position: 'Security is a speech act — issues are securitized, not objective', keyClaims: ['Securitization is a political choice', 'Who declares the threat matters', 'Desecuritization is the goal'], standardCritique: 'Can understate material threats; normatively skewed' },
  ],
  philosophy: [
    { school: 'Analytic', position: 'Clarity, logic, and argument — philosophy as precision discipline', keyClaims: ['Conceptual analysis advances', 'Science is the paradigm of knowledge', 'Ordinary language misleads'], standardCritique: 'Can be ahistorical; misses power and social embeddedness' },
    { school: 'Continental', position: 'Meaning is historical, embodied, power-laden', keyClaims: ['Reason is situated', 'Genealogy over analysis', 'Lifeworld precedes theory'], standardCritique: 'Obscurity as method; weak argumentative discipline' },
    { school: 'Pragmatist', position: 'Truth is what works in inquiry — consequences over foundations', keyClaims: ['Beliefs are habits of action', 'Democracy as experiment', 'Anti-foundationalism'], standardCritique: 'Truth instrumentalization worries; quietism on deep questions' },
  ],
  epistemology: [
    { school: 'Reliabilism', position: 'Knowledge is reliably produced true belief', keyClaims: ['Process matters more than reasons', 'Gettier solved by causal/reliable chains', 'Externalism suffices'], standardCritique: 'Generality problem — which process?; ignores first-person reasons' },
    { school: 'Evidentialism', position: 'Justification is fit to evidence — internalist', keyClaims: ['Epistemic duty to proportion belief to evidence', 'First-person accessibility required'], standardCritique: 'Over-intellectualizes; animals and children know without evidence catalogs' },
    { school: 'Feminist/Standpoint', position: 'Knowledge is situated; marginalized standpoints can be epistemically advantaged', keyClaims: ['Objectivity is social', 'Situated knowledge beats view-from-nowhere', 'Epistemic injustice is real'], standardCritique: 'Relativism risk; advantage claims need empirical support' },
  ],
  'social-theory': [
    { school: 'Bourdieusian', position: 'Fields + habitus + capital explain reproduction of inequality', keyClaims: ['Cultural capital reproduces class', 'Symbolic violence legitimizes', 'Practice logic over rational choice'], standardCritique: 'Reproduction-heavy — underexplains change and rupture' },
    { school: 'Rational Choice', position: 'Actors maximize utility — social order from strategic interaction', keyClaims: ['Micro-foundations required', 'Collective action problems structure politics', 'Formal models discipline theory'], standardCritique: 'Preferences assumed, not explained; thin on meaning and norms' },
    { school: 'Critical Theory/Frankfurt', position: 'Theory must emancipate — diagnose domination in culture and reason itself', keyClaims: ['Instrumental reason colonizes lifeworld', 'Culture industry manufactures consent', 'Immanent critique over positivism'], standardCritique: 'Normative foundations contested; empirical program thin' },
  ],
  'science-technology-studies': [
    { school: 'ANT/Posthumanist', position: 'Non-humans are actants; society is assembled', keyClaims: ['Technology is not neutral', 'Agency is distributed', 'Facts are constructed networks'], standardCritique: 'Relativism accusations; weak normative stance' },
    { school: 'Social Construction (SCOT)', position: 'Artifacts are shaped by relevant social groups — interpretive flexibility', keyClaims: ['Closure mechanisms stabilize tech', 'Different groups, different artifacts'], standardCritique: 'Underplays material constraints; symmetrical relativism' },
    { school: 'Critical/ Political STS', position: 'Technologies embed politics (Winner) — artifacts have politics', keyClaims: ['Design choices encode power', 'Expertise boundaries are political', 'Sociotechnical imaginaries guide policy'], standardCritique: 'Can over-politicize benign design choices' },
  ],
  'comparative-politics': [
    { school: 'Modernization', position: 'Development drives democracy — wealth first, then democracy', keyClaims: ['Lipset correlation holds', 'Middle class as agent', 'Development produces democratic demand'], standardCritique: 'China/Vietnam refute sequencing; endogeneity unresolved' },
    { school: 'Institutionalist', position: 'Design matters — presidentialism, electoral rules, federalism shape survival', keyClaims: ['Linzian perils of presidentialism', 'Consociational design for divided societies', 'Institutions are sticky'], standardCritique: 'Design effects are conditional; informal institutions dominate' },
    { school: 'Voluntarist/Agency', position: 'Elites choose transitions — pacts and craft, not structures', keyClaims: ['O\'Donnell-Schmitter transitions', 'Pact-making matters', 'Contingency over structure'], standardCritique: 'Underweights structural constraints; post-hoc storytelling' },
  ],
  'intelligence-studies': [
    { school: 'Tradecraft/Orthodox', position: 'Structured techniques (ACH, Devil\'s advocacy) fix analytic bias', keyClaims: ['Process discipline reduces error', 'Collection gaps are rare failure loci', 'Professionalization works'], standardCritique: 'Techniques underused in practice; politicization beats method' },
    { school: 'Critical/Constructivist', position: 'Intelligence is political — threat construction serves state interests', keyClaims: ['Securitization is a choice', 'Secret state lacks accountability', 'Intelligence communities self-perpetuate'], standardCritique: 'Underweights genuine adversary intent' },
  ],
  'migration-studies': [
    { school: 'Neoclassical/Push-Pull', position: 'Migration is wage-differential arbitrage by rational movers', keyClaims: ['Wage gaps predict flows', 'Individual cost-benefit calculus'], standardCritique: 'Predicts far more migration than observed; ignores networks and states' },
    { school: 'New Economics/Dual Labor Market', position: 'Households diversify risk; destination labor demand is structural', keyClaims: ['Household not individual is the unit', 'Employer demand pulls regardless of policy'], standardCritique: 'Structural-functional; thin on agency and politics' },
    { school: 'Migration Systems/Aspiration-Capability', position: 'Flows are self-sustaining systems; development first increases migration (de Haas)', keyClaims: ['Transition paradox — development boosts emigration', 'Networks make flows self-perpetuating', 'Aspirations × capabilities'], standardCritique: 'Descriptive strength exceeds predictive power' },
  ],
  technology: [
    { school: 'Accelerationist/e/acc', position: 'Capability progress is net-positive; speed beats precaution', keyClaims: ['Compute scaling delivers capability', 'Competition forces the pace anyway', 'Regulation protects incumbents'], standardCritique: 'Externalizes tail risks; ignores irreversibility asymmetry' },
    { school: 'Safety/Alignment-first', position: 'Frontier AI poses existential-scale risk; pause or slow until aligned', keyClaims: ['Deceptive alignment is unsolved', 'Evals lag capabilities', 'Race dynamics compress safety work'], standardCritique: 'No demonstrated catastrophic pathway; stifles beneficial diffusion' },
    { school: 'Pragmatist/Distribution', position: 'Harms are present-tense and distributional — bias, labor, concentration', keyClaims: ['Power concentration is the real risk', 'Labor displacement precedes AGI', 'Audit deployed systems, not hypotheticals'], standardCritique: 'Underweights genuine capability discontinuities' },
  ],
  environment: [
    { school: 'Ecomodernist', position: 'Decoupling + technology solve it — intensify, urbanize, go nuclear', keyClaims: ['Absolute decoupling is achievable', 'Nuclear is indispensable', 'Land sparing beats sharing'], standardCritique: 'Decoupling evidence is thin at required speed; techno-optimism bias' },
    { school: 'Degrowth/Post-growth', position: 'Green growth is an oxymoron — wealthy economies must contract throughput', keyClaims: ['Empirical decoupling insufficient', 'Wellbeing decouples from GDP', 'Carbon budgets force rationing logic'], standardCritique: 'No viable political coalition; transition path underspecified' },
    { school: 'Institutionalist/Polycentric', position: 'Climate is a collective-action problem — nested governance works (Ostrom)', keyClaims: ['Polycentric governance outperforms global treaties', 'Local commons can self-govern', 'Innovation in governance as important as tech'], standardCritique: 'Scale mismatch — local wins do not sum to planetary budgets' },
  ],
  'international-law': [
    { school: 'Positivist/Consent-based', position: 'Law binds by state consent — treaties and custom, nothing more', keyClaims: ['Consent is the source of obligation', 'Persistent objection defeats custom', 'Courts lack jurisdiction without consent'], standardCritique: 'Cannot explain jus cogens or erga omnes; freezes power relations' },
    { school: 'Policy-oriented/New Haven', position: 'Law is a process of authoritative decision — context and values matter', keyClaims: ['Rules are indeterminate without context', 'Human dignity is the goal norm', 'Decision-makers, not texts, make law'], standardCritique: 'US-centric policy science; opens door to power-as-law' },
    { school: 'TWAIL/Critical', position: 'International law is colonially constituted — reform from the margins', keyClaims: ['Universality masks Northern authorship', 'Intervention doctrines reproduce empire', 'Sovereignty was selectively granted'], standardCritique: 'Critique stronger than reconstruction; risks legitimating illiberal sovereignty' },
  ],
  'military-studies': [
    { school: 'Attritionist/Materialist', position: 'Industrial capacity and mass decide war — GDP wins', keyClaims: ['Ukraine validates attrition logic', 'Magazines and shells beat doctrine', 'Alliance depth is ammunition depth'], standardCritique: 'Ignores decisive maneuver and political collapse dynamics' },
    { school: 'Manoeuvrist', position: 'Defeat the cohesion, not the mass — tempo and shock matter', keyClaims: ['Mission command beats attrition', 'Surprise is still generatable', 'Psychological collapse precedes physical'], standardCritique: 'Romanticized post-1991; ISR saturation may kill maneuver' },
    { school: 'Technology/Revolution-ist', position: 'Drones, AI, precision change the character of war fundamentally', keyClaims: ['Transparent battlefield changes mass logic', 'Cheap precision beats exquisite platforms', 'Software tempo > industrial tempo'], standardCritique: 'Over-indexes on visible novelty; logistics and people still decide' },
  ],
  'public-health': [
    { school: 'Population-level/Structural', position: 'Health is produced by social determinants — upstream intervention dominates', keyClaims: ['Marmot gradient is causal', 'Structural prevention > individual choice', 'Commercial determinants drive NCDs'], standardCritique: 'Can deprioritize effective biomedical interventions' },
    { school: 'Biomedical/Individual', position: 'Disease is molecular — drugs, devices, vaccines deliver the gains', keyClaims: ['Mortality decline tracks technology', 'RCTs ground causality', 'Individual risk tools improve outcomes'], standardCritique: 'Diminishing returns; ignores distribution and upstream causes' },
    { school: 'One Health/Planetary', position: 'Human, animal, ecosystem health are one system', keyClaims: ['Zoonoses dominate emerging threats', 'Climate is a health multiplier', 'Antimicrobial resistance is ecological'], standardCritique: 'Framework inflation; hard to operationalize in policy' },
  ],
  sociology: [
    { school: 'Functionalist/Systems', position: 'Institutions persist because they perform functions — order is the puzzle', keyClaims: ['Differentiation drives modernity', 'Anomie explains pathology', 'Socialization stabilizes roles'], standardCritique: 'Conservative bias — legitimizes existing arrangements' },
    { school: 'Conflict/Marxist', position: 'Society is structured domination — class, race, gender are axes of power', keyClaims: ['Institutions serve dominant groups', 'Ideology masks material interests', 'Change comes from contradiction'], standardCritique: 'Over-politicizes; weak on why cooperation works' },
    { school: 'Interactionist/Interpretive', position: 'Society is built micro — meaning, identity, face-to-face order', keyClaims: ['Identity is negotiated', 'Symbols structure reality', 'Micro-order aggregates to macro'], standardCritique: 'Struggles to scale to structure and history' },
  ],
  psychology: [
    { school: 'Cognitive/Computational', position: 'Mind is information processing — biases are predictable bugs', keyClaims: ['Heuristics-and-biases program holds', 'Dual-process architecture', 'Decision science is engineering-able'], standardCritique: 'Replication crisis weakened foundations; WEIRD-sample bias' },
    { school: 'Evolutionary', position: 'Behavior reflects ancestral adaptation — deep time explains present bias', keyClaims: ['Mate choice, status, coalitions have fitness logic', 'Mismatch explains modern dysfunction'], standardCritique: 'Just-so stories risk; hard to falsify' },
    { school: 'Social/Cultural', position: 'Mind is constituted by culture and context — no universal psyche', keyClaims: ['WEIRD subjects are outliers', 'Emotion is constructed', 'Morality is cultural'], standardCritique: 'Universals exist (facial expression, coalitional psychology)' },
  ],
  education: [
    { school: 'Traditional/Direct instruction', position: 'Explicit teaching + knowledge curriculum beats discovery', keyClaims: ['Cognitive load theory favors guided instruction', 'Knowledge-rich curriculum closes gaps', 'Hattie effect sizes support direct methods'], standardCritique: 'Can narrow motivation and creativity; test-score framing' },
    { school: 'Progressive/Constructivist', position: 'Learning is constructed through inquiry, play, and relevance', keyClaims: ['Meaning-making drives retention', 'Student agency matters', 'Standardized metrics distort'], standardCritique: 'Minimal guidance harms novices (Kirschner et al.)' },
    { school: 'Critical Pedagogy', position: 'Education is political — emancipation or reproduction (Freire)', keyClaims: ['Banking model reproduces hierarchy', 'Hidden curriculum teaches obedience', 'Conscientization transforms'], standardCritique: 'Ideological capture risk; thin evidence on learning gains' },
  ],
  demography: [
    { school: 'Malthusian/Limits', position: 'Population presses on resources — growth is the threat', keyClaims: ['Carrying capacity binds', 'Fertility decline is adaptation'], standardCritique: 'Two centuries of failed catastrophe predictions' },
    { school: 'Cornucopian/Innovationist', position: 'More people = more ideas — resources expand with ingenuity (Simon)', keyClaims: ['Prices signal scarcity and induce substitution', 'Human capital is the resource'], standardCritique: 'Assumes substitution; ecological ceilings are real' },
    { school: 'Transition/Low-fertility', position: 'The real crisis is below-replacement — aging, pension math, shrinking states', keyClaims: ['Fertility falls with development', 'Migration cannot fully offset aging', 'Institutional solvency is the binding constraint'], standardCritique: 'Underweights adaptation, productivity, and later-life work' },
  ],
  'economic-history': [
    { school: 'Cliometric/Neoclassical', position: 'History is testable with economics — markets and incentives explain the past', keyClaims: ['Institutions and prices drive growth', 'Counterfactuals are estimable', 'Quantification disciplines narrative'], standardCritique: 'Reductionist; underweights contingency and meaning' },
    { school: 'Institutionalist/North', position: 'Property rights and commitment devices made modern growth', keyClaims: ['Credible commitment enables investment', 'Path dependence explains divergence'], standardCritique: 'Functionalist circularity — institutions explained by the growth they produce' },
    { school: 'World-Systems/Dependency', position: 'Global hierarchy, not national factors, explains divergence (Wallerstein)', keyClaims: ['Core extracts from periphery', 'Development of underdevelopment is structural'], standardCritique: 'Explains stasis better than takeoff; agency of peripheral states minimized' },
  ],
  'public-finance': [
    { school: 'Public Choice', position: 'Governments fail like markets — bureaucrats maximize budgets (Buchanan)', keyClaims: ['Incentives in politics are perverse', 'Fiscal constitutions restrain Leviathan', 'Debt is a future-tax externality'], standardCritique: 'Cynicism can self-fulfil; underweights public goods provision' },
    { school: 'Ricardian/Austerity', position: 'Debt is deferred taxation — consolidate early', keyClaims: ['Expansionary fiscal contraction possible', 'Debt overhangs crowd out growth'], standardCritique: '2010s austerity evidence went the other way' },
    { school: 'Functional Finance/Modern', position: 'Spend for outcomes, not solvency — inflation is the real constraint (Lerner)', keyClaims: ['Currency issuers cannot be forced to default', 'Job guarantees anchor prices better than unemployment'], standardCritique: 'Inflation control theory is thin; political economy ignored' },
  ],
  'political-anthropology': [
    { school: 'Neo-evolutionist/State formation', position: 'States emerge from warfare, agriculture, surplus (Tilly, Carneiro)', keyClaims: ['War made the state', 'Circumscription forces hierarchy', 'Surplus enables coercion'], standardCritique: 'Teleological; treats non-state orders as incomplete' },
    { school: 'Anti-state/Anarchist anthropology', position: 'Non-state orders are achievements, not absences (Clastres, Scott, Graeber)', keyClaims: ['Societies can organize against the state', 'Zomia-style escape is real', 'Egalitarianism is produced, not primitive'], standardCritique: 'Romanticization risk; cannot explain large-scale coordination' },
  ],
  'futures-studies': [
    { school: 'Trend-extrapolation/Quantitative', position: 'The future extends the measurable present — scenarios as curves', keyClaims: ['Base rates beat imagination', 'Models discipline forecasters'], standardCritique: 'Misses discontinuity — the precise wrongness problem' },
    { school: 'Critical Futures/Inayatullah', position: 'The future is contested terrain — deconstruct whose future it is', keyClaims: ['Causal layered analysis goes deeper than trends', 'Official futures serve power'], standardCritique: 'Weak on operational forecasting and decision value' },
    { school: 'Strategic Foresight/Practice', position: 'Foresight is a decision technology — options, signals, hedging', keyClaims: ['Scenarios inform strategy not prediction', 'Robustness over accuracy'], standardCritique: 'Can become ritualized consultancy, disconnected from evidence' },
  ],
};

/**
 * Build a debate-context block listing the domain's rival schools.
 * Returns '' when the domain has no registered schools.
 */
export function buildSchoolsBlock(domain?: string): string {
  if (!domain) return '';
  const schools = SCHOOLS_OF_THOUGHT[domain];
  if (!schools || schools.length === 0) return '';
  const lines = schools.map((s, i) =>
    `${i + 1}. ${s.school}: ${s.position}\n   Key claims: ${s.keyClaims.join('; ')}\n   Standard critique: ${s.standardCritique}`
  ).join('\n');
  return `\nESTABLISHED SCHOOLS IN THIS DOMAIN (${domain}):\n${lines}\n\nBuild the steel-man FROM one of these real schools — do not invent a generic counter. If the dominant thesis already aligns with one school, the counter MUST come from a rival school.`;
}
