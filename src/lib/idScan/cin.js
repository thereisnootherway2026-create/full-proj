// Heuristic reader for the printed side of a Moroccan CIN from OCR text (French + Latin script only:
// the Arabic lines come out as noise and are ignored). Pure functions, no I/O.
//
// Nothing here is authoritative. Every value it returns is a candidate the user confirms on the review
// screen. Values found next to a printed label ("Nom", "Prénom", "Né(e) le") are 'medium'; anything
// guessed from shape alone is 'low'.

const CIN_RE = /\b([A-Z]{1,2})\s?(\d{5,7})\b/g
// Words printed on the card that must never be mistaken for a CIN number or a name.
const NOT_A_CIN = new Set(['DE', 'LE', 'LA', 'ID', 'NO', 'N'])
// Whole words only: a surname such as BENALI or DUPONT must not be rejected for containing "NE" or "DU".
const CARD_WORDS = /\b(ROYAUME|MAROC|CARTE|NATIONALE|IDENTITE|VALABLE|SEXE|ADRESSE|PRENOM|NOM|NEE|NE|FILS|CIN|DE|DU)\b/i

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')

const cleanName = (s) =>
  s
    .replace(/[^A-Za-zÀ-ÿ' \-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.length >= 2 || /^[A-Z]$/.test(w))
    .join(' ')

const toIso = (d, m, y) => {
  const yy = Number(y)
  if (yy < 1900 || yy > new Date().getFullYear() + 20) return ''
  if (Number(m) < 1 || Number(m) > 12 || Number(d) < 1 || Number(d) > 31) return ''
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function findCinNumber(text) {
  const upper = String(text || '').toUpperCase()
  // A number printed after "N°" / "CIN" is the most likely one.
  const labelled = upper.match(/(?:CIN|N[°O0]|N\s?°)\s*[:.\-]?\s*([A-Z]{1,2})\s?(\d{5,7})\b/)
  if (labelled && !NOT_A_CIN.has(labelled[1])) return { value: `${labelled[1]}${labelled[2]}`, confidence: 'medium' }
  for (const m of upper.matchAll(CIN_RE)) {
    if (!NOT_A_CIN.has(m[1])) return { value: `${m[1]}${m[2]}`, confidence: 'low' }
  }
  return null
}

export function parseCinText(rawText) {
  const text = String(rawText || '').replace(/\r/g, '\n')
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const out = {}

  const cin = findCinNumber(text)
  if (cin) out.cin = cin

  // Dates: birth is the earliest plausible date (or the one after "né"), expiry the latest.
  const dates = [...text.matchAll(/(\d{2})\s?[.\/\- ]\s?(\d{2})\s?[.\/\- ]\s?(\d{4})/g)]
    .map((m) => ({ iso: toIso(m[1], m[2], m[3]), index: m.index }))
    .filter((d) => d.iso)
  if (dates.length) {
    const bornAt = text.search(/n[ée]\(?e?\)?\s*le/i)
    const afterBorn = bornAt >= 0 ? dates.find((d) => d.index >= bornAt) : null
    const sorted = [...dates].sort((a, b) => a.iso.localeCompare(b.iso))
    const birth = afterBorn || sorted[0]
    out.dateNaissance = { value: birth.iso, confidence: afterBorn ? 'medium' : 'low' }
  }

  const labelled = (labels) => {
    const re = new RegExp(`^(?:${labels})\\s*[:.\\-]?\\s*(.*)$`, 'i')
    for (let i = 0; i < lines.length; i += 1) {
      const m = fold(lines[i]).match(re)
      if (!m) continue
      // Same-line value, otherwise the next line.
      const same = cleanName(lines[i].slice(lines[i].length - m[1].length))
      if (same.length >= 2 && !CARD_WORDS.test(fold(same))) return same.toUpperCase()
      const next = cleanName(lines[i + 1] || '')
      if (next.length >= 2 && !CARD_WORDS.test(fold(next))) return next.toUpperCase()
    }
    return ''
  }

  const nom = labelled('nom|surname')
  const prenom = labelled('pr[ée]nom|prenom|given names?')
  if (nom) out.nom = { value: nom, confidence: 'medium' }
  if (prenom) out.prenom = { value: prenom, confidence: 'medium' }

  const sex = text.match(/sexe\s*[:.\-]?\s*([MF])\b/i)
  if (sex) out.sexe = { value: sex[1].toUpperCase() === 'F' ? 'femme' : 'homme', confidence: 'medium' }

  const adresse = text.match(/adresse\s*[:.\-]?\s*([^\n]{6,})/i)
  // Addresses keep their digits (unlike names).
  if (adresse) out.adresse = { value: adresse[1].replace(/[^\w\s'.,\-àâçéèêëîïôûùüÿ]/gi, ' ').replace(/\s+/g, ' ').trim(), confidence: 'low' }

  return out
}
