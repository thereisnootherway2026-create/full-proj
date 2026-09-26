import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronRight, FlaskConical } from 'lucide-react'
import { isMissingTable, listExamsToReview } from '../../lib/examService'

// Doctor dashboard: exam results that arrived and nobody has read yet — one chip per
// patient, straight to their Examens tab. Hidden when there is nothing to review.
export default function ExamsToReviewBanner() {
  const navigate = useNavigate()
  const q = useQuery({
    queryKey: ['exams-to-review'],
    queryFn: () => listExamsToReview(),
    refetchInterval: 60_000,
    retry: (n, e) => !isMissingTable(e) && n < 2,
  })
  const patients = useMemo(() => {
    const byPatient = new Map()
    for (const r of q.data?.rows || []) {
      const cur = byPatient.get(r.patient_id) || { id: r.patient_id, name: `${r.patients?.prenom || ''} ${r.patients?.nom || ''}`.trim() || 'Patient', count: 0 }
      cur.count += 1
      byPatient.set(r.patient_id, cur)
    }
    return [...byPatient.values()]
  }, [q.data])

  const total = q.data?.total || 0
  if (!total) return null

  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700"><FlaskConical className="h-4 w-4" /></span>
        <p className="text-[13.5px] font-semibold text-amber-900">
          {total} résultat{total > 1 ? 's' : ''} d'examen{total > 1 ? 's' : ''} à revoir
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {patients.slice(0, 6).map((p) => (
          <button key={p.id} type="button" onClick={() => navigate(`/patient-workspace/${p.id}?tab=Examens`)}
            className="group inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[12.5px] font-medium text-slate-700 ring-1 ring-amber-200 transition-colors hover:bg-amber-100">
            {p.name}{p.count > 1 && <span className="text-amber-700">· {p.count}</span>}
            <ChevronRight className="h-3.5 w-3.5 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </button>
        ))}
        {patients.length > 6 && <span className="self-center text-[12px] text-amber-800">+ {patients.length - 6} patient{patients.length - 6 > 1 ? 's' : ''}</span>}
      </div>
    </motion.div>
  )
}
