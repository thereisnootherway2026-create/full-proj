import React, { useState } from 'react'
import {
  MessageSquare,
  Calendar,
  CheckCircle2,
  Clock,
  User,
  Phone,
  AlertCircle,
  ExternalLink,
  Loader2,
  X,
  Send,
  CalendarCheck,
  Stethoscope,
  XCircle
} from 'lucide-react'
import Modal from '../common/Modal'
import { useAppContext } from '../../context/AppContext'
import { supabase } from '../../lib/supabase'
import axios from 'axios'
import type { WhatsAppInboxItem } from '../../types'

interface WhatsAppInboxModalProps {
  open: boolean
  onClose: () => void
  items: WhatsAppInboxItem[]
  loading: boolean
  onResolve: (id: string) => Promise<boolean>
  onRefetch: () => void
}

export default function WhatsAppInboxModal({
  open,
  onClose,
  items,
  loading,
  onResolve,
  onRefetch,
}: WhatsAppInboxModalProps) {
  const { cabinetId, doctors, notify } = useAppContext()

  // Booking confirmation modal sub-state
  const [selectedBooking, setSelectedBooking] = useState<WhatsAppInboxItem | null>(null)
  const [patientName, setPatientName] = useState('')
  const [patientPhone, setPatientPhone] = useState('')
  const [patientMotif, setPatientMotif] = useState('Consultation')
  const [bookingDate, setBookingDate] = useState(() => new Date().toISOString().split('T')[0])
  const [bookingTime, setBookingTime] = useState('10:00')
  const [selectedDoctorId, setSelectedDoctorId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Open booking confirmation dialog & Pre-fill using AI-parsed date/time
  const handleOpenBookingModal = (item: WhatsAppInboxItem) => {
    setSelectedBooking(item)
    const incomingName = (item.patient_name || '').trim()
    setPatientName(/^(patient\s*)?(whats\s?app|wtsp|inconnu)$/i.test(incomingName) ? '' : incomingName)
    const rawPhone = String(item.patient_phone || '').replace(/\D/g, '')
    const phoneDigits = rawPhone.startsWith('212') && rawPhone.length === 12 ? rawPhone.slice(3) : rawPhone.startsWith('0') && rawPhone.length === 10 ? rawPhone.slice(1) : rawPhone.length > 12 ? rawPhone.slice(-9) : rawPhone
    setPatientPhone(/^[567]\d{8}$/.test(phoneDigits) ? `0${phoneDigits}` : '')
    setPatientMotif(item.patient_motif || item.extracted_details?.patientMotif || 'Consultation')

    // Pre-fill Date and Time using AI-parsed details or fallback to current
    const details = item.extracted_details
    let initialDate = new Date().toISOString().split('T')[0]
    let initialTime = '10:00'

    if (details?.parsedDate && /^\d{4}-\d{2}-\d{2}$/.test(details.parsedDate)) {
      initialDate = details.parsedDate
    }
    if (details?.parsedTime && /^\d{2}:\d{2}$/.test(details.parsedTime)) {
      initialTime = details.parsedTime
    }

    // Keep fields fully editable
    setBookingDate(initialDate)
    setBookingTime(initialTime)

    if (doctors && doctors.length > 0) {
      setSelectedDoctorId(doctors[0].id)
    }
  }

  // Reject booking request with CNDP auto-purge
  const handleRejectBooking = async (item: WhatsAppInboxItem) => {
    try {
      const purgeNotice = '[Message purgé pour confidentialité CNDP]'

      // Update local backend API
      try {
        await axios.patch(`http://localhost:3001/api/whatsapp/inbox/${item.id}`, {
          status: 'rejected'
        })
      } catch (_) {}

      // Update Supabase
      try {
        await supabase
          .from('whatsapp_inbox')
          .update({
            status: 'rejected',
            resolved_at: new Date().toISOString(),
            raw_message: purgeNotice
          })
          .eq('id', item.id)
      } catch (_) {}

      notify({
        title: 'Demande rejetée',
        description: 'La demande a été rejetée et les données du message ont été purgées (CNDP).',
        tone: 'neutral'
      })
      onRefetch()
    } catch (err: any) {
      console.error('❌ Erreur rejet demande:', err)
    }
  }

  // 1-Click Booking Confirmation Workflow
  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedBooking) return
    setIsSubmitting(true)

    try {
      const localPhone = patientPhone.replace(/\D/g, '')
      const phoneNational = localPhone.startsWith('0') ? localPhone.slice(1) : localPhone
      if (!/^[567]\d{8}$/.test(phoneNational)) throw new Error('Veuillez vérifier le numéro WhatsApp marocain avant de confirmer.')
      const cleanPhone = `212${phoneNational}`
      const patientFullName = patientName.trim()
      if (!patientFullName) throw new Error('Veuillez saisir le nom et le prénom du patient avant de confirmer.')

      // 1. Check or create Patient
      let patientId: string | null = null

      const { data: existingPatients, error: pSearchErr } = await supabase
        .from('patients')
        .select('id, nom, prenom')
        .or(`telephone.ilike.%${cleanPhone.slice(-9)}%`)
        .limit(1)

      if (pSearchErr) console.warn('Search patient error:', pSearchErr.message)

      if (existingPatients && existingPatients.length > 0) {
        patientId = existingPatients[0].id
        if (/whats\s?app|wtsp|^patient$/i.test(`${existingPatients[0].prenom || ''} ${existingPatients[0].nom || ''}`)) {
          const names = patientFullName.split(/\s+/)
          const { error: patientUpdateErr } = await supabase.from('patients').update({
            prenom: names[0], nom: names.slice(1).join(' ') || names[0], telephone: `0${phoneNational}`
          }).eq('id', patientId)
          if (patientUpdateErr) throw new Error(`Impossible de corriger le dossier patient : ${patientUpdateErr.message}`)
        }
      } else {
        // Create quick patient entry using name from WhatsApp conversation
        const names = patientFullName.trim().split(/\s+/)
        const prenom = names[0] || 'Patient'
        // Use actual last name if provided, otherwise repeat first name (never use 'WhatsApp')
        const nom = names.length > 1 ? names.slice(1).join(' ') : prenom

        const formattedPhone = `0${phoneNational}`

        const { data: newPatient, error: pCreateErr } = await supabase
          .from('patients')
          .insert([{
            cabinet_id: cabinetId,
            prenom,
            nom,
            telephone: formattedPhone,
          }])
          .select('id')
          .single()

        if (pCreateErr) throw new Error(`Impossible d’ajouter le patient : ${pCreateErr.message}`)
        patientId = newPatient?.id || null
      }
      if (!patientId) throw new Error('Le patient n’a pas pu être créé dans l’onglet Patients.')

      // 2. Insert official appointment into main 'rdv' table
      const appointmentDateTime = `${bookingDate}T${bookingTime}:00`
      const motifNotice = patientMotif.trim() || 'Consultation'
      const notes = `__AGENDA_META__${JSON.stringify({
        confirmationState: 'CONFIRME', confirmedAt: new Date().toISOString(), confirmedBy: 'le secrétariat',
        clinicalContext: motifNotice, patientName: patientFullName, phone: `0${phoneNational}`, type: 'Consultation', source: 'whatsapp_inbox'
      })}`
      const { data: newRdv, error: rdvErr } = await supabase
        .from('rdv')
        .insert([{
          cabinet_id: cabinetId,
          patient_id: patientId,
          date_rdv: new Date(appointmentDateTime).toISOString(),
          status: 'confirme',
          rappel_envoye: false,
          notes
        }])
        .select()
        .single()

      if (rdvErr) throw rdvErr

      // 4. Send final WhatsApp confirmation message to patient via local bot
      let whatsappSent = false
      try {
        // patient_phone is stored as raw digits (e.g. '212548484777' or '0548484777')
        // The bot endpoint handles JID conversion internally
        const confirmPayload = {
          patientName: patientFullName,
          phoneNumber: cleanPhone,
          appointmentDate: bookingDate,
          time: bookingTime
        }
        console.log('📤 [Inbox Confirmation] Envoi confirmation WhatsApp:', JSON.stringify(confirmPayload))
        
        const waResponse = await axios.post('http://localhost:3001/api/whatsapp/send-confirmation', confirmPayload, { timeout: 15000 })
        console.log('✅ [Inbox Confirmation] Réponse:', waResponse.data)
        whatsappSent = waResponse.data?.success === true && waResponse.data?.messageSent !== false
      } catch (waErr: any) {
        console.error('⚠️ [Inbox Confirmation] Envoi WhatsApp échoué:', waErr?.response?.data || waErr.message)
        // The appointment is saved; the final notice below clearly reports delivery failure.
      }

      // Mark resolved after the appointment and patient are safely stored. The raw message is purged.
      const purgeNotice = '[Message purgé pour confidentialité CNDP]'
      await axios.patch(`http://localhost:3001/api/whatsapp/inbox/${selectedBooking.id}`, { status: 'confirmed' }).catch(() => {})
      await supabase.from('whatsapp_inbox').update({ status: 'confirmed', resolved_at: new Date().toISOString(), raw_message: purgeNotice }).eq('id', selectedBooking.id)

      notify({
        title: 'Rendez-vous confirmé',
        description: `Le rendez-vous pour ${patientFullName} a été planifié le ${bookingDate} à ${bookingTime}.${whatsappSent ? ' Confirmation WhatsApp envoyée.' : ' Le message WhatsApp reste à envoyer.'}`,
        tone: whatsappSent ? 'success' : 'neutral'
      })

      setSelectedBooking(null)
      onRefetch()
    } catch (err: any) {
      console.error('❌ Erreur confirmation RDV:', err)
      notify({
        title: 'Erreur',
        description: err?.message || 'Impossible de créer le rendez-vous.',
        tone: 'danger'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      {/* Main Inbox Drawer / Modal */}
      <Modal
        open={open}
        onClose={onClose}
        title="Boîte de Réception WhatsApp"
        description="Demandes de rendez-vous et messages reçus en direct par le bot"
        width="max-w-2xl"
      >
        <div className="p-4 flex flex-col gap-3 min-h-[350px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Loader2 className="h-7 w-7 animate-spin text-blue-500 mb-2" />
              <p className="text-xs font-medium">Chargement des messages en attente...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-12 w-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-slate-800">Aucune demande en attente</p>
              <p className="text-xs text-slate-400 max-w-sm mt-1">
                Tous les messages WhatsApp et demandes de réservation ont été traités par le secrétariat.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3 overflow-y-auto max-h-[500px] pr-1">
              {items.map((item) => {
                const isBooking = item.request_type === 'booking'
                const isReclamation = item.request_type === 'reclamation'
                const motif = item.patient_motif || item.extracted_details?.patientMotif
                const dateFormatted = new Date(item.created_at).toLocaleTimeString('fr-FR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  day: '2-digit',
                  month: '2-digit'
                })

                return (
                  <div
                    key={item.id}
                    className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 shadow-sm transition-all flex flex-col gap-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`h-9 w-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${
                            isBooking
                              ? 'bg-blue-50 text-blue-600'
                              : isReclamation
                              ? 'bg-rose-50 text-rose-600'
                              : 'bg-emerald-50 text-emerald-600'
                          }`}
                        >
                          {isBooking ? <Calendar className="h-4 w-4" /> : isReclamation ? <AlertCircle className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-900">
                              {item.patient_name || 'Patient'}
                            </span>
                            <span
                              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                                isBooking
                                  ? 'bg-blue-100 text-blue-800'
                                  : isReclamation
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {isBooking ? 'Demande RDV' : isReclamation ? 'Réclamation' : 'Message'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                            <Phone className="h-3 w-3" />
                            {item.patient_phone} • <Clock className="h-3 w-3 ml-1" /> {dateFormatted}
                          </p>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5">
                        {isBooking ? (
                          <button
                            type="button"
                            onClick={() => handleOpenBookingModal(item)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all active:scale-95"
                          >
                            <CalendarCheck className="h-3.5 w-3.5" />
                            Confirmer le RDV
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => handleRejectBooking(item)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 text-slate-600 text-xs font-semibold transition-all active:scale-95"
                          title="Rejeter et purger"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Rejeter
                        </button>

                        <button
                          type="button"
                          onClick={() => onResolve(item.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-all active:scale-95"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 text-slate-500" />
                          Marquer lu
                        </button>
                      </div>
                    </div>

                    {/* Medical reason badge if available */}
                    {motif && (
                      <div className="flex items-center gap-1.5 text-xs text-blue-800 bg-blue-50/80 border border-blue-200/70 rounded-md px-2.5 py-1 w-fit">
                        <Stethoscope className="h-3.5 w-3.5 text-blue-600" />
                        <span className="font-bold text-[10px] uppercase tracking-wide">Motif :</span>
                        <span className="font-medium">{motif}</span>
                      </div>
                    )}

                    {/* Raw message balloon */}
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs text-slate-700 leading-relaxed font-mono">
                      "{item.raw_message}"
                    </div>

                    {item.extracted_details?.extractedSlot && (
                      <div className="text-[11px] font-medium text-amber-800 bg-amber-50/80 border border-amber-200/70 px-2.5 py-1 rounded inline-block">
                        🕒 Créneau souhaité : {item.extracted_details.extractedSlot}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Modal>

      {/* Submodal: 1-Click Booking Confirmation Form with Flexible Editing */}
      {selectedBooking && (
        <Modal
          open={Boolean(selectedBooking)}
          onClose={() => setSelectedBooking(null)}
          title="Planifier et Confirmer le Rendez-vous"
          description={`Patient : ${selectedBooking.patient_name || 'Patient'} (${selectedBooking.patient_phone})`}
          width="max-w-md"
        >
          <form onSubmit={handleConfirmBooking} className="p-5 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-bold text-slate-700">Nom et prénom
                <input required value={patientName} onChange={(e) => setPatientName(e.target.value)} className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-xs font-medium" placeholder="Nom du patient" />
              </label>
              <label className="block text-xs font-bold text-slate-700">Téléphone WhatsApp
                <input required type="tel" value={patientPhone} onChange={(e) => setPatientPhone(e.target.value)} className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-xs font-medium" placeholder="06XXXXXXXX" />
              </label>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700">Motif (modifiable)
                <input value={patientMotif} onChange={(e) => setPatientMotif(e.target.value)} className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-xs font-medium" placeholder="Consultation" />
              </label>
            </div>
            <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-lg text-xs flex flex-col gap-1">
              <div className="flex items-center gap-1 text-blue-700 font-bold text-[10px] uppercase tracking-wider">
                <Stethoscope className="h-3.5 w-3.5" />
                <span>Motif de la visite (Extrait du patient)</span>
              </div>
              <span className="text-slate-900 font-semibold text-sm">
                {patientMotif || 'Consultation / Non précisé'}
              </span>
            </div>

            {selectedBooking.extracted_details?.extractedSlot && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                <strong>Souhait du patient :</strong> {selectedBooking.extracted_details.extractedSlot}
              </div>
            )}

            {/* Fully Editable Date and Time Fields */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Date du rendez-vous <span className="text-slate-400 font-normal">(modifiable)</span>
                </label>
                <input
                  type="date"
                  required
                  value={bookingDate}
                  onChange={(e) => setBookingDate(e.target.value)}
                  className="w-full h-9 rounded-lg border border-slate-300 px-3 text-xs text-slate-800 outline-none focus:border-blue-500 font-medium bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Heure <span className="text-slate-400 font-normal">(modifiable)</span>
                </label>
                <input
                  type="time"
                  required
                  value={bookingTime}
                  onChange={(e) => setBookingTime(e.target.value)}
                  className="w-full h-9 rounded-lg border border-slate-300 px-3 text-xs text-slate-800 outline-none focus:border-blue-500 font-medium bg-white"
                />
              </div>
            </div>

            {doctors && doctors.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Médecin</label>
                <select
                  value={selectedDoctorId}
                  onChange={(e) => setSelectedDoctorId(e.target.value)}
                  className="w-full h-9 rounded-lg border border-slate-300 px-3 text-xs text-slate-800 outline-none focus:border-blue-500"
                >
                  {doctors.map((doc: any) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.nom_complet || doc.name || 'Médecin'}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
              <span>
                En cliquant sur "Confirmer", le RDV sera ajouté à l'agenda, les données seront purgées selon la CNDP, et un WhatsApp de confirmation sera envoyé.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Enregistrement...
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    Enregistrer et envoyer confirmation
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
