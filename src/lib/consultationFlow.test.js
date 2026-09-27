import { describe, expect, it } from 'vitest'
import { RENEWAL_CONDUITE, applyRenewal, lastActiveOrdonnance, motifFlow, motifKind, ordonnanceToTreatments, prefillRenewalEdit } from './consultationFlow'
import { normalizeNote } from './encounterService'

describe('motif flow', () => {
  it('renouvellement d\'ordonnance is lightweight, however it is typed', () => {
    for (const m of ["Renouvellement d'ordonnance", 'renouvellement ordonnance', 'RENOUVELLEMENT DU TRAITEMENT', 'Renouvellement de traitement HTA', 'Ordonnance à renouveler']) {
      expect(motifFlow(m)).toBe('lightweight')
    }
    expect(motifKind("Renouvellement d'ordonnance")).toBe('renouvellement_ordonnance')
  })

  it('every other motif keeps the full form', () => {
    for (const m of ['Bilan de santé / check-up', 'Suivi de maladie chronique', "Résultats d'examens", 'Fièvre', '', 'Renouvellement']) {
      expect(motifFlow(m)).toBe('full')
    }
  })

  it('only the first line is the motif', () => {
    expect(motifFlow('Fièvre\nrenouvellement ordonnance prévu la semaine prochaine')).toBe('full')
  })
})

describe('last active ordonnance', () => {
  const ords = [
    { id: 'draft', statut: 'brouillon', lignes: [{ medicament: 'A' }] },
    { id: 'empty', statut: 'emise', lignes: [{ medicament: '  ' }] },
    { id: 'ok', statut: 'emise', lignes: [{ medicament: 'Amlodipine 5mg', posologie: '1 cp/j', duree: '3 mois' }, { medicament: '' }] },
    { id: 'older', statut: 'emise', lignes: [{ medicament: 'B' }] },
  ]
  it('skips drafts, cancelled and empty ordonnances; keeps the newest issued one', () => {
    expect(lastActiveOrdonnance(ords)?.id).toBe('ok')
    expect(lastActiveOrdonnance([{ statut: 'annulee', lignes: [{ medicament: 'X' }] }])).toBeNull()
    expect(lastActiveOrdonnance(undefined)).toBeNull()
  })
  it('maps lines to treatment rows, dropping blank ones', () => {
    expect(ordonnanceToTreatments(ords[2])).toEqual([{ medicament: 'Amlodipine 5mg', posologie: '1 cp/j', duree: '3 mois' }])
  })
})

describe('renewal on a resumed draft', () => {
  const ord = { statut: 'emise', lignes: [{ medicament: 'Amlodipine 5mg', posologie: '1 cp/j', duree: '3 mois' }, { medicament: 'Metformine 850mg', posologie: '2 cp/j', duree: '3 mois' }] }
  const base = normalizeNote({ motif: "Renouvellement d'ordonnance" })

  it('fills the treatment, ticks the ordonnance and fills an empty conduite once', () => {
    const n = applyRenewal(base, ord)
    expect(n.traitements).toEqual(ordonnanceToTreatments(ord))
    expect(n.ordonnance).toBe(true)
    expect(n.conduite).toBe(RENEWAL_CONDUITE)
  })

  it('renewing again after the draft was saved and reopened changes nothing', () => {
    const first = applyRenewal(base, ord)
    // Round-trip through the stored shape, as when a draft is resumed.
    const resumed = normalizeNote(JSON.parse(JSON.stringify(first)))
    const again = applyRenewal(resumed, ord)
    expect(again.conduite).toBe(RENEWAL_CONDUITE)
    expect(again.conduite.match(/Renouvellement/g)).toHaveLength(1)
    expect(again.traitements).toHaveLength(2)
    expect(again).toEqual(resumed)
  })

  it('never overwrites a conduite the doctor typed', () => {
    const typed = { ...base, conduite: 'Contrôle TA dans 1 mois.' }
    expect(applyRenewal(typed, ord).conduite).toBe('Contrôle TA dans 1 mois.')
  })

  it('replaces (not appends) a treatment left in the draft', () => {
    const withRow = { ...base, traitements: [{ medicament: 'Paracétamol', posologie: '', duree: '' }] }
    expect(applyRenewal(withRow, ord).traitements.map((r) => r.medicament)).toEqual(['Amlodipine 5mg', 'Metformine 850mg'])
  })

  it('"Modifier" prefills once and keeps what the doctor already entered', () => {
    const pre = prefillRenewalEdit(base, ord)
    expect(pre.traitements).toHaveLength(2)
    expect(prefillRenewalEdit(pre, ord)).toBe(pre)
    const own = { ...base, traitements: [{ medicament: 'Paracétamol', posologie: '', duree: '' }] }
    expect(prefillRenewalEdit(own, ord)).toBe(own)
    expect(prefillRenewalEdit(base, null).traitements).toEqual([{ medicament: '', posologie: '', duree: '' }])
  })
})

describe('follow-up reminder fields', () => {
  it('reminder is on by default; only an explicit false opts out', () => {
    expect(normalizeNote({}).followUpReminder).toBe(true)
    expect(normalizeNote({ followUpReminder: true }).followUpReminder).toBe(true)
    expect(normalizeNote({ followUpReminder: false }).followUpReminder).toBe(false)
  })
  it('kind is "renouvellement" or "controle", nothing else', () => {
    expect(normalizeNote({}).followUpKind).toBe('controle')
    expect(normalizeNote({ followUpKind: 'renouvellement' }).followUpKind).toBe('renouvellement')
    expect(normalizeNote({ followUpKind: 'autre' }).followUpKind).toBe('controle')
  })
})
