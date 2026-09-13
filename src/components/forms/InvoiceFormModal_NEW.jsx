import { useEffect, useState } from 'react'
import { Loader2, FileText } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import Modal from '../common/Modal'
import { useAppContext } from '../../context/AppContext'
import { useCabinetId } from '../../hooks/useCabinetId'
import { getPatients, createConsultation } from '../../lib/api'
import { supabase } from '../../lib/supabase'

function InvoiceFormModal_NEW({ open, onClose, onSuccess }) {
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
    visit_id: '', // Empty means "Paiement libre / hors RDV"
    montant: '',
    statut: 'paye', // Removed 'annule'
    date_consult: new Date().toISOString().split('T')[0],
    notes: '',
    mode_paiement: 'cash',
    // Cheque specific fields
    cheque_num: '',
    cheque_banque: '',
    cheque_emetteur: '',
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Fetch unpaid visits/rdvs for the selected patient
  const { data: unpaidVisits = [], isFetching: fetchingVisits } = useQuery({
    queryKey: ['unpaid_visits', form.patient_id, cabinetId],
    queryFn: async () => {
      if (!form.patient_id || !cabinetId) return []
      // Query visits/rdvs where payment_status is not 'PAID'
      const { data, error } = await supabase
        .from('rdv')
        .select('*')
        .eq('cabinet_id', cabinetId)
        .eq('patient_id', form.patient_id)
        .neq('status', 'annule')
        .neq('status', 'cancelled')
        .neq('status', 'absent')
        .neq('status', 'no_show')
        .order('start_time', { ascending: false })
        .limit(20)
      
      if (error) throw error
      
      return data.filter(v => v.payment_status !== 'PAID' && v.payment_status !== 'paid')
    },
    enabled: !!form.patient_id && !!cabinetId && open,
  })

  useEffect(() => {
    if (open) {
      setForm({
        patient_id: '',
        visit_id: '',
        montant: '',
        statut: 'paye',
        date_consult: new Date().toISOString().split('T')[0],
        notes: '',
        mode_paiement: 'cash',
        cheque_num: '',
        cheque_banque: '',
        cheque_emetteur: '',
      })
      setError(null)
    }
  }, [open])

  // Handle visit selection
  const handleVisitChange = (e) => {
    const selectedVisitId = e.target.value
    setForm(prev => {
      const next = { ...prev, visit_id: selectedVisitId }
      if (selectedVisitId) {
        // Automatic amount suggestion would require querying/joining the consultations table's billing_amount for that visit_id (future follow-up).
        // For now, we leave montant blank for the user to fill in manually.
      }
      return next
    })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError(null)

    if (!form.patient_id) { setError('Sélectionnez un patient.'); return }
    if (!form.montant || isNaN(Number(form.montant)) || Number(form.montant) <= 0) {
      setError('Saisissez un montant valide.')
      return
    }
    if (form.mode_paiement === 'cheque' && !form.cheque_num) {
      setError('Le numéro de chèque est requis.')
      return
    }

    if (!cabinetId) {
      setError('Session expirée — reconnectez-vous.')
      return
    }

    setLoading(true)
    try {
      let finalNotes = form.notes || ''
      if (form.mode_paiement === 'cheque') {
        const chequeInfo = `N° Chèque: ${form.cheque_num || 'N/A'} Banque: ${form.cheque_banque || ''} Émetteur: ${form.cheque_emetteur || ''}`.trim()
        finalNotes = finalNotes ? `${finalNotes}\n${chequeInfo}` : chequeInfo
      }

      await createConsultation({
        patient_id: form.patient_id,
        cabinet_id: cabinetId,
        visit_id: form.visit_id || null, // null if standalone
        montant: parseFloat(form.montant),
        statut: form.statut,
        date_consult: form.date_consult,
        notes: finalNotes || null,
        mode_paiement: form.mode_paiement,
      })
      window.dispatchEvent(new CustomEvent('mm:payments-changed'))
      notify({ title: 'Succès', description: 'Consultation / facture enregistrée.' })
      onSuccess?.()
      onClose()
    } catch (err) {
      console.error('InvoiceForm submit error - full object:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2))
      console.error('InvoiceForm submit error - raw:', err)
      const errorMsg = typeof err === 'string' ? err : (err?.message || err?.details || err?.hint || err?.code || JSON.stringify(err) || "Erreur lors de l'enregistrement")
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nouvelle facture" description="Créez une facture liée à un RDV ou un paiement libre." noScroll>
      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-base font-medium text-slate-700">Patient</span>
            <select
              value={form.patient_id}
              onChange={(e) => setForm((c) => ({ ...c, patient_id: e.target.value, visit_id: '' }))}
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

        {/* Lier à un RDV (only show if patient is selected) */}
        {form.patient_id && (
          <label className="block">
            <span className="mb-2 flex items-center justify-between text-base font-medium text-slate-700">
              <span>Lier à un RDV existant</span>
              {fetchingVisits && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
            </span>
            <select
              value={form.visit_id}
              onChange={handleVisitChange}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-300"
            >
              <option value="">Paiement libre / hors RDV</option>
              {unpaidVisits.map((v) => {
                const dateLabel = new Date(v.start_time || v.created_at).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })
                return (
                  <option key={v.id} value={v.id}>
                    {dateLabel} — {v.status}
                  </option>
                )
              })}
            </select>
          </label>
        )}

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
            </select>
          </label>
        </div>

        {/* Mode de Paiement */}
        <label className="block">
          <span className="mb-2 block text-base font-medium text-slate-700">Mode de paiement</span>
          <select
            value={form.mode_paiement}
            onChange={(e) => setForm((c) => ({ ...c, mode_paiement: e.target.value }))}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-300"
          >
            <option value="cash">💶 Espèces</option>
            <option value="card">💳 TPE / Carte bancaire</option>
            <option value="cheque">📝 Chèque</option>
          </select>
        </label>

        {/* Chèque Sub-form conditionally rendered */}
        {form.mode_paiement === 'cheque' && (
          <div className="bg-amber-50/70 p-3.5 rounded-2xl border border-amber-200/80 space-y-3 mt-1">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
              <FileText size={14} />
              Informations Chèque
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-amber-800 mb-1">N° de Chèque</label>
                <input
                  type="text"
                  value={form.cheque_num}
                  onChange={(e) => setForm((c) => ({ ...c, cheque_num: e.target.value }))}
                  placeholder="ex: CHQ-402910"
                  className="w-full h-10 px-3 rounded-xl border border-amber-300 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-amber-800 mb-1">Banque du Chèque</label>
                <input
                  type="text"
                  value={form.cheque_banque}
                  onChange={(e) => setForm((c) => ({ ...c, cheque_banque: e.target.value }))}
                  placeholder="ex: BMCE"
                  className="w-full h-10 px-3 rounded-xl border border-amber-300 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-amber-800 mb-1">Nom du Tireur</label>
                <input
                  type="text"
                  value={form.cheque_emetteur}
                  onChange={(e) => setForm((c) => ({ ...c, cheque_emetteur: e.target.value }))}
                  placeholder="Nom sur chèque"
                  className="w-full h-10 px-3 rounded-xl border border-amber-300 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
            </div>
          </div>
        )}

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
            ⚠ {error}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="h-[36px] px-5 rounded-[8px] font-semibold text-[13px] disabled:opacity-50"
            style={{
              backgroundColor: '#f8fafc',
              color: '#475569',
              border: '1.5px solid #e2e8f0',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.backgroundColor = '#f1f5f9'
                e.currentTarget.style.borderColor = '#cbd5e1'
                e.currentTarget.style.boxShadow = '0 6px 16px -4px rgba(148,163,184,0.18)'
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.backgroundColor = '#f8fafc'
                e.currentTarget.style.borderColor = '#e2e8f0'
                e.currentTarget.style.boxShadow = 'none'
              }
            }}
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={loading}
            className="h-[36px] px-5 rounded-[8px] font-semibold text-[13px] text-white flex items-center gap-2 disabled:opacity-70"
            style={{
              backgroundColor: '#2563eb',
              border: '1.5px solid #3b82f6',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.backgroundColor = '#1d4ed8'
                e.currentTarget.style.borderColor = '#2563eb'
                e.currentTarget.style.boxShadow = '0 6px 16px -4px rgba(37,99,235,0.4)'
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.backgroundColor = '#2563eb'
                e.currentTarget.style.borderColor = '#3b82f6'
                e.currentTarget.style.boxShadow = 'none'
              }
            }}
            onMouseDown={(e) => {
              if (!loading) e.currentTarget.style.transform = 'translateY(1px)'
            }}
            onMouseUp={(e) => {
              if (!loading) e.currentTarget.style.transform = 'translateY(-2px)'
            }}
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Enregistrement...
              </>
            ) : (
              'Enregistrer'
            )}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default InvoiceFormModal_NEW
