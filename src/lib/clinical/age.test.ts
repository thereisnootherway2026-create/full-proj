import { describe, expect, it } from 'vitest'
import {
  approxBirthDateFromAge, computeAge, formatAge, formatAgeSexe, formatFrenchDate, formatSexe, parseFrenchDate, parseIsoDate,
} from './age'

const TODAY = new Date(2026, 8, 24) // 24 Sept 2026

describe('computeAge', () => {
  it('counts whole years, birthday-aware', () => {
    expect(computeAge('1984-09-24', TODAY)).toBe(42)
    expect(computeAge('1984-09-25', TODAY)).toBe(41)
    expect(computeAge('2026-01-01', TODAY)).toBe(0)
  })

  it('null for missing, invalid or future dates', () => {
    expect(computeAge(null, TODAY)).toBeNull()
    expect(computeAge('', TODAY)).toBeNull()
    expect(computeAge('1984-02-30', TODAY)).toBeNull()
    expect(computeAge('2027-01-01', TODAY)).toBeNull()
  })

  it('accepts a timestamp suffix', () => {
    expect(parseIsoDate('1984-09-24T00:00:00Z')?.getDate()).toBe(24)
  })
})

describe('formatAge', () => {
  it('years, with "~" when approximate', () => {
    expect(formatAge('1984-01-01', false, TODAY)).toBe('42 ans')
    expect(formatAge('1984-01-01', true, TODAY)).toBe('~42 ans')
  })

  it('months under 2 years, singular "an"', () => {
    expect(formatAge('2026-01-10', false, TODAY)).toBe('8 mois')
    expect(formatAge('2024-09-24', false, TODAY)).toBe('2 ans')
    expect(formatAge('2025-01-01', true, TODAY)).toBe('~1 an')
  })

  it('null when unknown', () => {
    expect(formatAge(null, false, TODAY)).toBeNull()
  })
})

describe('sexe', () => {
  it('uses the repo values homme/femme', () => {
    expect(formatSexe('homme')).toBe('Homme')
    expect(formatSexe('femme')).toBe('Femme')
    expect(formatSexe('M')).toBeNull()
    expect(formatSexe(null)).toBeNull()
  })

  it('formatAgeSexe', () => {
    expect(formatAgeSexe({ date_naissance: '1984-01-01', sexe: 'femme' }, TODAY)).toBe('42 ans · Femme')
    expect(formatAgeSexe({ date_naissance: '1984-01-01', date_naissance_approx: true }, TODAY)).toBe('~42 ans')
    expect(formatAgeSexe({ sexe: 'homme' }, TODAY)).toBe('Homme')
    expect(formatAgeSexe({}, TODAY)).toBeNull()
    expect(formatAgeSexe(null, TODAY)).toBeNull()
  })
})

describe('dd/mm/yyyy', () => {
  it('parses valid dates', () => {
    expect(parseFrenchDate('24/09/1984', TODAY)).toBe('1984-09-24')
    expect(parseFrenchDate('5/3/1990', TODAY)).toBe('1990-03-05')
    expect(parseFrenchDate('05-03-1990', TODAY)).toBe('1990-03-05')
  })

  it('rejects invalid, future, too old, and US order that does not exist', () => {
    expect(parseFrenchDate('31/02/1990', TODAY)).toBeNull()
    expect(parseFrenchDate('01/01/2027', TODAY)).toBeNull()
    expect(parseFrenchDate('01/01/1850', TODAY)).toBeNull()
    expect(parseFrenchDate('09/24/1984', TODAY)).toBeNull()
    expect(parseFrenchDate('1984-09-24', TODAY)).toBeNull()
  })

  it('formats back', () => {
    expect(formatFrenchDate('1984-09-24')).toBe('24/09/1984')
    expect(formatFrenchDate(null)).toBe('')
  })
})

describe('approxBirthDateFromAge', () => {
  it('stores 1 January of the computed year and round-trips the age', () => {
    const iso = approxBirthDateFromAge(42, TODAY)
    expect(iso).toBe('1984-01-01')
    expect(computeAge(iso, TODAY)).toBe(42)
  })

  it('rejects impossible ages', () => {
    expect(approxBirthDateFromAge(-1, TODAY)).toBeNull()
    expect(approxBirthDateFromAge(131, TODAY)).toBeNull()
    expect(approxBirthDateFromAge(4.5, TODAY)).toBeNull()
  })
})
