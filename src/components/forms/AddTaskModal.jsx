import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Search, ChevronDown, Check, User } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

// ─── Constants ──────────────────────────────────────────────────────────────
const TASK_TYPES = [
  { value: 'patient_followup', label: 'Suivi patient' },
  { value: 'clinic', label: 'Clinique' },
  { value: 'results', label: 'Résultats' },
  { value: 'prescription', label: 'Ordonnance' },
  { value: 'appointment', label: 'Rendez-vous' },
  { value: 'administrative', label: 'Administratif' },
  { value: 'other', label: 'Autre' }
]

const TASK_PRIORITIES = [
  { value: 'normal',    label: 'Normale',    color: '#64748B', indicator: '#94A3B8' },
  { value: 'high',      label: 'Importante', color: '#B45309', indicator: '#F59E0B' },
  { value: 'urgent',    label: 'Urgente',    color: '#B91C1C', indicator: '#EF4444' }
]

const DEFAULT_ASSIGNEES = [
  { id: 'me', label: 'Moi-même' },
]

const PATIENT_REQUIRED_TYPES = ['patient_followup', 'clinic', 'results', 'prescription']

// ─── Shared input class helpers ──────────────────────────────────────────────
const inputBase =
  'w-full h-[38px] px-3 rounded-[8px] border text-sm font-medium focus:outline-none focus:ring-1 transition-shadow'
const inputNormal = `${inputBase} border-slate-300 bg-white text-slate-900 focus:ring-blue-400 focus:border-blue-400`
const inputError  = `${inputBase} border-red-300 bg-red-50 text-slate-900 focus:ring-red-400 focus:border-red-400`
const selectBase  =
  'w-full h-[38px] rounded-[8px] border border-slate-300 bg-white text-sm font-medium text-slate-800 appearance-none focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 cursor-pointer transition-shadow disabled:opacity-70 disabled:bg-slate-50'

// ─── Validation ──────────────────────────────────────────────────────────────
function validate(form) {
  const errors = {}
  if (!form.title || form.title.trim() === '') {
    errors.title = 'Le titre est requis.'
  }
  if (PATIENT_REQUIRED_TYPES.includes(form.type) && !form.patientId) {
    errors.patientId = 'Veuillez sélectionner un patient.'
  }
  if (form.dueDate && isNaN(new Date(form.dueDate).getTime())) {
    errors.dueDate = 'Veuillez sélectionner une date valide.'
  }
  return errors
}

// ─── Patient Search Component ────────────────────────────────────────────────
function PatientSearch({ value, patientName, onChange, patients = [] }) {
  const [query, setQuery] = useState(patientName || '')
  const [open, setOpen] = useState(false)
  const inputRef = useRef(null)
  const containerRef = useRef(null)

  const filtered = patients.filter((p) => {
    if (query.trim().length === 0) return false
    const searchString = `${p.prenom} ${p.nom} ${p.cin || ''} ${p.telephone || ''}`.toLowerCase()
    return searchString.includes(query.toLowerCase())
  })

  useEffect(() => {
    setQuery(patientName || '')
  }, [patientName])

  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
        if (value) setQuery(patientName || '')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [value, patientName])

  return (
    <div ref={containerRef} className="relative">
      {value ? (
        /* ── Selected state ── */
        <div className="w-full min-h-[38px] px-3 py-1.5 rounded-[8px] border border-slate-300 bg-slate-50 flex items-center justify-between">
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-slate-900 truncate">{patientName}</span>
            {(() => {
              const p = patients.find(x => x.id === value)
              if (p && (p.cin || p.telephone)) {
                return (
                  <span className="text-xs text-slate-500">
                    {p.cin ? `CIN: ${p.cin}` : ''}{p.cin && p.telephone ? ' · ' : ''}{p.telephone}
                  </span>
                )
              }
              return null
            })()}
          </div>
          <button
            type="button"
            tabIndex={-1}
            onClick={() => { setQuery(''); onChange('', '') }}
            className="ml-2 w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        /* ── Search input state ── */
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
              if (!e.target.value) onChange('', '')
            }}
            onFocus={() => { if (query.trim().length > 0) setOpen(true) }}
            placeholder="Rechercher un patient..."
            className="w-full h-[38px] pl-9 pr-3 rounded-[8px] border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 transition-shadow"
          />
        </div>
      )}

      {/* ── Dropdown ── */}
      <AnimatePresence>
        {open && query.trim().length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.13 }}
            className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-44 overflow-y-auto z-50"
          >
            {filtered.length > 0 ? (
              filtered.map((p) => {
                const fullName = `${p.prenom} ${p.nom}`
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setQuery(fullName)
                      onChange(p.id, fullName)
                      setOpen(false)
                    }}
                    className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
                  >
                    <div className="w-7 h-7 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-bold text-blue-600">
                        {p.prenom[0]}{p.nom[0]}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{fullName}</p>
                      {(p.cin || p.telephone) && (
                        <p className="text-xs text-slate-500 truncate">
                          {p.cin ? `CIN: ${p.cin}` : ''}{p.cin && p.telephone ? ' · ' : ''}{p.telephone}
                        </p>
                      )}
                    </div>
                    {value === p.id && <Check size={14} className="text-blue-600 flex-shrink-0" />}
                  </button>
                )
              })
            ) : (
              <div className="px-4 py-3 text-sm text-slate-500 text-center">
                Aucun patient trouvé
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Main Modal Component ────────────────────────────────────────────────────
export default function AddTaskModal({
  open,
  onClose,
  onSubmit,
  isPending = false,
  mode = 'create',
  initialData = null,
  patients = [],
  currentUser = null
}) {
  const isEdit = mode === 'edit'

  const getEmptyForm = () => {
    const today = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD, always dynamic
    return {
      title: '',
      description: '',
      patientId: '',
      patientName: '',
      type: 'patient_followup',
      priority: 'normal',
      dueDate: today,
      dueTime: '',
      assignedTo: currentUser?.id || 'me'
    }
  }

  const [form, setForm] = useState(getEmptyForm)
  const [initialFormState, setInitialFormState] = useState(null)
  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState({})
  const [showDiscardWarning, setShowDiscardWarning] = useState(false)
  const titleRef = useRef(null)

  // ── Initialization ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      let stateToSet
      if (isEdit && initialData) {
        stateToSet = {
          title:       initialData.title || '',
          description: initialData.description || '',
          patientId:   initialData.patientId || '',
          patientName: initialData.patientName || '',
          type:        initialData.type || 'patient_followup',
          priority:    initialData.priority || 'normal',
          dueDate:     initialData.dueDate || '',
          dueTime:     initialData.dueTime || '',
          assignedTo:  initialData.assignedTo || currentUser?.id || 'me'
        }
      } else {
        stateToSet = getEmptyForm()
      }
      setForm(stateToSet)
      setInitialFormState(JSON.stringify(stateToSet))
      setErrors({})
      setTouched({})
      setShowDiscardWarning(false)
      setTimeout(() => { titleRef.current?.focus() }, 100)
    }
  }, [open, isEdit, initialData, currentUser])

  const isDirty = initialFormState && JSON.stringify(form) !== initialFormState

  // ── Keyboard / Esc ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleAttemptClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, isDirty, isPending])

  // ── Field updater ───────────────────────────────────────────────────────────
  const setField = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setTouched((prev) => ({ ...prev, [field]: true }))
    setErrors(prev => {
      const next = { ...prev }
      if (field === 'title'     && value.trim() !== '') delete next.title
      if (field === 'patientId' && value)               delete next.patientId
      if (field === 'type'      && !PATIENT_REQUIRED_TYPES.includes(value)) delete next.patientId
      if (field === 'dueDate'   && !isNaN(new Date(value).getTime()))       delete next.dueDate
      return next
    })
  }, [])

  // ── Close / discard ─────────────────────────────────────────────────────────
  const handleAttemptClose = () => {
    if (isPending) return
    if (isDirty) setShowDiscardWarning(true)
    else onClose()
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = (e) => {
    if (e) e.preventDefault()
    if (isPending) return

    const errs = validate(form)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      setTouched({ title: true, patientId: true, dueDate: true })
      if (errs.title) titleRef.current?.focus()
      return
    }

    onSubmit({
      title:       form.title.trim(),
      description: form.description.trim() || undefined,
      patientId:   form.patientId || undefined,
      type:        form.type,
      priority:    form.priority,
      dueDate:     form.dueDate || undefined,
      dueTime:     form.dueTime || undefined,
      assignedTo:  form.assignedTo
    })
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit()
  }

  if (!open) return null

  // ── Priority meta for current selection ────────────────────────────────────
  const currentPriority = TASK_PRIORITIES.find(p => p.value === form.priority)

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[2px] overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onMouseDown={(e) => { if (e.target === e.currentTarget) handleAttemptClose() }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 10 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-[580px] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onKeyDown={handleKeyDown}
      >
        {/* ── Discard warning overlay ────────────────────────────────────── */}
        {showDiscardWarning && (
          <div className="absolute inset-0 z-50 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-200">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Quitter sans enregistrer ?</h3>
            <p className="text-slate-600 mb-6">Les informations saisies seront perdues.</p>
            <div className="flex gap-3 w-full">
              <button
                onClick={() => setShowDiscardWarning(false)}
                className="flex-1 px-4 py-2.5 rounded-xl font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Continuer la saisie
              </button>
              <button
                onClick={() => { setShowDiscardWarning(false); onClose() }}
                className="flex-1 px-4 py-2.5 rounded-xl font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors"
              >
                Quitter
              </button>
            </div>
          </div>
        )}

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between px-6 pt-5 pb-3 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 id="modal-title" className="text-[21px] font-bold text-slate-900 leading-none">
              {isEdit ? 'Modifier la tâche' : 'Nouvelle tâche'}
            </h2>
            <p className="text-sm font-medium text-slate-500 mt-1">
              {isEdit ? 'Modifiez les détails de la tâche.' : 'Ajoutez une tâche à votre liste de priorités.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleAttemptClose}
            disabled={isPending}
            className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 flex items-center justify-center transition-colors -mt-0.5 -mr-1 disabled:opacity-50 flex-shrink-0"
          >
            <X size={17} />
          </button>
        </div>

        {/* ── Body ──────────────────────────────────────────────────────── */}
        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-4">

          {/* Titre — primary field */}
          <div>
            <label htmlFor="task-title" className="block text-[13px] font-semibold text-slate-700 mb-1">
              Titre <span className="text-blue-500">*</span>
            </label>
            <input
              id="task-title"
              ref={titleRef}
              type="text"
              value={form.title}
              onChange={(e) => setField('title', e.target.value)}
              onBlur={() => setTouched(p => ({ ...p, title: true }))}
              placeholder="Ex. Consulter les résultats biologiques"
              className={touched.title && errors.title ? inputError : inputNormal}
              disabled={isPending}
            />
            {touched.title && errors.title && (
              <p className="text-xs font-semibold text-red-600 mt-1">{errors.title}</p>
            )}
          </div>

          {/* Description — compact fixed textarea */}
          <div>
            <label htmlFor="task-desc" className="block text-[13px] font-semibold text-slate-700 mb-1">
              Description
            </label>
            <textarea
              id="task-desc"
              rows={2}
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              placeholder="Ajouter un contexte ou une note..."
              disabled={isPending}
              className="w-full px-3 py-2 rounded-[8px] border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 transition-shadow resize-none disabled:opacity-70 disabled:bg-slate-50"
              style={{ minHeight: '60px', maxHeight: '60px' }}
            />
          </div>

          {/* Patient */}
          <div>
            <label className="block text-[13px] font-semibold text-slate-700 mb-1">
              Patient
            </label>
            <PatientSearch
              value={form.patientId}
              patientName={form.patientName}
              patients={patients}
              onChange={(id, name) => {
                setField('patientId', id)
                setField('patientName', name)
              }}
            />
            {touched.patientId && errors.patientId && (
              <p className="text-xs font-semibold text-red-600 mt-1">{errors.patientId}</p>
            )}
          </div>

          {/* Type + Priorité — 2-column */}
          <div className="grid grid-cols-2 gap-3">
            {/* Type de tâche */}
            <div>
              <label className="block text-[13px] font-semibold text-slate-700 mb-1">
                Type de tâche
              </label>
              <div className="relative">
                <select
                  value={form.type}
                  onChange={(e) => setField('type', e.target.value)}
                  className={`${selectBase} pl-3 pr-8`}
                  disabled={isPending}
                >
                  {TASK_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <ChevronDown size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Priorité */}
            <div>
              <label className="block text-[13px] font-semibold text-slate-700 mb-1">
                Priorité
              </label>
              <div className="relative">
                <select
                  value={form.priority}
                  onChange={(e) => setField('priority', e.target.value)}
                  className={`${selectBase} pl-8 pr-8`}
                  style={{ color: currentPriority?.color || '#334155' }}
                  disabled={isPending}
                >
                  {TASK_PRIORITIES.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                {/* Priority dot */}
                <div
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full pointer-events-none"
                  style={{ backgroundColor: currentPriority?.indicator || '#CBD5E1' }}
                />
                <ChevronDown size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Échéance + Heure — 2-column */}
          <div className="grid grid-cols-2 gap-3">
            {/* Échéance */}
            <div>
              <label className="block text-[13px] font-semibold text-slate-700 mb-1">
                Échéance
              </label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setField('dueDate', e.target.value)}
                onBlur={() => setTouched(p => ({ ...p, dueDate: true }))}
                className={`${touched.dueDate && errors.dueDate ? inputError : inputNormal}`}
                disabled={isPending}
              />
              {touched.dueDate && errors.dueDate && (
                <p className="text-xs font-semibold text-red-600 mt-1">{errors.dueDate}</p>
              )}
            </div>

            {/* Heure */}
            <div>
              <label className="block text-[13px] font-semibold text-slate-700 mb-1">
                Heure
              </label>
              <input
                type="time"
                value={form.dueTime}
                onChange={(e) => setField('dueTime', e.target.value)}
                className={inputNormal}
                disabled={isPending}
              />
            </div>
          </div>

          {/* Assigné à */}
          <div>
            <label className="block text-[13px] font-semibold text-slate-700 mb-1">
              Assigné à
            </label>
            <div className="relative">
              <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <select
                value={form.assignedTo}
                onChange={(e) => setField('assignedTo', e.target.value)}
                className={`${selectBase} pl-9 pr-8`}
                disabled={isPending}
              >
                {DEFAULT_ASSIGNEES.map(a => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>
              <ChevronDown size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>

        </div>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-end gap-2.5 flex-shrink-0">
          {/* Annuler — secondary, slate effect */}
          <button
            type="button"
            onClick={handleAttemptClose}
            disabled={isPending}
            className="h-[36px] px-5 rounded-[8px] font-semibold text-[13px] disabled:opacity-50"
            style={{
              backgroundColor: '#f8fafc',
              color: '#475569',
              border: '1.5px solid #e2e8f0',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            onMouseEnter={(e) => {
              if (!isPending) {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.backgroundColor = '#f1f5f9'
                e.currentTarget.style.borderColor = '#cbd5e1'
                e.currentTarget.style.boxShadow = '0 6px 16px -4px rgba(148,163,184,0.18)'
              }
            }}
            onMouseLeave={(e) => {
              if (!isPending) {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.backgroundColor = '#f8fafc'
                e.currentTarget.style.borderColor = '#e2e8f0'
                e.currentTarget.style.boxShadow = 'none'
              }
            }}
            onMouseDown={(e) => {
              if (!isPending) {
                e.currentTarget.style.transform = 'translateY(-1px) scale(0.98)'
                e.currentTarget.style.boxShadow = '0 3px 8px -2px rgba(148,163,184,0.12)'
              }
            }}
            onMouseUp={(e) => {
              if (!isPending) {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 6px 16px -4px rgba(148,163,184,0.18)'
              }
            }}
          >
            Annuler
          </button>

          {/* Créer la tâche — primary, blue effect */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="h-[36px] px-5 rounded-[8px] font-semibold text-[13px] text-white flex items-center gap-2 disabled:opacity-70"
            style={{
              backgroundColor: '#2563eb',
              border: '1.5px solid #3b82f6',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            onMouseEnter={(e) => {
              if (!isPending) {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.backgroundColor = '#1d4ed8'
                e.currentTarget.style.borderColor = '#2563eb'
                e.currentTarget.style.boxShadow = '0 6px 16px -4px rgba(37,99,235,0.4)'
              }
            }}
            onMouseLeave={(e) => {
              if (!isPending) {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.backgroundColor = '#2563eb'
                e.currentTarget.style.borderColor = '#3b82f6'
                e.currentTarget.style.boxShadow = 'none'
              }
            }}
            onMouseDown={(e) => {
              if (!isPending) {
                e.currentTarget.style.transform = 'translateY(-1px) scale(0.98)'
                e.currentTarget.style.boxShadow = '0 3px 8px -2px rgba(37,99,235,0.25)'
              }
            }}
            onMouseUp={(e) => {
              if (!isPending) {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 6px 16px -4px rgba(37,99,235,0.4)'
              }
            }}
          >
            {isPending ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {isEdit ? 'Enregistrement...' : 'Création...'}
              </>
            ) : (
              isEdit ? 'Enregistrer' : 'Créer la tâche'
            )}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
