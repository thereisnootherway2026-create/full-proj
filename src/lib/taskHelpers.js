import { AlertCircle, FileText, Pill, MessageSquare, Phone, Users, GitBranch, HelpCircle } from 'lucide-react'

const TASKS_KEY = 'macromedica_tasks'

// ─── Legacy categories (kept for backward compat with existing task cards) ────
export const TASK_CATEGORIES = ['urgences', 'resultats', 'prescriptions', 'messages']

// ─── New Task Types ───────────────────────────────────────────────────────────
export const TASK_TYPES = [
  { value: 'RESULT',       label: 'Résultats',         icon: FileText,     color: { bg: '#eff6ff', text: '#2563eb', badge: '#3b82f6', shadow: 'rgba(59,130,246,0.15)' } },
  { value: 'PRESCRIPTION', label: 'Ordonnance',        icon: Pill,         color: { bg: '#fffbeb', text: '#d97706', badge: '#f59e0b', shadow: 'rgba(245,158,11,0.15)' } },
  { value: 'FOLLOW_UP',    label: 'Suivi',             icon: AlertCircle,  color: { bg: '#f0fdf4', text: '#16a34a', badge: '#22c55e', shadow: 'rgba(34,197,94,0.15)' } },
  { value: 'PHONE_CALL',   label: 'Appel',             icon: Phone,        color: { bg: '#f5f3ff', text: '#7c3aed', badge: '#8b5cf6', shadow: 'rgba(139,92,246,0.15)' } },
  { value: 'ADMIN',        label: 'Administratif',     icon: Users,        color: { bg: '#f1f5f9', text: '#475569', badge: '#64748b', shadow: 'rgba(100,116,139,0.15)' } },
  { value: 'REFERRAL',     label: 'Référence externe', icon: GitBranch,    color: { bg: '#fff1f2', text: '#e11d48', badge: '#f43f5e', shadow: 'rgba(244,63,94,0.15)' } },
  { value: 'OTHER',        label: 'Autre',             icon: HelpCircle,   color: { bg: '#f1f5f9', text: '#64748b', badge: '#94a3b8', shadow: 'rgba(148,163,184,0.15)' } },
]

// ─── Priorities ───────────────────────────────────────────────────────────────
export const TASK_PRIORITIES = [
  { value: 'LOW',      label: 'Faible',   color: '#64748b', bg: '#f1f5f9', border: '#cbd5e1' },
  { value: 'NORMAL',   label: 'Normale',  color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  { value: 'HIGH',     label: 'Haute',    color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  { value: 'CRITICAL', label: 'Critique', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
]

// ─── Due date presets ─────────────────────────────────────────────────────────
export const DUE_DATE_PRESETS = [
  { value: 'TODAY',     label: "Aujourd'hui" },
  { value: 'TOMORROW',  label: 'Demain' },
  { value: 'THIS_WEEK', label: 'Cette semaine' },
  { value: 'CUSTOM',    label: 'Choisir une date...' },
]

// ─── Reminder presets ─────────────────────────────────────────────────────────
export const REMINDER_PRESETS = [
  { value: '1H',       label: 'Dans 1 heure' },
  { value: 'TODAY',    label: "Aujourd'hui" },
  { value: 'TOMORROW', label: 'Demain' },
  { value: 'CUSTOM',   label: 'Choisir...' },
]

// ─── Helpers for new Task types ───────────────────────────────────────────────
export function getTaskTypeInfo(type) {
  return TASK_TYPES.find(t => t.value === type) || TASK_TYPES[TASK_TYPES.length - 1]
}

export function getTaskPriorityInfo(priority) {
  return TASK_PRIORITIES.find(p => p.value === priority) || TASK_PRIORITIES[1]
}

export function computeDueDate(preset, customDate) {
  const now = new Date()
  switch (preset) {
    case 'TODAY':
      return now.toISOString()
    case 'TOMORROW': {
      const d = new Date(now)
      d.setDate(d.getDate() + 1)
      return d.toISOString()
    }
    case 'THIS_WEEK': {
      const d = new Date(now)
      // end of the current week (Sunday)
      const day = d.getDay()
      const daysUntilSunday = day === 0 ? 0 : 7 - day
      d.setDate(d.getDate() + daysUntilSunday)
      return d.toISOString()
    }
    case 'CUSTOM':
      return customDate ? new Date(customDate).toISOString() : now.toISOString()
    default:
      return now.toISOString()
  }
}

export function computeReminderDate(preset, customDate) {
  const now = new Date()
  switch (preset) {
    case '1H': {
      const d = new Date(now)
      d.setHours(d.getHours() + 1)
      return d.toISOString()
    }
    case 'TODAY':
      return now.toISOString()
    case 'TOMORROW': {
      const d = new Date(now)
      d.setDate(d.getDate() + 1)
      return d.toISOString()
    }
    case 'CUSTOM':
      return customDate ? new Date(customDate).toISOString() : null
    default:
      return null
  }
}

// ─── Map new Task to legacy shape (for card rendering on TasksPage) ───────────
export function taskToLegacy(task) {
  const typeInfo = getTaskTypeInfo(task.type)
  const priorityInfo = getTaskPriorityInfo(task.priority)

  // Map new type to legacy category
  const categoryMap = {
    RESULT:       'resultats',
    PRESCRIPTION: 'prescriptions',
    FOLLOW_UP:    'messages',
    PHONE_CALL:   'messages',
    ADMIN:        'messages',
    REFERRAL:     'urgences',
    OTHER:        'messages',
  }

  return {
    id: task.id,
    category: categoryMap[task.type] || 'messages',
    patientName: task.patientName || '',
    description: task.title,
    metadata: new Date(task.dueDate).toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' }),
    actionText: task.status === 'NEW' ? 'Voir' : task.status === 'DONE' ? '✓ Fait' : 'En cours',
    icon: typeInfo.icon,
    priority: task.priority,
    _isNewSchema: true,
    _task: task,
  }
}

// ─── Legacy helpers (kept for existing task cards) ────────────────────────────
export const DUMMY_PATIENTS = [
  'Sarah Benali',
  'Marc Dupont',
  'Ahmed Benali',
  'Fatima El Amrani',
  'Soufiane Kadiri',
  'Meryem Tazi',
]

export const DEFAULT_TASKS = [
  {
    id: 1,
    category: 'urgences',
    patientName: 'Meryem Tazi',
    description: 'Tension artérielle 185/110',
    metadata: 'En consultation',
    actionText: 'Traiter',
    status: 'En consultation',
  },
  {
    id: 2,
    category: 'resultats',
    patientName: 'Sarah Benali',
    description: 'ECG reçu',
    metadata: "Aujourd'hui",
    actionText: 'Consulter',
  },
  {
    id: 3,
    category: 'resultats',
    patientName: 'Marc Dupont',
    description: 'Bilan sanguin en attente',
    metadata: "Aujourd'hui",
    actionText: 'Consulter',
  },
  {
    id: 4,
    category: 'prescriptions',
    patientName: 'Ahmed Benali',
    description: 'Ordonnance antihypertenseurs',
    metadata: 'À signer',
    actionText: 'Signer',
  },
  {
    id: 5,
    category: 'prescriptions',
    patientName: 'Fatima El Amrani',
    description: 'Renouvellement',
    metadata: 'À signer',
    actionText: 'Signer',
  },
  {
    id: 6,
    category: 'messages',
    patientName: 'Soufiane Kadiri',
    description: 'Message reçu',
    metadata: 'Il y a 2h',
    actionText: 'Répondre',
  },
  {
    id: 7,
    category: 'messages',
    patientName: 'Meryem Tazi',
    description: 'Question sur le traitement',
    metadata: 'Il y a 4h',
    actionText: 'Répondre',
  },
]

export function getCategoryIcon(category) {
  switch (category) {
    case 'urgences':
      return AlertCircle
    case 'resultats':
      return FileText
    case 'prescriptions':
      return Pill
    case 'messages':
      return MessageSquare
    default:
      return MessageSquare
  }
}

export function getCategoryColor(category) {
  switch (category) {
    case 'urgences':
      return {
        bg: '#fef2f2',
        text: '#dc2626',
        badge: '#ef4444',
        hoverBadge: '#dc2626',
        shadow: 'rgba(239,68,68,0.15)',
      }
    case 'resultats':
      return {
        bg: '#eff6ff',
        text: '#2563eb',
        badge: '#3b82f6',
        hoverBadge: '#2563eb',
        shadow: 'rgba(59,130,246,0.15)',
      }
    case 'prescriptions':
      return {
        bg: '#fffbeb',
        text: '#d97706',
        badge: '#f59e0b',
        hoverBadge: '#d97706',
        shadow: 'rgba(245,158,11,0.15)',
      }
    case 'messages':
      return {
        bg: '#f1f5f9',
        text: '#64748b',
        badge: '#94a3b8',
        hoverBadge: '#64748b',
        shadow: 'rgba(148,163,184,0.15)',
      }
    default:
      return {
        bg: '#f1f5f9',
        text: '#64748b',
        badge: '#94a3b8',
        hoverBadge: '#64748b',
        shadow: 'rgba(148,163,184,0.15)',
      }
  }
}

export function getCategoryLabel(category) {
  switch (category) {
    case 'urgences':
      return 'Urgences'
    case 'resultats':
      return 'Résultats'
    case 'prescriptions':
      return 'Ordonnances'
    case 'messages':
      return 'Messages'
    default:
      return 'Autres'
  }
}

export function getSmartSuggestions(input) {
  const lowerInput = input.toLowerCase()
  const patientSuggestions = DUMMY_PATIENTS.filter((p) => p.toLowerCase().includes(lowerInput))
  let suggestedCategory = 'messages'
  let suggestedActions = []

  if (lowerInput.includes('tension') || lowerInput.includes('urgence') || lowerInput.includes('douleur')) {
    suggestedCategory = 'urgences'
    suggestedActions = ['Traiter', 'Voir', 'Appeler']
  } else if (lowerInput.includes('résultat') || lowerInput.includes('analyse') || lowerInput.includes('ecg')) {
    suggestedCategory = 'resultats'
    suggestedActions = ['Consulter', 'Voir', 'Archiver']
  } else if (lowerInput.includes('ordonnance') || lowerInput.includes('médicament') || lowerInput.includes('renouvellement')) {
    suggestedCategory = 'prescriptions'
    suggestedActions = ['Signer', 'Voir', 'Modifier']
  } else {
    suggestedCategory = 'messages'
    suggestedActions = ['Répondre', 'Voir', 'Archiver']
  }

  return { patientSuggestions, suggestedCategory, suggestedActions }
}

export function loadTasks() {
  return []
}

export function saveTasks(tasks) {
  void tasks
}

export function appendTask(task) {
  const tasks = loadTasks()
  const next = [{ id: Date.now(), metadata: "Aujourd'hui", ...task }, ...tasks]
  saveTasks(next)
  return next
}
