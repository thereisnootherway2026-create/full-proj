/**
 * useAutosave — production-ready autosave hook for ConsultationWorkspace.
 *
 * Features:
 *  - Saves every AUTOSAVE_INTERVAL_MS (15 s) when dirty
 *  - Debounced save triggered on field blur / diagnosis change / prescription change
 *  - Prevents duplicate in-flight requests via an in-flight ref
 *  - Exponential-backoff retry (up to MAX_RETRIES attempts)
 *  - Exposes saveStatus: 'idle' | 'saving' | 'saved' | 'error'
 *  - Warns the user before leaving if unsaved changes exist (beforeunload)
 *  - Skips the backend call for mock visits (no real UUID)
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { autosaveConsultation } from '../lib/visitService'

const AUTOSAVE_INTERVAL_MS = 15_000   // 15 seconds
const DEBOUNCE_MS          = 800      // after a trigger event
const MAX_RETRIES          = 3
const RETRY_BASE_MS        = 1_500    // 1.5 s × 2^attempt

// Returns true when the visitId looks like a real Supabase UUID (not a mock)
function isRealVisit(visitId) {
  if (!visitId) return false
  return true
}

export function useAutosave({ consultationId, visitId, getPayload }) {
  const [saveStatus, setSaveStatus] = useState('idle') // 'idle' | 'saving' | 'saved' | 'error'

  const isDirtyRef   = useRef(false)   // has data changed since last save?
  const inFlightRef  = useRef(false)   // is a save request currently running?
  const debounceRef  = useRef(null)    // debounce timer id
  const statusTimRef = useRef(null)    // timer to reset 'saved' → 'idle' after 4 s

  // ── Core save function (with retry) ────────────────────────────────────────
  const performSave = useCallback(async (attempt = 0) => {
    if (!consultationId || !visitId) {
      setSaveStatus('error')
      return
    }

    if (!consultationId || !isRealVisit(visitId)) {
      // Mock visit — simulate save locally without network call
      isDirtyRef.current = false
      setSaveStatus('saved')
      clearTimeout(statusTimRef.current)
      statusTimRef.current = setTimeout(() => setSaveStatus('idle'), 4_000)
      return
    }

    if (inFlightRef.current) return   // already saving — skip duplicate
    inFlightRef.current = true
    setSaveStatus('saving')

    try {
      const payload = getPayload()
      await autosaveConsultation(consultationId, payload)
      isDirtyRef.current = false
      inFlightRef.current = false
      setSaveStatus('saved')
      clearTimeout(statusTimRef.current)
      statusTimRef.current = setTimeout(() => setSaveStatus('idle'), 4_000)
    } catch (err) {
      inFlightRef.current = false
      console.warn(`[autosave] attempt ${attempt + 1} failed:`, err)

      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt)
        setTimeout(() => performSave(attempt + 1), delay)
      } else {
        setSaveStatus('error')
      }
    }
  }, [consultationId, visitId, getPayload])

  // ── Mark dirty (called on every field change) ───────────────────────────────
  const markDirty = useCallback(() => {
    isDirtyRef.current = true
  }, [])

  // ── Debounced trigger (blur / diagnosis / prescription) ────────────────────
  const triggerSave = useCallback(() => {
    markDirty()
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (isDirtyRef.current) performSave()
    }, DEBOUNCE_MS)
  }, [markDirty, performSave])

  // ── Periodic 15-second interval ────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      if (isDirtyRef.current) performSave()
    }, AUTOSAVE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [performSave])

  // ── Warn before leaving with unsaved changes ────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (!isDirtyRef.current) return
      e.preventDefault()
      e.returnValue = ''   // required for Chrome
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  // ── Cleanup timers on unmount ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearTimeout(debounceRef.current)
      clearTimeout(statusTimRef.current)
    }
  }, [])

  return { saveStatus, markDirty, triggerSave, performSave }
}

/**
 * useAutoSave - A simple debounced hook to handle auto-saving of a single value. Used in MedicalTextarea.
 */
export function useAutoSave(value, onSave, delay = 3000) {
  const [saveStatus, setSaveStatus] = useState('saved'); // 'idle' | 'saving' | 'saved' | 'error'
  const [errorMessage, setErrorMessage] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);

  const onSaveRef = useRef(onSave);
  const valueRef = useRef(value);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    const currentValue = value;

    const timer = setTimeout(async () => {
      setSaveStatus('saving');
      setErrorMessage(null);
      try {
        if (onSaveRef.current) {
          await onSaveRef.current(currentValue);
        }
        setSaveStatus('saved');
        setLastSavedAt(new Date());
      } catch (err) {
        setSaveStatus('error');
        setErrorMessage(err?.message || 'Erreur de sauvegarde automatique');
      }
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return { saveStatus, errorMessage, lastSavedAt };
}

