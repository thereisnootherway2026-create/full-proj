import { describe, expect, it, vi } from 'vitest'

const gemini = vi.fn()
vi.mock('./aiAgent', () => ({ callGeminiApi: (...args) => gemini(...args) }))

const { arretFin, buildExamRequestBody, examCategory, defaultDraft, generateDocumentBody, guessCertificatKind, improveDocumentWithAI, normalizeDocumentDrafts } = await import('./medicalDocuments')
const { normalizeNote } = await import('./encounterService')

const patient = { prenom: 'Othmane', nom: 'Alami', sexe: 'homme', date_naissance: '1990-05-12', antecedents: 'HTA', allergies: 'Aucune' }
const note = normalizeNote({
  motif: 'Lombalgie aiguë',
  histoire: 'Douleur lombaire après effort',
  vitals: { bloodPressureSystolic: '130', bloodPressureDiastolic: '80', temperature: '37.2' },
  examen: 'Contracture paravertébrale',
  diagnostics: ['Lumbago'],
  traitements: [{ medicament: 'Ibuprofène 400', posologie: '1 cp x3/j', duree: '5 jours' }],
  examens: ['Radiographie lombaire'],
})

describe('medical documents', () => {
  it('arrêt de travail: dates and default length come from the consultation', () => {
    const d = { ...defaultDraft('Arrêt de travail', note), debut: '2026-09-26' }
    expect(d.jours).toBe(5)
    expect(arretFin(d)).toBe('2026-09-30')
    const body = generateDocumentBody('Arrêt de travail', { note, patient, doctorName: 'Dr. Azri', draft: d })
    expect(body).toContain('M. Othmane Alami, né le 12 mai 1990')
    expect(body).toContain('arrêt de travail de 5 jours, du 26 septembre 2026 au 30 septembre 2026 inclus')
    expect(body).toContain('Dr. Azri')
  })

  it('courrier au confrère carries the clinical synthesis', () => {
    const body = generateDocumentBody('Courrier au confrère', { note, patient, doctorName: 'Azri', draft: { destinataire: 'Rhumatologue' } })
    expect(body).toContain("À l'attention de : Rhumatologue")
    expect(body).toContain('TA 130/80 mmHg')
    expect(body).toContain('- Ibuprofène 400 — 1 cp x3/j — 5 jours')
    expect(body).toContain('Antécédents : HTA.')
    expect(body).not.toContain('Allergies')
  })

  it('compte-rendu lists every filled section', () => {
    const body = generateDocumentBody('Compte-rendu de consultation', { note, patient, doctorName: 'Azri', draft: {} })
    for (const h of ['MOTIF', 'HISTOIRE DE LA MALADIE', 'EXAMEN CLINIQUE', 'DIAGNOSTIC', 'TRAITEMENT', 'EXAMENS COMPLÉMENTAIRES']) expect(body).toContain(h)
    expect(body).not.toContain('SUIVI')
  })

  it('certificat kind is guessed from the motif', () => {
    expect(guessCertificatKind(normalizeNote({ motif: "Certificat d'aptitude sportive" }))).toBe('aptitude_sport')
    expect(guessCertificatKind(note)).toBe('etat')
  })

  it('drafts are kept only for documents still in the list, and survive normalizeNote', () => {
    expect(Object.keys(normalizeDocumentDrafts({ 'Arrêt de travail': { body: 'x' }, 'Certificat médical': { body: 'y' } }, ['Arrêt de travail']))).toEqual(['Arrêt de travail'])
    const n = normalizeNote({ documents: ['Arrêt de travail'], documentDrafts: { 'Arrêt de travail': { body: 'Texte', jours: 4 } } })
    expect(n.documentDrafts['Arrêt de travail']).toMatchObject({ body: 'Texte', jours: 4 })
  })

  it('demande d\'examens groups by kind and carries the clinical context', () => {
    const exams = ['NFS', 'CRP', 'Radiographie thoracique', 'ECG'].map((label) => ({ label, category: examCategory(label) }))
    expect(exams.map((e) => e.category)).toEqual(['biologie', 'biologie', 'imagerie', 'autre'])
    const body = buildExamRequestBody({ patient, exams, renseignements: 'Toux fébrile — Pneumopathie ?' })
    expect(body).toContain('Prière de pratiquer chez M. Othmane Alami, né le 12 mai 1990')
    expect(body).toContain('BIOLOGIE\n- NFS\n- CRP')
    expect(body).toContain('IMAGERIE\n- Radiographie thoracique')
    expect(body).toContain('EXPLORATIONS\n- ECG')
    expect(body).toContain('Renseignements cliniques : Toux fébrile — Pneumopathie ?')
  })

  it('a single-kind request has no section titles', () => {
    const body = buildExamRequestBody({ patient, exams: [{ label: 'NFS', category: 'biologie' }] })
    expect(body).not.toContain('BIOLOGIE')
    expect(body).toContain('- NFS')
    expect(body).not.toContain('Renseignements')
  })

  it('the AI never receives the patient identity', async () => {
    gemini.mockImplementation(async ({ userPrompt }) => `Reformulé : ${userPrompt}`)
    const out = await improveDocumentWithAI('Certificat médical', 'Je certifie avoir examiné M. Othmane Alami, né le 12 mai 1990.', patient)
    const sent = gemini.mock.calls[0][0].userPrompt
    expect(sent).not.toMatch(/Othmane|Alami|1990/)
    expect(out).toContain('Othmane Alami')
    expect(out).toContain('12 mai 1990')
  })
})
