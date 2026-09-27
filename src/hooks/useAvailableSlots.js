import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAgendaConfig } from '../lib/agendaConfig'
import { useCabinetId } from './useCabinetId'
import {
  computeAvailableSlots,
  isSlotAvailable,
  DEFAULT_WORKING_HOURS,
} from '../lib/slotAvailability'

/**
 * Hook to compute real-time smart slot suggestions.
 *
 * Supports flexible invocation:
 * - useAvailableSlots(doctorId, durationMinutes)
 * - useAvailableSlots({ cabinetId, doctorId, durationMinutes, excludeAppointmentId, lookaheadDays, enabled })
 */
export function useAvailableSlots(arg1, arg2) {
  const { cabinetId: defaultCabinetId } = useCabinetId()

  const options = useMemo(() => {
    if (typeof arg1 === 'object' && arg1 !== null) {
      return {
        cabinetId: arg1.cabinetId || defaultCabinetId,
        doctorId: arg1.doctorId || null,
        durationMinutes: arg1.durationMinutes ?? 30,
        excludeAppointmentId: arg1.excludeAppointmentId || null,
        lookaheadDays: arg1.lookaheadDays ?? 7,
        enabled: arg1.enabled !== false,
      }
    }
    return {
      cabinetId: defaultCabinetId,
      doctorId: arg1 || null,
      durationMinutes: arg2 ?? 30,
      excludeAppointmentId: null,
      lookaheadDays: 7,
      enabled: true,
    }
  }, [arg1, arg2, defaultCabinetId])

  const {
    cabinetId,
    doctorId,
    durationMinutes,
    excludeAppointmentId,
    lookaheadDays,
    enabled,
  } = options

  const agenda = useAgendaConfig(cabinetId)

  // Query appointments across the next ~7 days
  const {
    data: rawAppointments = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      'available-slots-rdv',
      cabinetId,
      doctorId,
      excludeAppointmentId,
      lookaheadDays,
      agenda.schemaReady,
    ],
    enabled: Boolean(cabinetId) && enabled,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const today = new Date()
      // Start of today: 00:00:00
      const startIso = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        0,
        0,
        0
      ).toISOString()

      // End of lookahead window: 23:59:59
      const endIso = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + lookaheadDays,
        23,
        59,
        59
      ).toISOString()

      let q = supabase
        .from('rdv')
        .select(
          `id, date_rdv, duree_minutes, status${agenda.schemaReady ? ', end_time' : ''}`
        )
        .eq('cabinet_id', cabinetId)
        .in('status', ['scheduled', 'confirme', 'arrive', 'en_consultation'])
        .gte('date_rdv', startIso)
        .lte('date_rdv', endIso)
        .order('date_rdv', { ascending: true })

      if (excludeAppointmentId) {
        q = q.neq('id', excludeAppointmentId)
      }

      const { data, error: qErr } = await q
      if (qErr) {
        console.error('Error fetching appointments for slot availability:', qErr)
        return []
      }

      return data || []
    },
  })

  // Effective settings: agenda settings if available from DB, otherwise defaults
  const effectiveSettings = useMemo(() => ({
    ...DEFAULT_WORKING_HOURS,
    ...(agenda.settings || {}),
  }), [agenda.settings])

  // Compute available open slots
  const slots = useMemo(() => {
    if (!cabinetId) return []
    return computeAvailableSlots({
      appointments: rawAppointments,
      durationMinutes: Number(durationMinutes) || 30,
      settings: effectiveSettings,
      daysCount: lookaheadDays,
    })
  }, [rawAppointments, durationMinutes, effectiveSettings, lookaheadDays, cabinetId])

  // Helper to re-validate any chosen date+time against duration changes
  const isSlotValid = useMemo(() => {
    return (date, time, duration) => {
      return isSlotAvailable({
        date,
        time,
        durationMinutes: duration ?? durationMinutes,
        appointments: rawAppointments,
        settings: effectiveSettings,
      })
    }
  }, [rawAppointments, durationMinutes, effectiveSettings])

  return {
    slots,
    isLoading: isLoading || (Boolean(cabinetId) && agenda.isLoading),
    error,
    refetch,
    isSlotValid,
    rawAppointments,
    settings: effectiveSettings,
  }
}
