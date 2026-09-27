import { describe, it, expect } from 'vitest'
import {
  computeAvailableSlots,
  isSlotAvailable,
  timeToMinutes,
  minutesToTime,
  formatSlotLabel,
  DEFAULT_WORKING_HOURS,
} from './slotAvailability'

describe('slotAvailability unit tests', () => {
  it('converts time strings to minutes and back', () => {
    expect(timeToMinutes('09:00')).toBe(540)
    expect(timeToMinutes('13:30')).toBe(810)
    expect(minutesToTime(540)).toBe('09:00')
    expect(minutesToTime(810)).toBe('13:30')
  })

  it('computes open slots excluding lunch break and closed days', () => {
    // Fixed base date: Monday 2026-09-28
    const monday = new Date(2026, 8, 28, 8, 0, 0)
    const slots = computeAvailableSlots({
      appointments: [],
      durationMinutes: 30,
      settings: {
        heureDebut: '09:00',
        heureFin: '12:00',
        pauseDebut: '12:00',
        pauseFin: '14:00',
        pasMinutes: 30,
        joursOuvres: [1], // Only Monday
      },
      startDate: monday,
      daysCount: 1,
      now: new Date(2026, 8, 28, 7, 0, 0),
    })

    // From 09:00 to 12:00 with 30 min step: 09:00, 09:30, 10:00, 10:30, 11:00, 11:30
    expect(slots.map(s => s.time)).toEqual([
      '09:00',
      '09:30',
      '10:00',
      '10:30',
      '11:00',
      '11:30',
    ])
  })

  it('excludes booked appointments', () => {
    const monday = new Date(2026, 8, 28, 8, 0, 0)
    const appointments = [
      {
        id: 'rdv-1',
        date_rdv: new Date(2026, 8, 28, 9, 30, 0).toISOString(),
        duree_minutes: 30,
        status: 'confirme',
      },
    ]

    const slots = computeAvailableSlots({
      appointments,
      durationMinutes: 30,
      settings: {
        heureDebut: '09:00',
        heureFin: '11:00',
        pasMinutes: 30,
        joursOuvres: [1],
      },
      startDate: monday,
      daysCount: 1,
      now: new Date(2026, 8, 28, 7, 0, 0),
    })

    // 09:30 is booked (09:30-10:00), so only 09:00, 10:00, 10:30 should be available
    expect(slots.map(s => s.time)).toEqual(['09:00', '10:00', '10:30'])
  })

  it('re-validates slot when duration changes and detects conflicts', () => {
    const appointments = [
      {
        id: 'rdv-2',
        date_rdv: new Date(2026, 8, 28, 10, 0, 0).toISOString(),
        duree_minutes: 30,
        status: 'confirme',
      },
    ]

    const settings = {
      heureDebut: '09:00',
      heureFin: '18:00',
    }

    // 09:30 slot with 30 min duration ends at 10:00 -> fits!
    const fits30 = isSlotAvailable({
      date: '2026-09-28',
      time: '09:30',
      durationMinutes: 30,
      appointments,
      settings,
    })
    expect(fits30).toBe(true)

    // 09:30 slot with 45 min duration ends at 10:15 -> overlaps rdv-2 (10:00-10:30) -> FAILS!
    const fits45 = isSlotAvailable({
      date: '2026-09-28',
      time: '09:30',
      durationMinutes: 45,
      appointments,
      settings,
    })
    expect(fits45).toBe(false)
  })
})
