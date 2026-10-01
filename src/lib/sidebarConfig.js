function isSecretaryRole(role) {
  const value = String(role || '').toLowerCase()
  return ['secretaire', 'secrétaire', 'secretary'].includes(value)
}

function isDoctorRole(role) {
  const value = String(role || '').toLowerCase()
  return ['docteur', 'medecin', 'médecin', 'doctor'].includes(value)
}

export function getSidebarForRole(role) {
  if (isSecretaryRole(role)) {
    return [
      {
        label: '',
        items: [
          { label: 'Tableau de bord', to: '/dashboard', icon: 'layout-dashboard' },
          { label: 'Agenda (RDV)', to: '/agenda', icon: 'calendar-days' },
          { label: 'Patients', to: '/patients', icon: 'folder-heart' },
          { label: 'Facturation', to: '/facturation', icon: 'credit-card' },
          { label: 'Paramètres', to: '/parametres', icon: 'settings-2' },
        ],
      },
    ]
  }

  if (isDoctorRole(role)) {
    return [
      {
        label: '',
        items: [
          { label: 'Tableau de bord', to: '/dashboard', icon: 'layout-dashboard' },
          { label: 'Agenda (RDV)', to: '/agenda', icon: 'calendar-days' },
          { label: 'Patients', to: '/patients', icon: 'folder-heart' },
          { label: 'Facturation', to: '/facturation', icon: 'credit-card' },
          { label: 'Assistant IA', to: '/ai-scribe', icon: 'bot' },
          { label: 'Paramètres', to: '/parametres', icon: 'settings-2' },
        ],
      },
    ]
  }

  return getSidebarForRole('docteur')
}
