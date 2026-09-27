/**
 * Smart Slot Availability Engine for MacroMedica
 *
 * Computes available consultation slots over a lookahead window (e.g. 7 days)
 * by subtracting already booked appointments and pauses from working hours.
 *
 * NOTE ON WORKING HOURS ASSUMPTION:
 * As of migration 20260923040000, appointments are scoped per cabinet, and working hours
 * are stored in `cabinet_agenda_settings` (with fallback to 09:00-18:00, lunch break 13:00-14:00,
 * and Monday through Saturday). When per-doctor schedule tables are introduced, this module
 * can incorporate doctor-specific schedules without breaking this contract.
 */

import { addDays, format, isToday, isTomorrow, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

export const DEFAULT_WORKING_HOURS = {
  heureDebut: '09:00',
  heureFin: '18:00',
  pauseDebut: '13:00',
  pauseFin: '14:00',
  pasMinutes: 15,
  joursOuvres: [1, 2, 3, 4, 5, 6], // 1 = Monday, 6 = Saturday (Sunday 0 excluded)
  dureeDefautMinutes: 30,
}

/**
 * Convert "HH:mm" to total minutes from midnight
 * e.g. "09:30" -> 570
 */
export function timeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null
  const parts = timeStr.trim().split(':')
  if (parts.length < 2) return null
  const h = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

/**
 * Convert total minutes from midnight to "HH:mm"
 * e.g. 570 -> "09:30"
 */
export function minutesToTime(minutes) {
  if (minutes == null || Number.isNaN(minutes)) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Format a slot chip label:
 * - Today: "Aujourd'hui 14:30"
 * - Tomorrow: "Demain 09:00"
 * - Later: "Mer. 30 sept. 10:15"
 */
export function formatSlotLabel(dateStr, timeStr) {
  try {
    const d = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr
    if (isToday(d)) {
      return `Aujourd'hui ${timeStr}`
    }
    if (isTomorrow(d)) {
      return `Demain ${timeStr}`
    }
    const dayName = format(d, 'EEE d MMM', { locale: fr })
    // Capitalize first letter (e.g. "Mer. 30 sept.")
    const capitalized = dayName.charAt(0).toUpperCase() + dayName.slice(1)
    return `${capitalized} ${timeStr}`
  } catch {
    return `${dateStr} ${timeStr}`
  }
}

/**
 * Normalizes appointment data into day-based ranges [startMin, endMin]
 */
export function normalizeAppointments(appointments = []) {
  const byDate = new Map()

  for (const app of appointments) {
    if (!app || !app.date_rdv) continue

    // Exclude cancelled or absent appointments
    const status = String(app.status || '').toLowerCase()
    if (status === 'annule' || status === 'cancelled' || status === 'absent' || status === 'no_show') {
      continue
    }

    try {
      const dt = new Date(app.date_rdv)
      if (Number.isNaN(dt.getTime())) continue

      const dateKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
      const startMin = dt.getHours() * 60 + dt.getMinutes()
      const duration = Number(app.duree_minutes) || 30
      const endMin = startMin + duration

      if (!byDate.has(dateKey)) {
        byDate.set(dateKey, [])
      }
      byDate.get(dateKey).push({
        id: app.id,
        startMin,
        endMin,
      })
    } catch {
      // Ignore malformed rows
    }
  }

  return byDate
}

/**
 * Checks whether an interval [start, end) conflicts with an existing interval or pause
 */
function intervalsOverlap(s1, e1, s2, e2) {
  return Math.max(s1, s2) < Math.min(e1, e2)
}

/**
 * Pure function: computes available slots for the given lookahead window.
 *
 * @param {Object} options
 * @param {Array} options.appointments - raw rdv rows from DB
 * @param {number} options.durationMinutes - requested slot duration (e.g. 15, 20, 30, 45, 60)
 * @param {Object} [options.settings] - agenda/business hours settings
 * @param {Date|string} [options.startDate] - start of lookahead (default: today)
 * @param {number} [options.daysCount=7] - number of days to search
 * @param {number} [options.maxSlots=20] - max number of suggested slots to return
 * @param {Date} [options.now] - current time reference (for testing)
 * @returns {Array<{ date: string, time: string, label: string, dayLabel: string, timeLabel: string, duration: number }>}
 */
export function computeAvailableSlots({
  appointments = [],
  durationMinutes = 30,
  settings = {},
  startDate = new Date(),
  daysCount = 7,
  maxSlots = 16,
  now = new Date(),
} = {}) {
  const duration = Math.max(5, Number(durationMinutes) || 30)
  const config = {
    ...DEFAULT_WORKING_HOURS,
    ...settings,
  }

  const openMin = timeToMinutes(config.heureDebut) ?? 9 * 60
  const closeMin = timeToMinutes(config.heureFin) ?? 18 * 60
  const pauseStartMin = config.pauseDebut ? timeToMinutes(config.pauseDebut) : null
  const pauseEndMin = config.pauseFin ? timeToMinutes(config.pauseFin) : null
  const step = Math.max(5, Number(config.pasMinutes) || 15)
  const openDays = Array.isArray(config.joursOuvres) ? config.joursOuvres : DEFAULT_WORKING_HOURS.joursOuvres

  const normalizedApps = normalizeAppointments(appointments)
  const baseDate = typeof startDate === 'string' ? parseISO(startDate) : new Date(startDate)

  const slots = []

  // Current time in minutes for today buffer (now + 15 min buffer)
  const todayDateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const currentNowMinutes = now.getHours() * 60 + now.getMinutes()
  const minStartMinutesToday = currentNowMinutes + 15

  for (let dayOffset = 0; dayOffset < daysCount; dayOffset++) {
    const targetDate = addDays(baseDate, dayOffset)
    const dayOfWeek = targetDate.getDay() // 0 = Sunday, 1 = Monday, ...

    // Skip closed days
    if (!openDays.includes(dayOfWeek)) {
      continue
    }

    const dateKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`
    const isTargetToday = dateKey === todayDateKey
    const bookedOnDay = normalizedApps.get(dateKey) || []

    // Earliest start for this day
    let firstStart = openMin
    if (isTargetToday) {
      if (minStartMinutesToday > openMin) {
        // Round up to next step
        firstStart = Math.ceil(minStartMinutesToday / step) * step
      }
    }

    // Try candidate starts
    for (let candidateStart = firstStart; candidateStart + duration <= closeMin; candidateStart += step) {
      const candidateEnd = candidateStart + duration

      // Check lunch break conflict
      if (pauseStartMin != null && pauseEndMin != null) {
        if (intervalsOverlap(candidateStart, candidateEnd, pauseStartMin, pauseEndMin)) {
          continue
        }
      }

      // Check existing booked appointments conflict
      const hasConflict = bookedOnDay.some(app =>
        intervalsOverlap(candidateStart, candidateEnd, app.startMin, app.endMin)
      )

      if (hasConflict) {
        continue
      }

      const timeStr = minutesToTime(candidateStart)
      const label = formatSlotLabel(dateKey, timeStr)
      const dayLabel = isToday(targetDate)
        ? "Aujourd'hui"
        : isTomorrow(targetDate)
        ? 'Demain'
        : format(targetDate, 'EEE d MMM', { locale: fr })

      slots.push({
        date: dateKey,
        time: timeStr,
        label,
        dayLabel: dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1),
        timeLabel: timeStr,
        duration,
      })

      if (slots.length >= maxSlots) {
        return slots
      }
    }
  }

  return slots
}

/**
 * Pure function: re-validates if a specific chosen slot is still free for a new duration.
 * Returns true if available, false if it causes an overlap or exceeds business hours.
 *
 * @param {Object} options
 * @param {string} options.date - "YYYY-MM-DD"
 * @param {string} options.time - "HH:mm"
 * @param {number} options.durationMinutes - new duration
 * @param {Array} options.appointments - raw rdv rows
 * @param {Object} [options.settings] - agenda settings
 * @returns {boolean}
 */
export function isSlotAvailable({
  date,
  time,
  durationMinutes = 30,
  appointments = [],
  settings = {},
}) {
  if (!date || !time) return false

  const config = {
    ...DEFAULT_WORKING_HOURS,
    ...settings,
  }

  const duration = Math.max(5, Number(durationMinutes) || 30)
  const startMin = timeToMinutes(time)
  if (startMin == null) return false

  const endMin = startMin + duration
  const openMin = timeToMinutes(config.heureDebut) ?? 9 * 60
  const closeMin = timeToMinutes(config.heureFin) ?? 18 * 60

  // Outside business hours?
  if (startMin < openMin || endMin > closeMin) {
    return false
  }

  // Overlaps lunch pause?
  const pauseStartMin = config.pauseDebut ? timeToMinutes(config.pauseDebut) : null
  const pauseEndMin = config.pauseFin ? timeToMinutes(config.pauseFin) : null
  if (pauseStartMin != null && pauseEndMin != null) {
    if (intervalsOverlap(startMin, endMin, pauseStartMin, pauseEndMin)) {
      return false
    }
  }

  // Check conflicts with existing appointments
  const normalizedApps = normalizeAppointments(appointments)
  const bookedOnDay = normalizedApps.get(date) || []

  const hasConflict = bookedOnDay.some(app =>
    intervalsOverlap(startMin, endMin, app.startMin, app.endMin)
  )

  return !hasConflict
}
