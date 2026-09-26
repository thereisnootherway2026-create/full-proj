// Per-device usage counter for medications picked in the "Traitement" section, so "most
// prescribed" is real from the first prescription a doctor writes rather than an arbitrary
// default order. Same shape and storage pattern as acteUsage.js; kept separate because the two
// lists (actes vs. médicaments) are unrelated and merge differently into their suggestions.
const MAX_ENTRIES = 100
const keyOf = (scope) => `mm-meds-usage:${scope}`
const fold = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export const usageScope = (clinicId, userId) => (clinicId && userId ? `${clinicId}:${userId}` : null)

// -> [{ label, count, last }]  (never throws: storage may be unavailable)
export function readMedicationUsage(scope) {
  if (!scope) return []
  try {
    const raw = JSON.parse(localStorage.getItem(keyOf(scope)) || '[]')
    return Array.isArray(raw)
      ? raw.filter((e) => e && typeof e.label === 'string' && e.label.trim()).map((e) => ({ label: e.label, count: Number(e.count) || 1, last: Number(e.last) || 0 }))
      : []
  } catch { return [] }
}

export function recordMedicationUse(scope, name) {
  const label = String(name || '').trim().replace(/\s+/g, ' ')
  if (!scope || !label) return
  try {
    const list = readMedicationUsage(scope)
    const k = fold(label)
    const hit = list.find((e) => fold(e.label) === k)
    if (hit) { hit.count += 1; hit.last = Date.now(); hit.label = label } else list.push({ label, count: 1, last: Date.now() })
    list.sort((a, b) => b.count - a.count || b.last - a.last)
    localStorage.setItem(keyOf(scope), JSON.stringify(list.slice(0, MAX_ENTRIES)))
  } catch { /* storage unavailable: suggestions just don't learn on this device */ }
}
