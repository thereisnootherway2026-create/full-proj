import medicalDictionary from '../../data/medicalDictionary.json';
import { getPatientHistorySuggestions } from '../../lib/patientHistorySuggestions';

/**
 * Types de suggestions médicales et meta-informations
 * @typedef {'correction' | 'prediction' | 'abbreviation' | 'template' | 'history'} SuggestionType
 */

/**
 * @param {string} a
 * @param {string} b
 * @returns {number} Distance de Levenshtein
 */
function levenshteinDistance(a, b) {
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
 * Badge et couleur selon type de suggestion
 * @param {SuggestionType} type
 * @returns {{badge: string, colorClass: string, ghostColor: string}}
 */
export function getSuggestionMeta(type) {
  switch (type) {
    case 'correction':
      return { badge: 'Correction', colorClass: 'suggestion-correction', ghostColor: '#FCA5A5' };
    case 'prediction':
      return { badge: 'Prédiction', colorClass: 'suggestion-prediction', ghostColor: '#CBD5E1' };
    case 'abbreviation':
      return { badge: 'Abréviation', colorClass: 'suggestion-abbreviation', ghostColor: '#93C5FD' };
    case 'template':
      return { badge: 'Template', colorClass: 'suggestion-template', ghostColor: '#C4B5FD' };
    case 'history':
      return { badge: '📋 Historique', colorClass: 'suggestion-history', ghostColor: '#86EFAC' };
    default:
      return { badge: 'Suggestion', colorClass: 'suggestion-default', ghostColor: '#CBD5E1' };
  }
}

/**
 * Recherche toutes les suggestions pour l'input actuel (hors historique patient)
 * @param {string} lastWord - Dernier mot
 * @param {string} lastTwoWords - Deux derniers mots
 * @param {string} fullInputBefore - Tout le texte avant le curseur
 * @returns {Array<{text: string, type: SuggestionType, score: number}>}
 */
function getDictionarySuggestions(lastWord, lastTwoWords, fullInputBefore) {
  const out = [];
  const lowerLastWord = lastWord.toLowerCase();
  const lowerLastTwoWords = lastTwoWords.toLowerCase();
  const lowerFull = fullInputBefore.toLowerCase().trimEnd();

  if (!lowerLastWord) return out;

  // 1) TEMPLATES - PRIORITÉ MAX SI KEYS CORRESPONDENT
  for (const [key, fullTemplate] of Object.entries(medicalDictionary.templates)) {
    const lowerKey = key.toLowerCase();
    if (lowerFull.endsWith(lowerKey) || lowerLastWord === lowerKey || lowerLastWord.startsWith(lowerKey)) {
      let matchScore = 0;
      if (lowerFull.endsWith(lowerKey)) matchScore = 150;
      else if (lowerLastWord === lowerKey) matchScore = 140;
      else if (lowerLastWord.startsWith(lowerKey)) matchScore = 130 + Math.max(0, 50 - levenshteinDistance(lowerLastWord, lowerKey) * 10);
      out.push({ text: fullTemplate, type: 'template', score: matchScore });
    }
  }

  // 2) ABRÉVIATIONS
  const upperLastWord = lastWord.toUpperCase();
  if (medicalDictionary.abbreviations[upperLastWord]) {
    out.push({
      text: medicalDictionary.abbreviations[upperLastWord],
      type: 'abbreviation',
      score: 110
    });
  }

  // 3) CORRECTIONS EXACTES
  if (medicalDictionary.corrections[lowerLastWord]) {
    out.push({ text: medicalDictionary.corrections[lowerLastWord], type: 'correction', score: 120 });
  }
  if (medicalDictionary.corrections[lowerLastTwoWords]) {
    out.push({ text: medicalDictionary.corrections[lowerLastTwoWords], type: 'correction', score: 115 });
  }

  // 4) CORRECTIONS FUZZY (Levenshtein ≤ 2)
  for (const [key, value] of Object.entries(medicalDictionary.corrections)) {
    const d1 = levenshteinDistance(lowerLastWord, key);
    if (d1 > 0 && d1 <= 2) {
      out.push({ text: value, type: 'correction', score: 100 - d1 * 15 });
    }
    if (lowerLastTwoWords) {
      const d2 = levenshteinDistance(lowerLastTwoWords, key);
      if (d2 > 0 && d2 <= 2) {
        out.push({ text: value, type: 'correction', score: 95 - d2 * 15 });
      }
    }
  }

  // 5) PRÉDICTIONS
  for (const [key, values] of Object.entries(medicalDictionary.predictions)) {
    const matchPrefix = lowerLastWord.startsWith(key.toLowerCase()) || lowerLastTwoWords.startsWith(key.toLowerCase());
    if (matchPrefix) {
      values.forEach((val, idx) => {
        const compoundText = (lowerLastWord.startsWith(key.toLowerCase()) ? val : key + ' ' + val);
        out.push({
          text: compoundText,
          type: 'prediction',
          score: 80 - idx * 8
        });
      });
    }
  }

  // Dé-dupliquer par texte (garder celui avec le score max)
  const dedup = new Map();
  for (const s of out) {
    const existing = dedup.get(s.text);
    if (!existing || existing.score < s.score) {
      dedup.set(s.text, s);
    }
  }
  return Array.from(dedup.values());
}

/**
 * Moteur complet de suggestions (dictionnaire + historique patient)
 * @param {string} text - Texte actuel complet
 * @param {number} cursorPosition - Position du curseur
 * @param {Array} [patientConsultations=[]] - Consultations précédentes du patient
 * @returns {Array<{text: string, type: SuggestionType, score: number}>} Top 3 suggestions classées par score
 */
export function getAllSuggestions(text, cursorPosition, patientConsultations = []) {
  if (!text || cursorPosition === 0) return [];

  const textBeforeCursor = text.slice(0, cursorPosition);
  const words = textBeforeCursor.split(/\s+/);
  const lastWord = words[words.length - 1] || '';
  const lastTwoWords = words.slice(-2).join(' ') || '';

  // A) Suggestions du dictionnaire général
  const dictSugg = getDictionarySuggestions(lastWord, lastTwoWords, textBeforeCursor);

  // B) Suggestions de l'historique patient (priorisées)
  const historySugg = getPatientHistorySuggestions(patientConsultations, lastWord || lastTwoWords || textBeforeCursor, 3)
    .map(h => ({
      text: h.term,
      type: 'history',
      score: 160 + h.score // Boost historique par rapport au dictionnaire
    }));

  // Fusionner + trier + dédupliquer (garder historique si même texte)
  const merged = new Map();
  for (const s of [...historySugg, ...dictSugg]) {
    const existing = merged.get(s.text);
    if (!existing || existing.score < s.score) {
      merged.set(s.text, s);
    }
  }

  const sorted = Array.from(merged.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return sorted;
}

// Export legacy compat
export function getMedicalSuggestions(text, cursorPosition) {
  const all = getAllSuggestions(text, cursorPosition);
  return all.slice(0, 1).map(s => s.text);
}

