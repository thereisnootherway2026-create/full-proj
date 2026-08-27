import { supabase } from './supabase'

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || 'AIzaSyA9WidgKNcv2Z567J4KW8AyrpHQFl3s5sI'
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`

/**
 * Core Gemini API Caller
 */
export async function callGeminiApi({ systemInstruction, userPrompt, isJson = true, inlineData = null }) {
  const parts = [{ text: userPrompt }]
  if (inlineData) {
    parts.push({ inline_data: inlineData })
  }

  const payload = {
    system_instruction: {
      parts: [{ text: systemInstruction }]
    },
    contents: [
      {
        role: 'user',
        parts: parts
      }
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1500,
      ...(isJson ? { responseMimeType: 'application/json' } : {})
    }
  }

  const response = await fetch(GEMINI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Gemini API Error (${response.status}): ${errText}`)
  }

  const resData = await response.json()
  const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text

  if (!rawText) {
    throw new Error('Gemini API returned an empty response.')
  }

  if (isJson) {
    try {
      return JSON.parse(rawText)
    } catch {
      return { rawText }
    }
  }

  return rawText
}

/**
 * 1. Cabinet Strategic Consultant Helper
 */
export async function generateCabinetConsultantReport(metricsPayload) {
  const systemInstruction = `Tu es un consultant expert en gestion et rentabilité de cabinets médicaux au Maroc pour la plateforme MacroMedica. 
Analyse les données transmises et réponds TOUJOURS au format JSON strict avec les clés:
- headline (string court)
- summary (résumé synthétique)
- strengths (tableau de strings)
- opportunities (tableau de strings)
- recommendedActions (tableau de strings d'actions concrètes)
- featureHighlights (tableau d'objets { feature, impact })`

  const userPrompt = `Voici les métriques d'activité du cabinet:
${JSON.stringify(metricsPayload, null, 2)}
Donne ton bilan stratégique d'optimisation.`

  return await callGeminiApi({ systemInstruction, userPrompt, isJson: true })
}

/**
 * 2. Clinical Diagnosis & Triage Helper
 */
export async function generateClinicalDiagnosis(symptoms, patientContext = '') {
  const systemInstruction = `Tu es un assistant médical clinique prudent et rigoureux. 
Analyse les symptômes fournis et fournis des hypothèses diagnostiques orientatives au format JSON strict avec les clés:
- headline (string)
- summary (résumé clinique)
- hypotheses (tableau d'objets { disease, probability, reasoning })
- nextSteps (tableau de tests/examens recommandés)
- cautions (tableau d'alertes/red flags à surveiller)`

  const userPrompt = `Symptômes du patient: ${symptoms}
Contexte patient: ${patientContext || 'Aucun historique spécifique'}`

  return await callGeminiApi({ systemInstruction, userPrompt, isJson: true })
}

/**
 * 3. Lab Document OCR & Anomaly Extraction Helper
 */
export async function analyzeLabDocument(textInput, base64Image = null, mimeType = 'image/png') {
  const systemInstruction = `Tu es un biologiste médical et médecin analyste expert. 
Lis ce résultat de laboratoire et extrait les paramètres au format JSON strict avec les clés:
- title (titre de l'analyse)
- summary (résumé biologique)
- anomalies (tableau d'objets { param, value, norm, label, status })
- normalFindings (tableau de paramètres normaux)
- recommendations (recommandations d'actions cliniques)`

  const inlineData = base64Image ? { mime_type: mimeType, data: base64Image } : null
  const userPrompt = textInput || 'Veuillez analyser ce document de laboratoire.'

  return await callGeminiApi({ systemInstruction, userPrompt, isJson: true, inlineData })
}

/**
 * 4. Agenda & Smart Schedule Audit Helper
 */
export async function auditSmartSchedule(scheduleData) {
  const systemInstruction = `Tu es un coordinateur d'agenda médical et expert en flux de rendez-vous pour MacroMedica.
Analyse l'emploi du temps et réponds au format JSON strict avec les clés:
- headline (string)
- summary (résumé)
- pressurePoints (goulots d'étranglement détectés)
- opportunities (créneaux sous-optimisés)
- recommendedActions (actions d'optimisation)
- slotAlerts (alertes sur créneaux à risques)`

  const userPrompt = `Voici les données du calendrier:
${JSON.stringify(scheduleData, null, 2)}`

  return await callGeminiApi({ systemInstruction, userPrompt, isJson: true })
}

/**
 * 5. Medical Scribe & Letter Generator Helper
 */
export async function generateScribeLetter(notes) {
  const systemInstruction = `Tu es un secrétaire médical et médecin rédacteur hautement qualifié en France et au Maroc.
Transforme les notes brutes fournies par le médecin en une lettre médicale formelle, élégante et rigoureuse en français.
Réponds uniquement en texte brut (pas de JSON).`

  const userPrompt = `Voici les notes brutes de consultation:
${notes}`

  return await callGeminiApi({ systemInstruction, userPrompt, isJson: false })
}

/**
 * Save AI Output to Patient Record in Supabase
 */
export async function saveAiOutputToPatientRecord({ cabinetId, patientId, title, content, source, documentName }) {
  if (!patientId) {
    throw new Error('Un patient doit être sélectionné pour enregistrer au dossier.')
  }

  const textContent = typeof content === 'object' ? JSON.stringify(content, null, 2) : String(content)

  const { data, error } = await supabase.from('consultations').insert([
    {
      patient_id: patientId,
      notes: `[${source || 'IA Macromedica'}] ${title || 'Compte-rendu IA'}:\n\n${textContent}`,
      statut: 'Terminée',
      date_consult: new Date().toISOString()
    }
  ])

  if (error) {
    throw error
  }

  return data
}
