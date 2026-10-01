import { useEffect } from 'react'
import { Printer, Edit3, X, CheckCircle2 } from 'lucide-react'
import { formatDoctorLabel } from '../../lib/professionalName'
import Button from '../common/Button'

export default function OrdonnancePreviewModal({
  isOpen,
  onClose,
  onEdit,
  note,
  patient,
  patientName = '',
  encounterId = '',
  header,
}) {
  // Listen for Escape key to dismiss
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const rows = (note?.traitements || []).filter((r) => r?.medicament?.trim())
  const docName = formatDoctorLabel(header?.medecin || 'Docteur')
  const specialite = header?.specialite || 'Médecine Générale'
  const rpps = header?.rpps || header?.adeli || '10102345678'
  const adresse = header?.adresse || 'Cabinet Médical MacroMedica'
  const telephone = header?.telephone || '05 22 00 00 00'
  const ville = header?.ville || 'Casablanca'

  const pName = patientName || `${patient?.nom || ''} ${patient?.prenom || ''}`.trim() || 'Patient'
  const ageDisplay = patient?.age ? `${patient.age} ans` : (patient?.date_naissance ? `${patient.date_naissance}` : '')
  const couverture = patient?.mutuelle || patient?.assurance || patient?.couverture || (patient?.ald ? 'ALD 100%' : 'Assuré(e)')

  const ordoDate = note?.ordonnance?.generated_at
    ? new Date(note.ordonnance.generated_at)
    : new Date()
  const formattedDate = ordoDate.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const formattedDateTime = `${formattedDate} à ${ordoDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
  const consultRef = encounterId || (note?.id ? String(note.id).slice(0, 8) : 'DRAFT')

  const handlePrint = () => {
    window.print()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Aperçu de l'ordonnance"
      className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-3 sm:p-6 print:p-0 print:bg-white print:fixed print:inset-0"
    >
      {/* Print-specific style block scoped to this preview */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm 15mm;
          }
          body * {
            visibility: hidden !important;
          }
          #ordonnance-a4-sheet,
          #ordonnance-a4-sheet * {
            visibility: visible !important;
          }
          #ordonnance-a4-sheet {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            min-height: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
            background: #ffffff !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Modal window container */}
      <div className="relative flex max-h-[94vh] w-full max-w-4xl flex-col rounded-2xl bg-slate-100 shadow-2xl border border-slate-200/80 overflow-hidden print:border-none print:shadow-none print:max-h-none print:bg-white">
        
        {/* Top bar (Screen only) */}
        <div className="no-print flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 font-bold text-sm">
              📄
            </span>
            <div>
              <h2 className="text-[15px] font-bold text-slate-900 leading-tight">
                Aperçu de l'ordonnance
              </h2>
              <p className="text-[12px] text-slate-500">
                Format A4 standard · Prêt pour impression ou export PDF
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onClose?.()
                  onEdit?.()
                }}
                className="!text-slate-600 hover:!bg-slate-100"
              >
                <Edit3 className="h-4 w-4 mr-1.5" />
                Modifier
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
              className="!text-slate-600 hover:!bg-slate-100"
            >
              Fermer
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handlePrint}
              className="!bg-blue-600 hover:!bg-blue-700 shadow-xs"
            >
              <Printer className="h-4 w-4 mr-1.5" />
              Imprimer
            </Button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="ml-1 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable sheet preview area */}
        <div className="overflow-y-auto p-4 sm:p-8 flex justify-center bg-slate-200/60 print:p-0 print:bg-white print:overflow-visible">
          {/* A4 Sheet Container */}
          <div
            id="ordonnance-a4-sheet"
            className="w-full max-w-[210mm] min-h-[297mm] bg-white rounded-sm shadow-lg border border-slate-200 p-[15mm] sm:p-[18mm] flex flex-col justify-between text-slate-900 font-sans print:shadow-none print:border-none print:rounded-none"
          >
            {/* 1. Header (Letterhead) */}
            <div>
              <div className="flex items-start justify-between gap-6 border-b-2 border-slate-900 pb-4">
                <div className="min-w-0 flex-1">
                  <h1 className="text-[18px] font-black uppercase tracking-wide text-slate-950">
                    {docName}
                  </h1>
                  <p className="text-[13px] font-semibold text-slate-700 mt-0.5">
                    {specialite}
                  </p>
                  <p className="text-[11.5px] font-medium text-slate-600 mt-1">
                    N°&nbsp;RPPS&nbsp;: <span className="font-semibold text-slate-800">{rpps}</span>
                  </p>
                  <p className="text-[10.5px] text-slate-500 uppercase tracking-wider mt-0.5">
                    Conventionné Secteur 1
                  </p>
                </div>

                <div className="text-right text-[11.5px] text-slate-600 leading-relaxed max-w-[240px]">
                  {header?.logo && (
                    <img
                      src={header.logo}
                      alt=""
                      className="mb-2 ml-auto max-h-12 w-auto object-contain"
                    />
                  )}
                  {adresse && <p className="font-medium text-slate-800">{adresse}</p>}
                  {telephone && (
                    <p className="font-semibold text-slate-900 mt-0.5">
                      Tél&nbsp;: {telephone}
                    </p>
                  )}
                  {ville && <p className="text-slate-600">{ville}</p>}
                </div>
              </div>

              {/* 2. Title & Date */}
              <div className="my-7 flex flex-col items-center justify-center">
                <span className="inline-block rounded-xs border-2 border-slate-900 px-8 py-1.5 text-[15pt] font-black uppercase tracking-[0.25em] text-slate-950">
                  ORDONNANCE
                </span>
                <p className="mt-3 text-[12px] font-medium text-slate-600">
                  Fait à {ville}, le {formattedDate}
                </p>
              </div>

              {/* 3. Patient Information Box */}
              <div className="mb-7 rounded-lg border border-slate-300 bg-slate-50/70 p-3.5 text-[13px]">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mr-2">
                      Patient&nbsp;:
                    </span>
                    <span className="text-[15px] font-bold text-slate-900 capitalize">
                      {pName}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-[12px] text-slate-700">
                    {ageDisplay && (
                      <p>
                        <span className="text-slate-500 font-medium">Âge&nbsp;: </span>
                        <span className="font-semibold text-slate-900">{ageDisplay}</span>
                      </p>
                    )}
                    {couverture && (
                      <p>
                        <span className="text-slate-500 font-medium">Couverture&nbsp;: </span>
                        <span className="font-semibold text-slate-900">{couverture}</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* 4. Prescription Lines */}
              <div className="space-y-6 pl-2 pr-1">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-1.5 mb-4">
                  <span className="font-serif text-[18pt] font-bold italic leading-none text-slate-400">
                    ℞
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                    Prescriptions médicamenteuses
                  </span>
                </div>

                {rows.length === 0 ? (
                  <p className="text-[13px] italic text-slate-400 py-4">
                    Aucun médicament spécifié.
                  </p>
                ) : (
                  <ol className="space-y-4">
                    {rows.map((r, i) => (
                      <li key={i} className="space-y-1">
                        <div className="flex items-baseline gap-2">
                          <span className="w-5 shrink-0 text-[12px] font-bold text-slate-400">
                            {i + 1}.
                          </span>
                          <span className="text-[15px] font-black text-slate-950">
                            {r.medicament}
                            {r.dosage ? ` ${r.dosage}` : ''}
                          </span>
                        </div>
                        {(r.posologie || r.duree) && (
                          <div className="pl-7 text-[13px] font-medium text-slate-800 leading-snug">
                            {r.posologie && <span>{r.posologie}</span>}
                            {r.posologie && r.duree && (
                              <span className="mx-2 text-slate-400">·</span>
                            )}
                            {r.duree && (
                              <span className="text-slate-700">Pendant {r.duree}</span>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>

            {/* 5. Signature & Footer */}
            <div className="mt-12 pt-6">
              <div className="flex justify-end pr-4">
                <div className="w-64 text-center">
                  <p className="text-[11.5px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    {docName}
                  </p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-6">
                    Signature et cachet
                  </p>
                  <div className="h-16 rounded border border-dashed border-slate-300 bg-slate-50/50 flex items-center justify-center">
                    <span className="font-serif italic text-slate-400 text-[14px]">
                      {docName}
                    </span>
                  </div>
                </div>
              </div>

              {/* Document Reference Footer */}
              <div className="mt-8 border-t border-slate-200 pt-3 flex flex-wrap items-center justify-between text-[9.5px] text-slate-500 font-medium">
                <p>
                  Ordonnance générée par MacroMedica le {formattedDateTime}
                </p>
                <p>
                  Consultation n°&nbsp;<span className="font-mono text-slate-700">{consultRef}</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom actions footer on small screens (Screen only) */}
        <div className="no-print sm:hidden flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Fermer
          </Button>
          <Button variant="primary" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-1.5" />
            Imprimer
          </Button>
        </div>
      </div>
    </div>
  )
}
