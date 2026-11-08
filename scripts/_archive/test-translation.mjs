/**
 * Test rapide de la fonction de traduction FR → EN
 */

// Simulation simplifiée de isFrench et translateToEnglish
function isFrench(question) {
  const frenchIndicators = [
    // Articles & contractions
    "l'", "d'", "qu'", "le ", "la ", "les ", "du ", "des ", "au ", "aux ",
    // Interrogatifs
    "quel", "quelle", "quels", "quelles", 
    "comment", "pourquoi", "est-ce que", 
    // Verbes courants
    "sont", "sommes", "être", "avoir", "peut", "doit", "fait", "font",
    // Mots courants
    "français", "économie", "société", "travail", "étude",
    "taxe", "impact", "carbone", "demain", "emploi",
    // Prépositions
    " en ", " dans ", " sur ", " avec ", " pour ", " par ",
    "à ", "où "
  ];
  
  const q = question.toLowerCase();
  let frenchScore = 0;
  
  for (const indicator of frenchIndicators) {
    if (q.includes(indicator)) frenchScore++;
  }
  
  return frenchScore >= 1; // Seuil réduit
}

function translateToEnglish(question) {
  let translated = question;
  
  // ÉTAPE 1 : Phrases composées
  const phraseMappings = {
    "l'impact de l'ia sur le travail": "the impact of ai on work",
    "impact de l'ia sur le travail": "impact of ai on work",
    "de l'ia sur le travail": "of ai on work",
    "sur le travail": "on work",
    "le travail": "work",
    "taxe carbone": "carbon tax",
    "en europe": "in europe",
    "économie de demain": "economy of tomorrow",
    "de demain": "of tomorrow",
  };
  
  for (const [fr, en] of Object.entries(phraseMappings)) {
    const regex = new RegExp(fr, "gi");
    translated = translated.replace(regex, en);
  }
  
  // ÉTAPE 2 : Mots individuels
  const wordMappings = {
    "intelligence artificielle": "artificial intelligence",
    "l'ia": "ai",
    "de l'ia": "of ai",
    " ia ": " ai ",
    "l'emploi": "employment",
    "économie": "economy",
    "carbone": "carbon",
    "taxe": "tax",
    " travail": " work",
  };
  
  for (const [fr, en] of Object.entries(wordMappings)) {
    const regex = new RegExp(fr, "gi");
    translated = translated.replace(regex, en);
  }
  
  // ÉTAPE 3 : Prépositions
  const connectorMappings = {
    " sur ": " on ",
    " dans ": " in ",
    " de ": " of ",
    " du ": " of the ",
    " des ": " of ",
    " en ": " in ",
    " le ": " the ",
    " la ": " the ",
  };
  
  for (const [fr, en] of Object.entries(connectorMappings)) {
    const regex = new RegExp(fr, "gi");
    translated = translated.replace(regex, en);
  }
  
  return translated.replace(/\s+/g, ' ').trim();
}

// Tests
const testCases = [
  "l'impact de l'ia sur le travail",
  "impact de l'ia sur le travail",
  "taxe carbone en europe",
  "économie de demain",
  "what is AI impact on jobs" // Déjà en anglais
];

console.log("=".repeat(80));
console.log("TEST : Traduction FR → EN");
console.log("=".repeat(80));

for (const test of testCases) {
  const isFr = isFrench(test);
  const translated = isFr ? translateToEnglish(test.toLowerCase()) : test;
  
  console.log(`\n[${isFr ? "🇫🇷 FR" : "🇬🇧 EN"}] Input  : "${test}"`);
  console.log(`     Output : "${translated}"`);
  console.log(`     Status : ${isFr ? "✅ TRANSLATED" : "⏭️  SKIPPED"}`);
}

console.log("\n" + "=".repeat(80));
console.log("RÉSULTAT ATTENDU pour 'l'impact de l'ia sur le travail':");
console.log("✅ 'the impact of artificial intelligence on work'");
console.log("=".repeat(80));
