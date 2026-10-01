import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FileText,
  FlaskConical,
  Pill,
  Plus,
  Receipt,
  X,
} from 'lucide-react'
import { TreatmentEditor, ExamOrders, DocumentsBlock } from './PlanBlocks'
import Button from '../common/Button'
import IconButton from '../common/IconButton'
import StatusChip from '../common/StatusChip'
import { useAppContext } from '../../context/AppContext'

// ── Rail group accordion ────────────────────────────────────────────────────
function RailGroup({ id, icon: Icon, label, badge, openGroup, onToggle, isLast, children }) {
  const isOpen = openGroup === id
  return (
    <div
      className={`rounded-xl border transition-colors outline-none ${
        isOpen ? 'border-blue-200 bg-blue-50/15' : 'border-transparent'
      }`}
    >
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="flex h-11 w-full items-center gap-2.5 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50/80 rounded-xl transition-colors outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
        aria-expanded={isOpen}
      >
        <Icon className="h-4 w-4 shrink-0 text-slate-500" />
        <span className="flex-1 text-left truncate">{label}</span>
        {badge}
        {isOpen ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
        )}
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {!isOpen && !isLast && (
        <div className="mx-3 border-b border-gray-100" />
      )}
    </div>
  )
}

// ── Actes group content ─────────────────────────────────────────────────────
function ActesContent({
  acts = [],
  onAddActe,
  onRemoveActe,
  billToCaisse,
  onBillToggle,
  visitLinked,
  currency = '€',
}) {
  const [isAdding, setIsAdding] = useState(false)
  const [libelle, setLibelle] = useState('')
  const [montant, setMontant] = useState('25')

  const handleSave = (e) => {
    if (e) e.preventDefault()
    if (!libelle.trim()) return
    const newActe = {
      id: `act_${Date.now()}`,
      name: libelle.trim(),
      montant: parseFloat(montant) || 0,
    }
    onAddActe?.(newActe)
    setLibelle('')
    setMontant('25')
    setIsAdding(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      setIsAdding(false)
    }
  }

  return (
    <div className="space-y-2 pt-0.5">
      {/* Empty: dashed row "+ Ajouter un acte" */}
      {acts.length === 0 && !isAdding ? (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-200 bg-white hover:bg-blue-50/30 hover:border-blue-300 text-sm font-medium text-slate-500 hover:text-[#2563EB] transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span>Ajouter un acte</span>
        </button>
      ) : null}

      {/* Adding: inline row [Libellé …] [Montant €] — Enter or [+] saves */}
      {isAdding && (
        <form onSubmit={handleSave} className="flex items-center gap-1.5 p-1 rounded-lg border border-blue-200 bg-blue-50/40">
          <input
            type="text"
            autoFocus
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Libellé de l'acte…"
            className="h-8 min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#2563EB] focus:outline-none"
          />
          <div className="relative w-20 shrink-0">
            <input
              type="number"
              step="any"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Montant"
              className="h-8 w-full rounded-md border border-gray-200 bg-white pl-2 pr-5 text-xs text-slate-800 focus:border-[#2563EB] focus:outline-none"
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">{currency}</span>
          </div>
          <button
            type="submit"
            aria-label="Enregistrer l'acte"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#2563EB] text-white hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setIsAdding(false)}
            aria-label="Annuler"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </form>
      )}

      {/* Filled rows: "Consultation · 25,00 € ✕" */}
      {acts.length > 0 && (
        <div className="space-y-1.5">
          {acts.map((a) => (
            <div
              key={a.id}
              className="flex h-9 items-center justify-between px-3 rounded-lg border border-gray-200 bg-white text-[12.5px] transition-colors"
            >
              <span className="text-slate-800 font-medium truncate pr-2">{a.name}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-semibold text-slate-900 tabular-nums">
                  {Number(a.montant || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} {currency}
                </span>
                {onRemoveActe && (
                  <button
                    type="button"
                    onClick={() => onRemoveActe(a.id)}
                    className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Supprimer l'acte"
                    aria-label={`Supprimer ${a.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}

          {!isAdding && (
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="w-full h-8 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-200 text-xs font-medium text-slate-600 hover:text-[#2563EB] hover:border-blue-300 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter un acte
            </button>
          )}
        </div>
      )}

      {/* Group footer: iOS style switch "Facturé à la caisse" */}
      {visitLinked && (
        <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
          <span className="text-[12px] font-medium text-slate-600 select-none">
            Facturé à la caisse
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(billToCaisse)}
            onClick={() => onBillToggle?.(!billToCaisse)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
              billToCaisse ? 'bg-[#2563EB]' : 'bg-slate-300'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out mt-0.5 ${
                billToCaisse ? 'translate-x-4 ml-0.5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Badge helpers ──────────────────────────────────────────────────────────
function ordonnanceBadge(traitements, ordonnance, isOrdonnanceDirty) {
  const count = (traitements || []).filter((r) => r.medicament?.trim()).length
  if (isOrdonnanceDirty) return { state: 'a-completer', label: '⚠ À RÉGÉNÉRER' }
  if (ordonnance?.generated_at && count > 0) return { state: 'valide', label: '✓ GÉNÉRÉE' }
  if (count > 0) return { state: 'en-cours', label: `${count} LIGNE${count > 1 ? 'S' : ''}` }
  return null
}

// ── Shared Rail Body ────────────────────────────────────────────────────────
function RailBody({
  note,
  patient,
  acts,
  currency,
  totalActes,
  billToCaisse,
  onBillToggle,
  onAddActe,
  onRemoveActe,
  visitLinked,
  isOrdonnanceDirty,
  prescriptionRowErrors,
  setField,
  onDocumentsChange,
  requestAddTreatment,
  handleGenerateOrdonnance,
  onFinalize,
  openGroup,
  toggleGroup,
  lightweight,
  lightStage,
  prescribingGate,
  initialEditingIdx = null,
  initialActiveDoc = null,
  onToggleCollapse,
}) {
  const counts = {
    ordonnance: (note.traitements || []).filter((r) => r.medicament?.trim()).length,
    examens: (note.examens || []).length,
    documents: (note.documents || []).length,
    actes: acts.length,
  }

  const obadge = ordonnanceBadge(note.traitements, note.ordonnance, isOrdonnanceDirty)

  const safeSetField = (key) => {
    if (typeof setField === 'function') {
      const fn = setField(key)
      if (typeof fn === 'function') return fn
    }
    return () => {}
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with title + collapse button on desktop */}
      {onToggleCollapse && (
        <div className="hidden xl:flex items-center justify-between px-3.5 py-2.5 border-b border-gray-100 bg-slate-50/50">
          <span className="text-[12px] font-bold uppercase tracking-wider text-slate-700">
            Actions cliniques
          </span>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            title="Réduire les actions cliniques"
            aria-label="Réduire les actions cliniques"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Accordion groups */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {/* 1. Ordonnance */}
        <RailGroup
          id="ordonnance"
          icon={Pill}
          label="Ordonnance"
          badge={obadge ? <StatusChip state={obadge.state} label={obadge.label} /> : null}
          openGroup={openGroup}
          onToggle={toggleGroup}
        >
          <TreatmentEditor
            rows={note.traitements}
            onChange={safeSetField('traitements')}
            allergies={patient?.allergies}
            ordonnance={note.ordonnance}
            onOrdonnance={safeSetField('ordonnance')}
            onGenerateOrdonnance={handleGenerateOrdonnance}
            isOrdonnanceDirty={isOrdonnanceDirty}
            hasGeneratedOrdonnance={Boolean(note.ordonnance?.generated_at)}
            rowErrors={prescriptionRowErrors}
            onAdd={requestAddTreatment}
            gate={lightweight && lightStage === 'choose' ? null : prescribingGate}
            initialEditingIdx={initialEditingIdx}
          />
        </RailGroup>

        {/* 2. Examens */}
        <RailGroup
          id="examens"
          icon={FlaskConical}
          label="Examens"
          badge={counts.examens > 0 ? <StatusChip state="en-cours" label={`(${counts.examens})`} /> : null}
          openGroup={openGroup}
          onToggle={toggleGroup}
        >
          <ExamOrders
            items={note.examens}
            onChange={safeSetField('examens')}
            patient={patient}
            renseignements={[note.motif?.trim(), (note.diagnostics || []).join(', ')].filter(Boolean).join(' — ')}
          />
        </RailGroup>

        {/* 3. Documents */}
        <RailGroup
          id="documents"
          icon={FileText}
          label="Documents"
          badge={counts.documents > 0 ? <StatusChip state="en-cours" label={`(${counts.documents})`} /> : null}
          openGroup={openGroup}
          onToggle={toggleGroup}
        >
          <DocumentsBlock
            note={note}
            patient={patient}
            onChange={onDocumentsChange}
            initialActiveDoc={initialActiveDoc}
          />
        </RailGroup>

        {/* 4. Actes & caisse */}
        <RailGroup
          id="actes"
          icon={Receipt}
          label="Actes & caisse"
          badge={totalActes > 0 ? <StatusChip state="en-cours" label={`${totalActes.toLocaleString('fr-FR')} ${currency}`} /> : null}
          openGroup={openGroup}
          onToggle={toggleGroup}
          isLast={true}
        >
          <ActesContent
            acts={acts}
            visitLinked={visitLinked}
            billToCaisse={billToCaisse}
            onBillToggle={onBillToggle}
            onAddActe={onAddActe}
            onRemoveActe={onRemoveActe}
            currency={currency}
          />
        </RailGroup>
      </div>

      {/* Rail footer — sticky "Finaliser la visite" + Total when acts exist */}
      <div className="shrink-0 border-t border-gray-200 p-3 mt-auto bg-white">
        {acts.length > 0 && (
          <div className="text-right pb-2 text-[13px] font-semibold text-slate-900 tabular-nums">
            Total : {totalActes.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} {currency}
          </div>
        )}
        <Button
          variant="primary"
          size="sm"
          className="!w-full !bg-[#2563EB] hover:!bg-blue-700 !text-white !font-semibold !rounded-xl shadow-xs justify-center"
          onClick={onFinalize}
        >
          Finaliser la visite
        </Button>
      </div>
    </div>
  )
}

// ── Main ConsultationRail ──────────────────────────────────────────────────
export default function ConsultationRail({
  note,
  patient,
  acts: propActs = [],
  billingAmount = 0,
  visitLinked = false,
  billToCaisse,
  onBillToggle,
  onAddActe: propOnAddActe,
  onRemoveActe: propOnRemoveActe,
  isOrdonnanceDirty,
  prescriptionRowErrors,
  setField,
  onDocumentsChange,
  requestAddTreatment,
  handleGenerateOrdonnance,
  onFinalize,
  activeSection,
  lightweight,
  prescribingGate,
  lightStage,
  initialOpenGroup = 'ordonnance',
  initialEditingIdx = null,
  initialActiveDoc = null,
  isCollapsed = false,
  onToggleCollapse,
  className = '',
}) {
  const { profile } = useAppContext()
  const currency = profile?.cabinets?.currency || profile?.cabinets?.devise || profile?.currency || profile?.devise || '€'

  const [internalActs, setInternalActs] = useState(propActs)
  useEffect(() => {
    setInternalActs(propActs)
  }, [propActs])

  const handleAddActe = (newActe) => {
    setInternalActs((prev) => [...prev, newActe])
    propOnAddActe?.(newActe)
  }

  const handleRemoveActe = (id) => {
    setInternalActs((prev) => prev.filter((a) => a.id !== id))
    propOnRemoveActe?.(id)
  }

  const effectiveActs = internalActs
  const totalActes = effectiveActs.reduce((s, a) => s + (Number(a.montant) || 0), 0)

  const [openGroup, setOpenGroup] = useState(initialOpenGroup)
  useEffect(() => {
    if (initialOpenGroup) setOpenGroup(initialOpenGroup)
  }, [initialOpenGroup])

  const [drawerOpen, setDrawerOpen] = useState(false)

  const toggleGroup = (id) => setOpenGroup((prev) => (prev === id ? null : id))

  const counts = {
    ordonnance: (note.traitements || []).filter((r) => r.medicament?.trim()).length,
    examens: (note.examens || []).length,
    documents: (note.documents || []).length,
    actes: effectiveActs.length,
  }

  const totalCount =
    counts.ordonnance +
    counts.examens +
    counts.documents +
    counts.actes

  // Close drawer on Escape
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e) => { if (e.key === 'Escape') setDrawerOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  const commonProps = {
    note,
    patient,
    acts: effectiveActs,
    currency,
    totalActes,
    billToCaisse,
    onBillToggle,
    onAddActe: handleAddActe,
    onRemoveActe: handleRemoveActe,
    visitLinked,
    isOrdonnanceDirty,
    prescriptionRowErrors,
    setField,
    onDocumentsChange,
    requestAddTreatment,
    handleGenerateOrdonnance,
    openGroup,
    toggleGroup,
    lightweight,
    lightStage,
    prescribingGate,
    initialEditingIdx,
    initialActiveDoc,
    onToggleCollapse,
  }

  return (
    <>
      {/* ── Collapsed micro-rail for desktop (xl+) ── */}
      {isCollapsed && (
        <aside
          className={`hidden xl:flex flex-col items-center justify-between py-3.5 bg-white border border-gray-200 rounded-2xl w-14 shrink-0 shadow-xs sticky top-20 max-h-[calc(100vh-6rem)] select-none ${className}`}
          aria-label="Actions rapides réduites"
        >
          <div className="flex flex-col items-center gap-3 w-full">
            {/* Expand toggle */}
            <button
              type="button"
              onClick={onToggleCollapse}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              title="Agrandir les actions rapides"
              aria-label="Agrandir les actions rapides"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="w-6 border-b border-slate-100" />

            {/* Ordonnance */}
            <button
              type="button"
              onClick={() => {
                setOpenGroup('ordonnance')
                onToggleCollapse?.()
              }}
              className="relative flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 hover:text-[#1A56DB] hover:bg-blue-50 transition-colors"
              title={`Ordonnance (${counts.ordonnance})`}
            >
              <Pill className="h-4 w-4" />
              {counts.ordonnance > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#1A56DB] text-[9px] font-bold text-white shadow-2xs">
                  {counts.ordonnance}
                </span>
              )}
            </button>

            {/* Examens */}
            <button
              type="button"
              onClick={() => {
                setOpenGroup('examens')
                onToggleCollapse?.()
              }}
              className="relative flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 hover:text-[#1A56DB] hover:bg-blue-50 transition-colors"
              title={`Examens complémentaires (${counts.examens})`}
            >
              <FlaskConical className="h-4 w-4" />
              {counts.examens > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#1A56DB] text-[9px] font-bold text-white shadow-2xs">
                  {counts.examens}
                </span>
              )}
            </button>

            {/* Documents */}
            <button
              type="button"
              onClick={() => {
                setOpenGroup('documents')
                onToggleCollapse?.()
              }}
              className="relative flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 hover:text-[#1A56DB] hover:bg-blue-50 transition-colors"
              title={`Documents médicaux (${counts.documents})`}
            >
              <FileText className="h-4 w-4" />
              {counts.documents > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#1A56DB] text-[9px] font-bold text-white shadow-2xs">
                  {counts.documents}
                </span>
              )}
            </button>

            {/* Actes & Caisse */}
            <button
              type="button"
              onClick={() => {
                setOpenGroup('actes')
                onToggleCollapse?.()
              }}
              className="relative flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 hover:text-[#1A56DB] hover:bg-blue-50 transition-colors"
              title={`Actes & Caisse (${counts.actes} · ${totalActes} ${currency})`}
            >
              <Receipt className="h-4 w-4" />
              {counts.actes > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#1A56DB] text-[9px] font-bold text-white shadow-2xs">
                  {counts.actes}
                </span>
              )}
            </button>
          </div>

          {/* Bottom quick CTA */}
          <div className="flex flex-col items-center">
            {totalActes > 0 ? (
              <span className="text-[10px] font-bold text-slate-700 font-mono tracking-tight text-center px-1">
                {Math.round(totalActes)}{currency}
              </span>
            ) : (
              <button
                type="button"
                onClick={onFinalize}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-[#1A56DB] hover:bg-blue-100 transition-colors"
                title="Finaliser la visite"
              >
                <Check className="h-4 w-4 stroke-[2.5]" />
              </button>
            )}
          </div>
        </aside>
      )}

      {/* ── Full rail: shown on xl+ when not collapsed ── */}
      {!isCollapsed && (
        <aside
          className={`hidden xl:flex flex-col w-80 shrink-0 sticky top-20 max-h-[calc(100vh-6rem)] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xs ${className}`}
          aria-label="Actions rapides"
        >
          <RailBody {...commonProps} onFinalize={onFinalize} />
        </aside>
      )}

      {/* ── Floating Action Button for < xl screens (same position, all sections) ── */}
      <div className="fixed bottom-6 right-6 z-40 xl:hidden">
        <button
          type="button"
          onClick={() => {
            setOpenGroup('ordonnance')
            setDrawerOpen(true)
          }}
          className="relative flex h-12 w-12 items-center justify-center rounded-full bg-[#2563EB] text-white shadow-lg hover:bg-blue-700 active:scale-95 transition-all outline-none focus:outline-none"
          aria-label="Ouvrir les actions rapides"
          title="Actions rapides (Ordonnance, Examens, Documents, Actes)"
        >
          <Pill className="h-5 w-5 stroke-[2.2]" />
          {totalCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 min-w-[20px] items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white shadow-xs border-2 border-white">
              {totalCount > 9 ? '9+' : totalCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Overlay drawer for < xl screens ── */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-[120] bg-black/30"
              onClick={() => setDrawerOpen(false)}
            />
            <motion.div
              key="drawer"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
              className="fixed inset-y-0 right-0 z-[121] flex w-80 max-w-[90vw] flex-col bg-white shadow-2xl"
            >
              {/* Drawer header */}
              <div className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 px-4">
                <span className="text-[13.5px] font-bold text-slate-900">Actions rapides</span>
                <IconButton label="Fermer" onClick={() => setDrawerOpen(false)}>
                  <X className="h-4 w-4" />
                </IconButton>
              </div>
              {/* Reuse exact same rail content */}
              <div className="flex-1 overflow-y-auto">
                <RailBody
                  {...commonProps}
                  onFinalize={() => {
                    setDrawerOpen(false)
                    onFinalize()
                  }}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
