import { describe, expect, it } from 'vitest'
import { prescribingReadiness, pregnancyRelevant } from './prescribingReadiness'

const TODAY = new Date(2026, 8, 24)
const born = (age: number) => `${2026 - age}-01-01`

describe('prescribingReadiness', () => {
  it('quick-created patient (name + phone only) is missing age and sexe', () => {
    expect(prescribingReadiness({}, {}, TODAY)).toEqual({ ready: false, missing: ['age', 'sexe'] })
    expect(prescribingReadiness(null, null, TODAY)).toEqual({ ready: false, missing: ['age', 'sexe'] })
  })

  it('a man with an age is ready', () => {
    expect(prescribingReadiness({ date_naissance: born(40), sexe: 'homme' }, {}, TODAY)).toEqual({ ready: true, missing: [] })
  })

  it('a woman aged 12-50 also needs the pregnancy status', () => {
    expect(prescribingReadiness({ date_naissance: born(30), sexe: 'femme' }, {}, TODAY).missing).toEqual(['grossesse'])
    expect(prescribingReadiness({ date_naissance: born(12), sexe: 'femme' }, {}, TODAY).missing).toEqual(['grossesse'])
    expect(prescribingReadiness({ date_naissance: born(50), sexe: 'femme' }, {}, TODAY).missing).toEqual(['grossesse'])
  })

  it('outside 12-50 the pregnancy question does not apply', () => {
    expect(prescribingReadiness({ date_naissance: born(11), sexe: 'femme' }, {}, TODAY).ready).toBe(true)
    expect(prescribingReadiness({ date_naissance: born(51), sexe: 'femme' }, {}, TODAY).ready).toBe(true)
  })

  it('a woman of unknown age is asked age AND pregnancy', () => {
    expect(prescribingReadiness({ sexe: 'femme' }, {}, TODAY).missing).toEqual(['age', 'grossesse'])
  })

  it('any recorded pregnancy status satisfies the check, including "inconnu"', () => {
    for (const s of ['non', 'oui', 'allaitement', 'inconnu']) {
      expect(prescribingReadiness({ date_naissance: born(30), sexe: 'femme' }, { pregnancyStatus: s }, TODAY).ready).toBe(true)
    }
    expect(prescribingReadiness({ date_naissance: born(30), sexe: 'femme' }, { pregnancyStatus: '' }, TODAY).ready).toBe(false)
    expect(prescribingReadiness({ date_naissance: born(30), sexe: 'femme' }, { pregnancyStatus: 'peut-être' }, TODAY).ready).toBe(false)
  })

  it('a legacy M/F value is not a known sexe', () => {
    expect(prescribingReadiness({ date_naissance: born(30), sexe: 'M' }, {}, TODAY).missing).toEqual(['sexe'])
  })
})

describe('pregnancyRelevant', () => {
  it('only for women of childbearing age or unknown age', () => {
    expect(pregnancyRelevant({ sexe: 'homme', date_naissance: born(30) }, TODAY)).toBe(false)
    expect(pregnancyRelevant({ sexe: 'femme', date_naissance: born(30) }, TODAY)).toBe(true)
    expect(pregnancyRelevant({ sexe: 'femme' }, TODAY)).toBe(true)
    expect(pregnancyRelevant({ sexe: 'femme', date_naissance: born(70) }, TODAY)).toBe(false)
    expect(pregnancyRelevant(null, TODAY)).toBe(false)
  })
})
