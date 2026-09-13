import medicalDictionary from '../data/medicalDictionary.json';

/**
 * Extrait les termes médicaux significatifs d'une liste de consultations
 * @param {Array} consultations - Liste des consultations du patient
 * @returns {Array<{term: string, frequency: number, lastUsedAt: number}>} Termes avec leur score
 */
export function extractMedicalTerms(consultations) {
  const frequencyMap = new Map();
  const lastUsedMap = new Map();

  if (!consultations || !Array.isArray(consultations)) return [];

  consultations.forEach((visit, index) => {
    const allTextParts = [
      visit.reason,
      visit.notes,
      visit.diagnosis,
      visit.plan,
      visit.symptoms,
      visit.clinicalExam,
      visit.assessment
    ].filter(Boolean).map(String);

    const allText = allTextParts.join(' ');

    // Séparer les tokens : mots et abréviations
    const tokens = allText.match(/[\p{L}'’\-0-9]+/gu) || [];

    tokens.forEach(token => {
      const cleaned = token.trim().toLowerCase();
      if (cleaned.length < 2) return;

      // Mots complets
      if (!frequencyMap.has(cleaned)) {
        frequencyMap.set(cleaned, 0);
      }
      frequencyMap.set(cleaned, frequencyMap.get(cleaned) + 1);
      lastUsedMap.set(cleaned, Date.now() - (index * 86400000)); // Plus récent = plus vieil index = plus proche de now

      // Vérifier aussi les abréviations (en majuscules)
      const upperToken = token.trim().toUpperCase();
      if (medicalDictionary.abbreviations[upperToken]) {
        if (!frequencyMap.has(upperToken)) {
          frequencyMap.set(upperToken, 0);
        }
        frequencyMap.set(upperToken, frequencyMap.get(upperToken) + 2);
        lastUsedMap.set(upperToken, Date.now() - (index * 86400000));

        // Aussi la version étendue
        const expanded = medicalDictionary.abbreviations[upperToken];
        if (!frequencyMap.has(expanded)) {
          frequencyMap.set(expanded, 0);
        }
        frequencyMap.set(expanded, frequencyMap.get(expanded) + 3);
        lastUsedMap.set(expanded, Date.now() - (index * 86400000));
      }
    });
  });

  const results = [];
  for (const [term, frequency] of frequencyMap.entries()) {
    // Ne garder que les termes qui apparaissent au moins 2 fois ou qui sont des abréviations
    if (frequency >= 2) {
      results.push({
        term,
        frequency,
        lastUsedAt: lastUsedMap.get(term)
      });
    }
  }
  return results;
}

/**
 * Calcul du score pour une suggestion historique
 * @param {{term: string, frequency: number, lastUsedAt: number}} entry - Entrée terme
 * @param {string} currentInput - Texte actuellement saisi
 * @returns {number} Score
 */
function calculateHistoryScore(entry, currentInput) {
  if (!currentInput) return 0;
  const lowerInput = currentInput.toLowerCase();
  const lowerTerm = entry.term.toLowerCase();

  let score = 0;
  // Commence par l'input : boost majeur
  if (lowerTerm.startsWith(lowerInput)) {
    score += 100;
  }
  // Contient l'input
  else if (lowerTerm.includes(lowerInput)) {
    score += 50;
  }
  // Fuzzy match simple (Levenshtein <=2)
  else if (levenshtein(lowerInput, lowerTerm.slice(0, lowerInput.length + 2)) <= 2) {
    score += 30;
  } else {
    return 0;
  }

  // Fréquence : + de points = plus fréquent
  score += Math.min(entry.frequency * 5, 30);

  // Récence : plus récent = meilleur
  const ageDays = Math.max(0, (Date.now() - (entry.lastUsedAt || 0)) / 86400000);
  score += Math.max(0, 25 - ageDays * 0.5);

  return score;
}

function levenshtein(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Obtient les suggestions basées sur l'historique patient
 * @param {Array} consultations - Toutes les consultations du patient
 * @param {string} currentInput - Texte actuel avant le curseur
 * @param {number} [limit=3] - Nombre max de suggestions à retourner
 * @returns {Array<{term: string, score: number, type: 'history'}>} Suggestions
 */
export function getPatientHistorySuggestions(consultations, currentInput, limit = 3) {
  if (!currentInput || currentInput.length < 1) return [];

  const patientTerms = extractMedicalTerms(consultations);
  const scored = patientTerms
    .map(entry => ({
      term: entry.term,
      score: calculateHistoryScore(entry, currentInput),
      type: 'history'
    }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}
