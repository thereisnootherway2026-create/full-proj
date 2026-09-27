import { describe, expect, it } from 'vitest'
import { computeProgress, finalizeConfirmLabel, finalizeWarnings } from './consultationProgress'
import { normalizeNote } from './encounterService'

const renewal = normalizeNote({
  motif: "Renouvellement d'ordonnance",
  traitements: [{ medicament: 'Amlodipine 5 mg', posologie: '1 cp/j', duree: '3 mois' }],
  ordonnance: true,
})

describe('progress counter follows the flow', () => {
  it('full flow counts the 3 sections', () => {
    const p = computeProgress(renewal, { flow: 'full' })
    expect(p.total).toBe(3)
    expect(p.filledCount).toBe(2)
    expect(p.missing).toEqual(['Examen clinique'])
    expect(p.status).toBe('partial')
  })

  it('lightweight flow counts motif + traitement only: a renewal is complete without Examen clinique', () => {
    const p = computeProgress(renewal, { flow: 'lightweight' })
    expect(p.total).toBe(2)
    expect(p.sections.map((s) => s.label)).toEqual(['Motif & symptômes', 'Traitement'])
    expect(p.filledCount).toBe(2)
    expect(p.missing).toEqual([])
    expect(p.status).toBe('complete')
  })

  it('lightweight: a renewal date without medication does not fill "Traitement"', () => {
    const onlyDate = normalizeNote({ motif: "Renouvellement d'ordonnance", followUpDate: '2026-12-26' })
    const p = computeProgress(onlyDate, { flow: 'lightweight' })
    expect(p.filledCount).toBe(1)
    expect(p.missing).toEqual(['Traitement'])
  })

  it('defaults to the full flow', () => {
    expect(computeProgress(renewal).total).toBe(3)
  })
})

describe('finished consultation', () => {
  it('a closed draft does not read as "chargement du brouillon" once done', () => {
    const before = computeProgress(renewal, { ready: false, flow: 'lightweight' })
    expect(before.blockers).toContain('chargement du brouillon')
    const done = computeProgress(renewal, { ready: false, flow: 'lightweight', done: true })
    expect(done.status).toBe('done')
    expect(done.blockers).toEqual([])
    expect(done.canFinish).toBe(false)
  })
})

describe('finalize warnings', () => {
  const withVitals = { ...renewal, vitals: { ...renewal.vitals, heartRate: '72' } }
  const withDiag = { ...renewal, diagnostics: ['HTA (I10)'] }

  it('full flow without diagnosis asks for an explicit confirmation', () => {
    expect(finalizeWarnings(withVitals, { flow: 'full' }).map((w) => w.id)).toEqual(['no_diagnosis'])
  })
  it('full flow without any vital (0/9) asks for an explicit confirmation', () => {
    expect(finalizeWarnings(withDiag, { flow: 'full' }).map((w) => w.id)).toEqual(['no_vitals'])
  })
  it('both missing: both warnings, one checkbox', () => {
    const w = finalizeWarnings(renewal, { flow: 'full' })
    expect(w.map((x) => x.id)).toEqual(['no_diagnosis', 'no_vitals'])
    expect(finalizeConfirmLabel(w)).toBe('Je confirme terminer la consultation sans diagnostic ni constantes')
  })
  it('a single vital is enough', () => {
    expect(finalizeWarnings({ ...withDiag, vitals: { ...withDiag.vitals, temperature: '37.2' } }, { flow: 'full' })).toEqual([])
  })
  it('lightweight flow (renewal) requires neither diagnosis nor vitals', () => {
    expect(finalizeWarnings(renewal, { flow: 'lightweight' })).toEqual([])
  })
  it('checkbox wording', () => {
    expect(finalizeConfirmLabel(finalizeWarnings(withVitals, { flow: 'full' }))).toBe('Je confirme terminer la consultation sans diagnostic')
    expect(finalizeConfirmLabel(finalizeWarnings(withDiag, { flow: 'full' }))).toBe('Je confirme terminer la consultation sans constantes')
  })
})
