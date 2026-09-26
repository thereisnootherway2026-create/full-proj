// Input validation for the Constantes form.
//
//  error -> physically impossible: blocks saving that value (and finishing).
//  warn  -> unusual: allowed after the doctor explicitly confirms it.
//  ok    -> nothing to say.
//
// TO VALIDATE WITH A PHYSICIAN.
// These thresholds are engineering guardrails against typing errors
// (SpO2 "9", poids "7", taille "20"), NOT clinical guidance. The ABSOLUTE
// bounds are mirrored server-side in mm_complete_encounter and in the
// patient_vitals CHECK constraints (migration 20260924190200); change them
// in all three places together.

export type VitalType =
  | 'spo2' | 'poids' | 'taille' | 'temperature' | 'fc'
  | 'systolique' | 'diastolique' | 'glycemie' | 'fr' | 'eva'

export type VitalLevel = 'ok' | 'warn' | 'error'

export interface VitalResult {
  level: VitalLevel
  message: string
  // A x10 / ÷10 (or m -> cm) correction that lands inside the absolute bounds.
  suggestion?: number
}

export interface VitalContext {
  ageYears?: number | null
}

interface Range { min: number, max: number }

// TO VALIDATE WITH A PHYSICIAN — single source of truth for every threshold.
export const VITAL_THRESHOLDS = {
  // Impossible at any age: error, blocks saving.
  ABSOLUTE: {
    spo2: { min: 50, max: 100 },
    poids: { min: 0.3, max: 350 },
    taille: { min: 30, max: 250 },
    temperature: { min: 25, max: 45 },
    fc: { min: 20, max: 300 },
    systolique: { min: 50, max: 300 },
    diastolique: { min: 20, max: 200 },
    glycemie: { min: 0.1, max: 8 },
    fr: { min: 4, max: 80 },
    eva: { min: 0, max: 10 },
  } satisfies Record<VitalType, Range>,
  // Unusual in an adult: warn, needs confirmation. `min`/`max` are exclusive
  // limits of the unremarkable zone (value < min or value > max warns).
  ADULT_WARN: {
    spo2: { min: 92 },
    poids: { min: 30, max: 250 },
    taille: { min: 120, max: 220 },
    temperature: { min: 35.5, max: 38, severeMin: 40 },
    fc: { min: 45, max: 120 },
    // Blood pressure: warn when sys >= high.sys or dia >= high.dia,
    // or sys < low.sys or dia < low.dia.
    tension: { high: { sys: 180, dia: 110 }, low: { sys: 90, dia: 60 } },
    glycemie: { min: 0.5, max: 2.5 },
    fr: { min: 10, max: 24 },
  },
  // Adult warn thresholds apply when age >= ADULT_AGE or age is unknown.
  ADULT_AGE: 18,
  // Warn thresholds that do not depend on age (applied to children too).
  AGE_INDEPENDENT_WARN: ['spo2', 'temperature'] as readonly VitalType[],
} as const

const LABELS: Record<VitalType, { name: string, unit: string }> = {
  spo2: { name: 'SpO₂', unit: '%' },
  poids: { name: 'Poids', unit: 'kg' },
  taille: { name: 'Taille', unit: 'cm' },
  temperature: { name: 'Température', unit: '°C' },
  fc: { name: 'FC', unit: 'bpm' },
  systolique: { name: 'Systolique', unit: 'mmHg' },
  diastolique: { name: 'Diastolique', unit: 'mmHg' },
  glycemie: { name: 'Glycémie', unit: 'g/L' },
  fr: { name: 'FR', unit: '/min' },
  eva: { name: 'EVA', unit: '/10' },
}

const OK: VitalResult = { level: 'ok', message: '' }

// "37,5" -> 37.5 ; '' -> null ; 'abc' / '12a' -> NaN
export function parseVitalNumber(raw: unknown): number | null {
  const text = String(raw ?? '').trim()
  if (text === '') return null
  const normalized = text.replace(',', '.')
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(normalized)) return Number.NaN
  return Number(normalized)
}

const fmt = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')
const withUnit = (type: VitalType, n: number) => {
  const { unit } = LABELS[type]
  return unit === '%' || unit === '/10' || unit === '/min' ? `${fmt(n)}${unit === '%' ? ' %' : unit}` : `${fmt(n)} ${unit}`
}

const inRange = (n: number, r: Range) => n >= r.min && n <= r.max

// A plausible correction for a slipped decimal: value x10, ÷10 (and x100 for a
// height typed in metres). Offered only when it lands inside the absolute bounds
// AND outside the adult warn zone when that zone exists, so it is always a
// value that would itself be accepted without a question.
export function suggestCorrection(type: VitalType, value: number, ctx: VitalContext = {}): number | undefined {
  const factors = type === 'taille' ? [100, 10, 0.1] : [10, 0.1]
  for (const f of factors) {
    const candidate = Math.round(value * f * 100) / 100
    if (candidate === value) continue
    if (!inRange(candidate, VITAL_THRESHOLDS.ABSOLUTE[type])) continue
    if (type === 'eva' && !Number.isInteger(candidate)) continue
    if (warnFor(type, candidate, ctx)) continue
    return candidate
  }
  return undefined
}

function adultRulesApply(type: VitalType, ctx: VitalContext): boolean {
  if (VITAL_THRESHOLDS.AGE_INDEPENDENT_WARN.includes(type)) return true
  const age = ctx.ageYears
  return age == null || age >= VITAL_THRESHOLDS.ADULT_AGE
}

function warnFor(type: VitalType, n: number, ctx: VitalContext): string | null {
  if (!adultRulesApply(type, ctx)) return null
  const W = VITAL_THRESHOLDS.ADULT_WARN
  const v = withUnit(type, n)
  switch (type) {
    case 'spo2':
      return n < W.spo2.min ? `SpO₂ basse : ${v}. Vérifiez la mesure.` : null
    case 'poids':
      return n < W.poids.min || n > W.poids.max ? `Poids inhabituel pour un adulte : ${v}.` : null
    case 'taille':
      return n < W.taille.min || n > W.taille.max ? `Taille inhabituelle pour un adulte : ${v}.` : null
    case 'temperature':
      if (n >= W.temperature.severeMin) return `Fièvre élevée : ${v}. Vérifiez la mesure et la prise en charge.`
      if (n > W.temperature.max) return `Fièvre : ${v}.`
      if (n < W.temperature.min) return `Température basse : ${v}. Vérifiez la mesure.`
      return null
    case 'fc':
      return n < W.fc.min || n > W.fc.max ? `Fréquence cardiaque inhabituelle : ${v}.` : null
    case 'glycemie':
      return n < W.glycemie.min || n > W.glycemie.max ? `Glycémie inhabituelle : ${v}.` : null
    case 'fr':
      return n < W.fr.min || n > W.fr.max ? `Fréquence respiratoire inhabituelle : ${v}.` : null
    default:
      return null
  }
}

export function validateVital(type: VitalType, raw: unknown, ctx: VitalContext = {}): VitalResult {
  const n = parseVitalNumber(raw)
  if (n === null) return OK
  const { name } = LABELS[type]
  if (Number.isNaN(n)) return { level: 'error', message: `Valeur invalide pour ${name}.` }
  if (type === 'eva' && !Number.isInteger(n)) {
    return { level: 'error', message: 'EVA : un nombre entier entre 0 et 10.' }
  }

  const abs = VITAL_THRESHOLDS.ABSOLUTE[type]
  if (!inRange(n, abs)) {
    const suggestion = suggestCorrection(type, n, ctx)
    const hint = suggestion !== undefined ? ` Vouliez-vous dire ${fmt(suggestion)} ?` : ` Valeur attendue entre ${fmt(abs.min)} et ${fmt(abs.max)}.`
    return { level: 'error', message: `Valeur impossible : ${name} ${withUnit(type, n)}.${hint}`, ...(suggestion !== undefined ? { suggestion } : {}) }
  }

  const warning = warnFor(type, n, ctx)
  if (warning) {
    const suggestion = suggestCorrection(type, n, ctx)
    return {
      level: 'warn',
      message: suggestion !== undefined ? `Valeur improbable : ${name} ${withUnit(type, n)}. Vouliez-vous dire ${fmt(suggestion)} ?` : warning,
      ...(suggestion !== undefined ? { suggestion } : {}),
    }
  }
  return OK
}

// Blood pressure as a pair: each side on its own, then the pair.
// systolique <= diastolique is impossible (error, no suggestion).
export function validateBloodPressure(sysRaw: unknown, diaRaw: unknown, ctx: VitalContext = {}): VitalResult {
  const sysResult = validateVital('systolique', sysRaw, ctx)
  if (sysResult.level === 'error') return sysResult
  const diaResult = validateVital('diastolique', diaRaw, ctx)
  if (diaResult.level === 'error') return diaResult

  const sys = parseVitalNumber(sysRaw)
  const dia = parseVitalNumber(diaRaw)
  if (sys === null && dia === null) return OK
  if (sys === null) return { level: 'error', message: 'Renseignez aussi la systolique.' }
  if (dia === null) return { level: 'error', message: 'Renseignez aussi la diastolique.' }
  if (sys <= dia) {
    return { level: 'error', message: `Valeur impossible : TA ${fmt(sys)}/${fmt(dia)}. La systolique doit être supérieure à la diastolique.` }
  }

  if (adultRulesApply('systolique', ctx)) {
    const W = VITAL_THRESHOLDS.ADULT_WARN.tension
    if (sys >= W.high.sys || dia >= W.high.dia) return { level: 'warn', message: `Tension très élevée : ${fmt(sys)}/${fmt(dia)} mmHg.` }
    if (sys < W.low.sys || dia < W.low.dia) return { level: 'warn', message: `Tension basse : ${fmt(sys)}/${fmt(dia)} mmHg.` }
  }
  return OK
}

// BMI (kg/m²), one decimal. Null unless both values are present and not in
// error (an impossible weight or height never produces a number on screen).
export function computeIMC(poids: unknown, taille: unknown): number | null {
  const w = parseVitalNumber(poids)
  const h = parseVitalNumber(taille)
  if (w === null || h === null || Number.isNaN(w) || Number.isNaN(h)) return null
  if (validateVital('poids', w).level === 'error' || validateVital('taille', h).level === 'error') return null
  return Math.round((w / ((h / 100) ** 2)) * 10) / 10
}
