export const RDV_STATUSES = {
  SCHEDULED: 'confirme',
  ARRIVED: 'arrive',
  WAITING: 'en_attente',
  IN_CONSULTATION: 'en_consultation',
  TO_BE_PAID: 'a_encaisser',
  DONE: 'termine',
  ABSENT: 'absent',
  CANCELLED: 'annule',
  // Legacy aliases kept to avoid breaking older screens during migration.
  COMPLETED: 'a_encaisser',
  PAID: 'termine',
  CREDIT: 'a_encaisser',
}

export const VISIT_STATUSES = {
  SCHEDULED: 'scheduled',
  ARRIVED: 'arrived',
  WAITING: 'waiting',
  CALLED: 'called',
  CONSULTATION: 'consultation',
  BILLING: 'billing',
  COMPLETED: 'completed',
  PARTIEL: 'partiel',
  CANCELLED: 'cancelled',
}

export const VISIT_SOURCES = {
  APPOINTMENT: 'appointment',
  WALK_IN: 'walk_in',
}

export const BILLING_TYPES = {
  CASH: 'cash',
  INSURANCE: 'insurance',
  PACKAGE: 'package',
  FREE: 'free',
}

export const VISIT_STATUS_LABELS = {
  [VISIT_STATUSES.SCHEDULED]: 'Prévu',
  [VISIT_STATUSES.ARRIVED]: 'Arrivé',
  [VISIT_STATUSES.WAITING]: 'En attente',
  [VISIT_STATUSES.CONSULTATION]: 'En consultation',
  [VISIT_STATUSES.BILLING]: 'Encaissement',
  [VISIT_STATUSES.COMPLETED]: 'Terminé',
  [VISIT_STATUSES.PARTIEL]: 'Paiement partiel',
  [VISIT_STATUSES.CANCELLED]: 'Annulé',
}

export const VISIT_STATUS_COLORS = {
  [VISIT_STATUSES.WAITING]: {
    border: '#94A3B8',
    badgeBg: '#F1F5F9',
    badgeText: '#334155'
  },
  [VISIT_STATUSES.CONSULTATION]: {
    border: '#2563EB',
    badgeBg: '#DBEAFE',
    badgeText: '#1E40AF'
  },
  [VISIT_STATUSES.BILLING]: {
    border: '#EAB308',
    badgeBg: '#FEF9C3',
    badgeText: '#854D0E'
  },
  [VISIT_STATUSES.PARTIEL]: {
    border: '#EAB308',
    badgeBg: '#FEF3C7',
    badgeText: '#92400E'
  },
  [VISIT_STATUSES.COMPLETED]: {
    border: '#16A34A',
    badgeBg: '#DCFCE7',
    badgeText: '#166534'
  }
}

export const VISIT_TRANSITIONS = {
  [VISIT_STATUSES.SCHEDULED]: [VISIT_STATUSES.ARRIVED, VISIT_STATUSES.WAITING, VISIT_STATUSES.CANCELLED],
  [VISIT_STATUSES.ARRIVED]: [VISIT_STATUSES.WAITING, VISIT_STATUSES.CANCELLED],
  [VISIT_STATUSES.WAITING]: [VISIT_STATUSES.CONSULTATION, VISIT_STATUSES.CANCELLED],
  [VISIT_STATUSES.CONSULTATION]: [VISIT_STATUSES.BILLING, VISIT_STATUSES.COMPLETED],
  [VISIT_STATUSES.BILLING]: [VISIT_STATUSES.COMPLETED],
  [VISIT_STATUSES.COMPLETED]: [],
  [VISIT_STATUSES.CANCELLED]: [],
}

export function isValidVisitTransition(currentStatus, targetStatus) {
  const current = currentStatus || VISIT_STATUSES.SCHEDULED
  const validTargets = VISIT_TRANSITIONS[current] || []

  if (!validTargets.includes(targetStatus)) {
    throw new Error('Invalid visit state transition')
  }

  return true
}

export function mapVisitToLegacyRdvStatus(status) {
  const map = {
    [VISIT_STATUSES.SCHEDULED]: RDV_STATUSES.SCHEDULED,
    [VISIT_STATUSES.ARRIVED]: RDV_STATUSES.ARRIVED,
    [VISIT_STATUSES.WAITING]: RDV_STATUSES.WAITING,
    [VISIT_STATUSES.CALLED]: RDV_STATUSES.WAITING,
    [VISIT_STATUSES.CONSULTATION]: RDV_STATUSES.IN_CONSULTATION,
    [VISIT_STATUSES.BILLING]: RDV_STATUSES.TO_BE_PAID,
    [VISIT_STATUSES.COMPLETED]: RDV_STATUSES.DONE,
    [VISIT_STATUSES.CANCELLED]: RDV_STATUSES.CANCELLED,
  }
  return map[status] || status
}

// Strict UI transition enforcement
// Format: current_status: [allowed_next_statuses]
const TRANSITIONS = {
  [RDV_STATUSES.SCHEDULED]: [RDV_STATUSES.ARRIVED, RDV_STATUSES.ABSENT],
  [RDV_STATUSES.ARRIVED]: [RDV_STATUSES.WAITING],
  [RDV_STATUSES.WAITING]: [RDV_STATUSES.IN_CONSULTATION],
  [RDV_STATUSES.IN_CONSULTATION]: [RDV_STATUSES.TO_BE_PAID],
  [RDV_STATUSES.TO_BE_PAID]: [RDV_STATUSES.DONE],
  [RDV_STATUSES.DONE]: [],
  [RDV_STATUSES.ABSENT]: [],
  [RDV_STATUSES.CANCELLED]: [],
}

/**
 * Validates if the workflow can transition from the current status to the new status.
 * @param {string} currentStatus - The existing status
 * @param {string} targetStatus - The intended new status
 * @returns {boolean} True if transition is valid
 * @throws {Error} if the transition is invalid
 */
export function isValidTransition(currentStatus, targetStatus) {
  const current = currentStatus || RDV_STATUSES.SCHEDULED
  const validTargets = TRANSITIONS[current] || []
  
  if (!validTargets.includes(targetStatus)) {
    throw new Error('Invalid state transition')
  }
  
  return true
}

export const STATUS_LABELS = {
  [RDV_STATUSES.SCHEDULED]: 'Prévu',
  [RDV_STATUSES.ARRIVED]: 'Arrivé',
  [RDV_STATUSES.WAITING]: 'En attente',
  [RDV_STATUSES.IN_CONSULTATION]: 'En consultation',
  [RDV_STATUSES.TO_BE_PAID]: 'À encaisser',
  [RDV_STATUSES.DONE]: 'Terminé',
  [RDV_STATUSES.ABSENT]: 'Absent',
  [RDV_STATUSES.CANCELLED]: 'Annulé',
}
