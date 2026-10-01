import { useState } from 'react'
import { Plus, X } from 'lucide-react'

// Common Radiology catalog (8 exams across 3 columns matching design)
export const RADIOLOGY_EXAMS_COLS = [
  ['Radiographie thoracique', 'Échographie cardiaque', 'Mammographie'],
  ['Échographie abdominale', 'Scanner (TDM)', 'Doppler'],
  ['Échographie pelvienne', 'IRM'],
]

// Common Biology catalog (12 exams across 3 columns matching design)
export const BIOLOGY_EXAMS_COLS = [
  ['NFS / Hémogramme', 'Glycémie à jeun', 'HbA1c', 'Ionogramme sanguin'],
  ['Bilan lipidique (Cholestérol/TG)', 'Créatinine & Clairance', 'Bilan hépatique (Transaminases)', 'CRP / VS'],
  ['ECBU (Examen des urines)', 'TSH', 'Bilan de coagulation (TP/INR)', 'Ferritine'],
]

const ALL_CATALOG_EXAMS = [
  ...RADIOLOGY_EXAMS_COLS.flat(),
  ...BIOLOGY_EXAMS_COLS.flat(),
]

const fold = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

export default function DemandeExamensCard({ items = [], onChange, className = '' }) {
  const [activeTab, setActiveTab] = useState('radiologie')
  const [customText, setCustomText] = useState('')
  const [showAddCustom, setShowAddCustom] = useState(false)

  const isChecked = (name) => {
    const fn = fold(name)
    return items.some((i) => fold(i) === fn)
  }

  const toggleExam = (name) => {
    const fn = fold(name)
    if (items.some((i) => fold(i) === fn)) {
      onChange(items.filter((i) => fold(i) !== fn))
    } else {
      onChange([...items, name])
    }
  }

  const addCustomExam = () => {
    const trimmed = customText.trim()
    if (!trimmed || isChecked(trimmed)) return
    onChange([...items, trimmed])
    setCustomText('')
    setShowAddCustom(false)
  }

  // Count exams selected in each category
  const radFlat = RADIOLOGY_EXAMS_COLS.flat().map(fold)
  const bioFlat = BIOLOGY_EXAMS_COLS.flat().map(fold)

  const radCount = items.filter((i) => radFlat.includes(fold(i))).length
  const bioCount = items.filter((i) => bioFlat.includes(fold(i))).length
  const customExams = items.filter((i) => !radFlat.includes(fold(i)) && !bioFlat.includes(fold(i)))

  const currentCols = activeTab === 'radiologie' ? RADIOLOGY_EXAMS_COLS : BIOLOGY_EXAMS_COLS

  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-xs ${className}`}>
      {/* Title */}
      <h3 className="text-[16px] font-bold text-slate-900">Demande d'examens</h3>

      {/* Tabs Row */}
      <div className="mt-3 flex items-center gap-6 border-b border-slate-200/80">
        <button
          type="button"
          onClick={() => setActiveTab('radiologie')}
          className={`relative pb-2.5 text-[14px] font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'radiologie'
              ? 'text-emerald-700 font-semibold'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>Radiologie</span>
          <span className="inline-flex items-center justify-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
            {radCount}
          </span>
          {activeTab === 'radiologie' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600 rounded-full" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('biologie')}
          className={`relative pb-2.5 text-[14px] font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'biologie'
              ? 'text-emerald-700 font-semibold'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>Biologie</span>
          <span className="inline-flex items-center justify-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
            {bioCount}
          </span>
          {activeTab === 'biologie' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600 rounded-full" />
          )}
        </button>
      </div>

      {/* 3-Column Checkbox Grid */}
      <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2 md:grid-cols-3">
        {currentCols.map((col, colIdx) => (
          <div key={colIdx} className="space-y-2.5">
            {col.map((examName) => {
              const checked = isChecked(examName)
              return (
                <label
                  key={examName}
                  className="flex items-center gap-2.5 cursor-pointer text-[13.5px] text-slate-700 hover:text-slate-900 select-none py-0.5"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleExam(examName)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 accent-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span className={checked ? 'font-medium text-slate-900' : ''}>
                    {examName}
                  </span>
                </label>
              )
            })}
          </div>
        ))}
      </div>

      {/* Custom exams tags if any */}
      {customExams.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
          <span className="text-[11.5px] font-medium text-slate-400">Autres examens :</span>
          {customExams.map((x) => (
            <span
              key={x}
              className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[12px] font-medium text-emerald-800"
            >
              <span>{x}</span>
              <button
                type="button"
                onClick={() => onChange(items.filter((item) => item !== x))}
                className="hover:text-red-600"
                aria-label={`Retirer ${x}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Inline custom exam adder */}
      {showAddCustom ? (
        <div className="mt-3 flex items-center gap-2">
          <input
            type="text"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCustomExam()
              }
            }}
            placeholder="Nom de l'examen personnalisé…"
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            autoFocus
          />
          <button
            type="button"
            onClick={addCustomExam}
            disabled={!customText.trim()}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Ajouter
          </button>
          <button
            type="button"
            onClick={() => { setShowAddCustom(false); setCustomText('') }}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowAddCustom(true)}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-slate-400 hover:text-slate-600 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Ajouter un autre examen…</span>
          </button>
        </div>
      )}

      {/* Card Footer: Summary counter */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[12px] text-slate-400">
        <p>
          <span className="font-semibold text-slate-600">{items.length}</span> / {ALL_CATALOG_EXAMS.length} examens demandés
        </p>
      </div>
    </div>
  )
}
