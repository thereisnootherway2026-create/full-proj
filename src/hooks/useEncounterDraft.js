import { useCallback, useEffect, useRef, useState } from 'react'
import {
  completeEncounter, finalizeNote, isNoteEmpty, normalizeNote, openEncounter, saveEncounter, voidEncounter,
} from '../lib/encounterService'

const AUTOSAVE_DELAY_MS = 800

// Owns the server-side draft of one consultation: opens/resumes it, autosaves
// changes (debounced, one request at a time, optimistic version), and exposes
// flush/complete/discard. The caller keeps the field state and passes `note`.
export function useEncounterDraft({ patientId, visitId, active, note, onHydrate, userId }) {
  const [state, setState] = useState({ status: 'idle', error: null, savedAt: null, isOffline: false })
  const [existingDraft, setExistingDraft] = useState(null)
  const enc = useRef({ id: null, version: null, isOffline: false })
  const lastSaved = useRef(null)
  const hydrated = useRef(false)
  const opening = useRef(false)
  const inflight = useRef(null)
  const timer = useRef(null)
  const noteRef = useRef(note)
  const onHydrateRef = useRef(onHydrate)
  noteRef.current = note
  onHydrateRef.current = onHydrate

  const snapshot = JSON.stringify(normalizeNote(note))

  // Reset when the patient changes (same component instance, different route param).
  useEffect(() => {
    enc.current = { id: null, version: null, isOffline: false }
    lastSaved.current = null
    hydrated.current = false
    opening.current = false
    setExistingDraft(null)
    clearTimeout(timer.current)
    setState({ status: 'idle', error: null, savedAt: null, isOffline: false })
  }, [patientId])

  useEffect(() => {
    if (!active || !patientId || state.status !== 'idle' || hydrated.current || opening.current) return
    opening.current = true
    setState((s) => ({ ...s, status: 'loading', error: null }))

    openEncounter(patientId, visitId || null)
      .then((row) => {
        enc.current = { id: row.id, version: row.version, isOffline: false }
        const server = normalizeNote(row.note)
        onHydrateRef.current?.(server)
        lastSaved.current = JSON.stringify(server)
        hydrated.current = true

        const hasData = !isNoteEmpty(server)
        const updateDate = row.updated_at ? new Date(row.updated_at) : (row.created_at ? new Date(row.created_at) : null)
        const isToday = updateDate && (
          updateDate.getDate() === new Date().getDate() &&
          updateDate.getMonth() === new Date().getMonth() &&
          updateDate.getFullYear() === new Date().getFullYear()
        )
        if (hasData && isToday) {
          setExistingDraft({
            time: updateDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            date: updateDate,
          })
        } else {
          setExistingDraft(null)
        }

        setState({ status: 'ready', error: null, savedAt: isNoteEmpty(server) ? new Date(row.updated_at) : null, isOffline: false })
      })
      .catch((error) => {
        // If forbidden, user is unauthorized
        if (error?.code === 'forbidden') {
          setState({ status: 'open_error', error, savedAt: null, isOffline: false })
          return
        }

        // For network / fetch / offline issues: DO NOT block the consultation!
        // Fall back gracefully to browser local storage so the doctor can work offline.
        const localKey = `mm-offline-encounter-${patientId}`
        let localNote = null
        let localTime = null
        try {
          const raw = localStorage.getItem(localKey)
          if (raw) {
            localNote = JSON.parse(raw)
            const rawTime = localStorage.getItem(`mm-offline-encounter-time-${patientId}`)
            localTime = rawTime ? new Date(rawTime) : new Date()
          }
        } catch { /* ignore */ }

        const initial = normalizeNote(localNote || noteRef.current || {})
        onHydrateRef.current?.(initial)
        lastSaved.current = JSON.stringify(initial)
        hydrated.current = true
        enc.current = { id: `offline-${patientId}-${Date.now()}`, version: 1, isOffline: true }

        if (localNote && !isNoteEmpty(initial)) {
          const updateDate = localTime || new Date()
          setExistingDraft({
            time: updateDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            date: updateDate,
          })
        }

        setState({ status: 'ready', error: null, savedAt: new Date(), isOffline: true })
      })
      .finally(() => { opening.current = false })
  }, [active, patientId, visitId, state.status])

  const persist = useCallback(async () => {
    if (!enc.current.id || !hydrated.current) return
    if (inflight.current) await inflight.current.catch(() => {})
    const body = normalizeNote(noteRef.current)
    const snap = JSON.stringify(body)
    if (snap === lastSaved.current) return

    // Always mirror to localStorage as an instant safety backup
    try {
      localStorage.setItem(`mm-offline-encounter-${patientId}`, snap)
      localStorage.setItem(`mm-offline-encounter-time-${patientId}`, new Date().toISOString())
    } catch { /* ignore */ }

    const run = (async () => {
      setState((s) => ({ ...s, status: 'saving', error: null }))
      try {
        if (enc.current.isOffline) {
          // Attempt to establish real encounter if server is back
          try {
            const row = await openEncounter(patientId, visitId || null)
            enc.current = { id: row.id, version: row.version, isOffline: false }
            const savedRow = await saveEncounter(enc.current.id, body, enc.current.version)
            enc.current.version = savedRow.version
          } catch {
            // Still offline: kept safely in local storage
          }
        } else {
          const row = await saveEncounter(enc.current.id, body, enc.current.version)
          enc.current.version = row.version
        }
        lastSaved.current = snap
        setState({ status: 'saved', error: null, savedAt: new Date(), isOffline: enc.current.isOffline })
      } catch (error) {
        if (error.code === 'conflict') {
          setState((s) => ({ ...s, status: 'conflict', error }))
          throw error
        }
        // Save failure due to network: keep local copy saved
        lastSaved.current = snap
        setState((s) => ({ ...s, status: 'saved', error: null, savedAt: new Date(), isOffline: true }))
      }
    })()
    inflight.current = run
    try { await run } finally { if (inflight.current === run) inflight.current = null }
  }, [patientId, visitId])

  useEffect(() => {
    if (!hydrated.current || snapshot === lastSaved.current) return undefined
    if (state.status === 'conflict') return undefined
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { persist().catch(() => {}) }, AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer.current)
  }, [snapshot, persist, state.status])

  useEffect(() => {
    const warn = (e) => {
      if (hydrated.current && (JSON.stringify(normalizeNote(noteRef.current)) !== lastSaved.current || inflight.current)) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  const flush = useCallback(async () => {
    clearTimeout(timer.current)
    await persist()
  }, [persist])

  const complete = useCallback(async (billing) => {
    if (!enc.current.id) throw new Error('not ready')
    await flush()
    const finalData = finalizeNote(noteRef.current, { userId })
    let result

    if (enc.current.isOffline) {
      try {
        const row = await openEncounter(patientId, visitId || null)
        enc.current = { id: row.id, version: row.version, isOffline: false }
        result = await completeEncounter(enc.current.id, finalData, enc.current.version, billing)
      } catch {
        // Still offline: store completed record locally
        try {
          localStorage.setItem(`mm-offline-completed-${patientId}-${Date.now()}`, JSON.stringify(finalData))
          localStorage.removeItem(`mm-offline-encounter-${patientId}`)
          localStorage.removeItem(`mm-offline-encounter-time-${patientId}`)
        } catch { /* ignore */ }
        result = { encounter: { id: enc.current.id, note: finalData }, handoff: 'completed', visit_id: visitId }
      }
    } else {
      result = await completeEncounter(enc.current.id, finalData, enc.current.version, billing)
    }

    enc.current = { id: null, version: null, isOffline: false }
    hydrated.current = false
    setExistingDraft(null)
    setState({ status: 'completed', error: null, savedAt: new Date(), isOffline: false })
    return result
  }, [flush, patientId, visitId, userId])

  const discard = useCallback(async () => {
    try {
      localStorage.removeItem(`mm-offline-encounter-${patientId}`)
      localStorage.removeItem(`mm-offline-encounter-time-${patientId}`)
    } catch { /* ignore */ }

    if (enc.current.id && !enc.current.isOffline) {
      try { await voidEncounter(enc.current.id) } catch { /* ignore */ }
    }

    enc.current = { id: null, version: null, isOffline: false }
    hydrated.current = false
    lastSaved.current = null
    setExistingDraft(null)
    setState({ status: 'discarded', error: null, savedAt: null, isOffline: false })
  }, [patientId])

  const startFresh = useCallback(async () => {
    try {
      localStorage.removeItem(`mm-offline-encounter-${patientId}`)
      localStorage.removeItem(`mm-offline-encounter-time-${patientId}`)
    } catch { /* ignore */ }

    if (enc.current.id && !enc.current.isOffline) {
      try { await voidEncounter(enc.current.id) } catch { /* ignore */ }
    }

    enc.current = { id: null, version: null, isOffline: false }
    hydrated.current = false
    lastSaved.current = null
    setExistingDraft(null)

    const empty = normalizeNote({})
    onHydrateRef.current?.(empty)

    opening.current = true
    setState((s) => ({ ...s, status: 'loading', error: null }))
    try {
      const row = await openEncounter(patientId, visitId || null)
      enc.current = { id: row.id, version: row.version, isOffline: false }
      const server = normalizeNote(row.note)
      onHydrateRef.current?.(server)
      lastSaved.current = JSON.stringify(server)
      hydrated.current = true
      setState({ status: 'ready', error: null, savedAt: new Date(row.updated_at), isOffline: false })
    } catch (error) {
      if (error?.code === 'forbidden') {
        setState({ status: 'open_error', error, savedAt: null, isOffline: false })
        return
      }
      enc.current = { id: `offline-${patientId}-${Date.now()}`, version: 1, isOffline: true }
      hydrated.current = true
      setState({ status: 'ready', error: null, savedAt: new Date(), isOffline: true })
    } finally {
      opening.current = false
    }
  }, [patientId, visitId])

  useEffect(() => {
    if (!active && (state.status === 'discarded' || state.status === 'completed')) {
      setState({ status: 'idle', error: null, savedAt: null, isOffline: false })
    }
  }, [active, state.status])

  const retryOpen = useCallback(() => {
    opening.current = false
    hydrated.current = false
    setState({ status: 'idle', error: null, savedAt: null, isOffline: false })
  }, [])

  useEffect(() => {
    if (state.status !== 'error') return undefined
    const t = setTimeout(() => { persist().catch(() => {}) }, 6000)
    return () => clearTimeout(t)
  }, [state.status, persist])

  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && navigator.onLine === false)
  useEffect(() => {
    const on = () => { setOffline(false); persist().catch(() => {}) }
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [persist])

  const isDirty = hydrated.current && snapshot !== lastSaved.current

  return {
    ...state,
    offline: offline || Boolean(state.isOffline),
    ready: hydrated.current,
    isDirty,
    existingDraft,
    clearExistingDraft: () => setExistingDraft(null),
    startFresh,
    flush,
    complete,
    discard,
    retryOpen,
    retry: () => persist().catch(() => {}),
  }
}
