// Age and sex helpers. patients.date_naissance is a SQL `date` ("yyyy-mm-dd");
// patients.sexe is 'homme' | 'femme' (repo convention, not 'M' | 'F').
// date_naissance_approx = true means only an age in years was known and the
// date is 1 January of the computed birth year.

export type Sexe = 'homme' | 'femme'

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})/

// Parses "yyyy-mm-dd" (optionally followed by a time) as a LOCAL calendar date,
// so the birthday never shifts by a day with the timezone. Null if invalid.
export function parseIsoDate(value: string | null | undefined): Date | null {
  const m = ISO_RE.exec(String(value ?? ''))
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(y, mo - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null
  return date
}

// Whole years (or null when the date is missing, invalid or in the future).
export function computeAge(dateNaissance: string | null | undefined, today: Date = new Date()): number | null {
  const birth = parseIsoDate(dateNaissance)
  if (!birth || birth > today) return null
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age >= 0 ? age : null
}

function computeMonths(birth: Date, today: Date): number {
  let months = (today.getFullYear() - birth.getFullYear()) * 12 + (today.getMonth() - birth.getMonth())
  if (today.getDate() < birth.getDate()) months--
  return Math.max(0, months)
}

// "42 ans", "~42 ans" (approximate), "1 an", "8 mois" (under 2 years, exact
// dates only), or null when unknown.
export function formatAge(dateNaissance: string | null | undefined, approx = false, today: Date = new Date()): string | null {
  const age = computeAge(dateNaissance, today)
  if (age === null) return null
  const prefix = approx ? '~' : ''
  if (age < 2 && !approx) {
    const birth = parseIsoDate(dateNaissance) as Date
    const months = computeMonths(birth, today)
    if (months < 24) return `${months} mois`
  }
  return `${prefix}${age} ${age > 1 ? 'ans' : 'an'}`
}

export function formatSexe(sexe: string | null | undefined): string | null {
  if (sexe === 'homme') return 'Homme'
  if (sexe === 'femme') return 'Femme'
  return null
}

// "42 ans · Femme", "~42 ans", "Femme", or null when both are unknown.
export function formatAgeSexe(patient: { date_naissance?: string | null, date_naissance_approx?: boolean | null, sexe?: string | null } | null | undefined, today: Date = new Date()): string | null {
  const parts = [formatAge(patient?.date_naissance, Boolean(patient?.date_naissance_approx), today), formatSexe(patient?.sexe)].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

// "dd/mm/yyyy" (also accepts "-" or "." separators and 1-digit day/month)
// -> "yyyy-mm-dd". Null when the date is invalid, in the future or more than
// 130 years ago.
export function parseFrenchDate(input: string, today: Date = new Date()): string | null {
  const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s*$/.exec(String(input ?? ''))
  if (!m) return null
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(y, mo - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null
  if (date > today) return null
  if (today.getFullYear() - y > 130) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// "yyyy-mm-dd" -> "dd/mm/yyyy" ('' when invalid).
export function formatFrenchDate(iso: string | null | undefined): string {
  const d = parseIsoDate(iso)
  if (!d) return ''
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

// Age in years -> the approximate birth date stored with date_naissance_approx:
// 1 January of (current year - age). computeAge() of that date returns `years`.
export function approxBirthDateFromAge(years: number, today: Date = new Date()): string | null {
  if (!Number.isInteger(years) || years < 0 || years > 130) return null
  return `${today.getFullYear() - years}-01-01`
}
