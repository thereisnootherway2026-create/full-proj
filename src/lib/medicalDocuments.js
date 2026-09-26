import { callGeminiApi } from './aiAgent'
import { formatDoctorLabel } from './professionalName'

// The documents a consultation can hand over. `documents` (labels) stays the list of what
// was handed over — older notes only have that; `documentDrafts` holds each one's text and
// parameters, keyed by the same label, so a document can be reprinted from the history.
export const DOCUMENT_TYPES = [
  { id: 'Certificat médical', short: 'Certificat', desc: 'Atteste de l\'état de santé constaté ce jour.' },
  { id: 'Arrêt de travail', short: 'Arrêt', desc: 'Durée, dates et sorties, calculées automatiquement.' },
  { id: 'Courrier au confrère', short: 'Courrier', desc: 'Lettre d\'adressage avec la synthèse clinique.' },
  { id: 'Compte-rendu de consultation', short: 'Compte-rendu', desc: 'Résumé structuré de la consultation.' },
]
export const DOCUMENT_OPTIONS = DOCUMENT_TYPES.map((t) => t.id)

export const CERTIFICAT_KINDS = [
  ['etat', 'État de santé'],
  ['aptitude_sport', 'Aptitude au sport'],
  ['non_contagion', 'Non-contagion'],
  ['scolaire', 'Dispense scolaire'],
]
export const SORTIES = [['autorisees', 'Sorties autorisées'], ['libres', 'Sorties libres'], ['interdites', 'Sorties interdites']]

const MAX_BODY = 8000
const str = (x) => (typeof x === 'string' ? x : x == null ? '' : String(x))
const isoDay = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(str(x)) ? str(x) : '')

export const clinicToday = () => new Date().toLocaleDateString('fr-CA', { timeZone: 'Africa/Casablanca' })
export const addDays = (dateStr, days) => {
  const d = new Date(`${dateStr}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
export const fmtLongDate = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '')

// One draft: the editable body plus the few parameters the body is generated from.
export function normalizeDocumentDraft(raw) {
  const d = raw && typeof raw === 'object' ? raw : {}
  const jours = Math.round(Number(d.jours))
  return {
    body: str(d.body).slice(0, MAX_BODY),
    kind: CERTIFICAT_KINDS.some(([k]) => k === d.kind) ? d.kind : 'etat',
    jours: Number.isFinite(jours) && jours >= 1 && jours <= 365 ? jours : 3,
    debut: isoDay(d.debut),
    sorties: SORTIES.some(([k]) => k === d.sorties) ? d.sorties : 'autorisees',
    destinataire: str(d.destinataire).slice(0, 200),
    edited: d.edited === true,
    date: isoDay(d.date),
  }
}

export function normalizeDocumentDrafts(raw, labels) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const id of DOCUMENT_OPTIONS) {
    if (labels.includes(id) && raw[id] && typeof raw[id] === 'object') out[id] = normalizeDocumentDraft(raw[id])
  }
  return out
}

// ---- generation from the consultation (deterministic, instant, nothing leaves the browser) ----

const civilite = (patient) => {
  const s = str(patient?.sexe).toLowerCase()
  if (s.startsWith('f')) return { titre: 'Mme', ne: 'née', il: 'elle', le: 'la' }
  if (s.startsWith('h') || s === 'm') return { titre: 'M.', ne: 'né', il: 'il', le: 'le' }
  return { titre: 'M./Mme', ne: 'né(e)', il: 'il/elle', le: 'le/la' }
}

export const patientFullName = (patient) => `${str(patient?.prenom)} ${str(patient?.nom)}`.trim() || 'le patient'

const VITAL_LINES = [
  ['TA', (v) => (v.bloodPressureSystolic && v.bloodPressureDiastolic ? `${v.bloodPressureSystolic}/${v.bloodPressureDiastolic} mmHg` : '')],
  ['FC', (v) => (v.heartRate ? `${v.heartRate} bpm` : '')],
  ['T°', (v) => (v.temperature ? `${v.temperature} °C` : '')],
  ['SpO2', (v) => (v.oxygenSaturation ? `${v.oxygenSaturation} %` : '')],
  ['FR', (v) => (v.respiratoryRate ? `${v.respiratoryRate} /min` : '')],
  ['Poids', (v) => (v.weight ? `${v.weight} kg` : '')],
  ['Glycémie', (v) => (v.bloodSugar ? `${v.bloodSugar} g/L` : '')],
]
const vitalsLine = (vitals = {}) => VITAL_LINES.map(([label, f]) => { const x = f(vitals); return x ? `${label} ${x}` : '' }).filter(Boolean).join(', ')
const treatments = (note) => (note.traitements || []).filter((r) => str(r.medicament).trim())
const treatmentLine = (r) => [r.medicament, r.posologie, r.duree].map(str).map((t) => t.trim()).filter(Boolean).join(' — ')
const sentence = (t) => { const s = str(t).trim(); return s && !/[.!?]$/.test(s) ? `${s}.` : s }
const lower1 = (t) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : t)

// Picks the most likely certificate from the motif (e.g. "Certificat d'aptitude sportive").
export function guessCertificatKind(note) {
  const t = `${note.motif} ${note.conduite} ${(note.diagnostics || []).join(' ')}`.toLowerCase()
  if (/sport|aptitude|licence|club/.test(t)) return 'aptitude_sport'
  if (/contag|crèche|creche|collectivit/.test(t)) return 'non_contagion'
  if (/scol|école|ecole|dispense|eps/.test(t)) return 'scolaire'
  return 'etat'
}

// Rough default length for an arrêt: from the motif/diagnosis, else 3 days.
export function guessArretJours(note) {
  const t = `${note.motif} ${(note.diagnostics || []).join(' ')}`.toLowerCase()
  if (/fracture|entorse grave|chirurg|hospital/.test(t)) return 15
  if (/lombalgie|lumbago|sciatique|entorse|tendinite/.test(t)) return 5
  if (/grippe|covid|pneumo|bronchite/.test(t)) return 5
  if (/gastro|angine|rhino|fièvre|fievre|virose|migraine/.test(t)) return 3
  return 3
}

export function defaultDraft(type, note) {
  return normalizeDocumentDraft({
    kind: type === 'Certificat médical' ? guessCertificatKind(note) : undefined,
    jours: type === 'Arrêt de travail' ? guessArretJours(note) : undefined,
    debut: clinicToday(),
    date: clinicToday(),
  })
}

export function arretFin(draft) {
  return addDays(draft.debut || clinicToday(), Math.max(1, draft.jours) - 1)
}

// The body text of `type` built from the consultation, the patient and the doctor.
export function generateDocumentBody(type, { note, patient, doctorName, draft }) {
  const d = normalizeDocumentDraft(draft)
  const c = civilite(patient)
  const nom = patientFullName(patient)
  const dob = patient?.date_naissance ? `, ${c.ne} le ${fmtLongDate(patient.date_naissance)}` : ''
  const docteur = formatDoctorLabel(doctorName)
  const who = `${c.titre} ${nom}${dob}`
  const diags = (note.diagnostics || []).join(' ; ')
  const today = fmtLongDate(d.date || clinicToday())

  if (type === 'Certificat médical') {
    const intro = `Je soussigné(e), ${docteur}, certifie avoir examiné ce jour, ${today}, ${who}.`
    const bodies = {
      etat: `L'examen clinique pratiqué ce jour${diags ? ` met en évidence : ${diags}` : ' ne révèle pas d\'anomalie particulière'}.${note.conduite.trim() ? `\n\n${sentence(note.conduite)}` : ''}`,
      aptitude_sport: `${c.il.charAt(0).toUpperCase() + c.il.slice(1)} ne présente, à ce jour, aucune contre-indication cliniquement décelable à la pratique du sport, y compris en compétition.`,
      non_contagion: `${c.il.charAt(0).toUpperCase() + c.il.slice(1)} ne présente, à ce jour, aucun signe clinique de maladie contagieuse et peut réintégrer la collectivité.`,
      scolaire: `Son état de santé nécessite une dispense d'éducation physique et sportive${d.jours ? ` pour une durée de ${d.jours} jour${d.jours > 1 ? 's' : ''}` : ''}.`,
    }
    return `${intro}\n\n${bodies[d.kind]}\n\nCertificat établi à la demande de l'intéressé(e) et remis en main propre pour servir et valoir ce que de droit.`
  }

  if (type === 'Arrêt de travail') {
    const debut = d.debut || clinicToday()
    const sorties = { autorisees: 'Les sorties sont autorisées (hors 10h–12h et 16h–18h).', libres: 'Les sorties sont libres.', interdites: 'Les sorties ne sont pas autorisées.' }[d.sorties]
    return `Je soussigné(e), ${docteur}, certifie avoir examiné ce jour, ${today}, ${who}.\n\n`
      + `Son état de santé nécessite un arrêt de travail de ${d.jours} jour${d.jours > 1 ? 's' : ''}, du ${fmtLongDate(debut)} au ${fmtLongDate(arretFin({ ...d, debut }))} inclus, sauf complications.\n\n`
      + `${sorties}\n\nCertificat remis en main propre à l'intéressé(e).`
  }

  const lines = []
  const motif = note.motif.trim()
  const histoire = [note.histoire.trim(), note.depuis && `Depuis : ${lower1(note.depuis)}`, note.evolution && `Évolution : ${lower1(note.evolution)}`].filter(Boolean).join('. ')
  const vit = vitalsLine(note.vitals)
  const rx = treatments(note)

  if (type === 'Courrier au confrère') {
    const dest = d.destinataire.trim()
    if (dest) lines.push(`À l'attention de : ${dest}`)
    lines.push('Cher(e) Confrère,')
    lines.push(`Je vous adresse ${c.titre} ${nom}${patient?.date_naissance ? ` (${c.ne} le ${fmtLongDate(patient.date_naissance)})` : ''}, vu(e) ce jour en consultation${motif ? ` pour ${lower1(motif.replace(/\.$/, ''))}` : ''}.`)
    if (patient?.antecedents?.trim()) lines.push(`Antécédents : ${sentence(patient.antecedents)}`)
    if (patient?.allergies?.trim() && !/^aucune/i.test(patient.allergies.trim())) lines.push(`Allergies : ${sentence(patient.allergies)}`)
    if (histoire) lines.push(`Histoire de la maladie : ${sentence(histoire)}`)
    if (vit || note.examen.trim()) lines.push(`À l'examen : ${[vit, note.examen.trim()].filter(Boolean).map(sentence).join(' ')}`)
    if (diags) lines.push(`Hypothèse(s) diagnostique(s) : ${sentence(diags)}`)
    if (rx.length) lines.push(`Traitement en cours :\n${rx.map((r) => `- ${treatmentLine(r)}`).join('\n')}`)
    if (note.examens?.length) lines.push(`Examens demandés : ${sentence(note.examens.join(', '))}`)
    lines.push(`Je vous remercie de bien vouloir ${c.le} recevoir pour avis spécialisé et prise en charge.`)
    lines.push('Je vous prie d\'agréer, cher(e) Confrère, l\'expression de mes salutations confraternelles.')
    return lines.join('\n\n')
  }

  // Compte-rendu de consultation
  lines.push(`Patient : ${c.titre} ${nom}${patient?.date_naissance ? ` (${c.ne} le ${fmtLongDate(patient.date_naissance)})` : ''}\nDate : ${today}`)
  if (motif) lines.push(`MOTIF\n${sentence(motif)}`)
  if (histoire) lines.push(`HISTOIRE DE LA MALADIE\n${sentence(histoire)}`)
  if (vit || note.examen.trim()) lines.push(`EXAMEN CLINIQUE\n${[vit && `Constantes : ${vit}.`, sentence(note.examen)].filter(Boolean).join('\n')}`)
  if (diags) lines.push(`DIAGNOSTIC\n${sentence(diags)}`)
  if (note.conduite.trim()) lines.push(`CONDUITE À TENIR\n${sentence(note.conduite)}`)
  if (rx.length) lines.push(`TRAITEMENT\n${rx.map((r) => `- ${treatmentLine(r)}`).join('\n')}`)
  if (note.examens?.length) lines.push(`EXAMENS COMPLÉMENTAIRES\n${note.examens.map((x) => `- ${x}`).join('\n')}`)
  const follow = [note.followUpDate && `Prochain contrôle le ${fmtLongDate(note.followUpDate)}.`, sentence(note.followUpNotes)].filter(Boolean).join(' ')
  if (follow) lines.push(`SUIVI\n${follow}`)
  return lines.join('\n\n')
}

// ---- demande d'examens (for the lab / radiology) ----
// Grouped biologie / imagerie / autres; `renseignements` is the clinical context the lab
// or radiologist needs (motif, diagnostic), optional.
const EXAM_GROUPS = [['biologie', 'Biologie'], ['imagerie', 'Imagerie'], ['autre', 'Explorations']]
export function buildExamRequestBody({ patient, exams, renseignements = '' }) {
  const c = civilite(patient)
  const nom = patientFullName(patient)
  const dob = patient?.date_naissance ? `, ${c.ne} le ${fmtLongDate(patient.date_naissance)}` : ''
  const lines = [`Prière de pratiquer chez ${c.titre} ${nom}${dob}, les examens suivants :`]
  const byGroup = EXAM_GROUPS
    .map(([key, title]) => [title, exams.filter((e) => (e.category || 'biologie') === key).map((e) => e.label)])
    .filter(([, labels]) => labels.length)
  const multiple = byGroup.length > 1
  for (const [title, labels] of byGroup) lines.push(`${multiple ? `${title.toUpperCase()}\n` : ''}${labels.map((l) => `- ${l}`).join('\n')}`)
  if (renseignements.trim()) lines.push(`Renseignements cliniques : ${sentence(renseignements)}`)
  lines.push('Merci de bien vouloir me transmettre les résultats.')
  return lines.join('\n\n')
}

// Same rule as mm_exam_category (SQL), so the printed grouping matches the stored one.
export function examCategory(label) {
  const t = String(label || '')
  if (/(radio|rx\b|[ée]cho|irm|scanner|tdm|mammo|doppler|imagerie|ost[ée]odensit|panoramique)/i.test(t)) return 'imagerie'
  if (/(ecg|[ée]lectrocardio|eeg|emg|holter|spirom|efr|fond d.?oeil|audiogram|endoscop|fibroscop|coloscop)/i.test(t)) return 'autre'
  return 'biologie'
}

// ---- optional AI rewrite ----
// The patient's identity never leaves the browser: names and the birth date are swapped
// for placeholders before the call and put back afterwards.
export async function improveDocumentWithAI(type, body, patient) {
  const secrets = [
    [patientFullName(patient), '[PATIENT]'],
    [str(patient?.nom).trim(), '[NOM]'],
    [str(patient?.prenom).trim(), '[PRENOM]'],
    [patient?.date_naissance ? fmtLongDate(patient.date_naissance) : '', '[DATE_NAISSANCE]'],
  ].filter(([v]) => v && v.length >= 2 && v !== 'le patient')
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  let masked = body
  for (const [v, tag] of secrets) masked = masked.replace(new RegExp(esc(v), 'gi'), tag)

  const systemInstruction = `Tu es un médecin rédacteur au Maroc. Tu améliores un document médical rédigé en français (${type}).
Règles strictes :
- Conserve EXACTEMENT tous les faits, chiffres, dates, médicaments, posologies et durées. N'invente aucun fait clinique.
- Conserve tels quels les jetons [PATIENT], [NOM], [PRENOM], [DATE_NAISSANCE].
- Style médical formel, clair et concis. Pas de titre de document ni de signature : ils sont ajoutés à l'impression.
- Réponds uniquement avec le texte final, en texte brut (sans Markdown).`
  const out = await callGeminiApi({ systemInstruction, userPrompt: masked, isJson: false })
  let text = str(out).replace(/\*\*/g, '').trim()
  for (const [v, tag] of secrets) text = text.split(tag).join(v)
  return text.slice(0, MAX_BODY)
}
