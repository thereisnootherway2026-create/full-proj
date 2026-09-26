// The printed letterhead (ordonnances, certificats, courriers…). One source: Paramètres →
// Profil & Cabinet. Nothing here is typed per document.

export const DEFAULT_SPECIALITE = 'Médecin généraliste'

// profiles.specialite (migration 20260926010000), else what the doctor chose at signup.
export function doctorSpecialite(profile, user) {
  const own = user && profile && user.id === profile.id ? user.user_metadata?.specialite : ''
  return String(profile?.specialite || own || '').trim()
}

// `doctor`: the prescriber's profile row (the logged-in doctor, or the one a secretary picked).
export function buildLetterhead({ doctor, user, cabinet }) {
  const adresse = String(cabinet?.adresse || '').trim()
  return {
    medecin: String(doctor?.nom_complet || '').trim(),
    specialite: doctorSpecialite(doctor, user) || DEFAULT_SPECIALITE,
    adresse,
    telephone: String(cabinet?.telephone || '').trim(),
    ville: String(cabinet?.ville || '').trim() || adresse.split(',')[0].trim(),
    logo: cabinet?.logo_data_url || null,
  }
}

// What the letterhead is still missing, as labels for a "complete it in Paramètres" hint.
export function letterheadGaps(h) {
  return [
    !h.medecin && 'nom du médecin',
    !h.adresse && 'adresse',
    !h.telephone && 'téléphone',
    !h.ville && 'ville',
  ].filter(Boolean)
}

export const clinicToday = () => new Date().toLocaleDateString('fr-CA', { timeZone: 'Africa/Casablanca' })
