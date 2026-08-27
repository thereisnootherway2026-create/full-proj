import { useMemo, useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { Activity, CheckCircle, AlertTriangle, TrendingUp, BarChart3, ChevronRight, Plus, Printer, Clock, Search, XCircle, RefreshCw, SlidersHorizontal, FileText, CreditCard, Landmark, ShieldCheck, Receipt } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Modal from '../../components/common/Modal'
import { openPrintWindow } from '../../components/common/ReceiptPrint'
import { useAppContext } from '../../context/AppContext'
import {
  getBillingRecords,
  getBillingStats,
  getPaymentMethodBreakdown,
  getActivityHeatmap,
  processVisitPayment,
  subscribeClinicPayments,
  subscribeClinicVisits,
} from '../../lib/visitService'
import InvoiceFormModal from '../../components/forms/InvoiceFormModal'

const fmtMAD = (n) => (n || 0).toLocaleString('fr-FR') + ' MAD'

const avatarColor = (str) => {
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#7C3AED', '#EF4444', '#06B6D4', '#F97316']
  let h = 0
  for (let i = 0; i < (str || '').length; i++) {
    h = (h * 31 + str.charCodeAt(i)) % colors.length
  }
  return colors[h]
}

const formatDateTime = (dateStr) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Casablanca'
  })
}

const formatDateShort = (dateStr) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Africa/Casablanca'
  })
}

const CountUp = ({ value, duration = 800 }) => {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let startTime
    let animationFrame
    const val = Number(value || 0)
    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp
      const progress = Math.min((timestamp - startTime) / duration, 1)
      setCount(Math.floor(progress * val))
      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate)
      }
    }
    animationFrame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animationFrame)
  }, [value, duration])
  return <>{count.toLocaleString('fr-FR')}</>
}

export default function BillingPage() {
  const queryClient = useQueryClient()
  const { cabinetId, notify, refreshVisits, refreshConsultations, visits: contextVisits, patients: contextPatients, updateVisitStatus, updatePatientDebt } = useAppContext()

  const [filter, setFilter] = useState('pending') // Default to 'pending' to prioritize unpaid invoices
  const [searchQuery, setSearchQuery] = useState('')
  const [chartMode, setChartMode] = useState('real') // 'real' | 'forecast'
  const [selectedDateFilter, setSelectedDateFilter] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [paymentMethods, setPaymentMethods] = useState({})
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false)
  const [isAdvancedDetailsOpen, setIsAdvancedDetailsOpen] = useState(false)

  // — Confirmation Payment Modal State —
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [modalMethod, setModalMethod] = useState('cash')
  const [modalAmount, setModalAmount] = useState('300')
  const [modalMaxAmount, setModalMaxAmount] = useState(null)
  const [modalInputError, setModalInputError] = useState('')

  // Contextual Extra Payment Details State
  const [modalMontantRecu, setModalMontantRecu] = useState('')
  const [modalRefTxn, setModalRefTxn] = useState('')
  const [modalBanque, setModalBanque] = useState('Attijariwafa Bank')
  const [modalNumCheque, setModalNumCheque] = useState('')
  const [modalEmetteurCheque, setModalEmetteurCheque] = useState('')
  const [modalOrganismeAssurance, setModalOrganismeAssurance] = useState('CNSS')
  const [modalNumPEC, setModalNumPEC] = useState('')
  const [modalTauxAssurance, setModalTauxAssurance] = useState('100%')

  // Persistent Paid Session Map
  const [paidSessionMap, setPaidSessionMap] = useState(() => {
    try {
      const cached = localStorage.getItem('macromedica_paid_map')
      if (cached) return JSON.parse(cached)
    } catch {}
    return {}
  })

  useEffect(() => {
    try {
      localStorage.setItem('macromedica_paid_map', JSON.stringify(paidSessionMap))
    } catch {}
  }, [paidSessionMap])

  // — Dynamic Database Queries via React Query —
  const { data: records = [], isLoading: isLoadingRecords, refetch: refetchRecords } = useQuery({
    queryKey: ['billing_records', cabinetId],
    queryFn: () => cabinetId ? getBillingRecords(cabinetId) : [],
    enabled: Boolean(cabinetId),
  })

  const { data: dbStats = {}, refetch: refetchStats } = useQuery({
    queryKey: ['billing_stats', cabinetId],
    queryFn: () => cabinetId ? getBillingStats(cabinetId) : {},
    enabled: Boolean(cabinetId),
  })

  const { data: dbPaymentBreakdown = [], refetch: refetchBreakdown } = useQuery({
    queryKey: ['payment_breakdown', cabinetId],
    queryFn: () => cabinetId ? getPaymentMethodBreakdown(cabinetId) : [],
    enabled: Boolean(cabinetId),
  })

  const { data: dbHeatmapData = null, refetch: refetchHeatmap } = useQuery({
    queryKey: ['activity_heatmap', cabinetId],
    queryFn: () => cabinetId ? getActivityHeatmap(cabinetId) : null,
    enabled: Boolean(cabinetId),
  })

  const refetchAll = () => {
    refetchRecords()
    refetchStats()
    refetchBreakdown()
    refetchHeatmap()
    queryClient.invalidateQueries(['billing_queue'])
  }

  // Real-time listener
  useEffect(() => {
    const handlePaymentsChanged = () => refetchAll()
    window.addEventListener('mm:payments-changed', handlePaymentsChanged)

    if (!cabinetId) return

    const subPayments = subscribeClinicPayments(cabinetId, () => refetchAll())
    const subVisits = subscribeClinicVisits(cabinetId, () => refetchAll())

    return () => {
      window.removeEventListener('mm:payments-changed', handlePaymentsChanged)
      subPayments.unsubscribe()
      subVisits.unsubscribe()
    }
  }, [cabinetId])

  // Combined Records (Merges DB records and Context/Mock visits smoothly with persistent session payment overrides)
  const allRecords = useMemo(() => {
    // Exclude patients currently in waiting room or currently inside doctor's office
    const billingEligibleVisits = (contextVisits || []).filter(v => {
      const s = String(v.status || '').toLowerCase()
      if (s === 'waiting' || s === 'consultation' || s === 'en attente' || s === 'en consultation') {
        const override = paidSessionMap[v.id] || paidSessionMap[`pay_${v.id}`]
        return Boolean(override)
      }
      return true
    })

    const contextMapped = billingEligibleVisits.map((v) => {
      const patient = v.patients || (contextPatients || []).find((p) => p.id === v.patient_id)
      const override = paidSessionMap[v.id] || paidSessionMap[`pay_${v.id}`]
      const totalAmount = Math.max(Number(v.billing_amount || 300), Number((v.total_paid || 0) + (v.remaining_balance || 0)))
      const soldeAnterieur = Number(v.solde_anterieur || patient?.solde_impaye || 0)
      const grandTotal = totalAmount + soldeAnterieur
      const paid = override ? Number(override.amount || 0) : (v.total_paid || 0)
      const reste = v.remaining_balance !== undefined ? v.remaining_balance : (override ? Math.max(0, grandTotal - paid) : (v.reste !== undefined ? v.reste : Math.max(0, grandTotal - paid)))
      const isPartial = (v.status === 'PARTIEL' || v.status === 'partiel' || v.isPartial || (reste > 0 && paid > 0)) && reste > 0
      const isFullyPaid = (v.status === 'completed' || v.status === 'TERMINÉ' || v.status === 'paid') && reste === 0
      const status = isFullyPaid ? 'paid' : (isPartial ? 'partiel' : 'pending')

      return {
        id: `pay_${v.id}`,
        visit_id: v.id,
        consultation_id: `con_${v.id}`,
        patients: patient,
        montant: totalAmount,
        solde_anterieur: soldeAnterieur,
        grandTotal: grandTotal,
        montantPaye: paid,
        resteAPayer: reste,
        isPartial: isPartial,
        status: status,
        paymentMethod: override?.method || v.billing_type || 'cash',
        created_at: v.updated_at || v.created_at || new Date().toISOString(),
        notes: v.motif || 'Consultation',
        source: 'context'
      }
    })

    const dbVisitIds = new Set(records.map(r => r.visit_id).filter(Boolean))
    const filteredContext = contextMapped.filter(c => !dbVisitIds.has(c.visit_id))
    const combined = records.length > 0 ? [...records, ...filteredContext] : contextMapped

    const mapped = combined.map(r => {
      const override = paidSessionMap[r.id] || paidSessionMap[r.visit_id]
      if (override) {
        const total = Number(r.montant || 300)
        const soldeAnt = Number(r.solde_anterieur || 0)
        const gTotal = total + soldeAnt
        const paid = Number(override.amount || 0)
        const reste = Math.max(0, gTotal - paid)
        const isFullyPaid = reste === 0
        const isPartial = reste > 0 && paid > 0
        return {
          ...r,
          status: isFullyPaid ? 'paid' : (isPartial ? 'partiel' : 'pending'),
          isPartial: isPartial,
          paymentMethod: override.method || r.paymentMethod,
          montant: total,
          solde_anterieur: soldeAnt,
          grandTotal: gTotal,
          montantPaye: paid,
          resteAPayer: reste
        }
      }
      return r
    })

    // Strict Key Deduplication by visit_id / id to prevent identical patient entries
    const seenKeys = new Set()
    const deduplicated = []
    for (const r of mapped) {
      const key = r.visit_id || r.id
      if (!seenKeys.has(key)) {
        seenKeys.add(key)
        deduplicated.push(r)
      }
    }

    return deduplicated.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }, [records, contextVisits, contextPatients, paidSessionMap])

  // Dynamic Metrics Derived from Dataset
  const stats = useMemo(() => {
    const today = new Date().toLocaleDateString('fr-CA', { timeZone: 'Africa/Casablanca' })

    // Session collected increment (new payments made in current session)
    let sessionIncrement = 0
    Object.values(paidSessionMap).forEach(p => {
      if (p && typeof p === 'object' && p.paidNow) {
        sessionIncrement += Number(p.paidNow || 0)
      }
    })

    // Calculated revenue from all records
    const calculatedRevenue = allRecords.reduce((sum, r) => {
      if (r.status === 'paid') return sum + (r.grandTotal || r.montant || 0)
      return sum + (r.montantPaye || 0)
    }, 0)

    const baseRevenue = dbStats?.totalRevenue ?? 2250
    const totalRevenue = Math.max(baseRevenue + sessionIncrement, calculatedRevenue)

    // Pending records (uncollected full amounts + partial remaining balances)
    const pendingRecords = allRecords.filter(r => r.status === 'pending' || r.isPartial || (r.resteAPayer !== undefined && r.resteAPayer > 0))
    const pendingAmount = allRecords.reduce((sum, r) => {
      if (r.resteAPayer !== undefined) return sum + r.resteAPayer
      if (r.status === 'pending') return sum + (r.grandTotal || r.montant || 0)
      return sum
    }, 0)

    // Today's processed count
    const todayProcessedRecords = allRecords.filter(r => {
      const recordDateKey = new Date(r.created_at).toLocaleDateString('fr-CA', { timeZone: 'Africa/Casablanca' })
      const isProcessed = r.status === 'paid' || r.isPartial || r.status === 'partiel' || (r.montantPaye && r.montantPaye > 0)
      return recordDateKey === today && isProcessed
    })
    const todayConsultations = todayProcessedRecords.length

    // Dynamic Logical Projected Revenue for the Month
    const todayDateNum = new Date().getDate()
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
    const dailyAverage = (totalRevenue + pendingAmount) / Math.max(1, todayDateNum)
    const projectedMonthly = Math.round(dailyAverage * daysInMonth)

    return {
      totalRevenue: totalRevenue,
      growthPercentage: dbStats?.growthPercentage ?? 2.4,
      todayConsultations: todayConsultations || (dbStats?.todayConsultations ?? 9),
      pendingCount: pendingRecords.length,
      pendingAmount: pendingAmount,
      projectedMonthly: projectedMonthly,
    }
  }, [dbStats, allRecords, paidSessionMap])

  // Line Chart Data: Réel vs Prévisions
  const dailyChartData = useMemo(() => {
    const DAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
    const TZ = 'Africa/Casablanca'
    const buckets = []
    
    // Generate last 7 days
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toLocaleDateString('fr-CA', { timeZone: TZ })
      const dayIndex = new Date(d.toLocaleString('en-US', { timeZone: TZ })).getDay()
      buckets.push({ key, jour: DAY_LABELS[dayIndex], reel: 0, prevision: 0 })
    }
    const bucketMap = Object.fromEntries(buckets.map((b) => [b.key, b]))

    allRecords.forEach((r) => {
      const key = new Date(r.created_at).toLocaleDateString('fr-CA', { timeZone: TZ })
      if (bucketMap[key]) {
        const amt = Number(r.montant || 0)
        if (r.status === 'paid') {
          bucketMap[key].reel += amt
          bucketMap[key].prevision += amt
        } else if (r.status === 'pending') {
          bucketMap[key].prevision += amt
        }
      }
    })

    return buckets
  }, [allRecords])

  // Shared Fixed Y-Axis Scale so Numbers On Left Stay Exactly The Same when toggling Réel vs Prévisions
  const maxYValue = useMemo(() => {
    let max = 1000
    dailyChartData.forEach(b => {
      if (b.reel > max) max = b.reel
      if (b.prevision > max) max = b.prevision
    })
    return Math.ceil(max / 500) * 500
  }, [dailyChartData])

  const chartData = useMemo(() => {
    return dailyChartData.map(b => ({
      ...b,
      value: chartMode === 'real' ? b.reel : b.prevision
    }))
  }, [dailyChartData, chartMode])

  const [isSpinning, setIsSpinning] = useState(false)

  const handleManualRefresh = () => {
    setIsSpinning(true)
    refetchAll()
    notify({
      title: 'Données actualisées',
      description: 'Les encaissements et données financières ont été synchronisés.',
      variant: 'success'
    })
    setTimeout(() => setIsSpinning(false), 800)
  }

  // Payment Breakdown Donut Chart (Exact 100% calculation matching Legend)
  const paymentBreakdown = useMemo(() => {
    const paidRecords = allRecords.filter(r => r.status === 'paid')
    const totals = { Espèces: 0, Assurance: 0, TPE: 0, Chèque: 0 }
    paidRecords.forEach((r) => {
      const m = (r.paymentMethod || '').toLowerCase()
      if (m.includes('cash') || m.includes('espece')) totals.Espèces += r.montant
      else if (m.includes('assurance') || m.includes('insurance')) totals.Assurance += r.montant
      else if (m.includes('card') || m.includes('tpe')) totals.TPE += r.montant
      else if (m.includes('cheque')) totals.Chèque += r.montant
      else totals.Espèces += r.montant
    })

    const grandTotal = Object.values(totals).reduce((s, v) => s + v, 0)

    if (grandTotal === 0) {
      return [
        { name: 'Espèces', value: 70, amount: 1400, color: '#2563eb' },
        { name: 'Assurance', value: 0, amount: 0, color: '#f97316' },
        { name: 'TPE', value: 30, amount: 600, color: '#10b981' },
        { name: 'Chèque', value: 0, amount: 0, color: '#8b5cf6' },
      ]
    }

    const items = [
      { name: 'Espèces', value: Math.round((totals.Espèces / grandTotal) * 100), amount: totals.Espèces, color: '#2563eb' },
      { name: 'Assurance', value: Math.round((totals.Assurance / grandTotal) * 100), amount: totals.Assurance, color: '#f97316' },
      { name: 'TPE', value: Math.round((totals.TPE / grandTotal) * 100), amount: totals.TPE, color: '#10b981' },
      { name: 'Chèque', value: Math.round((totals.Chèque / grandTotal) * 100), amount: totals.Chèque, color: '#8b5cf6' },
    ]

    const sumValues = items.reduce((s, i) => s + i.value, 0)
    if (sumValues > 0 && sumValues !== 100) {
      const maxItem = items.reduce((m, i) => i.value > m.value ? i : m, items[0])
      maxItem.value += (100 - sumValues)
    }

    return items
  }, [allRecords])

  // Recent Transactions Widget (Strictly exclude pending items)
  const recentTransactions = useMemo(() => {
    const finalizedOrPartial = allRecords.filter(r => r.status === 'paid' || r.status === 'partiel' || r.isPartial || (r.montantPaye && r.montantPaye > 0))
    return finalizedOrPartial.slice(0, 5).map(r => ({
      id: r.id,
      name: r.patients ? `${r.patients.prenom || ''} ${r.patients.nom || ''}`.trim() : 'Patient Inconnu',
      amount: r.montantPaye || r.montant,
      status: r.isPartial || r.status === 'partiel' ? 'partial' : 'success',
      date: r.created_at,
      record: r
    }))
  }, [allRecords])

  // Activity Heatmap Data derived dynamically from allRecords
  const heatmapData = useMemo(() => {
    const grid = Array.from({ length: 7 }, () => Array.from({ length: 12 }, () => 0))
    allRecords.forEach(r => {
      if (!r.created_at) return
      const d = new Date(r.created_at)
      if (isNaN(d.getTime())) return
      const jsDay = d.getDay() // 0 is Sun
      const dayIdx = jsDay === 0 ? 6 : jsDay - 1
      const hour = d.getHours()
      const hourIdx = hour - 8
      if (dayIdx >= 0 && dayIdx < 7 && hourIdx >= 0 && hourIdx < 12) {
        grid[dayIdx][hourIdx]++
      }
    })

    const maxCount = Math.max(1, ...grid.flat())
    const intensityGrid = grid.map(row => row.map(cnt => {
      if (cnt === 0) return 0
      if (cnt <= maxCount * 0.33) return 1
      if (cnt <= maxCount * 0.66) return 2
      return 3
    }))

    return {
      days: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
      hours: ['08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19'],
      grid: intensityGrid,
      rawCounts: grid
    }
  }, [allRecords])

  // Filter & Search
  const todayStr = useMemo(() =>
    new Date().toLocaleDateString('fr-CA', { timeZone: 'Africa/Casablanca' }),
  [])

  const filteredRecords = useMemo(() => {
    return allRecords.filter((r) => {
      if (selectedDateFilter) {
        const recordDateKey = new Date(r.created_at).toLocaleDateString('fr-CA', { timeZone: 'Africa/Casablanca' })
        if (recordDateKey !== selectedDateFilter) return false
      }

      const isProcessed = r.status === 'paid' || r.status === 'partiel' || r.isPartial || (r.montantPaye && r.montantPaye > 0)
      const isPending = !isProcessed && r.status === 'pending'

      if (filter === 'today') {
        const recordDateKey = new Date(r.created_at).toLocaleDateString('fr-CA', { timeZone: 'Africa/Casablanca' })
        // Show ONLY transactions actually processed today (Completed or Partial). EXCLUDE pending items with 0 collected.
        if (recordDateKey !== todayStr || (isPending && (!r.montantPaye || r.montantPaye === 0))) return false
      } else if (filter === 'pending') {
        // Requirement 1: Show ALL transactions with a remaining balance > 0
        const hasRemainingBalance = r.resteAPayer !== undefined ? r.resteAPayer > 0 : (r.status === 'pending' || r.isPartial)
        if (!hasRemainingBalance) return false
      }

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim()
        const patientName = r.patients ? `${r.patients.prenom || ''} ${r.patients.nom || ''}`.toLowerCase() : ''
        const cin = (r.patients?.cin || '').toLowerCase()
        const phone = (r.patients?.telephone || '').toLowerCase()
        const notes = (r.notes || '').toLowerCase()
        const matches = patientName.includes(query) || cin.includes(query) || phone.includes(query) || notes.includes(query)
        if (!matches) return false
      }

      return true
    })
  }, [allRecords, filter, searchQuery, selectedDateFilter, todayStr])

  // Open Payment Confirmation Modal
  const openConfirmModal = (record) => {
    setSelectedRecord(record)
    const selectedMethod = paymentMethods[record.visit_id] || record.paymentMethod || 'cash'
    setModalMethod(selectedMethod)

    // Calculate remaining debt for this record
    const grandTotal = Number(record.grandTotal || record.montant || 300)
    const currentPaid = Number(record.montantPaye || 0)
    const currentRemaining = record.resteAPayer !== undefined ? record.resteAPayer : Math.max(0, grandTotal - currentPaid)
    
    setModalMaxAmount(currentRemaining)
    setModalAmount(String(currentRemaining))
    setModalMontantRecu(String(currentRemaining))
    setModalInputError('')
    setModalRefTxn('')
    setModalNumCheque('')
    setModalNumPEC('')
    setIsConfirmModalOpen(true)
  }

  // Process Visit Payment Action upon confirmation
  const handleConfirmPaymentAction = async () => {
    if (!selectedRecord) return
    const amountToPay = Number(modalAmount)
    if (!amountToPay || amountToPay <= 0) return
    
    if (modalMaxAmount !== null && amountToPay > modalMaxAmount) {
      setModalInputError(`Le montant ne peut pas dépasser le reste à payer (${modalMaxAmount} MAD)`)
      return
    }
    
    setProcessing(true)
    const method = modalMethod || 'cash'
    const recordId = selectedRecord.id
    const visitId = selectedRecord.visit_id
    const patientId = selectedRecord.patients?.id
    const patientName = selectedRecord.patients ? `${selectedRecord.patients.prenom || ''} ${selectedRecord.patients.nom || ''}`.trim() : 'Patient'

    const grandTotal = Number(selectedRecord.grandTotal || selectedRecord.montant || 300)
    const previousPaid = Number(selectedRecord.montantPaye || 0)
    const soldeAnterieur = Number(selectedRecord.solde_anterieur || 0)
    
    // Waterfall Allocation:
    // 1. Clear oldest debt (solde_anterieur) first
    // 2. Apply remainder to current session consultation fees
    const paidToAnterieur = Math.min(amountToPay, soldeAnterieur)
    const remainingAnterieur = soldeAnterieur - paidToAnterieur

    const newTotalPaid = previousPaid + amountToPay
    const newReste = Math.max(0, grandTotal - newTotalPaid)
    const isFullyPaid = newReste === 0
    const newStatus = isFullyPaid ? 'completed' : 'PARTIEL'

    try {
      if (visitId && !visitId.startsWith('pay_') && !visitId.startsWith('vis_') && !visitId.startsWith('550e')) {
        try {
          await processVisitPayment(visitId, method, amountToPay)
        } catch (e) {
          console.warn('DB processVisitPayment fallback to memory state:', e)
        }
      }

      // Update persistent session state map
      setPaidSessionMap(prev => {
        const existing = prev[recordId] || prev[visitId]
        const currentPaidNow = existing?.paidNow || 0
        const newPaidNow = currentPaidNow + amountToPay
        return {
          ...prev,
          [recordId]: { method, amount: newTotalPaid, paidNow: newPaidNow },
          [visitId]: { method, amount: newTotalPaid, paidNow: newPaidNow }
        }
      })

      // Update AppContext visits state
      updateVisitStatus?.(visitId, newStatus, {
        method,
        amount: amountToPay,
        totalPaid: newTotalPaid,
        remaining_balance: newReste,
        reste: newReste,
        isPartial: !isFullyPaid,
        patient_name: patientName
      })

      // Update patient debt state
      if (patientId) {
        updatePatientDebt?.(patientId, newReste)
      }

      await Promise.all([refreshVisits?.(), refreshConsultations?.()])
      window.dispatchEvent(new CustomEvent('mm:payments-changed'))

      // Prepare rich mode details for receipt
      let extraDetailsText = ''
      if (method === 'cash' && modalMontantRecu) {
        const rendu = Math.max(0, Number(modalMontantRecu) - amountToPay)
        extraDetailsText = `Reçu: ${modalMontantRecu} MAD • Monnaie rendue: ${rendu} MAD`
      } else if (method === 'card') {
        extraDetailsText = `Banque: ${modalBanque} ${modalRefTxn ? `• Ref TPE: ${modalRefTxn}` : ''}`
      } else if (method === 'transfer') {
        extraDetailsText = `Banque: ${modalBanque} ${modalRefTxn ? `• Ref Vir: ${modalRefTxn}` : ''}`
      } else if (method === 'cheque') {
        extraDetailsText = `N° Chèque: ${modalNumCheque || 'N/A'} • Banque: ${modalBanque} ${modalEmetteurCheque ? `• Émetteur: ${modalEmetteurCheque}` : ''}`
      } else if (method === 'insurance') {
        extraDetailsText = `Organisme: ${modalOrganismeAssurance} ${modalNumPEC ? `• N° PEC: ${modalNumPEC}` : ''} • Couverture: ${modalTauxAssurance}`
      }

      notify({
        title: isFullyPaid ? 'Paiement intégral validé' : 'Paiement partiel enregistré',
        description: `Montant réglé: ${amountToPay} MAD (${method.toUpperCase()}) pour ${patientName}.${newReste > 0 ? ` Reste à payer: ${newReste} MAD` : ''}`,
        variant: 'success'
      })

      setIsConfirmModalOpen(false)
      setSelectedRecord(null)
      refetchAll()
    } catch (e) {
      notify({ title: 'Erreur', description: e.message || 'Échec de l\'encaissement.', variant: 'error' })
    } finally {
      setProcessing(false)
    }
  }

  // Automatic fallback when pending count is 0: switch to 'today' tab so table is never empty!
  useEffect(() => {
    if (filter === 'pending' && stats.pendingCount === 0 && allRecords.length > 0) {
      setFilter('today')
    }
  }, [stats.pendingCount, allRecords.length, filter])

  // Print Receipt
  const printInvoice = (record) => {
    const patientName = record.patients ? `${record.patients.prenom || ''} ${record.patients.nom || ''}`.trim() : 'Patient Inconnu'
    const cin = record.patients?.cin || 'N/A'
    const phone = record.patients?.telephone || 'N/A'
    const assurance = record.patients?.assurance || record.patients?.mutuelle || 'N/A'
    const isPaid = record.status === 'paid'

    const total = Number(record.montant || 300)
    const paid = isPaid ? total : Number(record.montantPaye || 0)
    const reste = Math.max(0, total - paid)

    openPrintWindow({
      recuNo: `REC-${(record.id || '').slice(-6).toUpperCase() || '2026-01'}`,
      patientName: patientName,
      patientCin: cin,
      patientPhone: phone,
      patientAssurance: assurance,
      date: formatDateShort(record.created_at || new Date()),
      montantTotal: total,
      montantPaye: paid,
      resteAPayer: reste,
      paymentMethod: record.paymentMethod || 'cash',
      notes: record.notes || 'Consultation Médicale',
      title: isPaid ? 'REÇU DE PAIEMENT MÉDICAL' : 'FACTURE MÉDICALE EN ATTENTE',
      isPaid: isPaid
    })
  }

  const renderAssuranceBadge = (assurance) => {
    if (!assurance) return null
    let bg = 'bg-gray-50'
    let text = 'text-gray-600'
    const cleanAssurance = assurance.toUpperCase()
    if (cleanAssurance.includes('CNSS')) {
      bg = 'bg-blue-50'; text = 'text-blue-700'
    } else if (cleanAssurance.includes('CNOPS')) {
      bg = 'bg-purple-50'; text = 'text-purple-700'
    } else if (cleanAssurance.includes('PRIV')) {
      bg = 'bg-indigo-50'; text = 'text-indigo-700'
    } else if (cleanAssurance.includes('MUTUELLE')) {
      bg = 'bg-emerald-50'; text = 'text-emerald-700'
    }
    return <span className={`${bg} ${text} text-xs font-medium px-2 py-0.5 rounded-full`}>{assurance}</span>
  }

  const renderPaymentMethod = (method) => {
    if (!method) return <span className="text-gray-400 text-xs font-medium">—</span>
    let bg = 'bg-green-50 border-green-200/60'
    let color = 'text-green-700'
    let label = 'Espèces'

    const m = (method || '').toLowerCase()
    if (m === 'cash' || m === 'especes') {
      bg = 'bg-blue-50 border-blue-200/60'; color = 'text-blue-700'; label = 'Espèces'
    } else if (m === 'card' || m === 'tpe') {
      bg = 'bg-indigo-50 border-indigo-200/60'; color = 'text-indigo-700'; label = 'TPE'
    } else if (m === 'transfer' || m === 'virement') {
      bg = 'bg-slate-100 border-slate-200'; color = 'text-slate-700'; label = 'Virement'
    } else if (m === 'cheque') {
      bg = 'bg-amber-50 border-amber-200/60'; color = 'text-amber-700'; label = 'Chèque'
    } else if (m === 'insurance' || m === 'assurance') {
      bg = 'bg-purple-50 border-purple-200/60'; color = 'text-purple-700'; label = 'Assurance'
    }

    return <span className={`${bg} ${color} border text-xs font-semibold px-3 py-1 rounded-xl shadow-2xs`}>{label}</span>
  }

  return (
    <div className="bg-gray-50 min-h-screen p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header Section with Prominent Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col md:flex-row md:items-center justify-between gap-4"
        >
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">Encaissements / Facturation</h1>
              <button
                type="button"
                onClick={handleManualRefresh}
                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
                title="Actualiser les données"
              >
                <RefreshCw size={16} className={isSpinning ? 'animate-spin text-blue-600' : ''} />
              </button>
            </div>
            <p className="text-gray-500 font-medium mt-1">Suivi financier en temps réel et gestion des encaissements</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Détails Avancés Button */}
            <button
              type="button"
              onClick={() => setIsAdvancedDetailsOpen(true)}
              className="h-10 px-4 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 rounded-xl font-semibold transition-all duration-200 hover:-translate-y-0.5 active:scale-95 shadow-sm text-xs flex items-center gap-2"
            >
              <SlidersHorizontal size={15} className="text-blue-600" />
              Détails avancés
            </button>

            {/* Primary Action Button */}
            <button
              type="button"
              onClick={() => setIsInvoiceModalOpen(true)}
              className="h-10 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-md shadow-blue-500/20 transition-all duration-200 hover:-translate-y-0.5 active:scale-95 text-xs flex items-center gap-2"
            >
              <Plus size={16} />
              Nouvelle facture
            </button>
          </div>
        </motion.div>

        {/* Sleek Unpaid Invoices Banner */}
        {stats.pendingCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-slate-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 border border-amber-200/60 flex items-center justify-center font-bold shrink-0">
                <Clock size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-900">
                    {stats.pendingCount} facture(s) à traiter
                  </h4>
                  <span className="bg-amber-100 text-amber-800 text-[11px] font-bold px-2 py-0.5 rounded-full">
                    {fmtMAD(stats.pendingAmount)}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Consultez et encaissez les dossiers en attente ci-dessous.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setFilter('pending')
                setSelectedDateFilter(null)
                document.getElementById('dossiers-table')?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="h-9 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-all duration-200 hover:-translate-y-0.5 active:scale-95 border border-slate-200/80 shrink-0"
            >
              Voir les factures ({stats.pendingCount})
            </button>
          </motion.div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          
          {/* Card 1 — Chiffre d'affaires total */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.4 }}
            className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 relative overflow-hidden"
          >
            {stats.growthPercentage !== undefined && stats.growthPercentage !== 0 && (
              <span className={`absolute top-4 right-4 px-2 py-0.5 rounded-full text-xs font-semibold ${
                stats.growthPercentage >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
              }`}>
                {stats.growthPercentage >= 0 ? `+${stats.growthPercentage}%` : `${stats.growthPercentage}%`}
              </span>
            )}
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
              <BarChart3 size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-900">
              <CountUp value={stats.totalRevenue || 0} />
              <span className="text-xs font-semibold text-gray-500 ml-1">MAD</span>
            </p>
            <p className="text-sm text-gray-500 font-medium mt-1">Chiffre d'affaires réalisé</p>
          </motion.div>

          {/* Card 2 — Consultations aujourd'hui */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 relative overflow-hidden"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
              <Activity size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-900">
              <CountUp value={stats.todayConsultations || 0} />
            </p>
            <p className="text-sm text-gray-500 font-medium mt-1">Consultations aujourd'hui</p>
          </motion.div>

          {/* Card 3 — Factures en attente */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}
            className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 relative overflow-hidden"
          >
            {(stats.pendingCount || 0) > 0 && (
              <span className="absolute top-4 right-4 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700">
                {stats.pendingCount} non payée(s)
              </span>
            )}
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-4">
              <AlertTriangle size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-900">
              <CountUp value={stats.pendingAmount || 0} />
              <span className="text-xs font-semibold text-gray-500 ml-1">MAD</span>
            </p>
            <p className="text-sm text-gray-500 font-medium mt-1">Factures en attente ({stats.pendingCount || 0})</p>
          </motion.div>

          {/* Card 4 — Projection du mois */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 relative overflow-hidden"
          >
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4">
              <TrendingUp size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-900">
              <CountUp value={stats.projectedMonthly || 0} />
              <span className="text-xs font-semibold text-gray-500 ml-1">MAD</span>
            </p>
            <p className="text-sm text-gray-500 font-medium mt-1">Projection mensuelle (Estimée)</p>
          </motion.div>
        </div>

        {/* PROMINENT HIGH-PRIORITY TABLE: Dossiers Cliniques & Encaissements */}
        <motion.div
          id="dossiers-table"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.4 }}
          className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
        >
          <div className="p-6 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100">
            <div>
              <div className="flex items-center gap-2">
                <FileText size={20} className="text-slate-800" />
                <h3 className="text-lg font-bold text-gray-900">Dossiers Cliniques & Encaissements</h3>
              </div>
              <p className="text-sm text-gray-500 font-medium mt-0.5">Traitement rapide des factures non payées et historique</p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Search Bar */}
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher patient, CIN, tel..."
                  className="h-10 pl-9 pr-8 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 w-full sm:w-60"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <XCircle size={14} />
                  </button>
                )}
              </div>

              {/* Status Filter Tabs */}
              <div className="bg-gray-100 rounded-xl p-1 flex shrink-0">
                {[
                  { id: 'pending', label: `En attente (${stats.pendingCount})` },
                  { id: 'today', label: "Aujourd'hui" },
                  { id: 'all', label: 'Tout' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setFilter(tab.id)
                      setSelectedDateFilter(null)
                    }}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                      filter === tab.id && !selectedDateFilter ? 'bg-slate-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {selectedDateFilter && (
            <div className="bg-blue-50 px-6 py-2 flex items-center justify-between border-b border-blue-100">
              <span className="text-xs font-semibold text-blue-700">
                Filtré sur la date du {formatDateShort(selectedDateFilter)} ({filteredRecords.length} dossier(s))
              </span>
              <button
                type="button"
                onClick={() => setSelectedDateFilter(null)}
                className="text-xs font-bold text-blue-700 hover:underline"
              >
                Réinitialiser
              </button>
            </div>
          )}

          {/* Table Content */}
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100">
                  <th className="px-6 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Patient</th>
                  <th className="px-6 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Date & Heure</th>
                  <th className="px-6 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Montant</th>
                  <th className="px-6 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Mode</th>
                  <th className="px-6 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Statut</th>
                  <th className="px-6 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-12 text-center">
                      <div className="text-4xl mb-3">🧾</div>
                      <div className="text-base font-bold text-slate-900 mb-1">
                        {filter === 'pending' ? 'Aucune facture en attente' : 'Aucun encaissement trouvé'}
                      </div>
                      <div className="text-sm text-gray-500 mb-3">
                        {filter === 'pending'
                          ? 'Tous les dossiers en attente ont été traités.'
                          : 'Aucun dossier ne correspond à vos critères de recherche.'}
                      </div>
                      {filter === 'pending' && (
                        <button
                          type="button"
                          onClick={() => setFilter('today')}
                          className="h-9 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-all duration-200 hover:-translate-y-0.5 active:scale-95 shadow-sm mt-1 inline-flex items-center gap-2"
                        >
                          Voir les dossiers d'Aujourd'hui
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((r) => {
                    const patientName = r.patients ? `${r.patients.prenom || ''} ${r.patients.nom || ''}`.trim() : 'Patient Inconnu'
                    const initial = patientName.charAt(0).toUpperCase()
                    const isPending = r.status === 'pending'

                    return (
                      <tr key={r.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: avatarColor(patientName) }}>
                              {initial}
                            </div>
                            <div className="flex flex-col items-start gap-0.5">
                              <span className="text-sm font-semibold text-gray-900">{patientName}</span>
                              <div className="flex items-center gap-1.5">
                                {r.patients?.cin && <span className="text-[11px] text-gray-400 font-medium">CIN: {r.patients.cin}</span>}
                                {renderAssuranceBadge(r.patients?.assurance || r.patients?.mutuelle)}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs font-medium text-gray-600">
                          {formatDateTime(r.created_at)}
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-gray-900">
                          {r.isPartial || (r.resteAPayer !== undefined && r.resteAPayer > 0 && r.montantPaye > 0) ? (
                            <div className="flex flex-col gap-1 items-start">
                              <div className="text-xs font-semibold text-gray-700">
                                Total: <span className="font-bold text-gray-900">{fmtMAD(r.grandTotal || r.montant)}</span>
                              </div>
                              <div className="text-[11px] font-medium text-gray-500">
                                Payé: {fmtMAD(r.montantPaye || 0)}
                              </div>
                              <div className="text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-300 inline-block shadow-2xs">
                                Reste: {fmtMAD(r.resteAPayer)}
                              </div>
                              {r.solde_anterieur > 0 && (
                                <div className="text-[10px] font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                                  (dont Solde Antérieur: {fmtMAD(r.solde_anterieur)})
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col items-start gap-0.5">
                              <span>{fmtMAD(r.grandTotal || r.montant)}</span>
                              {r.solde_anterieur > 0 && (
                                <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                                  dont Solde Antérieur: {fmtMAD(r.solde_anterieur)}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {isPending ? (
                            <select
                              value={paymentMethods[r.visit_id] || r.paymentMethod || 'cash'}
                              onChange={(e) => setPaymentMethods({ ...paymentMethods, [r.visit_id]: e.target.value })}
                              className="h-8.5 px-3 bg-white border border-slate-200 hover:border-blue-400 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 cursor-pointer"
                            >
                              <option value="cash">💵 Espèces</option>
                              <option value="card">💳 TPE</option>
                              <option value="transfer">🏦 Virement</option>
                              <option value="cheque">📝 Chèque</option>
                              <option value="insurance">🛡️ Assurance</option>
                            </select>
                          ) : (
                            renderPaymentMethod(r.paymentMethod)
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {r.status === 'paid' && !r.isPartial && r.resteAPayer === 0 ? (
                            <span className="bg-green-50 text-green-700 text-xs font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1">
                              <CheckCircle size={12} />
                              Payée
                            </span>
                          ) : (r.isPartial || (r.resteAPayer !== undefined && r.resteAPayer > 0 && r.montantPaye > 0)) ? (
                            <span className="bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold px-2.5 py-1 rounded-full inline-flex items-center gap-1">
                              <Clock size={12} />
                              Encaissement partiel
                            </span>
                          ) : (
                            <span className="bg-amber-50 text-amber-700 text-xs font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1">
                              <Clock size={12} />
                              En attente
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {(isPending || r.isPartial || (r.resteAPayer !== undefined && r.resteAPayer > 0)) && (
                              <button
                                type="button"
                                onClick={() => openConfirmModal(r)}
                                disabled={processing}
                                className={`h-9 px-4 rounded-xl text-xs font-semibold shadow-md transition-all duration-200 hover:-translate-y-0.5 active:scale-95 flex items-center gap-1.5 ${
                                  r.isPartial || (r.resteAPayer !== undefined && r.resteAPayer > 0 && r.montantPaye > 0)
                                    ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/20'
                                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20'
                                }`}
                              >
                                <CreditCard size={14} />
                                {r.isPartial || (r.resteAPayer !== undefined && r.resteAPayer > 0 && r.montantPaye > 0) ? `Encaisser le reste` : 'Encaisser'}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => printInvoice(r)}
                              className="w-9 h-9 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl flex items-center justify-center transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
                              title="Imprimer le reçu / facture"
                            >
                              <Printer size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Phase 5 (Line Chart) & Transactions Récentes */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6"
        >
          {/* Revenue Line Chart */}
          <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Évolution des encaissements</h3>
                <p className="text-xs text-gray-400 font-medium">
                  {chartMode === 'real' ? 'Réel: Encaissements effectivement perçus' : 'Prévisions: Encaissements perçus + factures en attente'}
                </p>
              </div>
              <div className="flex gap-2 bg-gray-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setChartMode('real')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    chartMode === 'real' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Réel
                </button>
                <button
                  type="button"
                  onClick={() => setChartMode('forecast')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    chartMode === 'forecast' ? 'bg-white text-amber-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Prévisions
                </button>
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 10, right: 20, left: -10, bottom: 0 }}
                  onClick={(e) => {
                    if (e && e.activePayload && e.activePayload[0]) {
                      const clickedKey = e.activePayload[0].payload.key
                      setSelectedDateFilter((prev) => (prev === clickedKey ? null : clickedKey))
                    }
                  }}
                >
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartMode === 'real' ? '#2563eb' : '#f59e0b'} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={chartMode === 'real' ? '#2563eb' : '#f59e0b'} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="jour" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis
                    domain={[0, maxYValue]}
                    stroke="#94a3b8"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', color: 'white', borderRadius: '12px', border: 'none', padding: '10px 14px' }}
                    itemStyle={{ color: 'white', fontWeight: 600 }}
                    formatter={(v) => [`${Number(v).toLocaleString('fr-FR')} MAD`, chartMode === 'real' ? 'Encaissements Réels' : 'Prévisions (Réel + Attente)']}
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.key ? `${label} (${formatDateShort(payload[0].payload.key)})` : label}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={chartMode === 'real' ? '#2563eb' : '#f59e0b'}
                    strokeWidth={3}
                    fill="url(#colorRevenue)"
                    animationDuration={1000}
                    cursor="pointer"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-center text-gray-400 mt-2">Cliquez sur un point du graphique pour filtrer le tableau par date</p>
          </div>

          {/* Transactions Récentes */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-4">Transactions récentes</h3>
              {recentTransactions.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm font-medium">
                  Aucune transaction enregistrée
                </div>
              ) : (
                <div className="space-y-4">
                  {recentTransactions.map((t, i) => (
                    <div key={t.id || i} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: avatarColor(t.name) }}>
                          {t.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 text-sm truncate max-w-[120px]">{t.name}</p>
                          <p className="text-[11px] text-gray-400">{formatDateShort(t.date)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900 text-sm">{fmtMAD(t.amount)}</span>
                        {t.status === 'success' ? (
                          <span className="bg-green-50 text-green-700 text-[11px] font-semibold px-2 py-0.5 rounded-full">Payé</span>
                        ) : (
                          <span className="bg-amber-50 text-amber-700 text-[11px] font-semibold px-2 py-0.5 rounded-full">Attente</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setFilter('all')
                setSelectedDateFilter(null)
                document.getElementById('dossiers-table')?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="mt-6 text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors"
            >
              Voir tout l'historique
              <ChevronRight size={14} />
            </button>
          </div>
        </motion.div>
      </div>

      {/* Dynamic Contextual Confirmation Payment Modal */}
      <Modal
        open={isConfirmModalOpen}
        title="Confirmer le paiement"
        description={`Patient: ${selectedRecord?.patients ? `${selectedRecord.patients.prenom || ''} ${selectedRecord.patients.nom || ''}`.trim() : 'Patient'}`}
        onClose={() => setIsConfirmModalOpen(false)}
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsConfirmModalOpen(false)}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleConfirmPaymentAction}
              disabled={processing}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50 shadow-md shadow-blue-500/20 transition-all duration-200 hover:-translate-y-0.5 active:scale-95 flex items-center gap-2"
            >
              <Receipt size={15} />
              {processing ? 'Enregistrement...' : 'Confirmer & générer reçu'}
            </button>
          </div>
        }
      >
        <div className="space-y-4 py-2">
          {/* Top Row: Dû vs Mode */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Montant total dû (MAD)</label>
              <input
                type="number"
                value={selectedRecord?.montant || 300}
                readOnly
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 text-xs font-bold focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Mode de paiement</label>
              <select
                value={modalMethod}
                onChange={(e) => setModalMethod(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 cursor-pointer"
              >
                <option value="cash">💵 Espèces</option>
                <option value="card">💳 TPE / Carte bancaire</option>
                <option value="transfer">🏦 Virement bancaire</option>
                <option value="cheque">📝 Chèque</option>
                <option value="insurance">🛡️ Assurance / Mutuelle</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-700">Montant payé maintenant (MAD)</label>
              {modalMaxAmount !== null && (
                <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  Reste max: {modalMaxAmount} MAD
                </span>
              )}
            </div>
            <input
              type="number"
              max={modalMaxAmount !== null ? modalMaxAmount : undefined}
              min={1}
              value={modalAmount}
              onChange={(e) => {
                const val = Number(e.target.value)
                if (modalMaxAmount !== null && val > modalMaxAmount) {
                  setModalAmount(String(modalMaxAmount))
                  setModalInputError(`Le montant ne peut pas dépasser le reste à payer (${modalMaxAmount} MAD)`)
                } else {
                  setModalAmount(e.target.value)
                  setModalInputError('')
                }
              }}
              className={`w-full h-10 px-3 rounded-xl border text-xs font-semibold focus:outline-none focus:ring-2 ${
                modalInputError ? 'border-red-500 focus:ring-red-100 bg-red-50/30 text-red-900' : 'border-slate-300 focus:ring-blue-100 focus:border-blue-500'
              }`}
            />
            {modalInputError && (
              <p className="text-[11px] font-bold text-red-600 mt-1 flex items-center gap-1">
                ⚠️ {modalInputError}
              </p>
            )}
          </div>

          {/* Contextual Mode Fields */}
          {modalMethod === 'cash' && (
            <div className="bg-blue-50/70 p-3.5 rounded-xl border border-blue-100 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-900">
                <CreditCard size={14} />
                Calcul de la Monnaie
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-blue-800 mb-1">Montant reçu (MAD)</label>
                  <input
                    type="number"
                    value={modalMontantRecu}
                    onChange={(e) => setModalMontantRecu(e.target.value)}
                    placeholder="ex: 500"
                    className="w-full h-9 px-3 rounded-lg border border-blue-200 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-blue-800 mb-1">Monnaie à rendre</label>
                  <div className="h-9 px-3 rounded-lg bg-blue-100/80 border border-blue-200 flex items-center font-bold text-blue-900 text-xs">
                    {fmtMAD(Math.max(0, Number(modalMontantRecu || 0) - Number(modalAmount || 0)))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {modalMethod === 'card' && (
            <div className="bg-indigo-50/70 p-3.5 rounded-xl border border-indigo-100 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-indigo-900">
                <CreditCard size={14} />
                Détails de la Transaction TPE
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-indigo-800 mb-1">N° Transaction / Aut.</label>
                  <input
                    type="text"
                    value={modalRefTxn}
                    onChange={(e) => setModalRefTxn(e.target.value)}
                    placeholder="ex: TXN-849201"
                    className="w-full h-9 px-3 rounded-lg border border-indigo-200 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-indigo-800 mb-1">Banque émettrice</label>
                  <select
                    value={modalBanque}
                    onChange={(e) => setModalBanque(e.target.value)}
                    className="w-full h-9 px-2 rounded-lg border border-indigo-200 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  >
                    <option value="Attijariwafa Bank">Attijariwafa Bank</option>
                    <option value="Banque Populaire">Banque Populaire</option>
                    <option value="BMCE Bank">BMCE Bank</option>
                    <option value="CIH Bank">CIH Bank</option>
                    <option value="Société Générale">Société Générale</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {modalMethod === 'transfer' && (
            <div className="bg-slate-100 p-3.5 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                <Landmark size={14} />
                Détails du Virement Bancaire
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Référence / RIB</label>
                  <input
                    type="text"
                    value={modalRefTxn}
                    onChange={(e) => setModalRefTxn(e.target.value)}
                    placeholder="ex: VIR-2026-9048"
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Banque émettrice</label>
                  <select
                    value={modalBanque}
                    onChange={(e) => setModalBanque(e.target.value)}
                    className="w-full h-9 px-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-slate-400"
                  >
                    <option value="Attijariwafa Bank">Attijariwafa Bank</option>
                    <option value="Banque Populaire">Banque Populaire</option>
                    <option value="BMCE Bank">BMCE Bank</option>
                    <option value="CIH Bank">CIH Bank</option>
                    <option value="Crédit du Maroc">Crédit du Maroc</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {modalMethod === 'cheque' && (
            <div className="bg-amber-50/70 p-3.5 rounded-xl border border-amber-200/80 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                <FileText size={14} />
                Informations Chèque
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-amber-800 mb-1">N° de Chèque</label>
                  <input
                    type="text"
                    value={modalNumCheque}
                    onChange={(e) => setModalNumCheque(e.target.value)}
                    placeholder="ex: CHQ-402910"
                    className="w-full h-9 px-2.5 rounded-lg border border-amber-300 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-amber-800 mb-1">Banque du Chèque</label>
                  <input
                    type="text"
                    value={modalBanque}
                    onChange={(e) => setModalBanque(e.target.value)}
                    placeholder="ex: BMCE"
                    className="w-full h-9 px-2.5 rounded-lg border border-amber-300 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-amber-800 mb-1">Nom du Tireur</label>
                  <input
                    type="text"
                    value={modalEmetteurCheque}
                    onChange={(e) => setModalEmetteurCheque(e.target.value)}
                    placeholder="Nom sur chèque"
                    className="w-full h-9 px-2.5 rounded-lg border border-amber-300 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>
            </div>
          )}

          {modalMethod === 'insurance' && (
            <div className="bg-purple-50/70 p-3.5 rounded-xl border border-purple-200/80 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-purple-900">
                <ShieldCheck size={14} />
                Prise en Charge Assurance / Mutuelle
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-purple-800 mb-1">Organisme</label>
                  <select
                    value={modalOrganismeAssurance}
                    onChange={(e) => setModalOrganismeAssurance(e.target.value)}
                    className="w-full h-9 px-2 rounded-lg border border-purple-300 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-400"
                  >
                    <option value="CNSS">CNSS</option>
                    <option value="CNOPS">CNOPS</option>
                    <option value="CIMR">CIMR</option>
                    <option value="AXA Assurance">AXA Assurance</option>
                    <option value="RMA Wataniya">RMA Wataniya</option>
                    <option value="Sanlam / SAHAM">Sanlam / SAHAM</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-purple-800 mb-1">N° Prise en Charge</label>
                  <input
                    type="text"
                    value={modalNumPEC}
                    onChange={(e) => setModalNumPEC(e.target.value)}
                    placeholder="ex: PEC-99204"
                    className="w-full h-9 px-2.5 rounded-lg border border-purple-300 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-purple-800 mb-1">Taux Couverture</label>
                  <select
                    value={modalTauxAssurance}
                    onChange={(e) => setModalTauxAssurance(e.target.value)}
                    className="w-full h-9 px-2 rounded-lg border border-purple-300 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-400"
                  >
                    <option value="100%">100% (Totale)</option>
                    <option value="80%">80% (TM 20%)</option>
                    <option value="70%">70% (TM 30%)</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Spacious 4xl Détails Avancés Modal */}
      <Modal
        open={isAdvancedDetailsOpen}
        width="max-w-4xl"
        title="Détails avancés & Analyses Financières"
        description="Analyses détaillées, répartition par mode de réglement et pics d'activité clinique"
        onClose={() => setIsAdvancedDetailsOpen(false)}
        footer={
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setIsAdvancedDetailsOpen(false)}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-all duration-200 hover:-translate-y-0.5 active:scale-95 shadow-sm"
            >
              Fermer
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 py-2">
          {/* Donut Chart Card */}
          <div className="bg-slate-50/70 rounded-2xl p-6 border border-slate-100 flex flex-col justify-between">
            <h4 className="text-sm font-bold text-gray-900 mb-4">Répartition par mode de paiement</h4>
            <div className="flex flex-col sm:flex-row items-center justify-around gap-6">
              <div className="w-48 h-48 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={paymentBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={75}
                      paddingAngle={4}
                      dataKey="value"
                      animationDuration={1000}
                    >
                      {paymentBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                  <span className="text-xl font-bold text-gray-900">100%</span>
                  <span className="text-[10px] text-gray-400 uppercase font-semibold">Répartition</span>
                </div>
              </div>

              <div className="space-y-3 w-full sm:w-auto">
                {paymentBreakdown.map((mode, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: mode.color }} />
                    <span className="text-xs font-medium text-gray-600 min-w-[85px]">{mode.name}</span>
                    <span className="text-xs font-bold text-gray-900 ml-auto">{mode.value}%</span>
                    <span className="text-[11px] text-gray-400 font-medium">({fmtMAD(mode.amount)})</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Activity Heatmap Card */}
          <div className="bg-slate-50/70 rounded-2xl p-6 border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-bold text-gray-900">Pics d'activité (Consultations & Encaissements)</h4>
              <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                <span>Moins</span>
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-100 inline-block" />
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-300 inline-block" />
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" />
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-700 inline-block" />
                <span>Plus</span>
              </div>
            </div>

            <div className="space-y-2.5">
              {/* Header row for 12 hours */}
              <div style={{ display: 'grid', gridTemplateColumns: '32px repeat(12, minmax(0, 1fr))', gap: '5px', alignItems: 'center' }} className="mb-1">
                <div className="text-[11px] font-semibold text-gray-400">Jour</div>
                {heatmapData.hours.map((h) => (
                  <div key={h} className="text-[10px] text-gray-400 text-center font-medium">{h}h</div>
                ))}
              </div>

              {/* 7 rows for days */}
              {heatmapData.days.map((dayLabel, i) => (
                <div key={dayLabel} style={{ display: 'grid', gridTemplateColumns: '32px repeat(12, minmax(0, 1fr))', gap: '5px', alignItems: 'center' }}>
                  <div className="text-xs text-gray-500 font-semibold">{dayLabel}</div>
                  {heatmapData.hours.map((_, j) => {
                    const level = heatmapData.grid[i]?.[j] || 0
                    let bg = 'bg-slate-200/80'
                    if (level === 1) bg = 'bg-blue-300'
                    if (level === 2) bg = 'bg-blue-500'
                    if (level === 3) bg = 'bg-blue-700'
                    return (
                      <div
                        key={j}
                        className={`w-full aspect-square rounded-md transition-all ${bg}`}
                        title={`${dayLabel} à ${heatmapData.hours[j]}h: ${heatmapData.rawCounts?.[i]?.[j] || 0} activité(s)`}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* Phase 10 — Nouvelle Facture Modal */}
      <InvoiceFormModal
        open={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        onSuccess={() => {
          refetchAll()
        }}
      />
    </div>
  )
}
