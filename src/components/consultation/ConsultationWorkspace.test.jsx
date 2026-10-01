import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import StageSection from './StageSection'
import PatientContextSidebar from './PatientContextSidebar'
import ConsultationRail from './ConsultationRail'

vi.mock('../../context/AppContext', () => ({
  useAppContext: () => ({
    canonicalRole: 'doctor',
    profile: {
      cabinet_id: 'cab_1',
      cabinets: {
        currency: 'MAD',
      },
    },
  }),
}))

const MOCK_PATIENT = {
  id: 'pat_1',
  nom: 'Benjelloun',
  prenom: 'Fatima',
  age: 42,
  sexe: 'F',
  allergies: 'Pénicilline',
  allergies_status: 'listed',
  antecedents: 'Hypertension artérielle',
  antecedents_status: 'listed',
  medications_status: 'none',
}

const MOCK_NOTE = {
  motif: 'Contrôle tensionnel',
  histoire: 'Patiente vue en consultation de routine',
  depuis: '1 mois',
  evolution: 'stable',
  vitals: {
    bloodPressureSystolic: '130',
    bloodPressureDiastolic: '80',
    heartRate: '72',
    temperature: '37,0',
    oxygenSaturation: '99',
    respiratoryRate: '16',
    weight: '68',
    height: '165',
  },
  examen: 'Examen cardio-vasculaire sans particularité',
  diagnostics: ['Hypertension artérielle essentielle'],
  conduite: 'Poursuite des mesures hygiéno-diététiques',
  traitements: [
    { medicament: 'Amlodipine 5 mg', posologie: '1 cp le matin', duree: '3 mois' },
  ],
  examens: ['Bilan rénal (créatininémie, ionogramme)'],
  documents: [],
  followUpDate: '2026-11-15',
}

const MOCK_ACTES = [
  { id: 'act_1', name: 'Consultation de médecine générale', montant: 25 },
]

describe('Consultation Workspace Redesign', () => {
  describe('StageSection component', () => {
    it('renders clean section container with keyboard shortcut hint in footer', () => {
      const html = renderToStaticMarkup(
        <StageSection
          id="subjectif"
          index={1}
          title="Motif & symptômes"
          isExpanded={true}
          status="en_cours"
          onValidateAndContinue={() => {}}
          validateButtonLabel="Valider et continuer →"
        >
          <p>Motif form content</p>
        </StageSection>
      )

      expect(html).toContain('id="subjectif"')
      expect(html).toContain('1 · Motif &amp; symptômes')
      expect(html).toContain('Ctrl')
      expect(html).toContain('Entrée')
      expect(html).toContain('Valider et continuer →')
    })
  })

  describe('PatientContextSidebar collapsible behavior', () => {
    it('renders full patient identity and safety info when not collapsed', () => {
      const html = renderToStaticMarkup(
        <PatientContextSidebar
          patient={MOCK_PATIENT}
          patientId="pat_1"
          age={42}
          meds={[]}
          encounters={[]}
          vitalsRows={[]}
          isCollapsed={false}
          onToggleCollapse={() => {}}
        />
      )

      expect(html).toContain('Fatima Benjelloun')
      expect(html).toContain('42 ans')
      expect(html).toContain('Femme')
      expect(html).toContain('Allergies')
      expect(html).toContain('Pénicilline')
      expect(html).toContain('Antécédents')
      expect(html).toContain('Hypertension artérielle')
      expect(html).toContain('Consultations précédentes')
      expect(html).toContain('Constantes snapshot')
    })

    it('renders compact micro-rail when collapsed', () => {
      const html = renderToStaticMarkup(
        <PatientContextSidebar
          patient={MOCK_PATIENT}
          patientId="pat_1"
          age={42}
          meds={[]}
          encounters={[]}
          vitalsRows={[]}
          isCollapsed={true}
          onToggleCollapse={() => {}}
        />
      )

      expect(html).toContain('aria-label="Contexte patient réduit"')
      expect(html).toContain('FB') // Fatima Benjelloun initials
      expect(html).toContain('Agrandir le contexte patient')
    })
  })

  describe('ConsultationRail collapsible behavior', () => {
    it('renders full rail with 4 groups when not collapsed', () => {
      const html = renderToStaticMarkup(
        <ConsultationRail
          note={MOCK_NOTE}
          patient={MOCK_PATIENT}
          acts={MOCK_ACTES}
          billingAmount={25}
          isCollapsed={false}
          onToggleCollapse={() => {}}
          onFinalize={() => {}}
        />
      )

      expect(html).toContain('Ordonnance')
      expect(html).toContain('Examens')
      expect(html).toContain('Documents')
      expect(html).toContain('Actes &amp; caisse')
      expect(html).toContain('Actions cliniques')
      expect(html).toContain('Finaliser la visite')
    })

    it('renders compact micro-rail when collapsed', () => {
      const html = renderToStaticMarkup(
        <ConsultationRail
          note={MOCK_NOTE}
          patient={MOCK_PATIENT}
          acts={MOCK_ACTES}
          billingAmount={25}
          isCollapsed={true}
          onToggleCollapse={() => {}}
          onFinalize={() => {}}
        />
      )

      expect(html).toContain('aria-label="Actions rapides réduites"')
      expect(html).toContain('Agrandir les actions rapides')
      expect(html).toContain('Ordonnance (1)')
    })
  })
})
