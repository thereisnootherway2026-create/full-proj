import { describe, expect, it } from 'vitest'
import { buildPatientContext, generateChecklist } from './ChecklistEngine.js'

const allergy = (label) => ({ type: 'allergy', label, detail: label })
const ids = (items) => items.map((i) => i.id)

describe('allergy rules and the three-state status', () => {
  it('no allergy data and no status -> "Vérifier les allergies", no critical banner', () => {
    const items = generateChecklist(buildPatientContext({}, [], []))
    expect(ids(items)).toContain('allergies_verify')
    expect(items.find((i) => i.id === 'allergies_verify')).toMatchObject({ priority: 'important', title: 'Vérifier les allergies', isAllergy: false })
    expect(items.some((i) => i.isAllergy)).toBe(false)
  })

  it('explicit unknown -> verify item', () => {
    expect(ids(generateChecklist(buildPatientContext({ allergiesStatus: 'unknown' }, [], [])))).toContain('allergies_verify')
  })

  it('verified none -> no verify item and no banner (unknown is never treated as none)', () => {
    const items = generateChecklist(buildPatientContext({ allergiesStatus: 'none' }, [], []))
    expect(ids(items)).not.toContain('allergies_verify')
    expect(items.some((i) => i.isAllergy)).toBe(false)
  })

  it('listed penicillin -> non-dismissible critical banner', () => {
    const items = generateChecklist(buildPatientContext({ allergiesStatus: 'listed' }, [allergy('Pénicilline')], []))
    const banner = items.find((i) => i.id === 'allergy_penicillin')
    expect(banner).toMatchObject({ priority: 'critical', isAllergy: true })
    expect(banner.autoCompleteWhen({}, [])).toBe(false)
    expect(ids(items)).not.toContain('allergies_verify')
  })

  it('a listed allergy with no status is derived as listed', () => {
    const items = generateChecklist(buildPatientContext({}, [allergy('Latex')], []))
    expect(ids(items)).toContain('allergy_other')
  })

  it('status unknown with allergy alerts left over: no critical banner, verify item instead', () => {
    const items = generateChecklist(buildPatientContext({ allergiesStatus: 'unknown' }, [allergy('Pénicilline')], []))
    expect(ids(items)).toEqual(expect.arrayContaining(['allergies_verify']))
    expect(items.some((i) => i.isAllergy)).toBe(false)
  })

  it('the verify item auto-completes once a status is recorded', () => {
    const item = generateChecklist(buildPatientContext({}, [], [])).find((i) => i.id === 'allergies_verify')
    expect(item.autoCompleteWhen({ allergiesStatus: 'unknown' }, [])).toBe(false)
    expect(item.autoCompleteWhen({}, [])).toBe(false)
    expect(item.autoCompleteWhen({ allergiesStatus: 'none' }, [])).toBe(true)
    expect(item.autoCompleteWhen({ allergiesStatus: 'listed' }, [])).toBe(true)
  })
})
