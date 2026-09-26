import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { updatePatientAgeSexe } from '../../lib/api'
import { approxBirthDateFromAge, formatFrenchDate, parseFrenchDate } from '../../lib/clinical/age'
import { isPregnancyStatus, pregnancyRelevant } from '../../lib/clinical/prescribingReadiness'
import Button from '../common/Button'
import Chip from '../common/Chip'

// Compact inline form for the missing identity items a prescription depends on.
//   fields       : which of 'age' | 'sexe' to ask (only the missing ones in the gate)
//   askPregnancy : also ask grossesse / allaitement when relevant (per visit, stored
//                  in the consultation note by the caller through onPregnancy)
// Age: either a date of birth (jj/mm/aaaa) or an age in years; the latter is
// stored as 1 January of the computed year with date_naissance_approx = true.
const SEXES = [['homme', 'Homme'], ['femme', 'Femme']]
const PREGNANCY = [['non', 'Non'], ['oui', 'Enceinte'], ['allaitement', 'Allaitement'], ['inconnu', 'Ne sait pas']]

// Types digits and places the slashes: "24091984" -> "24/09/1984".
const maskDate = (raw) => {
  const d = String(raw).replace(/\D/g, '').slice(0, 8)
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join('/')
}

const Label = ({ children }) => <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{children}</p>

export default function AgeSexeForm({
  patient, patientId, fields = ['age', 'sexe'], askPregnancy = false, pregnancyStatus = '', onPregnancy,
  onDone, onCancel, submitLabel = 'Enregistrer', className = '',
}) {
  const queryClient = useQueryClient()
  const askAge = fields.includes('age')
  const askSexe = fields.includes('sexe')
  const [sexe, setSexe] = useState(patient?.sexe === 'homme' || patient?.sexe === 'femme' ? patient.sexe : '')
  const [mode, setMode] = useState(patient?.date_naissance_approx ? 'age' : 'date')
  const [dateText, setDateText] = useState(patient?.date_naissance && !patient?.date_naissance_approx ? formatFrenchDate(patient.date_naissance) : '')
  const [years, setYears] = useState('')
  const [pregnancy, setPregnancy] = useState(isPregnancyStatus(pregnancyStatus) ? pregnancyStatus : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const parsedDate = askAge
    ? (mode === 'date' ? parseFrenchDate(dateText) : approxBirthDateFromAge(years.trim() === '' ? Number.NaN : Number(years)))
    : null
  const effective = {
    sexe: askSexe ? sexe : patient?.sexe,
    date_naissance: askAge ? parsedDate : patient?.date_naissance,
  }
  const showPregnancy = askPregnancy && pregnancyRelevant(effective)

  const ageError = askAge && (mode === 'date' ? dateText.length === 10 && !parsedDate : years.trim() !== '' && !parsedDate)
  const complete = (!askAge || Boolean(parsedDate)) && (!askSexe || Boolean(sexe)) && (!showPregnancy || Boolean(pregnancy))

  const submit = async () => {
    if (!complete || busy) return
    setBusy(true); setError(null)
    try {
      const update = {}
      if (askAge) { update.date_naissance = parsedDate; update.date_naissance_approx = mode === 'age' }
      if (askSexe) update.sexe = sexe
      if (Object.keys(update).length) {
        await updatePatientAgeSexe(patientId, update)
        await queryClient.invalidateQueries({ queryKey: ['patient', patientId] })
      }
      if (showPregnancy) onPregnancy?.(pregnancy)
      onDone?.({ ...update, pregnancyStatus: showPregnancy ? pregnancy : undefined })
    } catch {
      setError('Enregistrement impossible. Réessayez.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`space-y-3 ${className}`} onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); submit() } }}>
      {askSexe && (
        <div>
          <Label>Sexe</Label>
          <div className="flex gap-1.5" role="radiogroup" aria-label="Sexe">
            {SEXES.map(([v, l]) => <Chip key={v} size="md" role="radio" selected={sexe === v} onClick={() => setSexe(v)}>{l}</Chip>)}
          </div>
        </div>
      )}

      {askAge && (
        <div>
          <div className="mb-1 flex items-center gap-1.5" role="tablist" aria-label="Saisie de l'âge">
            <Chip role="tab" selected={mode === 'date'} onClick={() => setMode('date')}>Date de naissance</Chip>
            <Chip role="tab" selected={mode === 'age'} onClick={() => setMode('age')}>Âge</Chip>
          </div>
          {mode === 'date' ? (
            <input value={dateText} onChange={(e) => setDateText(maskDate(e.target.value))} inputMode="numeric" placeholder="jj/mm/aaaa" aria-label="Date de naissance (jj/mm/aaaa)"
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] text-slate-800 outline-none focus:border-slate-900" autoFocus />
          ) : (
            <div className="flex items-center gap-2">
              <input value={years} onChange={(e) => setYears(e.target.value.replace(/\D/g, '').slice(0, 3))} inputMode="numeric" placeholder="ex. 42" aria-label="Âge en années"
                className="w-24 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] text-slate-800 outline-none focus:border-slate-900" autoFocus />
              <span className="text-[12.5px] text-slate-500">ans (date approximative)</span>
            </div>
          )}
          {ageError && <p className="mt-1 text-[11.5px] font-medium text-red-600">{mode === 'date' ? 'Date invalide (jj/mm/aaaa).' : 'Âge invalide.'}</p>}
        </div>
      )}

      {showPregnancy && (
        <div>
          <Label>Grossesse / allaitement</Label>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Grossesse ou allaitement">
            {PREGNANCY.map(([v, l]) => <Chip key={v} size="md" role="radio" selected={pregnancy === v} onClick={() => setPregnancy(v)}>{l}</Chip>)}
          </div>
        </div>
      )}

      {error && <p role="alert" className="text-[12px] font-medium text-red-600">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        {onCancel && <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>Annuler</Button>}
        <Button variant="primary" size="sm" onClick={submit} disabled={!complete || busy}>
          {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Enregistrement…</> : submitLabel}
        </Button>
      </div>
    </div>
  )
}
