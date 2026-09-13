import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Printer, Eye, Trash2, Search, FileSymlink, Loader2 } from 'lucide-react'
import { useMemo, useState, useEffect } from 'react'
import { AppButton, ContentCard } from '../../components/dashboard/DashboardPrimitives'
import OrdonnanceFormModal from '../../components/forms/OrdonnanceFormModal'
import { useAppContext } from '../../context/AppContext'
import { useCabinetId } from '../../hooks/useCabinetId'
import { getOrdonnances, deleteDocument } from '../../lib/api'

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Casablanca'
  })
}

function PrescriptionsPage() {
  const { notify } = useAppContext()
  const { cabinetId } = useCabinetId()
  const queryClient = useQueryClient()

  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('all') // 'all', 'week', 'month'
  
  const [printData, setPrintData] = useState(null)

  const { data: ordonnances, isLoading } = useQuery({
    queryKey: ['ordonnances', cabinetId],
    queryFn: () => getOrdonnances(cabinetId),
    enabled: !!cabinetId
  })

  const { mutate: handleDelete } = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => {
      notify({ title: 'Supprimée', description: "L'ordonnance a été retirée.", variant: 'destructive' })
      queryClient.invalidateQueries({ queryKey: ['ordonnances', cabinetId] })
    }
  })

  // Parse ordonnance JSON notes dynamically
  const parsedOrdonnances = useMemo(() => {
    if (!ordonnances) return []
    return ordonnances.map(doc => {
      let notesData = {}
      try {
        if (doc.consultations?.notes) {
          notesData = JSON.parse(doc.consultations.notes)
        }
      } catch (e) {
        // Fallback for malformed data
      }
      return {
        ...doc,
        parsedData: notesData
      }
    })
  }, [ordonnances])

  const filtered = useMemo(() => {
    return parsedOrdonnances.filter(doc => {
      const patientName = `${doc.patients?.nom || ''} ${doc.patients?.prenom || ''}`.toLowerCase()
      if (search && !patientName.includes(search.toLowerCase())) return false
      
      const docDate = new Date(doc.created_at)
      const now = new Date()
      if (dateFilter === 'week') {
        const weekAgo = new Date()
        weekAgo.setDate(now.getDate() - 7)
        if (docDate < weekAgo) return false
      } else if (dateFilter === 'month') {
        const monthAgo = new Date()
        monthAgo.setMonth(now.getMonth() - 1)
        if (docDate < monthAgo) return false
      }
      return true
    })
  }, [parsedOrdonnances, search, dateFilter])

  const stats = useMemo(() => {
    const now = new Date()
    const monthAgo = new Date()
    monthAgo.setMonth(now.getMonth() - 1)
    const weekAgo = new Date()
    weekAgo.setDate(now.getDate() - 7)

    return {
      totalMonth: parsedOrdonnances.filter(d => new Date(d.created_at) >= monthAgo).length,
      totalWeek: parsedOrdonnances.filter(d => new Date(d.created_at) >= weekAgo).length,
      lastDate: parsedOrdonnances.length > 0 ? formatDate(parsedOrdonnances[0].created_at) : '—'
    }
  }, [parsedOrdonnances])

  const handlePrint = (doc) => {
    setPrintData({
      patient: `${doc.patients?.prenom} ${doc.patients?.nom}`,
      date: formatDate(doc.consultations?.date_consult || doc.created_at),
      ville: doc.parsedData?.ville || '',
      medicaments: doc.parsedData?.medicaments || [],
      instructions: doc.parsedData?.instructions || '',
      medecin: doc.parsedData?.medecin || '',
      specialite: doc.parsedData?.specialite || '',
      adresse: doc.parsedData?.adresse || '',
      telephone: doc.parsedData?.telephone || '',
      signe: doc.parsedData?.signe || false
    })
    
    // Allow React to render the print layer, then trigger print
    setTimeout(() => {
      try {
        window.print()
      } catch (e) {
        console.warn('Window print error handled:', e)
      }
      // Optional: Clear printData after print dialog closes so it hides again
      setTimeout(() => setPrintData(null), 1000) 
    }, 100)
  }

  if (isLoading) return <div className="flex justify-center p-20"><Loader2 className="h-10 w-10 animate-spin text-blue-600" /></div>

  return (
    <div className="space-y-8 print:m-0 print:p-0">
      
      {/* --- NORMAL UI, HIDDEN ON PRINT --- */}
      <div className="print:hidden space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Ordonnances</h1>
            <p className="mt-2 text-base text-slate-500">Gérez et imprimez vos ordonnances de façon sécurisée.</p>
          </div>
          <AppButton onClick={() => setShowCreate(true)}>+ Nouvelle ordonnance</AppButton>
        </div>

        {/* Empty State */}
        {parsedOrdonnances.length === 0 && !search ? (
           <div className="rounded-[24px] bg-white py-20 text-center shadow-sm ring-1 ring-slate-100">
             <div className="mb-4 text-6xl opacity-80">📋</div>
             <h3 className="text-xl font-bold text-slate-900">Aucune ordonnance</h3>
             <p className="mt-2 text-slate-500 max-w-sm mx-auto">Créez votre première ordonnance en cliquant sur le bouton ci-dessus pour la lier à un patient.</p>
             <div className="mt-8">
               <AppButton onClick={() => setShowCreate(true)}>+ Nouvelle ordonnance</AppButton>
             </div>
           </div>
        ) : (
          <>
            {/* Stats Row */}
            <div className="grid gap-4 md:grid-cols-3">
              <ContentCard>
                <p className="text-sm font-medium text-slate-500">Ordonnances ce mois</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">{stats.totalMonth}</p>
              </ContentCard>
              <ContentCard>
                <p className="text-sm font-medium text-slate-500">Cette semaine</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">{stats.totalWeek}</p>
              </ContentCard>
              <ContentCard>
                <p className="text-sm font-medium text-slate-500">Dernière création</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">{stats.lastDate}</p>
              </ContentCard>
            </div>

            {/* Content Area */}
            <ContentCard>
              {/* Toolbar */}
              <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-6">
                <label className="flex h-12 w-full max-w-md items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 transition hover:border-slate-300 focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100">
                  <Search className="h-5 w-5 text-slate-400" />
                  <input value={search} onChange={e => setSearch(e.target.value)} type="text" placeholder="Rechercher par patient..." className="h-full w-full border-0 bg-transparent text-base text-slate-700 outline-none placeholder:text-slate-400" />
                </label>
                <select value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-medium text-slate-700 outline-none hover:border-slate-300 focus:border-blue-300">
                  <option value="all">Toutes les dates</option>
                  <option value="week">Cette semaine</option>
                  <option value="month">Ce mois</option>
                </select>
              </div>

              {/* List */}
              <div className="space-y-3">
                {filtered.map((doc) => {
                  const patientInitials = `${doc.patients?.prenom?.[0] || ''}${doc.patients?.nom?.[0] || ''}`.toUpperCase()
                  
                  return (
                    <div key={doc.id} className="group interactive flex items-center justify-between rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm hover:border-slate-200">
                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-blue-50 text-base font-bold text-blue-700">
                          {patientInitials || 'P'}
                        </div>
                        <div>
                          <p className="text-base font-semibold text-slate-900">{doc.patients?.prenom} {doc.patients?.nom}</p>
                          <div className="mt-1 flex items-center gap-3 text-sm text-slate-500">
                            <span>{formatDate(doc.created_at)}</span>
                            <span className="h-1 w-1 rounded-full bg-slate-300" />
                            <span>Dr. {doc.parsedData?.medecin?.split(' ').pop() || 'ND'}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3 opacity-0 transition-opacity group-hover:opacity-100 sm:opacity-100 border-l border-slate-100 pl-4">
                        <button type="button" onClick={() => handlePrint(doc)} title="Voir (Brouillon)" className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
                          <Eye className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => handlePrint(doc)} title="Imprimer l'ordonnance" className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700 transition">
                          <Printer className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => { if(window.confirm('Supprimer cette ordonnance définitivement ?')) handleDelete(doc.id) }} title="Supprimer" className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
                {filtered.length === 0 && search && (
                  <div className="py-10 text-center text-slate-500">Aucune ordonnance trouvée pour cette recherche.</div>
                )}
              </div>
            </ContentCard>
          </>
        )}
      </div>

      {showCreate && (
         <OrdonnanceFormModal 
           open={showCreate} 
           onClose={() => setShowCreate(false)} 
           onSuccess={() => queryClient.invalidateQueries({ queryKey: ['ordonnances'] })} 
         />
      )}

      {/* --- PRINT ONLY PDF LAYOUT --- */}
      {printData && (
        <div className="ordonnance-print hidden print:block">
          {/* Header */}
          <div className="border-b-[3px] border-slate-800 pb-4 mb-10 flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-black uppercase tracking-wide">Dr. {printData.medecin}</h1>
              <p className="text-lg text-slate-800 mt-1">{printData.specialite}</p>
            </div>
            <div className="text-right text-sm text-slate-700 leading-relaxed max-w-[250px]">
              <p>{printData.adresse}</p>
              <p className="mt-1 font-semibold">Tél: {printData.telephone}</p>
            </div>
          </div>
          
          <div className="text-center mb-12">
            <h2 className="text-3xl font-black uppercase tracking-[0.2em] border-2 border-slate-800 inline-block px-10 py-3 rounded-sm text-black">
              Ordonnance
            </h2>
          </div>

          <div className="flex justify-between items-center bg-slate-50 p-4 border border-slate-200 mb-12 rounded-lg text-lg">
            <p className="font-medium text-black">
              <span className="text-slate-500 mr-2 uppercase text-sm">Patient:</span> 
              <b>{printData.patient}</b>
            </p>
            <p className="font-medium text-black text-right">
              <span className="text-slate-500 mr-1 uppercase text-sm">Le:</span> {printData.date}
              {printData.ville && <span className="ml-4"><span className="text-slate-500 mr-1 uppercase text-sm">À:</span> {printData.ville}</span>}
            </p>
          </div>

          <div className="mb-16">
            <h3 className="text-4xl font-serif font-bold mb-8 italic text-slate-300 border-l-4 border-slate-300 pl-4">Rx</h3>
            <div className="space-y-8 pl-8">
              {printData.medicaments.map((m, i) => (
                <div key={i} className="flex gap-4 items-baseline">
                  <p className="font-bold text-base text-slate-400 w-6">{i + 1}.</p>
                  <div>
                    <p className="font-bold text-xl text-black">{m.nom}</p>
                    <p className="text-lg text-slate-800 mt-1">
                      {m.posologie} 
                      {m.duree ? <span className="font-medium"> &nbsp;&mdash;&nbsp; {m.duree}</span> : null}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {printData.instructions && (
            <div className="mt-12 pt-6 border-t border-dashed border-slate-300">
               <strong className="block mb-2 uppercase text-sm text-slate-500 tracking-wider">Instructions supplémentaires</strong>
               <p className="whitespace-pre-wrap text-lg text-black leading-relaxed">{printData.instructions}</p>
            </div>
          )}

          <div className="flex justify-end mt-24">
            <div className="text-center border-t border-slate-200 px-12 pt-4">
              <p className="mb-8 font-medium uppercase text-sm text-slate-500 tracking-wider">Signature du médecin</p>
              {printData.signe && (
                <p className="font-[cursive] text-4xl text-black -rotate-3">Dr. {printData.medecin.split(' ').pop()}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PrescriptionsPage
