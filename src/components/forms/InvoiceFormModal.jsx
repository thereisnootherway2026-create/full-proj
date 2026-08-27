import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import Modal from '../common/Modal'
import { useAppContext } from '../../context/AppContext'
import { useCabinetId } from '../../hooks/useCabinetId'
import { getPatients, createConsultation } from '../../lib/api'

function InvoiceFormModal({ open, onClose, onSuccess }) {
  const { notify, patients: contextPatients } = useAppContext()
  const { cabinetId } = useCabinetId()

  const { data: dbPatients = [] } = useQuery({
    queryKey: ['patients'],
    queryFn: getPatients,
    enabled: open,
  })

  const patients = (dbPatients && dbPatients.length > 0) ? dbPatients : (contextPatients || [])

  const [form, setForm] = useState({
    patient_id: '',
    montant: '',
    statut: 'paye',
    date_consult: new Date().toISOString().split('T')[0],
    notes: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (open) {
      setForm({
        patient_id: '',
        montant: '',
        statut: 'paye',
        date_consult: new Date().toISOString().split('T')[0],
        notes: '',
      })
      setError(null)
    }
  }, [open])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError(null)

    if (!form.patient_id) { setError('Sélectionnez un patient.'); return }
    if (!form.montant || isNaN(Number(form.montant)) || Number(form.montant) <= 0) {
      setError('Saisissez un montant valide.')
      return
    }

    if (!cabinetId) {
      setError('Session expirée — reconnectez-vous.')
      return
    }

    setLoading(true)
    try {
      await createConsultation({
        patient_id: form.patient_id,
        cabinet_id: cabinetId,
        montant: parseFloat(form.montant),
        statut: form.statut,
        date_consult: form.date_consult,
        notes: form.notes || null,
      })
      window.dispatchEvent(new CustomEvent('mm:payments-changed'))
      notify({ title: 'Succès', description: 'Consultation / facture enregistrée.' })
      onSuccess?.()
      onClose()
    } catch (err) {
      console.error('InvoiceForm submit error:', err)
      const errorMsg = typeof err === 'string' ? err : (err?.message || err?.details || err?.hint || "Erreur lors de l'enregistrement")
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nouvelle consultation" description="Enregistrez une consultation avec le montant et le statut de paiement.">
      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-base font-medium text-slate-700">Patient</span>
            <select
              value={form.patient_id}
              onChange={(e) => setForm((c) => ({ ...c, patient_id: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-300"
            >
              <option value="">— Sélectionner —</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-base font-medium text-slate-700">Date</span>
            <input
              type="date"
              value={form.date_consult}
              onChange={(e) => setForm((c) => ({ ...c, date_consult: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-300"
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-base font-medium text-slate-700">Montant (MAD)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.montant}
              onChange={(e) => setForm((c) => ({ ...c, montant: e.target.value }))}
              placeholder="250"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-300"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-base font-medium text-slate-700">Statut</span>
            <select
              value={form.statut}
              onChange={(e) => setForm((c) => ({ ...c, statut: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-300"
            >
              <option value="paye">Payé</option>
              <option value="credit">Crédit</option>
              <option value="annule">Annulé</option>
            </select>
          </label>
        </div>

        <label className="block">
          <span className="mb-2 block text-base font-medium text-slate-700">Notes</span>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))}
            rows={3}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-300"
          />
        </label>

        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            ⚠️ {error}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="interactive rounded-2xl border border-slate-200 bg-white px-5 py-3 text-base font-medium text-slate-700">Annuler</button>
          <button type="submit" disabled={loading} className="interactive inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-base font-medium text-white disabled:opacity-70">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Enregistrement...</> : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default InvoiceFormModal
