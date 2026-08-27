import { callGeminiApi, saveAiOutputToPatientRecord } from './aiAgent'

/**
 * Patient Dossier AI Analysis Helper
 */
export async function analyzePatientDossier(patientRecordData) {
  const systemInstruction = `Tu es un assistant clinique spécialisé dans la synthèse de dossiers médicaux pour MacroMedica.
Analyse l'historique complet du patient et fournis une synthèse clinique au format JSON strict avec les clés:
- summary (résumé synthétique du patient)
- clinicalHighlights (points forts et antécédents majeurs)
- watchouts (points de vigilance, interactions ou risques)
- recommendedNextSteps (actions et suivis recommandés)`

  const userPrompt = `Voici les données du dossier patient:
${JSON.stringify(patientRecordData, null, 2)}`

  return await callGeminiApi({ systemInstruction, userPrompt, isJson: true })
}

/**
 * Save AI Note to Patient Record Helper
 */
export async function saveAiNoteToPatientRecord({ cabinetId, patientId, content, sourceLabel = 'IA Assistant' }) {
  return await saveAiOutputToPatientRecord({
    cabinetId,
    patientId,
    title: `Note ${sourceLabel}`,
    content,
    source: sourceLabel
  })
}
