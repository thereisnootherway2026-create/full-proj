// Priority levels for checklist items
export const PRIORITY = Object.freeze({
  CRITICAL: 'critical',
  IMPORTANT: 'important',
  REMINDER: 'reminder',
})

// Navigation targets (scroll anchors in ConsultationWorkspace)
export const ACTION_TARGET = Object.freeze({
  VITALS: 'vitals',
  DIAGNOSIS: 'diagnosis',
  PRESCRIPTION: 'prescription',
  LAB: 'lab',
  FOLLOWUP: 'followup',
  SUBJECTIVE: 'subjective',
})

/**
 * ChecklistItem shape (JSDoc for editor hints):
 * @typedef {Object} ChecklistItem
 * @property {string} id
 * @property {string} priority - one of PRIORITY values
 * @property {string} title
 * @property {string} description
 * @property {string|null} actionLabel - short badge text
 * @property {string|null} actionTarget - one of ACTION_TARGET values
 * @property {boolean} isAllergy - if true: no checkbox, always shown, non-dismissible
 * @property {(formData: Object, medications: Array) => boolean} autoCompleteWhen
 */
