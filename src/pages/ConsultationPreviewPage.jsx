import React, { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ConsultationSheet from '../components/consultation/ConsultationSheet'

const MOCK_PATIENT = {
  id: 'pat_test_1',
  nom: 'Benali',
  prenom: 'Karim',
  sexe: 'M',
  date_naissance: '1985-04-12',
  allergies: 'Pénicilline',
  antecedents: 'HTA, Asthme',
  traitement_actuel: 'Amlodipine 5mg',
}

const FILLED_NOTE = {
  motif: 'Douleur lombaire aiguë',
  depuis: '5 jours',
  evolution: 'en aggravation',
  histoire: 'Patient se plaint d\'une douleur lombaire mécanique apparue suite à un effort de soulèvement.',
  vitals: {
    bloodPressureSystolic: '130',
    bloodPressureDiastolic: '80',
    heartRate: '72',
    temperature: '37.2',
    oxygenSaturation: '98',
    respiratoryRate: '16',
    weight: '75',
    height: '178',
    painScore: '6',
  },
  examen: 'Rachis lombaire : contracture des muscles paravertébraux. Signe de Lasègue négatif bilatéral.',
  diagnostics: ['Lombalgie commune aiguë'],
  conduite: 'Repos relatif, antalgiques palier I, éviter port de charges lourdes.',
  traitements: [
    {
      medicament: 'Paracétamol',
      dosage: '1000 mg',
      posologie: '1 cp × 3/j',
      duree: '5 jours',
      overrideAllergy: false,
    },
    {
      medicament: 'Ibuprofène',
      dosage: '400 mg',
      posologie: '1 cp × 2/j',
      duree: '3 jours',
      overrideAllergy: false,
    },
  ],
  examens: ['NFS', 'Radiographie rachis lombaire'],
  documents: ['Certificat médical'],
  documentDrafts: {
    'Certificat médical': {
      kind: 'etat',
      body: 'Certifie que l\'état de santé de M. Karim Benali nécessite un repos.',
      generatedAt: '01/10',
    },
  },
  followUpDate: '2026-10-15',
  followUpNotes: 'Revoir si absence d\'amélioration à J7.',
  ordonnance: {
    generated_at: '2026-10-01T10:00:00.000Z',
    lines: [
      { medicament: 'Paracétamol', dosage: '1000 mg', posologie: '1 cp × 3/j', duree: '5 jours' },
      { medicament: 'Ibuprofène', dosage: '400 mg', posologie: '1 cp × 2/j', duree: '3 jours' },
    ],
  },
}

const EMPTY_NOTE = {
  motif: 'Douleur lombaire aiguë',
  depuis: '5 jours',
  evolution: 'en aggravation',
  histoire: 'Patient se plaint d\'une douleur lombaire mécanique apparue suite à un effort de soulèvement.',
  vitals: {
    bloodPressureSystolic: '130',
    bloodPressureDiastolic: '80',
    heartRate: '72',
    temperature: '37.2',
  },
  examen: 'Contracture musculaire paravertébrale.',
  diagnostics: ['Lombalgie commune aiguë'],
  conduite: 'Repos relatif.',
  traitements: [],
  examens: [],
  documents: [],
  documentDrafts: {},
  followUpDate: '',
  followUpNotes: '',
  ordonnance: null,
}

const FILLED_ACTES = [
  { id: 'act_1', name: 'Consultation de médecine générale', montant: 25 },
  { id: 'act_2', name: 'Électrocardiogramme (ECG)', montant: 61 },
]

export default function ConsultationPreviewPage() {
  const [searchParams] = useSearchParams()
  const sectionParam = parseInt(searchParams.get('section') || '1', 10)
  const railGroupParam = searchParams.get('railGroup') || 'ordonnance'
  const isEmpty = searchParams.get('state') === 'empty'
  const isEditing = searchParams.get('editing') === 'true'
  const isDocExpanded = searchParams.get('docExpanded') === 'true'
  const isLeftCollapsed = searchParams.get('leftCollapsed') === 'true'
  const isRightCollapsed = searchParams.get('rightCollapsed') === 'true'

  const [note, setNote] = useState(isEmpty ? EMPTY_NOTE : FILLED_NOTE)
  const [acts, setActs] = useState(isEmpty ? [] : FILLED_ACTES)

  const mockDraft = {
    status: 'saved',
    savedAt: new Date(),
    isDirty: false,
    ready: true,
    existingDraft: { time: '21:47' },
    complete: async () => ({ encounter: { id: 'enc_mock_1' } }),
    discard: async () => {},
    flush: async () => {},
    startFresh: () => {},
    clearExistingDraft: () => {},
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <ConsultationSheet
        open={true}
        onClose={() => {}}
        patient={MOCK_PATIENT}
        age={39}
        patientId="pat_test_1"
        note={note}
        setNote={setNote}
        draft={mockDraft}
        acts={acts}
        billingAmount={acts.reduce((s, a) => s + (Number(a.montant) || 0), 0)}
        visitLinked={true}
        onAddActe={(newActe) => setActs((prev) => [...prev, newActe])}
        onCompleted={() => {}}
        onDiscarded={() => {}}
        patientConsultations={[]}
        initialSection={sectionParam}
        initialOpenGroup={railGroupParam}
        initialEditingIdx={isEditing ? 0 : null}
        initialActiveDoc={isDocExpanded ? 'Certificat médical' : null}
        initialLeftCollapsed={isLeftCollapsed}
        initialRightCollapsed={isRightCollapsed}
      />
    </div>
  )
}
