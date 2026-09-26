import { describe, expect, it } from 'vitest'
import {
  clinicalDisplay, hasListedText, isNoneMarker, patientClinicalStates, resolveClinicalStatus, splitClinicalList,
} from './clinicalStatus'

describe('resolveClinicalStatus: unknown is never none', () => {
  it('missing status + no data -> unknown (the old "Aucune allergie" bug)', () => {
    expect(resolveClinicalStatus(undefined, null)).toBe('unknown')
    expect(resolveClinicalStatus(null, '')).toBe('unknown')
    expect(resolveClinicalStatus(undefined, '   ')).toBe('unknown')
    expect(resolveClinicalStatus(undefined, [])).toBe('unknown')
  })

  it('legacy "aucune"-style text without a status stays unknown, never none', () => {
    for (const t of ['aucune', 'Aucune', ' néant ', 'RAS', '-', 'rien']) {
      expect(resolveClinicalStatus(undefined, t)).toBe('unknown')
      expect(resolveClinicalStatus('unknown', t)).toBe('unknown')
    }
  })

  it('missing status + real data -> listed (backfill rule)', () => {
    expect(resolveClinicalStatus(undefined, 'Pénicilline')).toBe('listed')
    expect(resolveClinicalStatus(null, ['Aspirine'])).toBe('listed')
  })

  it('an invalid status is treated as missing', () => {
    expect(resolveClinicalStatus('maybe', null)).toBe('unknown')
    expect(resolveClinicalStatus(42, 'Latex')).toBe('listed')
  })

  it('explicit statuses are respected', () => {
    expect(resolveClinicalStatus('none', null)).toBe('none')
    expect(resolveClinicalStatus('unknown', null)).toBe('unknown')
    expect(resolveClinicalStatus('listed', 'Pénicilline')).toBe('listed')
  })

  it('listed without any item cannot be displayed as a list -> unknown', () => {
    expect(resolveClinicalStatus('listed', '')).toBe('unknown')
    expect(resolveClinicalStatus('listed', 'aucune')).toBe('unknown')
  })

  it('none while data exists shows the data (never hides it)', () => {
    expect(resolveClinicalStatus('none', 'Pénicilline')).toBe('listed')
  })

  it('unknown with leftover text stays unknown (explicit "à vérifier plus tard")', () => {
    expect(resolveClinicalStatus('unknown', 'Pénicilline')).toBe('unknown')
  })
})

describe('text helpers', () => {
  it('detects none markers', () => {
    expect(isNoneMarker('Aucune')).toBe(true)
    expect(isNoneMarker('Pénicilline')).toBe(false)
    expect(hasListedText('aucun')).toBe(false)
    expect(hasListedText(' Latex ')).toBe(true)
    expect(hasListedText(null)).toBe(false)
  })

  it('splits lists on lines, commas and semicolons', () => {
    expect(splitClinicalList('Pénicilline, Latex;\nAspirine')).toEqual(['Pénicilline', 'Latex', 'Aspirine'])
    expect(splitClinicalList('aucune')).toEqual([])
    expect(splitClinicalList(undefined)).toEqual([])
  })
})

describe('clinicalDisplay', () => {
  it('unknown -> amber "à vérifier" label, no items', () => {
    const d = clinicalDisplay('allergies', undefined, null)
    expect(d).toMatchObject({ state: 'unknown', tone: 'warning', label: 'Non renseignées, à vérifier', items: [] })
  })

  it('never renders unknown as "Aucune allergie"', () => {
    const d = clinicalDisplay('allergies', null, '')
    expect(d.label).not.toMatch(/aucune/i)
  })

  it('none -> neutral "Aucune allergie connue" with the verification date', () => {
    const d = clinicalDisplay('allergies', 'none', null, '2026-09-24T10:00:00')
    expect(d).toMatchObject({ state: 'none', tone: 'neutral', label: 'Aucune allergie connue', verifiedLabel: 'vérifié le 24/09/2026' })
  })

  it('none without a date has no verified label', () => {
    expect(clinicalDisplay('antecedents', 'none', null).verifiedLabel).toBeNull()
  })

  it('listed allergies are a danger-toned list; other lists are informational', () => {
    expect(clinicalDisplay('allergies', 'listed', 'Pénicilline, Latex')).toMatchObject({ state: 'listed', tone: 'danger', items: ['Pénicilline', 'Latex'], label: null })
    expect(clinicalDisplay('antecedents', 'listed', 'HTA').tone).toBe('info')
  })

  it('treatments use their own wording', () => {
    expect(clinicalDisplay('medications', 'none', []).label).toBe('Aucun traitement en cours')
    expect(clinicalDisplay('medications', undefined, []).label).toBe('Non renseignés, à vérifier')
  })
})

describe('patientClinicalStates', () => {
  it('pre-migration payload (no status columns) never yields none', () => {
    const states = patientClinicalStates({ allergies: null, antecedents: '' }, [])
    expect(states).toEqual({ allergies: 'unknown', antecedents: 'unknown', medications: 'unknown' })
  })

  it('uses statuses and active medications', () => {
    const states = patientClinicalStates({ allergies_status: 'none', antecedents: 'HTA', medications_status: 'listed' }, ['Amlodipine'])
    expect(states).toEqual({ allergies: 'none', antecedents: 'listed', medications: 'listed' })
  })

  it('handles a null patient (secretary: no clinical access)', () => {
    expect(patientClinicalStates(null)).toEqual({ allergies: 'unknown', antecedents: 'unknown', medications: 'unknown' })
  })
})
