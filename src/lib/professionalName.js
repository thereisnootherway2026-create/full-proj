// Canonical display name for a professional. profiles.nom_complet is
// free-typed at signup/invite time, and some accounts already store it with a
// "Dr." prefix (e.g. "Dr. thereisno otherway") while others don't. Every call
// site that used to unconditionally prepend "Dr. " produced a duplicated title
// ("Dr. Dr. …") for the accounts that already had it. This is the one place
// that decision is made, so it can never happen again.
//
// Recognised titles (case-insensitive): "Dr", "Dr.", "Dr.Nom" (no space),
// "Docteur". `\b` keeps a name like "Driss" from being read as a title.
// public.mm_format_doctor_label() (SQL, used by mm_execute_task_action) applies
// the same pattern — change both together.
const DR_PREFIX = /^(?:docteur|dr)\b\.?\s*/i

// `nomComplet` with exactly one "Dr." in front — never zero, never two.
export function formatDoctorLabel(nomComplet) {
  const name = stripDoctorTitle(nomComplet)
  return name ? `Dr. ${name}` : 'Médecin'
}

// The stored name without any leading title, for layouts that place the title
// themselves or only need part of the name (e.g. the printed signature).
export function stripDoctorTitle(nomComplet) {
  return String(nomComplet || '').trim().replace(DR_PREFIX, '').trim()
}

// The stored name as-is, for a role that isn't a doctor (a title would be wrong).
export function formatStaffLabel(nomComplet, fallback = 'Membre du cabinet') {
  const name = String(nomComplet || '').trim()
  return name || fallback
}

// Role-aware: only doctors get the "Dr." treatment.
export function formatProfessionalName(nomComplet, role) {
  const r = String(role || '').toLowerCase()
  const isDoctor = r === 'doctor' || r === 'docteur' || r === 'medecin' || r === 'médecin'
  return isDoctor ? formatDoctorLabel(nomComplet) : formatStaffLabel(nomComplet)
}

export function initialsOf(label) {
  return String(label || '')
    .replace(DR_PREFIX, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '?'
}
