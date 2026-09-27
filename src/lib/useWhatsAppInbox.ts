import { useEffect, useState, useCallback, useRef } from 'react'
import axios from 'axios'
import { supabase } from './supabase'
import { useAppContext } from '../context/AppContext'
import type { WhatsAppInboxItem } from '../types'

const BACKEND_URL = 'http://localhost:3001'

/**
 * Custom React hook for Realtime WhatsApp Inbox subscription, backend sync, and data management
 */
export function useWhatsAppInbox() {
  const { notify } = useAppContext()
  const [items, setItems] = useState<WhatsAppInboxItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const knownItemIdsRef = useRef<Set<string>>(new Set())
  const isFirstLoadRef = useRef<boolean>(true)

  // Fetch pending inbox items from BOTH Backend API (localhost:3001) and Supabase
  const fetchPendingItems = useCallback(async () => {
    try {
      const mergedMap = new Map<string, WhatsAppInboxItem>()

      // 1. Fetch from Local Node.js Backend API
      try {
        const backendRes = await axios.get(`${BACKEND_URL}/api/whatsapp/inbox`, { timeout: 3000 })
        if (backendRes.data?.items && Array.isArray(backendRes.data.items)) {
          for (const item of backendRes.data.items) {
            const key = item.id || `${item.patient_phone}_${item.raw_message}`
            mergedMap.set(key, item)
          }
        }
      } catch (backendErr) {
        // Backend might be offline or still starting
      }

      // 2. Fetch from Supabase
      try {
        const { data: supaData, error: supaErr } = await supabase
          .from('whatsapp_inbox')
          .select('*')
          .eq('status', 'pending')
          .order('created_at', { ascending: false })

        if (!supaErr && supaData) {
          for (const item of supaData) {
            const key = item.id || `${item.patient_phone}_${item.raw_message}`
            mergedMap.set(key, item)
          }
        }
      } catch (supaErr) {
        // Supabase RLS or network
      }

      const allMerged = Array.from(mergedMap.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )

      // Notify for new items arriving after initial load
      if (!isFirstLoadRef.current) {
        for (const item of allMerged) {
          if (!knownItemIdsRef.current.has(item.id)) {
            const displayName = item.patient_name || item.patient_phone || 'Inconnu'
            const typeLabel =
              item.request_type === 'booking'
                ? 'Prise de RDV'
                : item.request_type === 'reclamation'
                ? 'Réclamation'
                : 'Message'

            notify({
              title: `Nouvelle demande WhatsApp (${typeLabel})`,
              description: `De : ${displayName} — "${item.raw_message?.slice(0, 60)}${
                (item.raw_message?.length || 0) > 60 ? '...' : ''
              }"`,
              tone: item.request_type === 'booking' ? 'success' : 'neutral',
            })
          }
        }
      }

      // Update known IDs
      knownItemIdsRef.current = new Set(allMerged.map((i) => i.id))
      isFirstLoadRef.current = false

      setItems(allMerged)
      setUnreadCount(allMerged.length)
    } catch (err: any) {
      console.error('❌ [useWhatsAppInbox] Erreur chargement boite de réception:', err?.message || err)
    } finally {
      setLoading(false)
    }
  }, [notify])

  // Initial load
  useEffect(() => {
    fetchPendingItems()
  }, [fetchPendingItems])

  // Polling interval against backend every 3.5s to ensure instant reactivity even if Supabase Realtime isn't enabled
  useEffect(() => {
    const interval = setInterval(() => {
      fetchPendingItems()
    }, 3500)

    return () => clearInterval(interval)
  }, [fetchPendingItems])

  // Supabase Realtime subscription to INSERT and UPDATE events on whatsapp_inbox
  useEffect(() => {
    const channel = supabase
      .channel('realtime-whatsapp-inbox')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'whatsapp_inbox',
        },
        (payload) => {
          const newItem = payload.new as WhatsAppInboxItem
          console.log('⚡ [Realtime WhatsApp] Nouvelle ligne insérée:', newItem)

          if (newItem.status === 'pending') {
            setItems((prev) => [newItem, ...prev.filter((i) => i.id !== newItem.id)])
            setUnreadCount((prev) => prev + 1)
            knownItemIdsRef.current.add(newItem.id)

            const displayName = newItem.patient_name || newItem.patient_phone || 'Inconnu'
            const typeLabel =
              newItem.request_type === 'booking'
                ? 'Prise de RDV'
                : newItem.request_type === 'reclamation'
                ? 'Réclamation'
                : 'Message'

            notify({
              title: `Nouvelle demande WhatsApp (${typeLabel})`,
              description: `De : ${displayName} — "${newItem.raw_message?.slice(0, 60)}${
                newItem.raw_message?.length > 60 ? '...' : ''
              }"`,
              tone: newItem.request_type === 'booking' ? 'success' : 'neutral',
            })
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'whatsapp_inbox',
        },
        (payload) => {
          const updatedItem = payload.new as WhatsAppInboxItem
          console.log('⚡ [Realtime WhatsApp] Mise à jour:', updatedItem)

          setItems((prev) => {
            if (updatedItem.status !== 'pending') {
              return prev.filter((i) => i.id !== updatedItem.id)
            } else {
              return prev.map((i) => (i.id === updatedItem.id ? updatedItem : i))
            }
          })

          setUnreadCount((prev) => Math.max(0, updatedItem.status !== 'pending' ? prev - 1 : prev))
        }
      )
      .subscribe((status) => {
        console.log('[Realtime WhatsApp] Statut du canal:', status)
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [notify])

  // Action: Mark reclamation / message as resolved in BOTH backend and Supabase
  const resolveItem = async (id: string) => {
    try {
      // 1. Update Backend API
      try {
        await axios.patch(`${BACKEND_URL}/api/whatsapp/inbox/${id}`, { status: 'resolved' })
      } catch (_) {}

      // 2. Update Supabase
      try {
        await supabase
          .from('whatsapp_inbox')
          .update({
            status: 'resolved',
            resolved_at: new Date().toISOString(),
          })
          .eq('id', id)
      } catch (_) {}

      setItems((prev) => prev.filter((i) => i.id !== id))
      setUnreadCount((prev) => Math.max(0, prev - 1))
      notify({
        title: 'Marqué comme lu',
        description: 'La demande a été classée avec succès.',
        tone: 'success',
      })
      return true
    } catch (err: any) {
      console.error('❌ Erreur resolveItem:', err)
      notify({
        title: 'Erreur',
        description: err?.message || 'Impossible de mettre à jour le statut.',
        tone: 'danger',
      })
      return false
    }
  }

  return {
    items,
    loading,
    unreadCount,
    refetch: fetchPendingItems,
    resolveItem,
    setItems,
  }
}
