// Which consultation flow a motif gets.
//   'full'        -> the 3 sections (Motif & symptômes, Examen clinique, Évaluation & conduite)
//   'lightweight' -> motif + a focused panel; Examen clinique is skipped
// To make another motif lightweight later (e.g. "Résultats d'examens"), add an entry here:
// `match` is tested against the normalized motif (lowercase, no accents, punctuation → space).
// The doctor can always switch back to the full form from the lightweight panel.
export const MOTIF_FLOW_CONFIG = {
  renouvellement_ordonnance: {
    flow: 'lightweight',
    match: [/\brenouvel\w*\b.*\b(ordonnance|traitement|medicament)s?\b/, /\b(ordonnance|traitement)\b.*\brenouvel\w*/],
  },
  default: 'full',
}

export const normalizeMotif = (motif) => String(motif || '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

// The config key of the motif (e.g. 'renouvellement_ordonnance'), or null. Only the first
// line counts: that is the motif itself, the rest is free text.
export function motifKind(motif) {
  const text = normalizeMotif(String(motif || '').split('\n')[0])
  if (!text) return null
  for (const [key, entry] of Object.entries(MOTIF_FLOW_CONFIG)) {
    if (key === 'default' || !entry?.match) continue
    if (entry.match.some((re) => re.test(text))) return key
  }
  return null
}

export function motifFlow(motif) {
  const kind = motifKind(motif)
  return kind ? MOTIF_FLOW_CONFIG[kind].flow : MOTIF_FLOW_CONFIG.default
}

// Most recent issued ordonnance with at least one line, from getOrdonnancesForPatient()
// (already sorted newest first). Drafts and cancelled ones are never renewed.
export function lastActiveOrdonnance(ordonnances) {
  return (ordonnances || []).find((o) => o.statut === 'emise' && (o.lignes || []).some((l) => String(l.medicament || '').trim())) || null
}

export const RENEWAL_CONDUITE = 'Renouvellement du traitement en cours.'

// "Reconduire à l'identique": the note with `ord`'s lines as its treatment. Idempotent — safe
// to apply again after resuming a saved draft: the treatment is replaced (never appended) and
// "Conduite à tenir" is only filled when empty, so a text already there (auto-filled earlier
// or typed by the doctor) is neither duplicated nor overwritten.
export function applyRenewal(note, ord) {
  return {
    ...note,
    traitements: ordonnanceToTreatments(ord),
    ordonnance: true,
    conduite: String(note.conduite || '').trim() ? note.conduite : RENEWAL_CONDUITE,
  }
}

// "Modifier avant de valider": prefill the treatment with `ord`'s lines, unless the doctor
// already entered one (then it is kept as is). Always leaves at least one row to type in.
export function prefillRenewalEdit(note, ord) {
  if ((note.traitements || []).some((r) => String(r.medicament || '').trim())) return note
  const rows = ordonnanceToTreatments(ord)
  return { ...note, traitements: rows.length ? rows : [{ medicament: '', posologie: '', duree: '' }], ordonnance: true }
}

// The ordonnance's lines as consultation treatment rows.
export const ordonnanceToTreatments = (ord) => (ord?.lignes || [])
  .filter((l) => String(l.medicament || '').trim())
  .map((l) => {
    const row = {
      medicament: String(l.medicament).trim(),
      posologie: String(l.posologie || '').trim(),
      duree: String(l.duree || '').trim(),
    }
    if (l.dosage !== undefined) row.dosage = String(l.dosage).trim()
    if (l.overrideAllergy !== undefined) row.overrideAllergy = Boolean(l.overrideAllergy)
    return row
  })
