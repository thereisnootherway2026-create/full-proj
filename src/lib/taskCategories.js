import { UserCheck, FileText, Stethoscope, Phone, Wallet, Tag, TestTube2, Pill } from 'lucide-react'

// Single source of truth for task categories, used by task creation, the
// detail modal, and the task list — so "the category" means the same six
// things everywhere instead of three components drifting apart.
//
// The category IS the tasks.type column (see tasks_type_check in the
// database) — no separate taxonomy layered on top of it. Five of the six
// values already existed; 'billing' was added because nothing in the
// pre-existing enum covered "Relancer un paiement" (see the migration
// 20260923000000_task_actor_label_and_billing_type.sql).
//
// 'results' and 'prescription' are deliberately not creatable anymore — they
// were their own top-level types but the actual work behind them ("call the
// patient about it") is the same as a follow-up, so new tasks of that kind are
// created as Suivi patient. Existing rows of those older types still display
// correctly below; nothing about them is rewritten.
export const CATEGORIES = {
  appointment: { label: 'Accueil', icon: UserCheck, tint: 'text-sky-500' },
  administrative: { label: 'Administratif', icon: FileText, tint: 'text-slate-400' },
  clinical: { label: 'Consultation', icon: Stethoscope, tint: 'text-blue-500' },
  patient_followup: { label: 'Suivi patient', icon: Phone, tint: 'text-emerald-500' },
  billing: { label: 'Facturation', icon: Wallet, tint: 'text-amber-500' },
  other: { label: 'Général', icon: Tag, tint: 'text-slate-400' },
  // Legacy-only: still shown correctly on old tasks, not offered when creating a new one.
  results: { label: 'Résultats', icon: TestTube2, tint: 'text-purple-500' },
  prescription: { label: 'Ordonnance', icon: Pill, tint: 'text-blue-500' },
  clinic: { label: 'Consultation', icon: Stethoscope, tint: 'text-blue-500' }, // pre-fix typo, kept so any stray row still renders
}

// The six offered when creating or editing a task.
export const CREATABLE_CATEGORIES = ['appointment', 'administrative', 'clinical', 'patient_followup', 'billing', 'other']

export function getCategoryMeta(type) {
  return CATEGORIES[type] || CATEGORIES.other
}
