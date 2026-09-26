import { describe, expect, it } from 'vitest'
import { computeIMC, parseVitalNumber, suggestCorrection, validateBloodPressure, validateVital } from './validateVital'

describe('parseVitalNumber', () => {
  it('accepts French decimals, rejects garbage', () => {
    expect(parseVitalNumber('37,5')).toBe(37.5)
    expect(parseVitalNumber(' 98 ')).toBe(98)
    expect(parseVitalNumber('')).toBeNull()
    expect(parseVitalNumber(null)).toBeNull()
    expect(parseVitalNumber('12a')).toBeNaN()
    expect(parseVitalNumber('-5')).toBeNaN()
  })
})

describe('validateVital: test-data values from the review', () => {
  it('SpO2 9 % is an error', () => {
    const r = validateVital('spo2', '9')
    expect(r.level).toBe('error')
    expect(r.message).toContain('SpO₂ 9 %')
  })

  it('poids 7 kg warns for an adult (or unknown age) and suggests 70', () => {
    const r = validateVital('poids', '7')
    expect(r.level).toBe('warn')
    expect(r.suggestion).toBe(70)
    expect(r.message).toContain('Vouliez-vous dire 70 ?')
    expect(validateVital('poids', '7', { ageYears: 40 }).level).toBe('warn')
  })

  it('poids 7 kg is fine for a toddler', () => {
    expect(validateVital('poids', '7', { ageYears: 1 }).level).toBe('ok')
  })

  it('taille 20 cm is an error at any age', () => {
    expect(validateVital('taille', '20').level).toBe('error')
    expect(validateVital('taille', '20', { ageYears: 0 }).level).toBe('error')
  })

  it('taille typed in metres suggests centimetres', () => {
    const r = validateVital('taille', '1,75')
    expect(r.level).toBe('error')
    expect(r.suggestion).toBe(175)
  })
})

describe('validateVital: absolute bounds (errors)', () => {
  const cases: Array<[Parameters<typeof validateVital>[0], string, string]> = [
    ['spo2', '49', '50'], ['spo2', '101', '100'],
    ['poids', '0.2', '0.3'], ['poids', '351', '350'],
    ['taille', '29', '30'], ['taille', '251', '250'],
    ['temperature', '24', '25'], ['temperature', '46', '45'],
    ['fc', '19', '20'], ['fc', '301', '300'],
    ['systolique', '49', '50'], ['systolique', '301', '300'],
    ['diastolique', '19', '20'], ['diastolique', '201', '200'],
    ['glycemie', '0.09', '0.1'], ['glycemie', '8.1', '8'],
    ['fr', '3', '4'], ['fr', '81', '80'],
    ['eva', '11', '10'],
  ]
  it.each(cases)('%s %s is an error, %s is not', (type, bad, good) => {
    expect(validateVital(type, bad).level).toBe('error')
    expect(validateVital(type, good).level).not.toBe('error')
  })

  it('EVA must be an integer 0-10', () => {
    expect(validateVital('eva', '0').level).toBe('ok')
    expect(validateVital('eva', '10').level).toBe('ok')
    expect(validateVital('eva', '4.5').level).toBe('error')
  })

  it('empty is ok, malformed is an error', () => {
    expect(validateVital('fc', '')).toEqual({ level: 'ok', message: '' })
    expect(validateVital('fc', 'abc').level).toBe('error')
  })

  it('temperature typed without the comma suggests the ÷10 value', () => {
    const r = validateVital('temperature', '375')
    expect(r.level).toBe('error')
    expect(r.suggestion).toBe(37.5)
  })
})

describe('validateVital: adult warnings', () => {
  it('warn zone boundaries', () => {
    expect(validateVital('spo2', '91').level).toBe('warn')
    expect(validateVital('spo2', '92').level).toBe('ok')
    expect(validateVital('fc', '44').level).toBe('warn')
    expect(validateVital('fc', '121').level).toBe('warn')
    expect(validateVital('fc', '80').level).toBe('ok')
    expect(validateVital('glycemie', '0.4').level).toBe('warn')
    expect(validateVital('glycemie', '2.6').level).toBe('warn')
    expect(validateVital('fr', '9').level).toBe('warn')
    expect(validateVital('fr', '25').level).toBe('warn')
    expect(validateVital('taille', '119').level).toBe('warn')
    expect(validateVital('poids', '251').level).toBe('warn')
  })

  it('temperature: 38 ok, above warns, >= 40 uses stronger wording', () => {
    expect(validateVital('temperature', '38').level).toBe('ok')
    expect(validateVital('temperature', '38.5')).toMatchObject({ level: 'warn', message: 'Fièvre : 38,5 °C.' })
    expect(validateVital('temperature', '40').message).toMatch(/Fièvre élevée/)
    expect(validateVital('temperature', '35.4').level).toBe('warn')
  })

  it('adult-only warnings are skipped for children, SpO2/temperature are not', () => {
    expect(validateVital('fc', '140', { ageYears: 2 }).level).toBe('ok')
    expect(validateVital('fr', '30', { ageYears: 1 }).level).toBe('ok')
    expect(validateVital('spo2', '90', { ageYears: 5 }).level).toBe('warn')
    expect(validateVital('temperature', '39', { ageYears: 5 }).level).toBe('warn')
  })

  it('adult warnings apply at 18 and when age is unknown', () => {
    expect(validateVital('fc', '140', { ageYears: 18 }).level).toBe('warn')
    expect(validateVital('fc', '140', { ageYears: null }).level).toBe('warn')
    expect(validateVital('fc', '140', { ageYears: 17 }).level).toBe('ok')
  })
})

describe('suggestCorrection', () => {
  it('only offers values that would be accepted as-is', () => {
    // 9 x10 = 90 would itself warn (SpO2 < 92), so it is not offered.
    expect(suggestCorrection('spo2', 9)).toBeUndefined()
    expect(suggestCorrection('poids', 7)).toBe(70)
    expect(suggestCorrection('fc', 7)).toBe(70)
  })
})

describe('validateBloodPressure', () => {
  it('systolique <= diastolique is blocked', () => {
    expect(validateBloodPressure('80', '120').level).toBe('error')
    expect(validateBloodPressure('90', '90').level).toBe('error')
  })

  it('one side missing is an error, both empty is ok', () => {
    expect(validateBloodPressure('120', '').level).toBe('error')
    expect(validateBloodPressure('', '80').level).toBe('error')
    expect(validateBloodPressure('', '').level).toBe('ok')
  })

  it('absolute bounds per side', () => {
    expect(validateBloodPressure('40', '30').level).toBe('error')
    expect(validateBloodPressure('120', '210').level).toBe('error')
  })

  it('adult warnings', () => {
    expect(validateBloodPressure('180', '100').level).toBe('warn')
    expect(validateBloodPressure('150', '110').level).toBe('warn')
    expect(validateBloodPressure('85', '55').level).toBe('warn')
    expect(validateBloodPressure('120', '80').level).toBe('ok')
    expect(validateBloodPressure('85', '55', { ageYears: 8 }).level).toBe('ok')
  })
})

describe('computeIMC', () => {
  it('needs both valid values', () => {
    expect(computeIMC('70', '175')).toBe(22.9)
    expect(computeIMC('70', '')).toBeNull()
    expect(computeIMC('', '175')).toBeNull()
    expect(computeIMC('70', '20')).toBeNull() // impossible height
    expect(computeIMC('abc', '175')).toBeNull()
  })

  it('a warned (but possible) value still computes', () => {
    expect(computeIMC('7', '70')).toBe(14.3)
  })
})
