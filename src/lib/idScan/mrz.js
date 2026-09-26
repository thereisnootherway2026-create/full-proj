// ICAO 9303 machine-readable zone (MRZ) parser: passports (TD3, 2 x 44) and ID cards (TD1, 3 x 30).
// Pure functions, no I/O. The MRZ is the most reliable thing to read on a document because its
// numeric fields carry check digits: a field whose check digit passes is trustworthy, a field whose
// check digit fails is reported as unverified so the review screen can flag it.

const WEIGHTS = [7, 3, 1]

const charValue = (c) => {
  if (c === '<') return 0
  if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48
  if (c >= 'A' && c <= 'Z') return c.charCodeAt(0) - 55
  return NaN
}

export function checkDigit(field) {
  let sum = 0
  for (let i = 0; i < field.length; i += 1) {
    const v = charValue(field[i])
    if (Number.isNaN(v)) return NaN
    sum += v * WEIGHTS[i % 3]
  }
  return sum % 10
}

// A field is valid when its check digit character matches. '<' stands for 0 in a check position.
export const isValidField = (field, digit) => {
  const d = digit === '<' ? 0 : Number(digit)
  return Number.isInteger(d) && checkDigit(field) === d
}

// OCR confuses look-alike characters. In purely numeric fields map letters back to digits.
const NUMERIC_FIX = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', B: '8', G: '6' }
const toDigits = (s) => s.replace(/[A-Z]/g, (c) => NUMERIC_FIX[c] ?? c)

// Anything that is not A-Z 0-9 < is noise in a MRZ line.
const cleanLine = (line) => line.toUpperCase().replace(/\s+/g, '').replace(/[«‹〈]/g, '<').replace(/[^A-Z0-9<]/g, '<')

function parseDate(yymmdd, kind) {
  if (!/^\d{6}$/.test(yymmdd)) return ''
  const yy = Number(yymmdd.slice(0, 2))
  const mm = Number(yymmdd.slice(2, 4))
  const dd = Number(yymmdd.slice(4, 6))
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return ''
  const currentYY = new Date().getFullYear() % 100
  // Birth dates are in the past; expiry dates are within ~a few decades ahead.
  const century = kind === 'birth' ? (yy > currentYY ? 1900 : 2000) : (yy > currentYY + 30 ? 1900 : 2000)
  return `${century + yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

function parseNames(field) {
  const [surname = '', given = ''] = field.split('<<')
  const clean = (s) => s.replace(/</g, ' ').replace(/\s+/g, ' ').trim()
  return { nom: clean(surname), prenom: clean(given) }
}

const sexOf = (c) => (c === 'M' ? 'homme' : c === 'F' ? 'femme' : '')

function build({ docType, country, docNumber, docNumberOk, optional, birth, birthOk, sex, expiry, expiryOk, nationality, names, compositeOk }) {
  const { nom, prenom } = parseNames(names)
  return {
    docType,
    country,
    nationality,
    nom,
    prenom,
    sexe: sexOf(sex),
    dateNaissance: parseDate(birth, 'birth'),
    dateExpiration: parseDate(expiry, 'expiry'),
    numeroDocument: docNumber.replace(/</g, ''),
    optional: optional.replace(/</g, ''),
    // Which numeric fields passed their check digit. Names have no check digit.
    verified: { docNumber: docNumberOk, birth: birthOk, expiry: expiryOk, composite: compositeOk },
  }
}

export function parseTD3(l1, l2) {
  if (l1.length !== 44 || l2.length !== 44) return null
  const docNumber = l2.slice(0, 9)
  const birth = toDigits(l2.slice(13, 19))
  const expiry = toDigits(l2.slice(21, 27))
  const composite = l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43)
  return build({
    docType: 'passeport',
    country: l1.slice(2, 5).replace(/</g, ''),
    docNumber,
    docNumberOk: isValidField(docNumber, toDigits(l2[9])),
    optional: l2.slice(28, 42),
    birth,
    birthOk: isValidField(birth, toDigits(l2[19])),
    sex: l2[20],
    expiry,
    expiryOk: isValidField(expiry, toDigits(l2[27])),
    nationality: l2.slice(10, 13).replace(/</g, ''),
    names: l1.slice(5),
    compositeOk: isValidField(composite, toDigits(l2[43])),
  })
}

export function parseTD1(l1, l2, l3) {
  if (l1.length !== 30 || l2.length !== 30 || l3.length !== 30) return null
  const docNumber = l1.slice(5, 14)
  const birth = toDigits(l2.slice(0, 6))
  const expiry = toDigits(l2.slice(8, 14))
  const composite = l1.slice(5, 30) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29)
  return build({
    docType: 'cin',
    country: l1.slice(2, 5).replace(/</g, ''),
    docNumber,
    docNumberOk: isValidField(docNumber, toDigits(l1[14])),
    optional: l1.slice(15, 30),
    birth,
    birthOk: isValidField(birth, toDigits(l2[6])),
    sex: l2[7],
    expiry,
    expiryOk: isValidField(expiry, toDigits(l2[14])),
    nationality: l2.slice(15, 18).replace(/</g, ''),
    names: l3,
    compositeOk: isValidField(composite, toDigits(l2[29])),
  })
}

// Find and parse a MRZ inside raw OCR text. Returns null when no consistent MRZ is found.
export function findMrz(rawText) {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map(cleanLine)
    .filter((l) => l.length >= 28 && (l.match(/</g) || []).length >= 2)

  // TD3: two consecutive 44-character lines.
  for (let i = 0; i + 1 < lines.length; i += 1) {
    if (lines[i].length === 44 && lines[i + 1].length === 44 && lines[i].startsWith('P')) {
      const r = parseTD3(lines[i], lines[i + 1])
      if (r) return r
    }
  }
  // TD1: three consecutive 30-character lines.
  for (let i = 0; i + 2 < lines.length; i += 1) {
    if (lines[i].length === 30 && lines[i + 1].length === 30 && lines[i + 2].length === 30 && /^[IAC]/.test(lines[i])) {
      const r = parseTD1(lines[i], lines[i + 1], lines[i + 2])
      if (r) return r
    }
  }
  return null
}
