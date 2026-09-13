import { PRIORITY, ACTION_TARGET } from './ChecklistTypes.js'

/**
 * CHECKLIST_RULES — array of rule definitions.
 * Each rule: { id, test(patientContext), generate(patientContext) }
 * Rules are evaluated in order; add new rules here without touching UI.
 */
export const CHECKLIST_RULES = [
  // ── CRITICAL: Allergy alerts (non-dismissible, no checkbox) ────────────────
  {
    id: 'allergy_penicillin',
    test: (ctx) =>
      ctx.allergies?.some(
        (a) =>
          a.detail?.toLowerCase().includes('pénicilline') ||
          a.detail?.toLowerCase().includes('penicilline') ||
          a.label?.toLowerCase().includes('pénicilline') ||
          a.label?.toLowerCase().includes('penicilline')
      ),
    generate: (ctx) => {
      const found = ctx.allergies?.find(
        (a) =>
          a.detail?.toLowerCase().includes('pénicilline') ||
          a.detail?.toLowerCase().includes('penicilline') ||
          a.label?.toLowerCase().includes('pénicilline') ||
          a.label?.toLowerCase().includes('penicilline')
      )
      return {
        id: 'allergy_penicillin',
        priority: PRIORITY.CRITICAL,
        title: 'Allergie critique — Pénicilline',
        description:
          (found?.detail || 'Réaction sévère documentée.') +
          ' Ne jamais prescrire pénicillines ni bêtalactamines.',
        actionLabel: null,
        actionTarget: null,
        isAllergy: true,
        autoCompleteWhen: () => false,
      }
    },
  },

  // Generic allergy rule for other documented allergies
  {
    id: 'allergy_other',
    test: (ctx) =>
      ctx.allergies?.some(
        (a) =>
          !a.detail?.toLowerCase().includes('pénicilline') &&
          !a.detail?.toLowerCase().includes('penicilline') &&
          !a.label?.toLowerCase().includes('pénicilline') &&
          !a.label?.toLowerCase().includes('penicilline')
      ),
    generate: (ctx) => {
      const others = ctx.allergies?.filter(
        (a) =>
          !a.detail?.toLowerCase().includes('pénicilline') &&
          !a.detail?.toLowerCase().includes('penicilline')
      )
      const first = others?.[0]
      return {
        id: 'allergy_other',
        priority: PRIORITY.CRITICAL,
        title: first?.label || 'Allergie médicamenteuse documentée',
        description: first?.detail || 'Vérifier les contre-indications avant toute prescription.',
        actionLabel: null,
        actionTarget: null,
        isAllergy: true,
        autoCompleteWhen: () => false,
      }
    },
  },

  // ── IMPORTANT: HTA — Blood pressure not checked in >2 months ──────────────
  {
    id: 'hta_bp_check',
    test: (ctx) => ctx.hasHypertension && (ctx.lastBPMonthsAgo ?? 0) > 2,
    generate: (ctx) => ({
      id: 'hta_bp_check',
      priority: PRIORITY.IMPORTANT,
      title: 'Contrôler la tension artérielle',
      description: `Dernière mesure : ${ctx.lastBPValue || '—'} · il y a ${
        ctx.lastBPMonthsAgo
      } mois. Cible TA < 130/80 mmHg.`,
      actionLabel: 'Constantes',
      actionTarget: ACTION_TARGET.VITALS,
      isAllergy: false,
      autoCompleteWhen: (formData) => Boolean(formData?.bloodPressure),
    }),
  },

  // ── IMPORTANT: Diabète — HbA1c not done in >6 months ───────────────────────
  {
    id: 'hba1c_prescription',
    test: (ctx) => ctx.hasDiabetes && (ctx.lastHbA1cMonthsAgo ?? 0) > 6,
    generate: (ctx) => ({
      id: 'hba1c_prescription',
      priority: PRIORITY.IMPORTANT,
      title: 'Prescrire HbA1c',
      description: `Dernier contrôle : ${ctx.lastHbA1cValue || '—'} · il y a ${
        ctx.lastHbA1cMonthsAgo
      } mois. Contrôle recommandé tous les 6 mois.`,
      actionLabel: 'Voir analyses',
      actionTarget: ACTION_TARGET.LAB,
      isAllergy: false,
      autoCompleteWhen: () => false,
    }),
  },

  // ── IMPORTANT: Ramipril — creatinine annual monitoring ──────────────────────
  {
    id: 'ramipril_creatinine',
    test: (ctx) =>
      ctx.hasMedication?.('Ramipril') && (ctx.lastCreatinineMonthsAgo ?? 0) > 6,
    generate: (ctx) => ({
      id: 'ramipril_creatinine',
      priority: PRIORITY.IMPORTANT,
      title: 'Contrôler créatinine',
      description: `Sous Ramipril (IEC) — dernière valeur : ${
        ctx.lastCreatinineValue || '—'
      } · il y a ${ctx.lastCreatinineMonthsAgo} mois. Contrôle annuel recommandé.`,
      actionLabel: 'Voir analyses',
      actionTarget: ACTION_TARGET.LAB,
      isAllergy: false,
      autoCompleteWhen: () => false,
    }),
  },

  // ── IMPORTANT: Metformine — renal function check ─────────────────────────────
  {
    id: 'metformine_renal',
    test: (ctx) =>
      ctx.hasMedication?.('Metformine') &&
      !ctx.hasMedication?.('Ramipril') && // avoid duplicate with ramipril_creatinine
      (ctx.lastCreatinineMonthsAgo ?? 0) > 6,
    generate: (ctx) => ({
      id: 'metformine_renal',
      priority: PRIORITY.IMPORTANT,
      title: 'Vérifier fonction rénale',
      description: `Metformine contre-indiquée si DFG < 30 mL/min. Dernière créatinine : il y a ${
        ctx.lastCreatinineMonthsAgo
      } mois.`,
      actionLabel: 'Voir analyses',
      actionTarget: ACTION_TARGET.LAB,
      isAllergy: false,
      autoCompleteWhen: () => false,
    }),
  },

  // ── IMPORTANT: Prescription refill needed ────────────────────────────────────
  {
    id: 'refill_ordonnance',
    test: (ctx) => (ctx.medicationsNeedingRefill?.length ?? 0) > 0,
    generate: (ctx) => {
      const meds = ctx.medicationsNeedingRefill || []
      const count = meds.length
      const refillFirstNames = meds.map((m) =>
        m.name?.split(' ')[0]?.toLowerCase()
      )
      return {
        id: 'refill_ordonnance',
        priority: PRIORITY.IMPORTANT,
        title:
          count > 1
            ? `Renouveler ${count} ordonnances`
            : `Renouveler — ${meds[0]?.name || 'traitement en cours'}`,
        description: `Traitement${count > 1 ? 's' : ''} arrivant à expiration : ${
          meds.map((m) => m.name).join(', ')
        }.`,
        actionLabel: 'Ordonnance',
        actionTarget: ACTION_TARGET.PRESCRIPTION,
        isAllergy: false,
        autoCompleteWhen: (_, medications) => {
          if (!medications?.length) return false
          return refillFirstNames.some((name) =>
            medications.some((m) => m.name?.toLowerCase().includes(name))
          )
        },
      }
    },
  },

  // ── REMINDER: Lipid profile missing or outdated (>12 months) ─────────────────
  {
    id: 'lipid_profile',
    test: (ctx) => (ctx.lastLipidProfileMonthsAgo ?? 0) > 12,
    generate: (ctx) => ({
      id: 'lipid_profile',
      priority: PRIORITY.REMINDER,
      title: 'Prescrire bilan lipidique',
      description: `Dernier bilan : il y a ${
        ctx.lastLipidProfileMonthsAgo
      } mois. Surveillance annuelle recommandée${
        ctx.hasDiabetes ? ' chez le patient diabétique' : ''
      }.`,
      actionLabel: 'Voir analyses',
      actionTarget: ACTION_TARGET.LAB,
      isAllergy: false,
      autoCompleteWhen: () => false,
    }),
  },

  // ── REMINDER: Annual flu vaccination ──────────────────────────────────────────
  {
    id: 'flu_vaccination',
    test: (ctx) =>
      ctx.pendingVaccinations?.includes('Grippe saisonnière'),
    generate: () => ({
      id: 'flu_vaccination',
      priority: PRIORITY.REMINDER,
      title: 'Vaccination grippe saisonnière',
      description:
        'Rappel annuel recommandé pour les patients diabétiques et à risque cardiovasculaire.',
      actionLabel: 'Suivi',
      actionTarget: ACTION_TARGET.FOLLOWUP,
      isAllergy: false,
      autoCompleteWhen: () => false,
    }),
  },

  // ── REMINDER: Smoking cessation counseling ───────────────────────────────────
  {
    id: 'tabac_counseling',
    test: (ctx) => Boolean(ctx.isSmoker),
    generate: (ctx) => ({
      id: 'tabac_counseling',
      priority: PRIORITY.REMINDER,
      title: 'Aborder le sevrage tabagique',
      description: `Tabagisme actif${
        ctx.packYears ? ` (${ctx.packYears} PA)` : ''
      }. Counseling recommandé à chaque consultation.`,
      actionLabel: 'Suivi',
      actionTarget: ACTION_TARGET.FOLLOWUP,
      isAllergy: false,
      autoCompleteWhen: () => false,
    }),
  },

  // ── REMINDER: Weight follow-up (diabetes or BMI > 25) ────────────────────────
  {
    id: 'bmi_followup',
    test: (ctx) => ctx.hasDiabetes || (ctx.bmiValue != null && ctx.bmiValue > 25),
    generate: (ctx) => ({
      id: 'bmi_followup',
      priority: PRIORITY.REMINDER,
      title: 'Suivi pondéral',
      description:
        ctx.bmiValue != null && ctx.bmiValue > 25
          ? `IMC actuel : ${ctx.bmiValue} kg/m². Objectif < 25. Encourager l'activité physique.`
          : 'Peser le patient — surveillance systématique chez le patient diabétique.',
      actionLabel: 'Constantes',
      actionTarget: ACTION_TARGET.VITALS,
      isAllergy: false,
      autoCompleteWhen: (formData) => Boolean(formData?.weight),
    }),
  },

  // ── REMINDER: General follow-up overdue (>6 months no consultation) ──────────
  {
    id: 'general_followup',
    test: (ctx) => (ctx.lastConsultationMonthsAgo ?? 0) > 6,
    generate: (ctx) => ({
      id: 'general_followup',
      priority: PRIORITY.REMINDER,
      title: 'Revoir le suivi général',
      description: `Absence de consultation depuis ${
        ctx.lastConsultationMonthsAgo
      } mois. Effectuer un bilan complet de suivi.`,
      actionLabel: 'Suivi',
      actionTarget: ACTION_TARGET.FOLLOWUP,
      isAllergy: false,
      autoCompleteWhen: () => false,
    }),
  },
]
