/**
 * Council desk portraits — each NomosX desk is embodied by a patron
 * mythological figure, rendered as a rediscovered fresco portrait
 * (same DA as publication heroes: obsidian ground, mineral pigments,
 * luminous machine filaments).
 *
 * `visualDna` is the LOCKED description of the figure — it is reused
 * verbatim in every generation so the desk's face stays consistent
 * across regenerations (the "Elements" pattern: identity first, scene second).
 *
 * `filamentMotif` is the desk's signature of machine light — the one
 * place where AI inhabits the ancient figure.
 */

export interface DeskPortrait {
  /** Council desk id (researchers.ts id) */
  id: string;
  /** Mythological figure embodying the desk */
  figure: string;
  /** Greek name for display, e.g. "Ἀθηνᾶ" */
  greekName: string;
  /** One-line archetype — why this figure owns this desk */
  archetype: string;
  /** Locked visual description of the figure (reused verbatim) */
  visualDna: string;
  /** The desk-specific machine-light signature */
  filamentMotif: string;
}

export const DESK_PORTRAITS: Record<string, DeskPortrait> = {
  economics: {
    id: 'economics',
    figure: 'Ploutos',
    greekName: 'Πλοῦτος',
    archetype: 'the blind god of wealth — riches flow without sight; only method reveals the causal pattern',
    visualDna: 'a young blind god in fresco profile, eyes closed or covered by a thin bronze band, holding a cornucopia spilling grain and gold, lapis-blue drapery',
    filamentMotif: 'the cornucopia\'s spill resolves into a branching cascade of fine gold filaments — capital flows made visible as light',
  },
  technology: {
    id: 'technology',
    figure: 'Hephaestus',
    greekName: 'Ἥφαιστος',
    archetype: 'the smith-god who built Talos — the first artificial intelligence was forged, not coded',
    visualDna: 'a bearded smith-god in three-quarter fresco profile, muscular shoulder bared, hammer lowered over a small bronze automaton head resting on an anvil, terracotta and soot tones',
    filamentMotif: 'the automaton\'s bronze skull glows from within — fine steel-blue filaments trace its seams like waking thought',
  },
  policy: {
    id: 'policy',
    figure: 'Eunomia',
    greekName: 'Εὐνομία',
    archetype: 'good order — the Hora of lawful governance, institutions as ritual rhythm',
    visualDna: 'a serene enthroned goddess in fresco profile, one hand raised in measured gesture, verdigris and bone-white drapery, a faint meander crown',
    filamentMotif: 'fine gold filaments radiate from her raised hand like ordinance lines — rules drawn in light',
  },
  health: {
    id: 'health',
    figure: 'Hygieia',
    greekName: 'Ὑγίεια',
    archetype: 'the goddess of health — prevention, the serpent that sheds and renews',
    visualDna: 'a calm goddess in fresco profile feeding a serpent coiled around a shallow bowl she holds, verdigris and bone-white pigments',
    filamentMotif: 'the serpent\'s scales shimmer with faint steel-blue filaments — vigilance as living circuitry',
  },
  security: {
    id: 'security',
    figure: 'Athena',
    greekName: 'Ἀθηνᾶ',
    archetype: 'strategic wisdom under arms — the aegis is her own shield; deterrence is her invention',
    visualDna: 'Athena in crested helm and fresco profile, the gorgoneion faint on her shoulder, owl barely visible behind her, lapis and bronze',
    filamentMotif: 'the rim of her aegis is traced in gold filaments forming concentric circuit arcs — the shield as a sensor field',
  },
  law: {
    id: 'law',
    figure: 'Themis',
    greekName: 'Θέμις',
    archetype: 'divine law and counsel — what binds gods also binds statutes',
    visualDna: 'a severe goddess in fresco profile holding a level beam of scales, eyes steady, cinnabar and ochre drapery',
    filamentMotif: 'each scale-pan weighs a single point of light — precedent and proportion measured in photons',
  },
  environment: {
    id: 'environment',
    figure: 'Gaia',
    greekName: 'Γαία',
    archetype: 'the primordial earth — every climate metric is her own body',
    visualDna: 'a vast maternal goddess half-emerging from the plaster itself, face and shoulders formed of layered earth tones, verdigris and ochre',
    filamentMotif: 'fine filaments thread through her earthen surface like sensor roots and fault lines of light',
  },
  quantitative: {
    id: 'quantitative',
    figure: 'Lachesis',
    greekName: 'Λάχεσις',
    archetype: 'the Fate who measures — every life is a distribution, and she reads the length',
    visualDna: 'one of the Moirai in fresco profile drawing a thread taut between her hands, measuring it with cool detachment, bone-white and lapis',
    filamentMotif: 'the thread she measures is a luminous filament marked with faint regular gradations — the distribution made visible',
  },
  finance: {
    id: 'finance',
    figure: 'Hermes',
    greekName: 'Ἑρμῆς',
    archetype: 'god of markets and thieves — liquidity, signals, and the fine print in between',
    visualDna: 'Hermes in fresco profile with a traveler hat and caduceus, half-smile of someone who knows the order book, ochre and terracotta',
    filamentMotif: 'the twin serpents of his caduceus glow as paired gold and steel-blue filaments — bid and ask in eternal braid',
  },
  'social-sciences': {
    id: 'social-sciences',
    figure: 'Hestia',
    greekName: 'Ἑστία',
    archetype: 'the hearth of the polis — every society is organized around what it gathers to protect',
    visualDna: 'a veiled matronly goddess in fresco profile tending a small hearth flame, warm ochre and terracotta pigments',
    filamentMotif: 'the hearth\'s embers are connected by fine gold filaments like a social graph — kinship rendered as light',
  },
  humanities: {
    id: 'humanities',
    figure: 'Apollo',
    greekName: 'Ἀπόλλων',
    archetype: 'reason, measure, and form — the counterweight to Dionysus in every ethical question',
    visualDna: 'a beardless youthful god in fresco profile with laurel wreath, contemplative gaze slightly downcast, lapis and bone-white',
    filamentMotif: 'his lyre\'s strings are drawn as taut luminous filaments — harmony as resolved tension',
  },
  'energy-advanced': {
    id: 'energy-advanced',
    figure: 'Helios',
    greekName: 'Ἥλιος',
    archetype: 'the sun himself — every energy system is a way of catching his chariot',
    visualDna: 'a radiant god in fresco profile crowned with a thin halo of rays, driving gaze forward, cinnabar and gold',
    filamentMotif: 'his crown-rays resolve into fine gold filaments — radiation harvested as circuitry',
  },
  geopolitics: {
    id: 'geopolitics',
    figure: 'Atlas',
    greekName: 'Ἄτλας',
    archetype: 'the bearer of the world-order — every alliance is a hand that helps or lets go',
    visualDna: 'Atlas in three-quarter fresco view, massive shoulders hunched beneath a dark celestial sphere of faint geometric panels, terracotta and umber',
    filamentMotif: 'the sphere\'s panel seams glow with gold filaments, one joint visibly fraying — the order\'s load-bearing lines',
  },
  'cognitive-science': {
    id: 'cognitive-science',
    figure: 'Metis',
    greekName: 'Μῆτις',
    archetype: 'thought itself — the wisdom swallowed into Zeus, mother of strategic mind',
    visualDna: 'a contemplative goddess in fresco profile, eyes half-closed in inner calculation, temple touched by one finger, lapis and verdigris',
    filamentMotif: 'fine filaments branch from her temple like a dendritic tree of light — decision pathways thinking themselves',
  },
  'digital-society': {
    id: 'digital-society',
    figure: 'Iris',
    greekName: 'Ἶρις',
    archetype: 'the divine messenger — the first network was a goddess on a rainbow',
    visualDna: 'a swift goddess in fresco profile mid-stride, winged sandals, trailing a faint arc of layered color behind her, lapis and rose-cinnabar',
    filamentMotif: 'her rainbow arc decomposes into fine parallel filaments — a spectrum unbundled into channels',
  },
  'behavioral-economics': {
    id: 'behavioral-economics',
    figure: 'Dionysus',
    greekName: 'Διόνυσος',
    archetype: 'the irrational within — every nudge is a negotiation with him',
    visualDna: 'a languid god in fresco profile crowned with ivy, leopard skin on shoulder, knowing sideways smile, deep cinnabar and ochre',
    filamentMotif: 'his ivy vines carry faint gold filaments spiraling like impulses — desire mapped as light',
  },
  'urban-studies': {
    id: 'urban-studies',
    figure: 'Daedalus',
    greekName: 'Δαίδαλος',
    archetype: 'the architect — every city is a labyrinth someone designed and someone else must live in',
    visualDna: 'a gaunt master-builder in fresco profile, measuring a labyrinth plan held in his hands, ochre and bone-white, aged and intent',
    filamentMotif: 'the labyrinth walls on his plan glow as fine filaments — the city plan thinking its own flows',
  },
  'development-economics': {
    id: 'development-economics',
    figure: 'Demeter',
    greekName: 'Δημήτηρ',
    archetype: 'growth that feeds — grain cycles, seasons, and the economics of what sustains',
    visualDna: 'a mature goddess in fresco profile holding sheaves of wheat, patient and cyclical gaze, ochre and verdigris',
    filamentMotif: 'the wheat stalks\' veins glow as fine gold filaments — yield curves grown, not drawn',
  },
  'computational-social-science': {
    id: 'computational-social-science',
    figure: 'Arachne',
    greekName: 'Ἀράχνη',
    archetype: 'the weaver — social reality as pattern, networks as the loom',
    visualDna: 'a focused mortal weaver in fresco profile at a loom, threads radiating between her fingers, lapis and ochre',
    filamentMotif: 'her warp threads are luminous filaments forming a visible network mesh — the social graph woven, not drawn',
  },
  bioethics: {
    id: 'bioethics',
    figure: 'Asclepius',
    greekName: 'Ἀσκληπιός',
    archetype: 'struck down for raising the dead — the first bioethics dilemma in history',
    visualDna: 'a bearded healer-god in fresco profile with serpent-entwined staff, grave downward gaze, bone-white and terracotta',
    filamentMotif: 'the serpent on his staff carries a single fine gold filament along its spine — the thin line between healing and hubris',
  },
  'complexity-science': {
    id: 'complexity-science',
    figure: 'Proteus',
    greekName: 'Πρωτεύς',
    archetype: 'the shape-shifter — truth only to those who hold on through every transformation',
    visualDna: 'an ancient sea-god in fresco profile, form visibly flickering at the edges — part lion, part wave, part flame within one silhouette, verdigris and lapis',
    filamentMotif: 'each metamorphic edge is traced in shifting steel-blue filaments — phase transitions drawn in light',
  },
  'risk-analysis': {
    id: 'risk-analysis',
    figure: 'Cassandra',
    greekName: 'Κασσάνδρα',
    archetype: 'the tail-risk prophet — every black swan was visible to someone nobody believed',
    visualDna: 'a wild-eyed prophetess in fresco profile, hair loose, one hand raised in unheeded warning, cinnabar and bone-white',
    filamentMotif: 'from her open mouth escapes not speech but a fine gold filament that frays into darkness — the warning nobody prices',
  },
};

export function getDeskPortrait(deskId: string): DeskPortrait | undefined {
  return DESK_PORTRAITS[deskId];
}

/** Static URL where the generated portrait lives (see scripts/gen-researcher-portraits). */
export function deskPortraitUrl(deskId: string): string {
  return `/researchers/${deskId}.webp`;
}
